// CRUD de processos + dados das abas (documentos, prazos, anotacoes, etiquetas) de um processo.
const express = require('express');
const db = require('../db/conexao');
const auditoria = require('../servicos/auditoria');
const movimentacoes = require('../servicos/movimentacoes');

const router = express.Router();

// Descricao curta usada na trilha de auditoria.
function identificar(processo) {
  return `Processo ${processo.numero_cnj || '(sem número CNJ)'}`;
}

const SELECT_PROCESSO_COM_CLIENTE = `
  SELECT p.*, c.nome AS cliente_nome
  FROM processos p
  JOIN clientes c ON c.id = p.cliente_id
`;

function etiquetasDoProcesso(processoId) {
  return db.prepare(`
    SELECT e.id, e.nome, e.cor
    FROM etiquetas e
    JOIN processos_etiquetas pe ON pe.etiqueta_id = e.id
    WHERE pe.processo_id = ?
    ORDER BY e.nome
  `).all(processoId);
}

// GET /api/processos?status=ativo&clienteId=&q=
router.get('/', (req, res) => {
  const { status, clienteId, q } = req.query;
  let sql = SELECT_PROCESSO_COM_CLIENTE + ' WHERE 1=1';
  const params = [];

  if (status) { sql += ' AND p.status = ?'; params.push(status); }
  if (clienteId) { sql += ' AND p.cliente_id = ?'; params.push(clienteId); }
  if (q) {
    sql += ' AND (p.numero_cnj LIKE ? OR c.nome LIKE ? OR p.parte_contraria LIKE ? OR p.area_direito LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY p.atualizado_em DESC';

  const processos = db.prepare(sql).all(...params).map(p => ({ ...p, etiquetas: etiquetasDoProcesso(p.id) }));
  res.json({ processos });
});

// GET /api/processos/:id
router.get('/:id', (req, res) => {
  const processo = db.prepare(SELECT_PROCESSO_COM_CLIENTE + ' WHERE p.id = ?').get(req.params.id);
  if (!processo) return res.status(404).json({ erro: 'Processo nao encontrado.' });
  processo.etiquetas = etiquetasDoProcesso(processo.id);
  res.json({ processo });
});

// GET /api/processos/:id/documentos
router.get('/:id/documentos', (req, res) => {
  const documentos = db.prepare(`
    SELECT id, titulo, nome_arquivo, tamanho_bytes, link_drive, criado_em, atualizado_em
    FROM documentos WHERE processo_id = ? ORDER BY atualizado_em DESC
  `).all(req.params.id);
  res.json({ documentos });
});

// GET /api/processos/:id/prazos
router.get('/:id/prazos', (req, res) => {
  const prazos = db.prepare(`
    SELECT pr.*, u.nome AS responsavel_nome, u.cor AS responsavel_cor
    FROM prazos pr LEFT JOIN usuarios u ON u.id = pr.responsavel_id
    WHERE pr.processo_id = ? ORDER BY pr.vencimento
  `).all(req.params.id);
  res.json({ prazos });
});

// GET /api/processos/:id/anotacoes
router.get('/:id/anotacoes', (req, res) => {
  const anotacoes = db.prepare(`
    SELECT * FROM anotacoes WHERE processo_id = ? ORDER BY fixado DESC, atualizado_em DESC
  `).all(req.params.id);
  res.json({ anotacoes });
});

// GET /api/processos/:id/movimentacoes
router.get('/:id/movimentacoes', (req, res) => {
  const processo = db.prepare('SELECT id FROM processos WHERE id = ?').get(req.params.id);
  if (!processo) return res.status(404).json({ erro: 'Processo nao encontrado.' });
  movimentacoes.marcarLidas(req.params.id);
  res.json({ movimentacoes: movimentacoes.listarDoProcesso(req.params.id) });
});

// POST /api/processos/:id/sincronizar-movimentacoes — sync manual (mesma regra do cron)
router.post('/:id/sincronizar-movimentacoes', async (req, res) => {
  try {
    const resultado = await movimentacoes.sincronizarProcesso(req.params.id);
    if (!resultado.ok) return res.json(resultado);
    auditoria.registrar(req, {
      acao: 'alterou',
      entidade: 'processos',
      entidadeId: req.params.id,
      descricao: `Sincronizou movimentações (${resultado.tipo || 'manual'})`
    });
    res.json(resultado);
  } catch (erro) {
    if (erro.tipo === 'processo_inexistente') {
      return res.status(404).json({ erro: 'Processo nao encontrado.' });
    }
    console.error('[datajud] sync_failed', { processoId: req.params.id, erro: erro.message });
    res.status(400).json({ erro: erro.message });
  }
});

// POST /api/processos
router.post('/', (req, res) => {
  const { cliente_id, numero_cnj, vara_comarca, parte_contraria, area_direito, status,
    link_tribunal, link_drive_pasta, observacoes, etiquetas } = req.body || {};

  if (!cliente_id) return res.status(400).json({ erro: 'Selecione o cliente.' });

  const resultado = db.prepare(`
    INSERT INTO processos (cliente_id, numero_cnj, vara_comarca, parte_contraria, area_direito,
      status, link_tribunal, link_drive_pasta, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(cliente_id, numero_cnj || null, vara_comarca || null, parte_contraria || null,
    area_direito || null, status || 'ativo', link_tribunal || null, link_drive_pasta || null, observacoes || null);

  const id = resultado.lastInsertRowid;
  if (Array.isArray(etiquetas)) atualizarEtiquetas(id, etiquetas);

  const processo = db.prepare(SELECT_PROCESSO_COM_CLIENTE + ' WHERE p.id = ?').get(id);
  processo.etiquetas = etiquetasDoProcesso(id);
  auditoria.registrar(req, { acao: 'criou', entidade: 'processos', entidadeId: id, descricao: `${identificar(processo)} para ${processo.cliente_nome}` });
  res.status(201).json({ processo });
});

// PUT /api/processos/:id
router.put('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM processos WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Processo nao encontrado.' });

  const { cliente_id, numero_cnj, vara_comarca, parte_contraria, area_direito, status,
    link_tribunal, link_drive_pasta, observacoes, etiquetas } = req.body || {};

  if (!cliente_id) return res.status(400).json({ erro: 'Selecione o cliente.' });

  db.prepare(`
    UPDATE processos SET cliente_id = ?, numero_cnj = ?, vara_comarca = ?, parte_contraria = ?,
      area_direito = ?, status = ?, link_tribunal = ?, link_drive_pasta = ?, observacoes = ?,
      atualizado_em = datetime('now', 'localtime')
    WHERE id = ?
  `).run(cliente_id, numero_cnj || null, vara_comarca || null, parte_contraria || null, area_direito || null,
    status || 'ativo', link_tribunal || null, link_drive_pasta || null, observacoes || null, req.params.id);

  if (Array.isArray(etiquetas)) atualizarEtiquetas(req.params.id, etiquetas);

  const processo = db.prepare(SELECT_PROCESSO_COM_CLIENTE + ' WHERE p.id = ?').get(req.params.id);
  processo.etiquetas = etiquetasDoProcesso(req.params.id);
  auditoria.registrar(req, { acao: 'alterou', entidade: 'processos', entidadeId: processo.id, descricao: identificar(processo) });
  res.json({ processo });
});

// DELETE /api/processos/:id
router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM processos WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Processo nao encontrado.' });
  db.prepare('DELETE FROM processos WHERE id = ?').run(req.params.id);
  auditoria.registrar(req, { acao: 'excluiu', entidade: 'processos', entidadeId: existente.id, descricao: identificar(existente) });
  res.json({ ok: true });
});

function atualizarEtiquetas(processoId, etiquetaIds) {
  db.prepare('DELETE FROM processos_etiquetas WHERE processo_id = ?').run(processoId);
  const inserir = db.prepare('INSERT OR IGNORE INTO processos_etiquetas (processo_id, etiqueta_id) VALUES (?, ?)');
  for (const etiquetaId of etiquetaIds) inserir.run(processoId, etiquetaId);
}

module.exports = router;
