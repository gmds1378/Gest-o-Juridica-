// Middlewares de autenticacao baseados em sessao (express-session).
// A sessao em si e persistida no SQLite - ver middleware/sessaoSqlite.js.

const TAMANHO_MINIMO_SENHA = 8;

function exigirLogin(req, res, next) {
  if (!req.session || !req.session.usuario) {
    return res.status(401).json({ erro: 'Sessao expirada ou usuario nao autenticado.' });
  }

  // Senha provisoria (recem-criada ou resetada pelo administrador) da acesso
  // apenas a troca de senha, em /api/auth/me. Bloquear aqui, e nao so na tela,
  // e o que impede alguem de usar o sistema com a senha que o admin conhece.
  if (req.session.usuario.senha_provisoria) {
    return res.status(403).json({
      erro: 'Defina uma nova senha antes de usar o sistema.',
      senhaProvisoria: true
    });
  }

  return next();
}

function exigirAdmin(req, res, next) {
  exigirLogin(req, res, () => {
    if (req.session.usuario.perfil !== 'admin') {
      return res.status(403).json({ erro: 'Acao restrita ao administrador.' });
    }
    return next();
  });
}

module.exports = { exigirLogin, exigirAdmin, TAMANHO_MINIMO_SENHA };
