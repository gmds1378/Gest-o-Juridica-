// CRUD de clientes.
const express = require('express');
const db = require('../db/conexao');

const router = express.Router();

// GET /api/clientes?q=termo
router.get('/', (req, res) => {
  const { q } = req.query;
  let clientes;
  if (q) {
    clientes = db.prepare(`
      SELECT * FROM clientes
      WHERE nome LIKE ? OR documento LIKE ? OR email LIKE ?
      ORDER BY nome
    `).all(`%${q}%`, `%${q}%`, `%${q}%`);
  } else {
    clientes = db.prepare('SELECT * FROM clientes ORDER BY nome').all();
  }
  res.json({ clientes });
});

// GET /api/clientes/:id
router.get('/:id', (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ erro: 'Cliente nao encontrado.' });
  res.json({ cliente });
});

// POST /api/clientes
router.post('/', (req, res) => {
  const { nome, documento, telefone, email, observacoes } = req.body || {};
  if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Nome do cliente e obrigatorio.' });

  const resultado = db.prepare(`
    INSERT INTO clientes (nome, documento, telefone, email, observacoes)
    VALUES (?, ?, ?, ?, ?)
  `).run(nome.trim(), documento || null, telefone || null, email || null, observacoes || null);

  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json({ cliente });
});

// PUT /api/clientes/:id
router.put('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Cliente nao encontrado.' });

  const { nome, documento, telefone, email, observacoes } = req.body || {};
  if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Nome do cliente e obrigatorio.' });

  db.prepare(`
    UPDATE clientes SET nome = ?, documento = ?, telefone = ?, email = ?, observacoes = ?,
      atualizado_em = datetime('now', 'localtime')
    WHERE id = ?
  `).run(nome.trim(), documento || null, telefone || null, email || null, observacoes || null, req.params.id);

  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  res.json({ cliente });
});

// DELETE /api/clientes/:id
router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Cliente nao encontrado.' });

  const temProcessos = db.prepare('SELECT COUNT(*) AS total FROM processos WHERE cliente_id = ?').get(req.params.id);
  if (temProcessos.total > 0) {
    return res.status(409).json({ erro: 'Este cliente possui processos vinculados. Remova ou realoque os processos antes de excluir.' });
  }

  db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
