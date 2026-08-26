// Servidor principal do sistema de gestao juridica.
// Roda 100% local/rede local: nenhuma chamada a servicos externos.
//
// Uso:
//   npm install
//   npm run seed     (uma vez, cria os 3 usuarios)
//   npm start
//
// Outros computadores da rede acessam via http://<IP-DESTE-PC>:3000

const path = require('path');
const express = require('express');
const session = require('express-session');

const db = require('./db/conexao'); // garante que o banco e as tabelas existem antes de tudo
const { exigirLogin } = require('./middleware/autenticacao');

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
const aaspIntimacoes = require('./servicos/aaspIntimacoes');
const resumoIA = require('./servicos/resumoIA');

const app = express();
const PORTA = process.env.PORTA || process.env.PORT || 3000;

app.use(express.json());

app.use(session({
  name: 'conectar.sid',
  secret: 'gestao-juridica-rede-local-troque-se-quiser', // uso apenas local, sem exposicao a internet
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 12 // 12 horas
  }
}));

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

// Arquivos estaticos do frontend (HTML/CSS/JS puro, sem build)
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORTA, '0.0.0.0', () => {
  console.log(`\nSistema de Gestao Juridica rodando.`);
  console.log(`- Neste computador:  http://localhost:${PORTA}`);
  console.log(`- Na rede local:     http://<IP-DESTE-PC>:${PORTA}\n`);
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
