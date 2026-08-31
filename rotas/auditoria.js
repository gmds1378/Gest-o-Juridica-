// Consulta da trilha de auditoria - restrita ao administrador.
// A gravacao dos eventos fica em servicos/auditoria.js.

const express = require('express');
const db = require('../db/conexao');
const { exigirAdmin } = require('../middleware/autenticacao');

const router = express.Router();

router.use(exigirAdmin);

const LIMITE_PADRAO = 200;

// GET /api/auditoria?entidade=&usuarioId=&limite=
router.get('/', (req, res) => {
  const { entidade, usuarioId } = req.query;
  const limite = Math.min(Number(req.query.limite) || LIMITE_PADRAO, 1000);

  let sql = 'SELECT * FROM auditoria WHERE 1=1';
  const params = [];
  if (entidade) { sql += ' AND entidade = ?'; params.push(entidade); }
  if (usuarioId) { sql += ' AND usuario_id = ?'; params.push(usuarioId); }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limite);

  res.json({ eventos: db.prepare(sql).all(...params) });
});

// GET /api/auditoria/entidades - alimenta o filtro da tela
router.get('/entidades', (req, res) => {
  const linhas = db.prepare('SELECT DISTINCT entidade FROM auditoria ORDER BY entidade').all();
  res.json({ entidades: linhas.map((l) => l.entidade) });
});

module.exports = router;
