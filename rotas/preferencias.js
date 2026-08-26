// Preferencias de layout do Painel (ordem e tamanho dos blocos) - guardadas
// em configuracoes (chave-valor), compartilhadas por todo o escritorio (nao
// e por usuario). Qualquer usuario logado pode reorganizar o proprio painel.
const express = require('express');
const db = require('../db/conexao');

const router = express.Router();

const CHAVE = 'layout_painel';

// GET /api/preferencias/painel
router.get('/painel', (req, res) => {
  const linha = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(CHAVE);
  if (!linha || !linha.valor) return res.json({ ordem: [], tamanhos: {} });
  try {
    const layout = JSON.parse(linha.valor);
    res.json({ ordem: Array.isArray(layout.ordem) ? layout.ordem : [], tamanhos: layout.tamanhos || {} });
  } catch (e) {
    res.json({ ordem: [], tamanhos: {} });
  }
});

// PUT /api/preferencias/painel  { ordem: [...], tamanhos: {...} }
router.put('/painel', (req, res) => {
  const { ordem, tamanhos } = req.body || {};
  if (!Array.isArray(ordem)) return res.status(400).json({ erro: 'Formato de ordem inválido.' });

  const valor = JSON.stringify({ ordem, tamanhos: tamanhos && typeof tamanhos === 'object' ? tamanhos : {} });
  db.prepare(`
    INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `).run(CHAVE, valor);

  res.json({ ok: true });
});

module.exports = router;
