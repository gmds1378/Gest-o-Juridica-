// CRUD de prazos/compromissos (agenda).
const express = require('express');
const db = require('../db/conexao');

const router = express.Router();

const SELECT_PRAZO = `
  SELECT pr.*, u.nome AS responsavel_nome, u.cor AS responsavel_cor,
         c.nome AS cliente_nome, p.numero_cnj
  FROM prazos pr
  LEFT JOIN usuarios u ON u.id = pr.responsavel_id
  LEFT JOIN clientes c ON c.id = pr.cliente_id
  LEFT JOIN processos p ON p.id = pr.processo_id
`;

// GET /api/prazos?inicio=&fim=&responsavelId=&concluido=
router.get('/', (req, res) => {
  const { inicio, fim, responsavelId, concluido } = req.query;
  let sql = SELECT_PRAZO + ' WHERE 1=1';
  const params = [];
  if (inicio) { sql += ' AND pr.vencimento >= ?'; params.push(inicio); }
  if (fim) { sql += ' AND pr.vencimento <= ?'; params.push(fim); }
  if (responsavelId) { sql += ' AND pr.responsavel_id = ?'; params.push(responsavelId); }
  if (concluido !== undefined) { sql += ' AND pr.concluido = ?'; params.push(concluido === 'true' ? 1 : 0); }
  sql += ' ORDER BY pr.vencimento, pr.prioridade DESC';
  res.json({ prazos: db.prepare(sql).all(...params) });
});

router.get('/:id', (req, res) => {
  const prazo = db.prepare(SELECT_PRAZO + ' WHERE pr.id = ?').get(req.params.id);
  if (!prazo) return res.status(404).json({ erro: 'Prazo nao encontrado.' });
  res.json({ prazo });
});

router.post('/', (req, res) => {
  const { titulo, descricao, vencimento, processo_id, cliente_id, prioridade, responsavel_id } = req.body || {};
  if (!titulo || !titulo.trim()) return res.status(400).json({ erro: 'Informe o titulo do prazo.' });
  if (!vencimento) return res.status(400).json({ erro: 'Informe a data de vencimento.' });

  const resultado = db.prepare(`
    INSERT INTO prazos (titulo, descricao, vencimento, processo_id, cliente_id, prioridade, responsavel_id, criado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(titulo.trim(), descricao || null, vencimento, processo_id || null, cliente_id || null,
    prioridade || 'media', responsavel_id || null, req.session.usuario.id);

  const prazo = db.prepare(SELECT_PRAZO + ' WHERE pr.id = ?').get(resultado.lastInsertRowid);
  res.status(201).json({ prazo });
});

router.put('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM prazos WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Prazo nao encontrado.' });

  const { titulo, descricao, vencimento, processo_id, cliente_id, prioridade, responsavel_id, concluido } = req.body || {};
  if (!titulo || !titulo.trim()) return res.status(400).json({ erro: 'Informe o titulo do prazo.' });
  if (!vencimento) return res.status(400).json({ erro: 'Informe a data de vencimento.' });

  db.prepare(`
    UPDATE prazos SET titulo = ?, descricao = ?, vencimento = ?, processo_id = ?, cliente_id = ?,
      prioridade = ?, responsavel_id = ?, concluido = ?, atualizado_em = datetime('now', 'localtime')
    WHERE id = ?
  `).run(titulo.trim(), descricao || null, vencimento, processo_id || null, cliente_id || null,
    prioridade || 'media', responsavel_id || null, concluido ? 1 : 0, req.params.id);

  const prazo = db.prepare(SELECT_PRAZO + ' WHERE pr.id = ?').get(req.params.id);
  res.json({ prazo });
});

// PATCH /api/prazos/:id/concluir - alterna o checkbox de concluido
router.patch('/:id/concluir', (req, res) => {
  const existente = db.prepare('SELECT * FROM prazos WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Prazo nao encontrado.' });

  const novoValor = existente.concluido ? 0 : 1;
  db.prepare(`UPDATE prazos SET concluido = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?`)
    .run(novoValor, req.params.id);

  const prazo = db.prepare(SELECT_PRAZO + ' WHERE pr.id = ?').get(req.params.id);
  res.json({ prazo });
});

router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM prazos WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Prazo nao encontrado.' });
  db.prepare('DELETE FROM prazos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
