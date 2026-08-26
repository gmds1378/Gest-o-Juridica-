// Configuracoes gerais do escritorio. Por enquanto, so a chave da API de
// Intimacoes da AASP - visivel/editavel apenas pelo administrador.
const express = require('express');
const { exigirAdmin } = require('../middleware/autenticacao');
const aasp = require('../servicos/aaspIntimacoes');
const groq = require('../servicos/resumoIA');

const router = express.Router();

function mascarar(chave) {
  if (!chave) return '';
  if (chave.length <= 8) return '••••••••';
  return chave.slice(0, 4) + '•'.repeat(chave.length - 8) + chave.slice(-4);
}

// GET /api/configuracoes/aasp
router.get('/aasp', exigirAdmin, (req, res) => {
  const chave = aasp.obterChave();
  res.json({ configurada: !!chave, chaveMascarada: mascarar(chave) });
});

// PUT /api/configuracoes/aasp  { chave }
router.put('/aasp', exigirAdmin, (req, res) => {
  const { chave } = req.body || {};
  if (!chave || !chave.trim()) return res.status(400).json({ erro: 'Informe a chave da API.' });
  aasp.definirChave(chave.trim());
  res.json({ ok: true, chaveMascarada: mascarar(chave.trim()) });
});

// POST /api/configuracoes/aasp/testar - valida a chave sem consumir publicacoes
router.post('/aasp/testar', exigirAdmin, async (req, res) => {
  const chave = req.body && req.body.chave ? req.body.chave.trim() : aasp.obterChave();
  if (!chave) return res.status(400).json({ erro: 'Informe a chave da API.' });
  try {
    const resultado = await aasp.testarConexao(chave);
    res.json(resultado);
  } catch (erro) {
    res.status(400).json({ erro: erro.message || 'Não foi possível validar a chave.' });
  }
});

// DELETE /api/configuracoes/aasp - remove a chave (desativa a integracao)
router.delete('/aasp', exigirAdmin, (req, res) => {
  aasp.definirChave('');
  res.json({ ok: true });
});

// GET /api/configuracoes/groq
router.get('/groq', exigirAdmin, (req, res) => {
  const chave = groq.obterChave();
  res.json({ configurada: !!chave, chaveMascarada: mascarar(chave) });
});

// PUT /api/configuracoes/groq  { chave }
router.put('/groq', exigirAdmin, (req, res) => {
  const { chave } = req.body || {};
  if (!chave || !chave.trim()) return res.status(400).json({ erro: 'Informe a chave da API.' });
  groq.definirChave(chave.trim());
  res.json({ ok: true, chaveMascarada: mascarar(chave.trim()) });
});

// POST /api/configuracoes/groq/testar - chamada minima so pra validar a chave
router.post('/groq/testar', exigirAdmin, async (req, res) => {
  const chave = req.body && req.body.chave ? req.body.chave.trim() : groq.obterChave();
  if (!chave) return res.status(400).json({ erro: 'Informe a chave da API.' });
  try {
    const resultado = await groq.testarConexao(chave);
    res.json(resultado);
  } catch (erro) {
    res.status(400).json({ erro: (erro && erro.message) || 'Não foi possível validar a chave.' });
  }
});

// DELETE /api/configuracoes/groq - remove a chave (desativa o resumo automatico)
router.delete('/groq', exigirAdmin, (req, res) => {
  groq.definirChave('');
  res.json({ ok: true });
});

module.exports = router;
