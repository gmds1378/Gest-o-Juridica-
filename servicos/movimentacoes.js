// Pipeline de movimentações processuais: provedor → normalização → deduplicação
// → persistência → notificação (sino). Único ponto chamado pelo cron e pelo
// sync manual. AASP (intimações) não passa daqui.

const crypto = require('crypto');
const db = require('../db/conexao');
const numeroCnj = require('./numeroCnj');
const tribunais = require('./datajudTribunais');
const datajud = require('./datajudProvedor');

const TAMANHO_LOTE = Number(process.env.DATAJUD_LOTE) || 20;
const IDADE_MINIMA_RESYNC = process.env.DATAJUD_RESYNC_APOS || '-20 hours';

const provedores = {
  datajud
};

let loteEmAndamento = false;

function obterProvedor(nome) {
  const chave = nome || process.env.MOVIMENTACAO_PROVEDOR || 'datajud';
  const provedor = provedores[chave];
  if (!provedor) {
    const erro = new Error(`Provedor de movimentações desconhecido: ${chave}.`);
    erro.tipo = 'provedor_desconhecido';
    throw erro;
  }
  return { nome: chave, origem: provedor.ORIGEM, consultarProcesso: provedor.consultarProcesso };
}

function fingerprintDe(movimento) {
  const complementos = JSON.stringify(movimento.complementosTabelados || []);
  const base = [
    movimento.codigo || '',
    movimento.dataHora || '',
    movimento.nome || '',
    complementos
  ].join('|');
  return crypto.createHash('sha256').update(base).digest('hex');
}

const inserirMovimento = db.prepare(`
  INSERT OR IGNORE INTO movimentacoes
    (processo_id, origem, codigo_externo, nome, ocorrido_em, tribunal, orgao_julgador,
     complementos, fingerprint, historico_inicial, lida)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const atualizarMeta = db.prepare(`
  UPDATE processos SET
    movimentacao_tentativa_em = datetime('now', 'localtime'),
    movimentacao_ok_em = CASE WHEN ? = 1 THEN datetime('now', 'localtime') ELSE movimentacao_ok_em END,
    movimentacao_erro = ?,
    movimentacao_status = ?,
    movimentacao_provedor = ?,
    movimentacao_qtd_recebidos = ?,
    movimentacao_qtd_novos = ?
  WHERE id = ?
`);

function gravarMovimentos(processoId, origem, movimentos, { inicial, tribunal }) {
  let novos = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const m of movimentos) {
      const fp = fingerprintDe(m);
      const resultado = inserirMovimento.run(
        processoId,
        origem,
        m.codigo,
        m.nome || '',
        m.dataHora || null,
        tribunal || null,
        m.orgaoJulgador || null,
        JSON.stringify(m.complementosTabelados || []),
        fp,
        inicial ? 1 : 0,
        inicial ? 1 : 0
      );
      if (resultado.changes > 0) novos++;
    }
    db.exec('COMMIT');
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
  return novos;
}

function registrarMeta(processoId, { ok, status, erro, provedor, recebidos, novos }) {
  atualizarMeta.run(
    ok ? 1 : 0,
    erro || null,
    status,
    provedor || null,
    recebidos != null ? recebidos : null,
    novos != null ? novos : null,
    processoId
  );
}

function ehInicial(processoId, origem) {
  const row = db.prepare(
    'SELECT 1 AS existe FROM movimentacoes WHERE processo_id = ? AND origem = ? LIMIT 1'
  ).get(processoId, origem);
  return !row;
}

async function sincronizarProcesso(processoId, opcoes = {}) {
  const processo = db.prepare('SELECT * FROM processos WHERE id = ?').get(processoId);
  if (!processo) {
    const erro = new Error('Processo não encontrado.');
    erro.tipo = 'processo_inexistente';
    throw erro;
  }

  const provedor = opcoes.provedor || obterProvedor(opcoes.nomeProvedor);
  const origem = provedor.origem || 'datajud';

  console.log('[datajud] sync_started', { processoId, numero_cnj: processo.numero_cnj });

  if (!processo.numero_cnj || !numeroCnj.normalizar(processo.numero_cnj)) {
    registrarMeta(processoId, {
      ok: false, status: 'sem_cnj', erro: 'Processo sem número CNJ.', provedor: origem, recebidos: 0, novos: 0
    });
    return { ok: false, tipo: 'sem_cnj', processoId, novos: 0, recebidos: 0 };
  }

  let destino;
  try {
    destino = tribunais.resolverPorNumeroCnj(processo.numero_cnj);
  } catch (erro) {
    const tipo = erro.tipo || 'tribunal_nao_resolvido';
    registrarMeta(processoId, {
      ok: false, status: tipo, erro: erro.message, provedor: origem, recebidos: 0, novos: 0
    });
    console.warn('[datajud] sync_failed', { processoId, tipo, erro: erro.message });
    return { ok: false, tipo, processoId, erro: erro.message, novos: 0, recebidos: 0 };
  }

  const inicial = ehInicial(processoId, origem);

  let consulta;
  try {
    consulta = await provedor.consultarProcesso({
      numeroCnj: destino.numeroNormalizado,
      aliasTribunal: destino.alias,
      url: destino.url
    }, { fetchImpl: opcoes.fetchImpl });
  } catch (erro) {
    const tipo = erro.tipo || 'sync_failed';
    registrarMeta(processoId, {
      ok: false, status: tipo, erro: erro.message, provedor: origem, recebidos: 0, novos: 0
    });
    console.warn('[datajud] sync_failed', { processoId, tipo, erro: erro.message });
    return { ok: false, tipo, processoId, erro: erro.message, novos: 0, recebidos: 0 };
  }

  if (!consulta.encontrado) {
    registrarMeta(processoId, {
      ok: true, status: 'nao_encontrado', erro: null, provedor: origem, recebidos: 0, novos: 0
    });
    return { ok: true, tipo: 'nao_encontrado', processoId, inicial, novos: 0, recebidos: 0 };
  }

  const recebidos = consulta.movimentos.length;
  const novos = gravarMovimentos(processoId, origem, consulta.movimentos, {
    inicial,
    tribunal: consulta.tribunal || destino.sigla
  });

  registrarMeta(processoId, {
    ok: true, status: 'ok', erro: null, provedor: origem, recebidos, novos
  });

  if (novos > 0 && !inicial) {
    console.log('[datajud] new_movements_found', { processoId, novos, recebidos });
  }
  console.log('[datajud] sync_completed', { processoId, inicial, recebidos, novos });

  return {
    ok: true,
    tipo: inicial ? 'initialSync' : 'regularSync',
    processoId,
    inicial,
    recebidos,
    novos,
    tribunal: destino.sigla
  };
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sincronizarPendentes(opcoes = {}) {
  if (loteEmAndamento) {
    return { ok: false, erro: 'Já existe uma sincronização de movimentações em andamento.' };
  }
  if (!datajud.obterChave() && !opcoes.provedor) {
    return { ok: false, erro: 'Chave da API DataJud não configurada (DATAJUD_API_KEY).' };
  }

  loteEmAndamento = true;
  const tamanho = opcoes.tamanhoLote || TAMANHO_LOTE;
  const pausa = opcoes.pausaMs != null ? opcoes.pausaMs : datajud.intervaloMinimoMs();

  try {
    const processos = db.prepare(`
      SELECT id FROM processos
      WHERE status = 'ativo'
        AND numero_cnj IS NOT NULL AND TRIM(numero_cnj) != ''
        AND (
          movimentacao_tentativa_em IS NULL
          OR movimentacao_tentativa_em < datetime('now', 'localtime', ?)
        )
      ORDER BY movimentacao_tentativa_em IS NULL DESC, movimentacao_tentativa_em ASC
      LIMIT ?
    `).all(IDADE_MINIMA_RESYNC, tamanho);

    const resultados = [];
    for (const [i, p] of processos.entries()) {
      try {
        resultados.push(await sincronizarProcesso(p.id, opcoes));
      } catch (erro) {
        registrarMeta(p.id, {
          ok: false, status: 'sync_failed', erro: erro.message, provedor: 'datajud', recebidos: 0, novos: 0
        });
        console.error('[datajud] sync_failed', { processoId: p.id, erro: erro.message });
        resultados.push({ ok: false, processoId: p.id, tipo: 'sync_failed', erro: erro.message });
      }
      if (i < processos.length - 1 && pausa > 0) await esperar(pausa);
    }

    return { ok: true, processados: resultados.length, resultados };
  } finally {
    loteEmAndamento = false;
  }
}

function listarDoProcesso(processoId) {
  return db.prepare(`
    SELECT * FROM movimentacoes WHERE processo_id = ?
    ORDER BY ocorrido_em DESC, id DESC
  `).all(processoId);
}

function marcarLidas(processoId) {
  db.prepare(`
    UPDATE movimentacoes SET lida = 1
    WHERE processo_id = ? AND lida = 0 AND historico_inicial = 0
  `).run(processoId);
}

function alertasNaoLidos() {
  return db.prepare(`
    SELECT m.id, m.nome, m.ocorrido_em, m.processo_id, p.numero_cnj
    FROM movimentacoes m
    JOIN processos p ON p.id = m.processo_id
    WHERE m.historico_inicial = 0 AND m.lida = 0
    ORDER BY m.ocorrido_em DESC, m.id DESC
    LIMIT 40
  `).all();
}

module.exports = {
  obterProvedor,
  fingerprintDe,
  sincronizarProcesso,
  sincronizarPendentes,
  listarDoProcesso,
  marcarLidas,
  alertasNaoLidos,
  gravarMovimentos
};
