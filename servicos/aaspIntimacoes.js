// Integracao com a API de Intimacoes da AASP (Associacao dos Advogados de Sao Paulo).
// Busca publicacoes novas e guarda em uma fila de revisao (tabela "publicacoes") -
// o sistema NUNCA cria um prazo sozinho a partir do texto: alguem do escritorio
// confere e cria o prazo manualmente, usando a calculadora de prazos ja existente.
//
// ATENCAO: a busca e destrutiva do lado da AASP. Ao chamar a rota de intimacoes
// com diferencial=true, ela marca aquelas publicacoes como baixadas e elas nao
// aparecem em nenhuma consulta futura. Por isso este modulo:
//   1. grava a resposta crua em disco ANTES de interpretar qualquer coisa;
//   2. grava as publicacoes de cada dia em uma transacao (tudo ou nada);
//   3. impede duas sincronizacoes simultaneas;
//   4. usa timeout em toda chamada de rede.
// Se algo der errado mesmo assim, a resposta crua permite reimportar sem perda
// (ver db/reimportar-aasp.js).
//
// Documentacao tecnica (Swagger): https://intimacaoapi.aasp.org.br/docapi/index.html

const path = require('path');
const fs = require('fs');
const db = require('../db/conexao');

const BASE_URL = 'https://intimacaoapi.aasp.org.br/api';
const TEMPO_LIMITE_MS = 60 * 1000;
const PASTA_BRUTOS = path.join(__dirname, '..', 'dados', 'aasp-brutos');

let sincronizacaoEmAndamento = false;

function obterChave() {
  const linha = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'aasp_chave'").get();
  return linha ? linha.valor : '';
}

function definirChave(chave) {
  db.prepare(`
    INSERT INTO configuracoes (chave, valor) VALUES ('aasp_chave', ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `).run(chave || '');
}

function formatarDataISO(dataComHora) {
  return (dataComHora || '').slice(0, 10); // "2026-08-19T00:00:00" -> "2026-08-19"
}

// Faz a chamada e devolve o corpo como texto puro. O corpo e lido SEMPRE, mesmo
// em resposta de erro: a AASP manda a explicacao util ("Chave de acesso
// incorreta") no corpo de um HTTP 400, entao checar apenas o status esconderia
// justamente a mensagem que o usuario precisa ler.
async function requisitar(url, descricao) {
  let resposta;
  try {
    resposta = await fetch(url, { signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  } catch (erro) {
    if (erro.name === 'TimeoutError' || erro.name === 'AbortError') {
      throw new Error(`A AASP nao respondeu em ${TEMPO_LIMITE_MS / 1000}s ao ${descricao}.`);
    }
    throw new Error(`Falha de conexao com a AASP ao ${descricao}: ${erro.message}`);
  }
  return { status: resposta.status, ok: resposta.ok, corpo: await resposta.text() };
}

function interpretar(retorno, descricao) {
  let dados;
  try {
    dados = JSON.parse(retorno.corpo);
  } catch {
    throw new Error(`A AASP respondeu ${retorno.status} em formato inesperado ao ${descricao}.`);
  }
  if (dados.erro) throw new Error(dados.status || `Erro desconhecido da AASP ao ${descricao}.`);
  if (!retorno.ok) throw new Error(`A AASP respondeu ${retorno.status} ao ${descricao}.`);
  return dados;
}

// Busca, para os ultimos N dias, quais datas ainda tem publicacoes pendentes de baixar.
// Somente leitura: nao marca nada como baixado.
async function diasComPendencias(chave, qtdeDias) {
  const url = `${BASE_URL}/Associado/intimacao/GetJornaisComIntimacoes/json?chave=${encodeURIComponent(chave)}&qtdeDias=${qtdeDias}`;
  const dados = interpretar(await requisitar(url, 'consultar o resumo'), 'consultar o resumo');

  return (dados.datas || [])
    .filter((dia) => dia.intimacoesABaixar > 0)
    .map((dia) => formatarDataISO(dia.dataDisponibilizacao_Publicacao));
}

// Guarda a resposta crua antes de qualquer interpretacao. E a unica copia que
// sobra caso a gravacao no banco falhe, ja que a AASP nao devolve o mesmo item duas vezes.
function salvarCopiaBruta(dataISO, corpo) {
  fs.mkdirSync(PASTA_BRUTOS, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const caminho = path.join(PASTA_BRUTOS, `${dataISO}_${carimbo}.json`);
  fs.writeFileSync(caminho, corpo, 'utf8');
  return caminho;
}

// Busca as intimacoes de uma data especifica, marcando-as como baixadas do lado da AASP
// (diferencial=true). A partir daqui nao ha volta: por isso a copia crua vem primeiro.
async function buscarIntimacoesDoDia(chave, dataISO) {
  const descricao = `buscar publicacoes de ${dataISO}`;
  const url = `${BASE_URL}/Associado/intimacao/json?chave=${encodeURIComponent(chave)}&data=${dataISO}&diferencial=true`;
  const retorno = await requisitar(url, descricao);

  const arquivoBruto = salvarCopiaBruta(dataISO, retorno.corpo);
  const dados = interpretar(retorno, descricao);
  return { intimacoes: dados.intimacoes || [], arquivoBruto };
}

const inserirPublicacao = db.prepare(`
  INSERT OR IGNORE INTO publicacoes
    (origem, codigo_externo, numero_processo, titulo, texto, jornal, data_disponibilizacao, processo_id)
  VALUES ('aasp', ?, ?, ?, ?, ?, ?, ?)
`);
const encontrarProcessoPorNumero = db.prepare('SELECT id FROM processos WHERE numero_cnj = ?');

function salvarIntimacao(item) {
  const numeroProcesso = item.numeroUnicoProcesso || null;
  const processo = numeroProcesso ? encontrarProcessoPorNumero.get(numeroProcesso) : null;

  const resultado = inserirPublicacao.run(
    String(item.codigoRelacionamento),
    numeroProcesso,
    item.titulo || 'Publicação',
    item.textoPublicacao || '',
    (item.jornal && item.jornal.nomeJornal) || null,
    item.jornal ? formatarDataISO(item.jornal.dataDisponibilizacao_Publicacao) : null,
    processo ? processo.id : null
  );
  return resultado.changes > 0; // true se era nova (o UNIQUE em codigo_externo evita duplicar)
}

// Grava as publicacoes de um dia em uma unica transacao. Se qualquer item falhar,
// desfaz o dia inteiro em vez de deixar metade gravada: a copia crua ja esta em
// disco e permite reimportar o dia completo depois.
function gravarLote(intimacoes) {
  db.exec('BEGIN IMMEDIATE');
  try {
    let novas = 0;
    for (const item of intimacoes) {
      if (salvarIntimacao(item)) novas++;
    }
    db.exec('COMMIT');
    return novas;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

// Ponto de entrada: busca tudo que estiver pendente nos ultimos `qtdeDias` dias.
async function sincronizar(qtdeDias = 30) {
  const chave = obterChave();
  if (!chave) {
    return { ok: false, erro: 'Chave da API da AASP não configurada.' };
  }

  // O ciclo automatico de 4h e o botao "Buscar agora" podem coincidir. Como cada
  // chamada consome publicacoes de forma irreversivel, duas ao mesmo tempo sao
  // um risco real de perda - a segunda espera a proxima oportunidade.
  if (sincronizacaoEmAndamento) {
    return { ok: false, erro: 'Já existe uma busca de publicações em andamento. Aguarde ela terminar.' };
  }
  sincronizacaoEmAndamento = true;

  try {
    const dias = await diasComPendencias(chave, qtdeDias);
    let novas = 0;
    let totalEncontradas = 0;
    const diasComFalha = [];

    for (const dia of dias) {
      const { intimacoes, arquivoBruto } = await buscarIntimacoesDoDia(chave, dia);
      totalEncontradas += intimacoes.length;
      try {
        novas += gravarLote(intimacoes);
      } catch (erro) {
        diasComFalha.push({ dia, arquivoBruto });
        console.error(
          `[AASP] Falha ao gravar as ${intimacoes.length} publicacao(oes) de ${dia}: ${erro.message}\n` +
          `[AASP] Os dados estao salvos em ${arquivoBruto}. Reimporte com: npm run reimportar-aasp`
        );
      }
    }

    return { ok: true, diasVerificados: dias.length, totalEncontradas, novas, diasComFalha };
  } finally {
    sincronizacaoEmAndamento = false;
  }
}

// Reimporta um arquivo de resposta crua (usado na recuperacao de uma gravacao
// que falhou). Idempotente: o UNIQUE em codigo_externo ignora o que ja existe.
function reimportarArquivo(caminho) {
  const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  const intimacoes = dados.intimacoes || [];
  return { total: intimacoes.length, novas: gravarLote(intimacoes) };
}

// Testa a chave sem marcar nada como baixado na AASP (usa o resumo, que e so leitura).
async function testarConexao(chave) {
  const dias = await diasComPendencias(chave, 30);
  return { ok: true, pendentes: dias.length };
}

module.exports = {
  obterChave,
  definirChave,
  sincronizar,
  testarConexao,
  reimportarArquivo,
  PASTA_BRUTOS
};
