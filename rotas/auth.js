// Autenticacao: login por usuario/senha e login com Google (OAuth).
//
// Nao existe autocadastro em nenhum dos dois caminhos. Quem cria conta e o
// administrador (ver rotas/usuarios.js); o login com Google apenas reconhece
// um e-mail que ja foi autorizado por ele.

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db/conexao');
const auditoria = require('../servicos/auditoria');
const { TAMANHO_MINIMO_SENHA } = require('../middleware/autenticacao');

const router = express.Router();

// Freia tentativa de adivinhar senha por forca bruta. O limite e por IP e so
// conta tentativas que falharam, entao quem digita certo nunca esbarra nele.
const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Aguarde 15 minutos e tente de novo.' }
});

function dadosDaSessao(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    login: usuario.login,
    perfil: usuario.perfil,
    cor: usuario.cor,
    senha_provisoria: !!usuario.senha_provisoria
  };
}

// GET /api/auth/config - o que a tela de login precisa saber antes do login
router.get('/config', (req, res) => {
  res.json({ googleAtivo: googleConfigurado() });
});

// POST /api/auth/login
router.post('/login', limitadorLogin, (req, res) => {
  const { login, senha } = req.body || {};
  if (!login || !senha) {
    return res.status(400).json({ erro: 'Informe login e senha.' });
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE login = ? AND ativo = 1').get(login.trim());
  if (!usuario || !bcrypt.compareSync(senha, usuario.senha_hash)) {
    return res.status(401).json({ erro: 'Login ou senha invalidos.' });
  }

  req.session.usuario = dadosDaSessao(usuario);
  auditoria.registrar(req, { acao: 'entrou', entidade: 'sessao', entidadeId: usuario.id, descricao: 'Login por usuário e senha' });
  res.json({ usuario: req.session.usuario });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('conectar.sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/me - retorna o usuario logado (usado ao carregar o app)
router.get('/me', (req, res) => {
  if (!req.session || !req.session.usuario) {
    return res.status(401).json({ erro: 'Nao autenticado.' });
  }
  res.json({ usuario: req.session.usuario });
});

// PUT /api/auth/me - o proprio usuario edita seu nome, login e/ou senha.
// Continua acessivel com senha provisoria: e justamente aqui que ele a troca.
router.put('/me', (req, res) => {
  if (!req.session || !req.session.usuario) {
    return res.status(401).json({ erro: 'Nao autenticado.' });
  }

  const { nome, login, senha_atual, nova_senha } = req.body || {};
  if (!nome || !nome.trim()) {
    return res.status(400).json({ erro: 'Informe o nome.' });
  }
  if (!login || !login.trim()) {
    return res.status(400).json({ erro: 'Informe o usuário de login.' });
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.session.usuario.id);
  const novoLogin = login.trim();

  if (novoLogin !== usuario.login) {
    const conflito = db.prepare('SELECT id FROM usuarios WHERE login = ? AND id != ?').get(novoLogin, usuario.id);
    if (conflito) {
      return res.status(409).json({ erro: 'Já existe um usuário com esse login.' });
    }
  }

  // Quem esta com senha provisoria precisa definir uma nova para liberar o sistema.
  if (usuario.senha_provisoria && !nova_senha) {
    return res.status(400).json({ erro: 'Defina uma nova senha para continuar usando o sistema.' });
  }

  let novaSenhaHash = usuario.senha_hash;
  if (nova_senha) {
    if (!senha_atual || !bcrypt.compareSync(senha_atual, usuario.senha_hash)) {
      return res.status(400).json({ erro: 'Senha atual incorreta.' });
    }
    if (nova_senha.length < TAMANHO_MINIMO_SENHA) {
      return res.status(400).json({ erro: `A nova senha deve ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.` });
    }
    if (bcrypt.compareSync(nova_senha, usuario.senha_hash)) {
      return res.status(400).json({ erro: 'A nova senha precisa ser diferente da atual.' });
    }
    novaSenhaHash = bcrypt.hashSync(nova_senha, 10);
  }

  db.prepare('UPDATE usuarios SET nome = ?, login = ?, senha_hash = ?, senha_provisoria = ? WHERE id = ?')
    .run(nome.trim(), novoLogin, novaSenhaHash, nova_senha ? 0 : usuario.senha_provisoria, usuario.id);

  const atualizado = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuario.id);
  req.session.usuario = dadosDaSessao(atualizado);
  if (nova_senha) {
    auditoria.registrar(req, { acao: 'alterou', entidade: 'sessao', entidadeId: usuario.id, descricao: 'Trocou a própria senha' });
  }
  res.json({ usuario: req.session.usuario });
});

// GET /api/auth/usuarios - lista simples de usuarios (para selects de "responsavel")
router.get('/usuarios', (req, res) => {
  if (!req.session || !req.session.usuario) {
    return res.status(401).json({ erro: 'Nao autenticado.' });
  }
  const usuarios = db.prepare('SELECT id, nome, login, perfil, cor FROM usuarios WHERE ativo = 1 ORDER BY nome').all();
  res.json({ usuarios });
});

// =====================================================================
// Login com Google (OAuth 2.0, fluxo de codigo de autorizacao)
//
// Sem biblioteca: sao duas chamadas HTTP. O id_token nao precisa ter a
// assinatura verificada porque chega direto do endpoint do Google, por HTTPS,
// numa requisicao servidor-a-servidor autenticada com o client_secret - e o
// proprio Google que documenta essa dispensa. Ainda assim conferimos "aud" e
// "iss" como sanidade.
// =====================================================================
const GOOGLE_AUTORIZACAO = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const EMISSORES_VALIDOS = ['accounts.google.com', 'https://accounts.google.com'];

function googleConfigurado() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

function decodificarIdToken(idToken) {
  const partes = String(idToken || '').split('.');
  if (partes.length !== 3) throw new Error('id_token em formato inesperado.');
  return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
}

// GET /api/auth/google - manda o usuario para a tela de consentimento do Google
router.get('/google', (req, res) => {
  if (!googleConfigurado()) {
    return res.status(503).send('Login com Google não está configurado neste servidor.');
  }

  // O "state" amarra o retorno a esta sessao e barra CSRF no callback.
  const state = crypto.randomBytes(16).toString('hex');
  req.session.googleState = state;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });
  res.redirect(`${GOOGLE_AUTORIZACAO}?${params}`);
});

// GET /api/auth/google/callback - retorno do Google
router.get('/google/callback', async (req, res) => {
  if (!googleConfigurado()) {
    return res.status(503).send('Login com Google não está configurado neste servidor.');
  }

  const falhar = (motivo) => res.redirect('/login.html?erro=' + encodeURIComponent(motivo));

  const { code, state, error } = req.query;
  if (error) return falhar('Login com Google cancelado.');
  if (!code) return falhar('Retorno do Google sem código de autorização.');
  if (!state || state !== req.session.googleState) return falhar('Sessão de login expirada. Tente novamente.');
  delete req.session.googleState;

  let perfil;
  try {
    const resposta = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
      }),
      signal: AbortSignal.timeout(20000)
    });

    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.error_description || dados.error || `HTTP ${resposta.status}`);

    perfil = decodificarIdToken(dados.id_token);
    if (!EMISSORES_VALIDOS.includes(perfil.iss)) throw new Error('Emissor do token inesperado.');
    if (perfil.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('Token emitido para outra aplicação.');
    if (!perfil.email || perfil.email_verified === false) throw new Error('Conta Google sem e-mail verificado.');
  } catch (erro) {
    console.error('[Google] Falha na troca do código de autorização:', erro.message);
    return falhar('Não foi possível concluir o login com Google.');
  }

  const email = perfil.email.trim().toLowerCase();
  const usuario = db.prepare('SELECT * FROM usuarios WHERE lower(email) = ? AND ativo = 1').get(email);
  if (!usuario) {
    // Sem autocadastro: e-mail desconhecido nao vira conta nova.
    console.warn(`[Google] Tentativa de login com e-mail nao autorizado: ${email}`);
    return falhar('Este e-mail não está autorizado a acessar o sistema. Fale com o administrador.');
  }

  // Guarda o identificador permanente da conta Google no primeiro login bem-sucedido.
  if (!usuario.google_sub) {
    db.prepare('UPDATE usuarios SET google_sub = ? WHERE id = ?').run(perfil.sub, usuario.id);
  } else if (usuario.google_sub !== perfil.sub) {
    console.warn(`[Google] google_sub divergente para ${email} - login recusado.`);
    return falhar('Não foi possível confirmar sua conta Google. Fale com o administrador.');
  }

  req.session.usuario = dadosDaSessao(usuario);
  auditoria.registrar(req, { acao: 'entrou', entidade: 'sessao', entidadeId: usuario.id, descricao: `Login com Google (${email})` });
  res.redirect('/');
});

module.exports = router;
