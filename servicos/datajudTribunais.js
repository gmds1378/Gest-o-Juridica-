// Mapa centralizado tribunal CNJ → alias da API pública DataJud.
// Não espalhar URLs/aliases pelo restante do código.
//
// O processo não guarda tribunal: o código J.TR do número CNJ resolve o alias.
// Documentação: https://www.cnj.jus.br/sistemas/datajud/api-publica/

const numeroCnj = require('./numeroCnj');

const BASE_URL = process.env.DATAJUD_BASE_URL || 'https://api-publica.datajud.cnj.jus.br';

// Justiça estadual (J=8) e eleitoral (J=6) usam o mesmo código TR (01–27).
const TRIBUNAL_ESTADUAL = {
  '01': { sigla: 'TJAC', alias: 'api_publica_tjac', tre: 'api_publica_ac' },
  '02': { sigla: 'TJAL', alias: 'api_publica_tjal', tre: 'api_publica_al' },
  '03': { sigla: 'TJAP', alias: 'api_publica_tjap', tre: 'api_publica_ap' },
  '04': { sigla: 'TJAM', alias: 'api_publica_tjam', tre: 'api_publica_am' },
  '05': { sigla: 'TJBA', alias: 'api_publica_tjba', tre: 'api_publica_ba' },
  '06': { sigla: 'TJCE', alias: 'api_publica_tjce', tre: 'api_publica_ce' },
  '07': { sigla: 'TJDFT', alias: 'api_publica_tjdft', tre: 'api_publica_df' },
  '08': { sigla: 'TJES', alias: 'api_publica_tjes', tre: 'api_publica_es' },
  '09': { sigla: 'TJGO', alias: 'api_publica_tjgo', tre: 'api_publica_go' },
  '10': { sigla: 'TJMA', alias: 'api_publica_tjma', tre: 'api_publica_ma' },
  '11': { sigla: 'TJMT', alias: 'api_publica_tjmt', tre: 'api_publica_mt' },
  '12': { sigla: 'TJMS', alias: 'api_publica_tjms', tre: 'api_publica_ms' },
  '13': { sigla: 'TJMG', alias: 'api_publica_tjmg', tre: 'api_publica_mg' },
  '14': { sigla: 'TJPA', alias: 'api_publica_tjpa', tre: 'api_publica_pa' },
  '15': { sigla: 'TJPB', alias: 'api_publica_tjpb', tre: 'api_publica_pb' },
  '16': { sigla: 'TJPR', alias: 'api_publica_tjpr', tre: 'api_publica_pr' },
  '17': { sigla: 'TJPE', alias: 'api_publica_tjpe', tre: 'api_publica_pe' },
  '18': { sigla: 'TJPI', alias: 'api_publica_tjpi', tre: 'api_publica_pi' },
  '19': { sigla: 'TJRJ', alias: 'api_publica_tjrj', tre: 'api_publica_rj' },
  '20': { sigla: 'TJRN', alias: 'api_publica_tjrn', tre: 'api_publica_rn' },
  '21': { sigla: 'TJRS', alias: 'api_publica_tjrs', tre: 'api_publica_rs' },
  '22': { sigla: 'TJRO', alias: 'api_publica_tjro', tre: 'api_publica_ro' },
  '23': { sigla: 'TJRR', alias: 'api_publica_tjrr', tre: 'api_publica_rr' },
  '24': { sigla: 'TJSC', alias: 'api_publica_tjsc', tre: 'api_publica_sc' },
  '25': { sigla: 'TJSE', alias: 'api_publica_tjse', tre: 'api_publica_se' },
  '26': { sigla: 'TJSP', alias: 'api_publica_tjsp', tre: 'api_publica_sp' },
  '27': { sigla: 'TJTO', alias: 'api_publica_tjto', tre: 'api_publica_to' }
};

const TJM = {
  '13': { sigla: 'TJMMG', alias: 'api_publica_tjmmg' },
  '21': { sigla: 'TJMRS', alias: 'api_publica_tjmrs' },
  '26': { sigla: 'TJMSP', alias: 'api_publica_tjmsp' }
};

function urlDoAlias(alias) {
  return `${BASE_URL.replace(/\/$/, '')}/${alias}/_search`;
}

function resolverPorSegmentos(justica, tribunal) {
  const j = String(justica || '');
  const tr = String(tribunal || '').padStart(2, '0');

  if (j === '1') return { sigla: 'STF', alias: 'api_publica_stf' };
  if (j === '3') return { sigla: 'STJ', alias: 'api_publica_stj' };
  if (j === '4' && tr >= '01' && tr <= '06') {
    const n = String(Number(tr));
    return { sigla: `TRF${n}`, alias: `api_publica_trf${n}` };
  }
  if (j === '5' && tr >= '01' && tr <= '24') {
    const n = String(Number(tr));
    return { sigla: `TRT${n}`, alias: `api_publica_trt${n}` };
  }
  if (j === '6' && TRIBUNAL_ESTADUAL[tr]) {
    return { sigla: `TRE-${TRIBUNAL_ESTADUAL[tr].sigla.slice(2)}`, alias: TRIBUNAL_ESTADUAL[tr].tre };
  }
  if (j === '7') return { sigla: 'STM', alias: 'api_publica_stm' };
  if (j === '8' && TRIBUNAL_ESTADUAL[tr]) {
    return { sigla: TRIBUNAL_ESTADUAL[tr].sigla, alias: TRIBUNAL_ESTADUAL[tr].alias };
  }
  if (j === '9' && TJM[tr]) return TJM[tr];

  return null;
}

function resolverPorNumeroCnj(numero) {
  const partes = numeroCnj.analisar(numero);
  if (!partes) {
    const erro = new Error('Número CNJ inválido (são necessários 20 dígitos).');
    erro.tipo = 'cnj_invalido';
    throw erro;
  }
  const resolvido = resolverPorSegmentos(partes.justica, partes.tribunal);
  if (!resolvido) {
    const erro = new Error(
      `Tribunal não resolvido a partir do CNJ (justiça ${partes.justica}, tribunal ${partes.tribunal}).`
    );
    erro.tipo = 'tribunal_nao_resolvido';
    throw erro;
  }
  return {
    ...resolvido,
    url: urlDoAlias(resolvido.alias),
    justica: partes.justica,
    tribunal: partes.tribunal,
    numeroNormalizado: partes.normalizado
  };
}

module.exports = {
  BASE_URL,
  urlDoAlias,
  resolverPorSegmentos,
  resolverPorNumeroCnj
};
