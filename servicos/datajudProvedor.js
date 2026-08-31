// Provedor DataJud da abstração de movimentações processuais.
// O restante do sistema chama consultarProcesso() — não monta URL nem header.
//
// Contrato (mesmo que um provedor futuro TRIBUNAL_DIRECT):
//   consultarProcesso({ numeroCnj, aliasTribunal, url }) →
//     { encontrado, numeroProcesso, tribunal, grau, classe, orgaoJulgador,
//       dataHoraUltimaAtualizacao, movimentos[] }
//
// movimentos[]: { codigo, nome, dataHora, complementosTabelados, orgaoJulgador }

const db = require('../db/conexao');
const tribunais = require('./datajudTribunais');

const CONFIG = {
  timeoutMs: Number(process.env.DATAJUD_TIMEOUT_MS) || 20_000,
  maxTentativas: Number(process.env.DATAJUD_MAX_TENTATIVAS) || 3,
  reqPorMinuto: Number(process.env.DATAJUD_MAX_REQ_POR_MINUTO) || 60,
  backoffMs: Number(process.env.DATAJUD_BACKOFF_MS) || 500
};

const ORIGEM = 'datajud';

function obterChave() {
  const linha = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'datajud_chave'").get();
  if (linha && linha.valor) return linha.valor;
  return process.env.DATAJUD_API_KEY || '';
}

function definirChave(chave) {
  db.prepare(`
    INSERT INTO configuracoes (chave, valor) VALUES ('datajud_chave', ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `).run(chave || '');
}

function intervaloMinimoMs() {
  return Math.ceil(60_000 / Math.max(1, CONFIG.reqPorMinuto));
}

function interpretarBusca(json) {
  const hits = (json && json.hits && json.hits.hits) || [];
  if (!hits.length) return { encontrado: false, movimentos: [] };

  const fontes = hits.map((h) => h._source || {});
  fontes.sort((a, b) => String(b.dataHoraUltimaAtualizacao || '').localeCompare(String(a.dataHoraUltimaAtualizacao || '')));
  const principal = fontes[0];

  const movimentos = [];
  for (const src of fontes) {
    for (const m of src.movimentos || []) {
      movimentos.push({
        codigo: m.codigo != null ? String(m.codigo) : null,
        nome: m.nome || '',
        dataHora: m.dataHora || null,
        complementosTabelados: m.complementosTabelados || [],
        orgaoJulgador: (m.orgaoJulgador && (m.orgaoJulgador.nome || m.orgaoJulgador)) ||
          (src.orgaoJulgador && src.orgaoJulgador.nome) || null
      });
    }
  }

  const classe = principal.classe
    ? (principal.classe.nome || JSON.stringify(principal.classe))
    : null;
  const orgao = principal.orgaoJulgador
    ? (principal.orgaoJulgador.nome || JSON.stringify(principal.orgaoJulgador))
    : null;

  return {
    encontrado: true,
    numeroProcesso: principal.numeroProcesso || null,
    tribunal: principal.tribunal || null,
    grau: principal.grau || null,
    classe,
    orgaoJulgador: orgao,
    dataHoraUltimaAtualizacao: principal.dataHoraUltimaAtualizacao || null,
    movimentos
  };
}

function erroTipado(tipo, mensagem, status) {
  const erro = new Error(mensagem);
  erro.tipo = tipo;
  if (status) erro.status = status;
  return erro;
}

function transitorio(status, causa) {
  if (causa === 'timeout' || causa === 'rede') return true;
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requisitar(url, corpo, fetchImpl) {
  const chave = obterChave();
  if (!chave) {
    throw erroTipado('sem_chave', 'Chave da API DataJud não configurada (DATAJUD_API_KEY).');
  }

  const fetchFn = fetchImpl || fetch;
  let ultimoErro;

  for (let tentativa = 1; tentativa <= CONFIG.maxTentativas; tentativa++) {
    let resposta;
    try {
      resposta = await fetchFn(url, {
        method: 'POST',
        headers: {
          Authorization: `APIKey ${chave}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(CONFIG.timeoutMs)
      });
    } catch (erro) {
      const timeout = erro.name === 'TimeoutError' || erro.name === 'AbortError';
      ultimoErro = erroTipado(
        timeout ? 'timeout' : 'rede',
        timeout
          ? `DataJud não respondeu em ${CONFIG.timeoutMs / 1000}s.`
          : `Falha de conexão com o DataJud: ${erro.message}`
      );
      if (transitorio(0, timeout ? 'timeout' : 'rede') && tentativa < CONFIG.maxTentativas) {
        const espera = CONFIG.backoffMs * (2 ** (tentativa - 1));
        console.warn(`[datajud] retry tentativa=${tentativa} espera_ms=${espera} motivo=${ultimoErro.tipo}`);
        await esperar(espera);
        continue;
      }
      throw ultimoErro;
    }

    if (resposta.status === 429) {
      ultimoErro = erroTipado('rate_limited', 'DataJud recusou a consulta (limite de requisições).', 429);
      console.warn('[datajud] rate_limited');
      if (tentativa < CONFIG.maxTentativas) {
        const retryAfter = Number(resposta.headers.get('retry-after'));
        const espera = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : CONFIG.backoffMs * (2 ** (tentativa - 1));
        await esperar(espera);
        continue;
      }
      throw ultimoErro;
    }

    if (resposta.status >= 500) {
      ultimoErro = erroTipado('http', `DataJud respondeu ${resposta.status}.`, resposta.status);
      if (tentativa < CONFIG.maxTentativas) {
        const espera = CONFIG.backoffMs * (2 ** (tentativa - 1));
        console.warn(`[datajud] retry tentativa=${tentativa} espera_ms=${espera} status=${resposta.status}`);
        await esperar(espera);
        continue;
      }
      throw ultimoErro;
    }

    if (!resposta.ok) {
      throw erroTipado('http', `DataJud respondeu ${resposta.status}.`, resposta.status);
    }

    const json = await resposta.json();
    return json;
  }

  throw ultimoErro;
}

async function consultarProcesso({ numeroCnj, aliasTribunal, url }, opcoes = {}) {
  const destino = url || tribunais.urlDoAlias(aliasTribunal);
  const json = await requisitar(destino, {
    query: { match: { numeroProcesso: numeroCnj } },
    size: 10,
    _source: [
      'numeroProcesso', 'tribunal', 'grau', 'classe', 'orgaoJulgador',
      'dataHoraUltimaAtualizacao', 'movimentos'
    ]
  }, opcoes.fetchImpl);

  const interpretado = interpretarBusca(json);
  if (!interpretado.encontrado) {
    console.log('[datajud] process_not_found', { numeroProcesso: numeroCnj, alias: aliasTribunal });
  } else {
    console.log('[datajud] process_found', {
      numeroProcesso: interpretado.numeroProcesso,
      alias: aliasTribunal,
      movimentos: interpretado.movimentos.length
    });
  }
  return interpretado;
}

async function testarConexao(chave) {
  const destino = tribunais.urlDoAlias('api_publica_tjrs');
  let resposta;
  try {
    resposta = await fetch(destino, {
      method: 'POST',
      headers: {
        Authorization: `APIKey ${chave}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: { match_all: {} }, size: 0 }),
      signal: AbortSignal.timeout(CONFIG.timeoutMs)
    });
  } catch (erro) {
    const timeout = erro.name === 'TimeoutError' || erro.name === 'AbortError';
    throw new Error(timeout
      ? `DataJud não respondeu em ${CONFIG.timeoutMs / 1000}s.`
      : `Falha de conexão com o DataJud: ${erro.message}`);
  }
  if (resposta.status === 401 || resposta.status === 403) {
    throw new Error('Chave da API DataJud recusada.');
  }
  if (!resposta.ok) {
    throw new Error(`DataJud respondeu ${resposta.status}.`);
  }
  return { ok: true };
}

module.exports = {
  ORIGEM,
  CONFIG,
  obterChave,
  definirChave,
  intervaloMinimoMs,
  interpretarBusca,
  consultarProcesso,
  testarConexao
};
