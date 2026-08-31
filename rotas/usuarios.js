// Administracao de usuarios - restrita ao administrador.
//
// Nao existe autocadastro: toda conta nasce aqui. O admin define uma senha
// provisoria (gerada pelo sistema) e a pessoa e obrigada a troca-la no primeiro
// acesso - ver senha_provisoria em middleware/autenticacao.js.

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/conexao');
const { exigirAdmin } = require('../middleware/autenticacao');
const auditoria = require('../servicos/auditoria');

const router = express.Router();

router.use(exigirAdmin);

const CAMPOS_PUBLICOS = 'id, nome, login, email, perfil, cor, ativo, senha_provisoria, (google_sub IS NOT NULL) AS google_vinculado, criado_em';

// Senha provisoria legivel para ser ditada por telefone: sem caracteres que se
// confundem (0/O, 1/l/I) e sem simbolos que atrapalhem na hora de digitar.
const ALFABETO_SENHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function gerarSenhaProvisoria(tamanho = 12) {
  const bytes = crypto.randomBytes(tamanho);
  return Array.from(bytes, (b) => ALFABETO_SENHA[b % ALFABETO_SENHA.length]).join('');
}

function normalizarEmail(email) {
  const limpo = (email || '').trim().toLowerCase();
  return limpo || null;
}

function validarEntrada({ nome, login, email, perfil }) {
  if (!nome || !nome.trim()) return 'Informe o nome.';
  if (!login || !login.trim()) return 'Informe o usuário de login.';
  if (!/^[a-z0-9._-]+$/i.test(login.trim())) return 'O login pode ter apenas letras, números, ponto, hífen e underline.';
  if (perfil && !['admin', 'usuario'].includes(perfil)) return 'Perfil inválido.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'E-mail inválido.';
  return null;
}

// GET /api/usuarios
router.get('/', (req, res) => {
  const usuarios = db.prepare(`SELECT ${CAMPOS_PUBLICOS} FROM usuarios ORDER BY ativo DESC, nome`).all();
  res.json({ usuarios });
});

// POST /api/usuarios - cria a conta e devolve a senha provisoria uma unica vez
router.post('/', (req, res) => {
  const { nome, login, email, perfil, cor } = req.body || {};
  const erro = validarEntrada({ nome, login, email, perfil });
  if (erro) return res.status(400).json({ erro });

  const loginLimpo = login.trim();
  const emailLimpo = normalizarEmail(email);

  if (db.prepare('SELECT id FROM usuarios WHERE login = ?').get(loginLimpo)) {
    return res.status(409).json({ erro: 'Já existe um usuário com esse login.' });
  }
  if (emailLimpo && db.prepare('SELECT id FROM usuarios WHERE lower(email) = ?').get(emailLimpo)) {
    return res.status(409).json({ erro: 'Já existe um usuário com esse e-mail.' });
  }

  const senhaProvisoria = gerarSenhaProvisoria();
  const resultado = db.prepare(`
    INSERT INTO usuarios (nome, login, email, senha_hash, perfil, cor, senha_provisoria)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(
    nome.trim(),
    loginLimpo,
    emailLimpo,
    bcrypt.hashSync(senhaProvisoria, 10),
    perfil || 'usuario',
    cor || '#64748b'
  );

  auditoria.registrar(req, {
    acao: 'criou', entidade: 'usuarios', entidadeId: resultado.lastInsertRowid,
    descricao: `Criou o usuário ${nome.trim()} (${loginLimpo})`
  });

  const usuario = db.prepare(`SELECT ${CAMPOS_PUBLICOS} FROM usuarios WHERE id = ?`).get(resultado.lastInsertRowid);
  // A senha so aparece nesta resposta - depois disso existe apenas o hash.
  res.status(201).json({ usuario, senhaProvisoria });
});

// PUT /api/usuarios/:id - dados cadastrais (nao mexe em senha)
router.put('/:id', (req, res) => {
  const alvo = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });

  const { nome, login, email, perfil, cor } = req.body || {};
  const erro = validarEntrada({ nome, login, email, perfil });
  if (erro) return res.status(400).json({ erro });

  const loginLimpo = login.trim();
  const emailLimpo = normalizarEmail(email);

  if (db.prepare('SELECT id FROM usuarios WHERE login = ? AND id != ?').get(loginLimpo, alvo.id)) {
    return res.status(409).json({ erro: 'Já existe um usuário com esse login.' });
  }
  if (emailLimpo && db.prepare('SELECT id FROM usuarios WHERE lower(email) = ? AND id != ?').get(emailLimpo, alvo.id)) {
    return res.status(409).json({ erro: 'Já existe um usuário com esse e-mail.' });
  }

  // Rebaixar o ultimo admin deixaria o sistema sem quem administra.
  const novoPerfil = perfil || alvo.perfil;
  if (alvo.perfil === 'admin' && novoPerfil !== 'admin' && contarAdminsAtivos(alvo.id) === 0) {
    return res.status(400).json({ erro: 'Este é o único administrador ativo. Promova outra pessoa antes de rebaixá-lo.' });
  }

  // Trocar o e-mail desfaz o vinculo com a conta Google anterior.
  const desvincularGoogle = emailLimpo !== normalizarEmail(alvo.email);

  db.prepare(`
    UPDATE usuarios SET nome = ?, login = ?, email = ?, perfil = ?, cor = ?${desvincularGoogle ? ', google_sub = NULL' : ''}
    WHERE id = ?
  `).run(nome.trim(), loginLimpo, emailLimpo, novoPerfil, cor || alvo.cor, alvo.id);

  auditoria.registrar(req, {
    acao: 'alterou', entidade: 'usuarios', entidadeId: alvo.id,
    descricao: `Alterou o usuário ${nome.trim()} (${loginLimpo})`
  });

  res.json({ usuario: db.prepare(`SELECT ${CAMPOS_PUBLICOS} FROM usuarios WHERE id = ?`).get(alvo.id) });
});

// POST /api/usuarios/:id/resetar-senha - gera nova senha provisoria
router.post('/:id/resetar-senha', (req, res) => {
  const alvo = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });

  const senhaProvisoria = gerarSenhaProvisoria();
  db.prepare('UPDATE usuarios SET senha_hash = ?, senha_provisoria = 1 WHERE id = ?')
    .run(bcrypt.hashSync(senhaProvisoria, 10), alvo.id);

  // Derruba as sessoes abertas: senha resetada nao pode deixar ninguem logado.
  encerrarSessoesDoUsuario(alvo.id);

  auditoria.registrar(req, {
    acao: 'alterou', entidade: 'usuarios', entidadeId: alvo.id,
    descricao: `Resetou a senha de ${alvo.nome}`
  });

  res.json({ senhaProvisoria });
});

// PATCH /api/usuarios/:id/ativo - ativa ou desativa o acesso
router.patch('/:id/ativo', (req, res) => {
  const alvo = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });

  if (alvo.id === req.session.usuario.id) {
    return res.status(400).json({ erro: 'Você não pode desativar a própria conta.' });
  }

  const novoAtivo = alvo.ativo ? 0 : 1;
  if (!novoAtivo && alvo.perfil === 'admin' && contarAdminsAtivos(alvo.id) === 0) {
    return res.status(400).json({ erro: 'Este é o único administrador ativo. Promova outra pessoa antes de desativá-lo.' });
  }

  db.prepare('UPDATE usuarios SET ativo = ? WHERE id = ?').run(novoAtivo, alvo.id);
  if (!novoAtivo) encerrarSessoesDoUsuario(alvo.id);

  auditoria.registrar(req, {
    acao: 'alterou', entidade: 'usuarios', entidadeId: alvo.id,
    descricao: `${novoAtivo ? 'Reativou' : 'Desativou'} o usuário ${alvo.nome}`
  });

  res.json({ usuario: db.prepare(`SELECT ${CAMPOS_PUBLICOS} FROM usuarios WHERE id = ?`).get(alvo.id) });
});

// Usuarios nunca sao excluidos, so desativados: prazos, documentos e a propria
// auditoria referenciam quem fez cada coisa, e esse historico precisa sobreviver.
function contarAdminsAtivos(exceto) {
  const { total } = db.prepare(
    "SELECT COUNT(*) AS total FROM usuarios WHERE perfil = 'admin' AND ativo = 1 AND id != ?"
  ).get(exceto);
  return total;
}

// Remove as sessoes abertas de um usuario (senha resetada ou conta desativada
// precisam ter efeito imediato, nao so no proximo login). Le e interpreta cada
// sessao em vez de casar texto no JSON, que erraria em nome de usuario contendo
// algo parecido com o padrao buscado.
function encerrarSessoesDoUsuario(usuarioId) {
  const sessoes = db.prepare('SELECT sid, dados FROM sessoes').all();
  const apagar = db.prepare('DELETE FROM sessoes WHERE sid = ?');
  for (const sessao of sessoes) {
    try {
      const dados = JSON.parse(sessao.dados);
      if (dados.usuario && dados.usuario.id === usuarioId) apagar.run(sessao.sid);
    } catch {
      apagar.run(sessao.sid); // sessao ilegivel nao serve para nada
    }
  }
}

module.exports = router;
