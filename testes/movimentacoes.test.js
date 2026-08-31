process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
process.env.GESTAO_DB = require('path').join(require('os').tmpdir(), `gestao-teste-${process.pid}-${Date.now()}.db`);
process.env.DATAJUD_API_KEY = 'chave-teste';
process.env.DATAJUD_MAX_TENTATIVAS = '3';
process.env.DATAJUD_BACKOFF_MS = '1';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const numeroCnj = require('../servicos/numeroCnj');
const tribunais = require('../servicos/datajudTribunais');
const datajud = require('../servicos/datajudProvedor');
const movimentacoes = require('../servicos/movimentacoes');
const db = require('../db/conexao');

after(() => {
  try { fs.unlinkSync(process.env.GESTAO_DB); } catch { /* ignore */ }
  try { fs.unlinkSync(process.env.GESTAO_DB + '-wal'); } catch { /* ignore */ }
  try { fs.unlinkSync(process.env.GESTAO_DB + '-shm'); } catch { /* ignore */ }
});

function respostaHttp(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (nome) => headers[nome.toLowerCase()] || null },
    json: async () => body
  };
}

function hitDatajud(campos) {
  return {
    hits: {
      hits: [{ _source: {
        numeroProcesso: '00012345620248210001',
        tribunal: 'TJRS',
        grau: 'G1',
        classe: { nome: 'Procedimento Comum' },
        orgaoJulgador: { nome: '1ª Vara Cível' },
        dataHoraUltimaAtualizacao: '2024-06-01T12:00:00.000Z',
        movimentos: [],
        ...campos
      } }]
    }
  };
}

function criarProcesso(numeroCnjFmt) {
  const cliente = db.prepare('INSERT INTO clientes (nome) VALUES (?)').run('Cliente Teste');
  const proc = db.prepare(`
    INSERT INTO processos (cliente_id, numero_cnj, status) VALUES (?, ?, 'ativo')
  `).run(cliente.lastInsertRowid, numeroCnjFmt);
  return Number(proc.lastInsertRowid);
}

function provedorDe(consulta) {
  return {
    origem: 'datajud',
    consultarProcesso: async () => consulta
  };
}

describe('número CNJ', () => {
  it('normaliza tirando pontuação', () => {
    assert.equal(numeroCnj.normalizar('0001234-56.2024.8.21.0001'), '00012345620248210001');
  });

  it('analisa segmentos J.TR', () => {
    const p = numeroCnj.analisar('0001234-56.2024.8.21.0001');
    assert.equal(p.justica, '8');
    assert.equal(p.tribunal, '21');
    assert.equal(p.ano, '2024');
  });
});

describe('tribunal DataJud', () => {
  it('resolve TJRS, TJSP e TRF4 pelo CNJ', () => {
    assert.equal(tribunais.resolverPorNumeroCnj('0001234-56.2024.8.21.0001').alias, 'api_publica_tjrs');
    assert.equal(tribunais.resolverPorNumeroCnj('1000000-00.2024.8.26.0100').alias, 'api_publica_tjsp');
    assert.equal(tribunais.resolverPorNumeroCnj('5000000-00.2024.4.04.0000').alias, 'api_publica_trf4');
  });

  it('falha se o tribunal não for resolvido', () => {
    assert.throws(
      () => tribunais.resolverPorNumeroCnj('0001234-56.2024.2.00.0001'),
      (e) => e.tipo === 'tribunal_nao_resolvido'
    );
  });
});

describe('parsing DataJud', () => {
  it('lê movimentos do hit', () => {
    const r = datajud.interpretarBusca(hitDatajud({
      movimentos: [{ codigo: 123, nome: 'Juntada de Petição', dataHora: '2024-05-01T10:00:00.000Z' }]
    }));
    assert.equal(r.encontrado, true);
    assert.equal(r.movimentos.length, 1);
    assert.equal(r.movimentos[0].nome, 'Juntada de Petição');
    assert.equal(r.classe, 'Procedimento Comum');
  });

  it('processo não encontrado', () => {
    const r = datajud.interpretarBusca({ hits: { hits: [] } });
    assert.equal(r.encontrado, false);
  });
});

describe('HTTP DataJud', () => {
  it('reexecuta erro transitório e depois funciona', async () => {
    let n = 0;
    const fetchImpl = async () => {
      n++;
      if (n < 3) return respostaHttp(503, {});
      return respostaHttp(200, hitDatajud({ movimentos: [] }));
    };
    const r = await datajud.consultarProcesso({
      numeroCnj: '00012345620248210001',
      aliasTribunal: 'api_publica_tjrs'
    }, { fetchImpl });
    assert.equal(r.encontrado, true);
    assert.equal(n, 3);
  });

  it('trata 429 até esgotar tentativas', async () => {
    const fetchImpl = async () => respostaHttp(429, {});
    await assert.rejects(
      () => datajud.consultarProcesso({
        numeroCnj: '00012345620248210001',
        aliasTribunal: 'api_publica_tjrs'
      }, { fetchImpl }),
      (e) => e.tipo === 'rate_limited'
    );
  });
});

describe('sync de movimentações', () => {
  it('salva movimento novo e não duplica', async () => {
    const id = criarProcesso('0001234-56.2024.8.21.0001');
    const consulta = {
      encontrado: true,
      tribunal: 'TJRS',
      movimentos: [{ codigo: '85', nome: 'Juntada', dataHora: '2024-01-01T10:00:00Z', complementosTabelados: [] }]
    };
    const r1 = await movimentacoes.sincronizarProcesso(id, { provedor: provedorDe(consulta) });
    assert.equal(r1.novos, 1);
    const r2 = await movimentacoes.sincronizarProcesso(id, { provedor: provedorDe(consulta) });
    assert.equal(r2.novos, 0);
    const lista = movimentacoes.listarDoProcesso(id);
    assert.equal(lista.length, 1);
  });

  it('initial sync não gera alerta no sino', async () => {
    const id = criarProcesso('0001234-56.2024.8.21.0001');
    await movimentacoes.sincronizarProcesso(id, {
      provedor: provedorDe({
        encontrado: true,
        movimentos: [{ codigo: '1', nome: 'Distribuição', dataHora: '2020-01-01T00:00:00Z' }]
      })
    });
    const alertas = movimentacoes.alertasNaoLidos().filter((a) => a.processo_id === id);
    assert.equal(alertas.length, 0);
    assert.equal(movimentacoes.listarDoProcesso(id)[0].historico_inicial, 1);
  });

  it('regular sync com movimento novo gera alerta', async () => {
    const id = criarProcesso('0001234-56.2024.8.21.0001');
    await movimentacoes.sincronizarProcesso(id, {
      provedor: provedorDe({
        encontrado: true,
        movimentos: [{ codigo: '1', nome: 'Distribuição', dataHora: '2020-01-01T00:00:00Z' }]
      })
    });
    await movimentacoes.sincronizarProcesso(id, {
      provedor: provedorDe({
        encontrado: true,
        movimentos: [
          { codigo: '1', nome: 'Distribuição', dataHora: '2020-01-01T00:00:00Z' },
          { codigo: '85', nome: 'Juntada de Petição', dataHora: '2024-08-01T12:00:00Z' }
        ]
      })
    });
    const alertas = movimentacoes.alertasNaoLidos().filter((a) => a.processo_id === id);
    assert.equal(alertas.length, 1);
    assert.equal(alertas[0].nome, 'Juntada de Petição');
  });

  it('erro de um processo não interrompe o lote', async () => {
    db.prepare(`UPDATE processos SET movimentacao_tentativa_em = datetime('now', 'localtime')`).run();
    const a = criarProcesso('0001234-56.2024.8.21.0001');
    const b = criarProcesso('1000000-00.2024.8.26.0100');
    const c = criarProcesso('5000000-00.2024.4.04.0000');
    let passo = 0;
    const provedor = {
      origem: 'datajud',
      consultarProcesso: async () => {
        passo++;
        if (passo === 2) throw Object.assign(new Error('DataJud indisponível'), { tipo: 'http' });
        return { encontrado: true, movimentos: [{ codigo: String(passo), nome: 'X', dataHora: '2024-01-01T00:00:00Z' }] };
      }
    };
    const r = await movimentacoes.sincronizarPendentes({ provedor, tamanhoLote: 10, pausaMs: 0 });
    assert.equal(r.ok, true);
    assert.equal(r.processados, 3);
    const ids = r.resultados.map((x) => x.processoId).sort((x, y) => x - y);
    assert.deepEqual(ids, [a, b, c].sort((x, y) => x - y));
    assert.equal(r.resultados.filter((x) => x.ok).length, 2);
    assert.equal(r.resultados.filter((x) => !x.ok).length, 1);
  });

  it('processo não encontrado no DataJud', async () => {
    const id = criarProcesso('0001234-56.2024.8.21.0001');
    const r = await movimentacoes.sincronizarProcesso(id, {
      provedor: provedorDe({ encontrado: false, movimentos: [] })
    });
    assert.equal(r.tipo, 'nao_encontrado');
    const proc = db.prepare('SELECT movimentacao_status FROM processos WHERE id = ?').get(id);
    assert.equal(proc.movimentacao_status, 'nao_encontrado');
  });

  it('tribunal não resolvido', async () => {
    const id = criarProcesso('0001234-56.2024.2.00.0001');
    const r = await movimentacoes.sincronizarProcesso(id, {
      provedor: provedorDe({ encontrado: true, movimentos: [] })
    });
    assert.equal(r.ok, false);
    assert.equal(r.tipo, 'tribunal_nao_resolvido');
  });

  it('duas execuções concorrentes não duplicam', async () => {
    const id = criarProcesso('0001234-56.2024.8.21.0001');
    const consulta = {
      encontrado: true,
      movimentos: [{ codigo: '99', nome: 'Despacho', dataHora: '2024-03-03T03:03:03Z' }]
    };
    const [x, y] = await Promise.all([
      movimentacoes.sincronizarProcesso(id, { provedor: provedorDe(consulta) }),
      movimentacoes.sincronizarProcesso(id, { provedor: provedorDe(consulta) })
    ]);
    assert.equal((x.novos || 0) + (y.novos || 0), 1);
    assert.equal(movimentacoes.listarDoProcesso(id).length, 1);
  });
});
