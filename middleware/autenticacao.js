// Middlewares simples de autenticacao baseados em sessao (express-session).
// Nao ha JWT nem chamadas externas: tudo fica na memoria do servidor local.

function exigirLogin(req, res, next) {
  if (req.session && req.session.usuario) {
    return next();
  }
  return res.status(401).json({ erro: 'Sessao expirada ou usuario nao autenticado.' });
}

function exigirAdmin(req, res, next) {
  if (req.session && req.session.usuario && req.session.usuario.perfil === 'admin') {
    return next();
  }
  return res.status(403).json({ erro: 'Acao restrita ao administrador.' });
}

module.exports = { exigirLogin, exigirAdmin };
