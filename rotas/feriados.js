// CRUD de feriados, usados na calculadora de prazos em dias uteis.
const express = require('express');
const db = require('../db/conexao');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ feriados: db.prepare('SELECT * FROM feriados ORDER BY data').all() });
});

router.post('/', (req, res) => {
  const { data, descricao, abrangencia } = req.body || {};
  if (!data || !descricao) return res.status(400).json({ erro: 'Informe a data e a descricao do feriado.' });
  try {
    const resultado = db.prepare('INSERT INTO feriados (data, descricao, abrangencia) VALUES (?, ?, ?)')
      .run(data, descricao, abrangencia || 'nacional');
    res.status(201).json({ feriado: { id: resultado.lastInsertRowid, data, descricao, abrangencia: abrangencia || 'nacional' } });
  } catch (e) {
    res.status(409).json({ erro: 'Ja existe um feriado cadastrado nesta data.' });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM feriados WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
