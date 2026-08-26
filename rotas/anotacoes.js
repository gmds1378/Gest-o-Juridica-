// CRUD de anotacoes rapidas (avulsas ou vinculadas a processo/cliente).
const express = require('express');
const db = require('../db/conexao');

const router = express.Router();

const SELECT_ANOTACAO = `
  SELECT a.*, c.nome AS cliente_nome, p.numero_cnj, u.nome AS criado_por_nome
  FROM anotacoes a
  LEFT JOIN clientes c ON c.id = a.cliente_id
  LEFT JOIN processos p ON p.id = a.processo_id
  LEFT JOIN usuarios u ON u.id = a.criado_por
`;

// GET /api/anotacoes?q=&processoId=
router.get('/', (req, res) => {
  const { q, processoId } = req.query;
  let sql = SELECT_ANOTACAO + ' WHERE 1=1';
  const params = [];
  if (processoId) { sql += ' AND a.processo_id = ?'; params.push(processoId); }
  if (q) { sql += ' AND (a.titulo LIKE ? OR a.conteudo LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY a.fixado DESC, a.atualizado_em DESC';
  res.json({ anotacoes: db.prepare(sql).all(...params) });
});

router.post('/', (req, res) => {
  const { titulo, conteudo, processo_id, cliente_id } = req.body || {};
  if (!conteudo || !conteudo.trim()) return res.status(400).json({ erro: 'A anotacao nao pode estar vazia.' });

  const resultado = db.prepare(`
    INSERT INTO anotacoes (titulo, conteudo, processo_id, cliente_id, criado_por)
    VALUES (?, ?, ?, ?, ?)
  `).run(titulo || '', conteudo, processo_id || null, cliente_id || null, req.session.usuario.id);

  const anotacao = db.prepare(SELECT_ANOTACAO + ' WHERE a.id = ?').get(resultado.lastInsertRowid);
  res.status(201).json({ anotacao });
});

router.put('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM anotacoes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Anotacao nao encontrada.' });

  const { titulo, conteudo, processo_id, cliente_id } = req.body || {};
  if (!conteudo || !conteudo.trim()) return res.status(400).json({ erro: 'A anotacao nao pode estar vazia.' });

  db.prepare(`
    UPDATE anotacoes SET titulo = ?, conteudo = ?, processo_id = ?, cliente_id = ?,
      atualizado_em = datetime('now', 'localtime')
    WHERE id = ?
  `).run(titulo || '', conteudo, processo_id || null, cliente_id || null, req.params.id);

  const anotacao = db.prepare(SELECT_ANOTACAO + ' WHERE a.id = ?').get(req.params.id);
  res.json({ anotacao });
});

// PATCH /api/anotacoes/:id/fixar
router.patch('/:id/fixar', (req, res) => {
  const existente = db.prepare('SELECT * FROM anotacoes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Anotacao nao encontrada.' });

  const novoValor = existente.fixado ? 0 : 1;
  db.prepare(`UPDATE anotacoes SET fixado = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?`)
    .run(novoValor, req.params.id);

  const anotacao = db.prepare(SELECT_ANOTACAO + ' WHERE a.id = ?').get(req.params.id);
  res.json({ anotacao });
});

router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM anotacoes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Anotacao nao encontrada.' });
  db.prepare('DELETE FROM anotacoes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
