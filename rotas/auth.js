const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/conexao');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { login, senha } = req.body || {};
  if (!login || !senha) {
    return res.status(400).json({ erro: 'Informe login e senha.' });
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE login = ? AND ativo = 1').get(login.trim());
  if (!usuario || !bcrypt.compareSync(senha, usuario.senha_hash)) {
    return res.status(401).json({ erro: 'Login ou senha invalidos.' });
  }

  req.session.usuario = {
    id: usuario.id,
    nome: usuario.nome,
    login: usuario.login,
    perfil: usuario.perfil,
    cor: usuario.cor
  };

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

// PUT /api/auth/me - o proprio usuario edita seu nome e/ou senha
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

  let novaSenhaHash = usuario.senha_hash;
  if (nova_senha) {
    if (!senha_atual || !bcrypt.compareSync(senha_atual, usuario.senha_hash)) {
      return res.status(400).json({ erro: 'Senha atual incorreta.' });
    }
    if (nova_senha.length < 6) {
      return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }
    novaSenhaHash = bcrypt.hashSync(nova_senha, 10);
  }

  db.prepare('UPDATE usuarios SET nome = ?, login = ?, senha_hash = ? WHERE id = ?')
    .run(nome.trim(), novoLogin, novaSenhaHash, usuario.id);

  req.session.usuario.nome = nome.trim();
  req.session.usuario.login = novoLogin;
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

module.exports = router;
