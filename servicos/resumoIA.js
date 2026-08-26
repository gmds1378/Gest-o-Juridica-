// Resumo automatico de publicacoes usando a API gratuita da Groq (modelos
// open-source como Llama, rodando em hardware especializado da Groq - nao
// confundir com o Grok da xAI). So roda quando o administrador configura uma
// chave propria - sem chave, as publicacoes continuam funcionando normalmente,
// so sem o resumo. Chave gratuita (sem cartao de credito): https://console.groq.com/keys

const { Groq, RateLimitError } = require('groq-sdk');
const db = require('../db/conexao');

// gpt-oss-120b e o principal (melhor qualidade). gpt-oss-20b e a reserva:
// tem cota diaria propria e separada (nao compartilha com a principal), entao
// mesmo com o mesmo teto de 200 mil tokens/dia cada, juntos dao margem bem
// maior antes de faltar cota no dia.
const MODELO_PRINCIPAL = 'openai/gpt-oss-120b';
const MODELO_RESERVA = 'openai/gpt-oss-20b';

const INSTRUCOES = `Voce e assistente de um escritorio de advocacia brasileiro pequeno.
Resuma a publicacao do Diario de Justica abaixo em portugues, cobrindo sempre estes 3 pontos, nesta ordem:
1. Teor: o que e a publicacao (sentenca, despacho, decisao, intimacao para manifestar-se, etc.) e o assunto tratado.
2. Intimado(s): quem esta sendo intimado - parte e/ou advogado(a), quando identificavel no texto.
3. Prazo/data: se o texto mencionar prazo (quantos dias, a partir de quando) ou alguma data relevante, informe exatamente o que esta escrito. Senao, diga "sem prazo/data explicitos no texto".
Seja objetivo (ate 5 frases curtas). Nao invente informacao que nao esteja no texto - se algo nao for identificavel, diga "nao identificado" em vez de omitir.`;

function obterChave() {
  const linha = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'groq_chave'").get();
  return linha ? linha.valor : '';
}

function definirChave(chave) {
  db.prepare(`
    INSERT INTO configuracoes (chave, valor) VALUES ('groq_chave', ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `).run(chave || '');
}

async function resumir(texto) {
  const chave = obterChave();
  if (!chave) {
    const erro = new Error('Chave da API Groq não configurada.');
    erro.semChave = true;
    throw erro;
  }

  const groq = new Groq({ apiKey: chave });
  const mensagens = [
    { role: 'system', content: INSTRUCOES },
    { role: 'user', content: (texto || '').slice(0, 4000) }
  ];

  // gpt-oss e um modelo "raciocinador" - sem isso ele gasta os tokens da
  // resposta pensando por dentro e a resposta final sai vazia (mesmo problema
  // que ja tivemos com o Gemini). "low" deixa espaco de sobra pra resposta.
  const config = { messages: mensagens, max_completion_tokens: 700, reasoning_effort: 'low' };

  try {
    const resposta = await groq.chat.completions.create({ model: MODELO_PRINCIPAL, ...config });
    return (resposta.choices[0]?.message?.content || '').trim();
  } catch (erro) {
    // Cota diaria de tokens do modelo principal esgotada - usa o modelo
    // reserva (cota separada) em vez de falhar a publicacao inteira.
    if (!(erro instanceof RateLimitError)) throw erro;
    const resposta = await groq.chat.completions.create({ model: MODELO_RESERVA, ...config });
    return (resposta.choices[0]?.message?.content || '').trim();
  }
}

// Testa a chave com uma chamada minima (dentro do uso gratuito) so pra confirmar que funciona.
// Tambem tenta o modelo reserva se o principal estiver com a cota do dia
// esgotada, pra nao dar falso negativo numa chave que na verdade funciona.
async function testarConexao(chave) {
  const groq = new Groq({ apiKey: chave });
  try {
    await groq.chat.completions.create({
      model: MODELO_PRINCIPAL,
      messages: [{ role: 'user', content: 'oi' }],
      max_completion_tokens: 5
    });
  } catch (erro) {
    if (!(erro instanceof RateLimitError)) throw erro;
    await groq.chat.completions.create({
      model: MODELO_RESERVA,
      messages: [{ role: 'user', content: 'oi' }],
      max_completion_tokens: 5
    });
  }
  return { ok: true };
}

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resume todas as publicacoes que ainda nao tem resumo (usado apos cada
// sincronizacao, manual ou automatica). Silencioso por item: uma falha
// isolada (ex.: limite de uso gratuito) nao interrompe as demais.
// Espera um pouco entre chamadas para respeitar o limite de 30 requisicoes
// por minuto do plano gratuito da Groq.
async function resumirPendentes() {
  if (!obterChave()) return 0;

  const pendentes = db.prepare('SELECT id, texto FROM publicacoes WHERE resumo IS NULL').all();
  let resumidas = 0;
  for (const pub of pendentes) {
    try {
      const resumo = await resumir(pub.texto);
      db.prepare('UPDATE publicacoes SET resumo = ? WHERE id = ?').run(resumo, pub.id);
      resumidas++;
    } catch (erro) {
      console.error(`[Groq] Falha ao resumir publicação ${pub.id}:`, erro.message);
    }
    await aguardar(2200);
  }
  return resumidas;
}

module.exports = { obterChave, definirChave, resumir, testarConexao, resumirPendentes };
