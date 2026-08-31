// Servidor principal do sistema de gestao juridica.
//
// Roda atras de um proxy reverso (Caddy) que cuida do HTTPS. As integracoes
// externas (AASP, DataJud e, opcionalmente, Groq) sao descritas no README.
//
// Uso:
//   npm install
//   npm run seed     (uma vez, cria os usuarios iniciais)
//   npm start
//
// Variaveis de ambiente (ver .env.exemplo):
//   SESSION_SECRET  obrigatoria em producao
//   NODE_ENV        "production" ativa cookie seguro e confianca no proxy
//   PORTA / PORT    porta HTTP local (padrao 3000)
//   TZ              deve ser America/Sao_Paulo (validado em db/conexao.js)

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const db = require('./db/conexao'); // garante banco, tabelas e fuso horario antes de tudo
const { exigirLogin } = require('./middleware/autenticacao');
const SessaoSqliteStore = require('./middleware/sessaoSqlite');

const rotaAuth = require('./rotas/auth');
const rotaClientes = require('./rotas/clientes');
const rotaProcessos = require('./rotas/processos');
const rotaModelos = require('./rotas/modelos');
const rotaDocumentos = require('./rotas/documentos');
const rotaPrazos = require('./rotas/prazos');
const rotaAnotacoes = require('./rotas/anotacoes');
const rotaFeriados = require('./rotas/feriados');
const rotaEtiquetas = require('./rotas/etiquetas');
const rotaDashboard = require('./rotas/dashboard');
const rotaBusca = require('./rotas/busca');
const rotaAtalhos = require('./rotas/atalhos');
const rotaPreferencias = require('./rotas/preferencias');
const rotaConfiguracoes = require('./rotas/configuracoes');
const rotaPublicacoes = require('./rotas/publicacoes');
const rotaUsuarios = require('./rotas/usuarios');
const rotaAuditoria = require('./rotas/auditoria');
const aaspIntimacoes = require('./servicos/aaspIntimacoes');
const resumoIA = require('./servicos/resumoIA');
const movimentacoes = require('./servicos/movimentacoes');

const app = express();
const PORTA = process.env.PORTA || process.env.PORT || 3000;
const PRODUCAO = process.env.NODE_ENV === 'production';

// O segredo assina os cookies de sessao: se vazar, da para forjar login de
// qualquer usuario. Em producao ele e obrigatorio; em desenvolvimento geramos
// um temporario (que muda a cada reinicio, deslogando todo mundo - de proposito,
// para ninguem confundir a maquina local com o servidor de verdade).
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  if (PRODUCAO) {
    throw new Error(
      'SESSION_SECRET nao definida. Em producao ela e obrigatoria. ' +
      'Gere uma com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  console.warn('[Aviso] SESSION_SECRET nao definida - usando segredo temporario (apenas para desenvolvimento).');
  return crypto.randomBytes(32).toString('hex');
})();

// Atras do Caddy, o IP do cliente e o protocolo chegam em X-Forwarded-*.
// Sem isso o cookie "secure" nunca e enviado e o rate limit veria todo mundo
// como o mesmo IP (o do proxy).
if (PRODUCAO) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // O frontend monta as telas com template strings e usa estilos inline
      // (style="..." nos elementos), entao 'unsafe-inline' e necessario aqui.
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  // Downloads de documentos precisam poder ser abertos pelo navegador.
  crossOriginResourcePolicy: { policy: 'same-site' }
}));

app.use(express.json());

app.use(session({
  name: 'conectar.sid',
  secret: SESSION_SECRET,
  store: new SessaoSqliteStore(),
  resave: false,
  saveUninitialized: false,
  rolling: true, // renova a validade a cada requisicao: ninguem cai no meio do expediente
  cookie: {
    httpOnly: true,
    secure: PRODUCAO,     // exige HTTPS em producao
    sameSite: 'lax',      // bloqueia envio do cookie em requisicoes vindas de outros sites
    maxAge: 1000 * 60 * 60 * 12 // 12 horas
  }
}));

// Usado pelo monitoramento de uptime. Fica antes da autenticacao de proposito.
app.get('/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, horario: new Date().toISOString() });
  } catch (erro) {
    res.status(503).json({ ok: false, erro: 'Banco de dados indisponivel.' });
  }
});

// Rotas de autenticacao ficam abertas (login precisa ser acessivel sem sessao)
app.use('/api/auth', rotaAuth);

// Todas as demais rotas de API exigem login
app.use('/api/clientes', exigirLogin, rotaClientes);
app.use('/api/processos', exigirLogin, rotaProcessos);
app.use('/api/modelos', exigirLogin, rotaModelos);
app.use('/api/documentos', exigirLogin, rotaDocumentos);
app.use('/api/prazos', exigirLogin, rotaPrazos);
app.use('/api/anotacoes', exigirLogin, rotaAnotacoes);
app.use('/api/feriados', exigirLogin, rotaFeriados);
app.use('/api/etiquetas', exigirLogin, rotaEtiquetas);
app.use('/api/dashboard', exigirLogin, rotaDashboard);
app.use('/api/busca', exigirLogin, rotaBusca);
app.use('/api/atalhos', exigirLogin, rotaAtalhos);
app.use('/api/preferencias', exigirLogin, rotaPreferencias);
app.use('/api/configuracoes', exigirLogin, rotaConfiguracoes);
app.use('/api/publicacoes', exigirLogin, rotaPublicacoes);
app.use('/api/usuarios', exigirLogin, rotaUsuarios);
app.use('/api/auditoria', exigirLogin, rotaAuditoria);

// Arquivos estaticos do frontend (HTML/CSS/JS puro, sem build)
app.use(express.static(path.join(__dirname, 'public')));

// Tratador global: sem ele, um erro sincrono numa rota devolve o stack trace
// do servidor para o navegador.
app.use((erro, req, res, next) => {
  if (res.headersSent) return next(erro);

  if (erro.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ erro: 'Arquivo maior que o limite permitido.' });
  }

  // Erros de validacao (status < 500) trazem mensagem escrita para o usuario.
  // Qualquer outra coisa e falha nossa: registra o detalhe no log e devolve
  // uma mensagem generica, para nao vazar caminho de arquivo ou stack trace.
  const status = erro.status || 500;
  if (status < 500) {
    return res.status(status).json({ erro: erro.message });
  }

  console.error(`[Erro] ${req.method} ${req.originalUrl}:`, erro);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

// Uma promise rejeitada sem catch derruba o processo no Node moderno. Como o
// systemd reinicia o servico, o registro no log e o que permite descobrir a causa.
process.on('unhandledRejection', (motivo) => {
  console.error('[Erro] Promise rejeitada sem tratamento:', motivo);
});

app.listen(PORTA, '0.0.0.0', () => {
  console.log(`\nSistema de Gestao Juridica rodando (${PRODUCAO ? 'producao' : 'desenvolvimento'}).`);
  console.log(`- Porta local:  http://localhost:${PORTA}`);
  console.log(`- Fuso horario: ${process.env.TZ}\n`);
});

// Sincronizacao automatica de publicacoes (ex.: AASP Intimacoes). E um "no-op"
// silencioso enquanto nenhuma chave estiver configurada em Configuracoes.
const INTERVALO_SINCRONIZACAO_MS = 4 * 60 * 60 * 1000; // 4 horas

async function executarSincronizacaoAutomatica() {
  try {
    const resultado = await aaspIntimacoes.sincronizar();
    if (resultado.ok && resultado.novas > 0) {
      console.log(`[Publicacoes] ${resultado.novas} publicacao(oes) nova(s) importada(s) automaticamente.`);
    }
    if (resultado.ok && resultado.diasComFalha && resultado.diasComFalha.length) {
      console.error(
        `[Publicacoes] ATENCAO: ${resultado.diasComFalha.length} dia(s) nao foram gravados. ` +
        'Os dados estao em dados/aasp-brutos/. Rode: npm run reimportar-aasp'
      );
    }
    const resumidas = await resumoIA.resumirPendentes();
    if (resumidas > 0) {
      console.log(`[Publicacoes] ${resumidas} publicacao(oes) resumida(s) automaticamente.`);
    }
  } catch (erro) {
    console.error('[Publicacoes] Falha na sincronizacao automatica:', erro.message);
  }
}

setTimeout(executarSincronizacaoAutomatica, 30 * 1000); // primeira checagem logo apos subir
setInterval(executarSincronizacaoAutomatica, INTERVALO_SINCRONIZACAO_MS);

// Movimentações DataJud: ~1x/dia, em lote. Não dispara no boot (evita bater em
// todos os processos no meio de um deploy). A primeira execução espera 1 hora.
const INTERVALO_MOVIMENTACOES_MS = Number(process.env.DATAJUD_INTERVALO_MS) || 24 * 60 * 60 * 1000;
const ATRASO_PRIMEIRO_SYNC_MS = Number(process.env.DATAJUD_ATRASO_INICIAL_MS) || 60 * 60 * 1000;

async function executarSincronizacaoMovimentacoes() {
  try {
    const resultado = await movimentacoes.sincronizarPendentes();
    if (!resultado.ok) {
      if (resultado.erro && /não configurada/i.test(resultado.erro)) return;
      console.warn('[datajud] sync_failed', resultado.erro);
      return;
    }
    const novos = (resultado.resultados || []).reduce((n, r) => n + (r.novos || 0), 0);
    console.log('[datajud] sync_completed', { processados: resultado.processados, novos });
  } catch (erro) {
    console.error('[datajud] sync_failed', erro.message);
  }
}

setTimeout(executarSincronizacaoMovimentacoes, ATRASO_PRIMEIRO_SYNC_MS);
setInterval(executarSincronizacaoMovimentacoes, INTERVALO_MOVIMENTACOES_MS);
