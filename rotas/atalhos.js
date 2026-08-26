// CRUD de atalhos (links de tribunais e outros sites uteis), exibidos no Painel.
const express = require('express');
const db = require('../db/conexao');

const router = express.Router();

function normalizarUrl(url) {
  const limpo = (url || '').trim();
  if (!limpo) return limpo;
  return /^https?:\/\//i.test(limpo) ? limpo : `https://${limpo}`;
}

router.get('/', (req, res) => {
  res.json({ atalhos: db.prepare('SELECT * FROM atalhos ORDER BY titulo').all() });
});

router.post('/', (req, res) => {
  const { titulo, url } = req.body || {};
  if (!titulo || !titulo.trim()) return res.status(400).json({ erro: 'Informe o título do atalho.' });
  if (!url || !url.trim()) return res.status(400).json({ erro: 'Informe o link.' });

  const resultado = db.prepare('INSERT INTO atalhos (titulo, url) VALUES (?, ?)')
    .run(titulo.trim(), normalizarUrl(url));

  const atalho = db.prepare('SELECT * FROM atalhos WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json({ atalho });
});

router.put('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM atalhos WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Atalho não encontrado.' });

  const { titulo, url } = req.body || {};
  if (!titulo || !titulo.trim()) return res.status(400).json({ erro: 'Informe o título do atalho.' });
  if (!url || !url.trim()) return res.status(400).json({ erro: 'Informe o link.' });

  db.prepare('UPDATE atalhos SET titulo = ?, url = ? WHERE id = ?').run(titulo.trim(), normalizarUrl(url), req.params.id);
  const atalho = db.prepare('SELECT * FROM atalhos WHERE id = ?').get(req.params.id);
  res.json({ atalho });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM atalhos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
