// CRUD simples de etiquetas coloridas (usadas para organizar processos).
const express = require('express');
const db = require('../db/conexao');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ etiquetas: db.prepare('SELECT * FROM etiquetas ORDER BY nome').all() });
});

router.post('/', (req, res) => {
  const { nome, cor } = req.body || {};
  if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Informe o nome da etiqueta.' });
  try {
    const resultado = db.prepare('INSERT INTO etiquetas (nome, cor) VALUES (?, ?)').run(nome.trim(), cor || '#64748b');
    res.status(201).json({ etiqueta: { id: resultado.lastInsertRowid, nome: nome.trim(), cor: cor || '#64748b' } });
  } catch (e) {
    res.status(409).json({ erro: 'Ja existe uma etiqueta com esse nome.' });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM etiquetas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
