// Fila de revisao de publicacoes importadas (ex.: API de Intimacoes da AASP).
const express = require('express');
const db = require('../db/conexao');
const aasp = require('../servicos/aaspIntimacoes');
const groq = require('../servicos/resumoIA');

const router = express.Router();

const SELECT_PUBLICACAO = `
  SELECT pub.*, c.nome AS cliente_nome, p.numero_cnj AS processo_numero_cnj
  FROM publicacoes pub
  LEFT JOIN processos p ON p.id = pub.processo_id
  LEFT JOIN clientes c ON c.id = p.cliente_id
`;

// GET /api/publicacoes?lida=0
router.get('/', (req, res) => {
  const { lida } = req.query;
  let sql = SELECT_PUBLICACAO + ' WHERE 1=1';
  const params = [];
  if (lida !== undefined) { sql += ' AND pub.lida = ?'; params.push(lida === 'true' || lida === '1' ? 1 : 0); }
  sql += ' ORDER BY pub.data_disponibilizacao DESC, pub.id DESC';
  res.json({ publicacoes: db.prepare(sql).all(...params) });
});

// GET /api/publicacoes/contagem-nao-lidas
router.get('/contagem-nao-lidas', (req, res) => {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM publicacoes WHERE lida = 0').get();
  res.json({ total });
});

// POST /api/publicacoes/sincronizar - busca publicacoes novas na origem configurada.
// Se a chave da Groq estiver configurada, os resumos rodam em segundo plano
// (nao trava a resposta - resumir muitas publicacoes de uma vez pode levar minutos
// por causa do limite de requisicoes por minuto do plano gratuito).
router.post('/sincronizar', async (req, res) => {
  try {
    const resultado = await aasp.sincronizar();
    if (!resultado.ok) return res.status(400).json({ erro: resultado.erro });

    groq.resumirPendentes().catch((erro) => {
      console.error('[Groq] Falha ao resumir publicações em segundo plano:', erro.message);
    });

    res.json(resultado);
  } catch (erro) {
    console.error('Falha ao sincronizar publicacoes:', erro);
    res.status(502).json({ erro: erro.message || 'Falha ao consultar a API de publicações.' });
  }
});

// POST /api/publicacoes/:id/resumir - gera (ou regenera) o resumo de uma publicacao
router.post('/:id/resumir', async (req, res) => {
  const existente = db.prepare('SELECT * FROM publicacoes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Publicação não encontrada.' });

  try {
    const resumo = await groq.resumir(existente.texto);
    db.prepare('UPDATE publicacoes SET resumo = ? WHERE id = ?').run(resumo, req.params.id);
    const publicacao = db.prepare(SELECT_PUBLICACAO + ' WHERE pub.id = ?').get(req.params.id);
    res.json({ publicacao });
  } catch (erro) {
    const status = erro.semChave ? 400 : 502;
    res.status(status).json({ erro: erro.message || 'Não foi possível gerar o resumo.' });
  }
});

// PATCH /api/publicacoes/:id/lida - alterna lida/nao lida
router.patch('/:id/lida', (req, res) => {
  const existente = db.prepare('SELECT * FROM publicacoes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Publicação não encontrada.' });
  db.prepare('UPDATE publicacoes SET lida = ? WHERE id = ?').run(existente.lida ? 0 : 1, req.params.id);
  const publicacao = db.prepare(SELECT_PUBLICACAO + ' WHERE pub.id = ?').get(req.params.id);
  res.json({ publicacao });
});

// PUT /api/publicacoes/:id/processo - vincula (ou revincula) manualmente a um processo
router.put('/:id/processo', (req, res) => {
  const existente = db.prepare('SELECT * FROM publicacoes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Publicação não encontrada.' });
  const { processo_id } = req.body || {};
  db.prepare('UPDATE publicacoes SET processo_id = ? WHERE id = ?').run(processo_id || null, req.params.id);
  const publicacao = db.prepare(SELECT_PUBLICACAO + ' WHERE pub.id = ?').get(req.params.id);
  res.json({ publicacao });
});

// DELETE /api/publicacoes/:id - remove da fila (ex.: publicacao irrelevante)
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM publicacoes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function apenasDigitos(texto) {
  return (texto || '').replace(/\D/g, '');
}

function normalizarNome(texto) {
  return (texto || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// POST /api/publicacoes/:id/criar-processo - cadastra processo (e cliente, se
// necessario) no acervo a partir dos dados da propria publicacao. Sempre com
// verificacao previa de duplicidade: numero CNJ (normalizado, so digitos) e
// nome do cliente (normalizado) - reaproveita o que ja existir em vez de duplicar.
router.post('/:id/criar-processo', (req, res) => {
  const publicacao = db.prepare('SELECT * FROM publicacoes WHERE id = ?').get(req.params.id);
  if (!publicacao) return res.status(404).json({ erro: 'Publicação não encontrada.' });
  if (publicacao.processo_id) return res.status(400).json({ erro: 'Esta publicação já está vinculada a um processo.' });

  const { cliente_nome, cliente_documento, numero_cnj, vara_comarca, area_direito } = req.body || {};
  if (!cliente_nome || !cliente_nome.trim()) return res.status(400).json({ erro: 'Informe o nome do cliente.' });

  const cnjDigitos = apenasDigitos(numero_cnj);

  // 1) numero CNJ ja cadastrado em outro processo -> so vincula, nao duplica.
  if (cnjDigitos) {
    const processos = db.prepare("SELECT * FROM processos WHERE numero_cnj IS NOT NULL AND numero_cnj != ''").all();
    const existente = processos.find(p => apenasDigitos(p.numero_cnj) === cnjDigitos);
    if (existente) {
      db.prepare('UPDATE publicacoes SET processo_id = ? WHERE id = ?').run(existente.id, publicacao.id);
      const processo = db.prepare(`
        SELECT p.*, c.nome AS cliente_nome FROM processos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?
      `).get(existente.id);
      return res.json({ vinculado: true, processo });
    }
  }

  // 2) cliente com nome equivalente ja cadastrado -> reaproveita em vez de duplicar.
  const nomeNormalizado = normalizarNome(cliente_nome);
  const clientes = db.prepare('SELECT * FROM clientes').all();
  let cliente = clientes.find(c => normalizarNome(c.nome) === nomeNormalizado);
  let clienteReaproveitado = !!cliente;

  if (!cliente) {
    const resultado = db.prepare(`
      INSERT INTO clientes (nome, documento) VALUES (?, ?)
    `).run(cliente_nome.trim(), (cliente_documento || '').trim() || null);
    cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(resultado.lastInsertRowid);
  }

  const resultadoProcesso = db.prepare(`
    INSERT INTO processos (cliente_id, numero_cnj, vara_comarca, area_direito, status)
    VALUES (?, ?, ?, ?, 'ativo')
  `).run(cliente.id, (numero_cnj || '').trim() || null, (vara_comarca || '').trim() || null, (area_direito || '').trim() || null);

  db.prepare('UPDATE publicacoes SET processo_id = ? WHERE id = ?').run(resultadoProcesso.lastInsertRowid, publicacao.id);

  const processo = db.prepare(`
    SELECT p.*, c.nome AS cliente_nome FROM processos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?
  `).get(resultadoProcesso.lastInsertRowid);

  res.status(201).json({ criado: true, processo, clienteReaproveitado });
});

module.exports = router;
