// Integracao com a API de Intimacoes da AASP (Associacao dos Advogados de Sao Paulo).
// Busca publicacoes novas e guarda em uma fila de revisao (tabela "publicacoes") -
// o sistema NUNCA cria um prazo sozinho a partir do texto: alguem do escritorio
// confere e cria o prazo manualmente, usando a calculadora de prazos ja existente.
//
// Documentacao tecnica (Swagger): https://intimacaoapi.aasp.org.br/docapi/index.html

const db = require('../db/conexao');

const BASE_URL = 'https://intimacaoapi.aasp.org.br/api';

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

// Busca, para os ultimos N dias, quais datas ainda tem publicacoes pendentes de baixar.
async function diasComPendencias(chave, qtdeDias) {
  const url = `${BASE_URL}/Associado/intimacao/GetJornaisComIntimacoes/json?chave=${encodeURIComponent(chave)}&qtdeDias=${qtdeDias}`;
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`AASP respondeu ${resposta.status} ao consultar o resumo.`);
  const dados = await resposta.json();
  if (dados.erro) throw new Error(dados.status || 'Erro desconhecido ao consultar a AASP.');

  return (dados.datas || [])
    .filter((dia) => dia.intimacoesABaixar > 0)
    .map((dia) => formatarDataISO(dia.dataDisponibilizacao_Publicacao));
}

// Busca as intimacoes de uma data especifica, marcando-as como baixadas do lado da AASP
// (diferencial=true). So deve ser chamada quando ja estamos prontos para gravar tudo.
async function buscarIntimacoesDoDia(chave, dataISO) {
  const url = `${BASE_URL}/Associado/intimacao/json?chave=${encodeURIComponent(chave)}&data=${dataISO}&diferencial=true`;
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`AASP respondeu ${resposta.status} ao buscar publicacoes de ${dataISO}.`);
  const dados = await resposta.json();
  if (dados.erro) throw new Error(dados.status || 'Erro desconhecido ao consultar a AASP.');
  return dados.intimacoes || [];
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

// Ponto de entrada: busca tudo que estiver pendente nos ultimos `qtdeDias` dias.
async function sincronizar(qtdeDias = 30) {
  const chave = obterChave();
  if (!chave) {
    return { ok: false, erro: 'Chave da API da AASP não configurada.' };
  }

  const dias = await diasComPendencias(chave, qtdeDias);
  let novas = 0;
  let totalEncontradas = 0;
  let falhas = 0;

  for (const dia of dias) {
    // A partir daqui a AASP ja marca cada item como baixado do lado dela -
    // por isso salvamos item a item, isolando falhas, para nao perder
    // nenhuma publicacao caso uma unica gravacao de erro (ex.: pico de disco).
    const intimacoes = await buscarIntimacoesDoDia(chave, dia);
    totalEncontradas += intimacoes.length;
    for (const item of intimacoes) {
      try {
        if (salvarIntimacao(item)) novas++;
      } catch (erro) {
        falhas++;
        console.error(`[AASP] Falha ao gravar publicacao (codigoRelacionamento=${item.codigoRelacionamento}):`, erro.message);
      }
    }
  }

  return { ok: true, diasVerificados: dias.length, totalEncontradas, novas, falhas };
}

// Testa a chave sem marcar nada como baixado na AASP (usa o resumo, que e so leitura).
async function testarConexao(chave) {
  const dias = await diasComPendencias(chave, 30);
  const pendentes = dias.length;
  return { ok: true, pendentes };
}

module.exports = { obterChave, definirChave, sincronizar, testarConexao };
