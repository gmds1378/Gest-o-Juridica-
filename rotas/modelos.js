// CRUD de modelos de peca (arquivo local, ex.: .docx) + categorias customizaveis.
const express = require('express');
const db = require('../db/conexao');
const { uploadModelo, caminhoAbsoluto, removerArquivo } = require('../middleware/upload');

const router = express.Router();

const SELECT_MODELO = `
  SELECT m.id, m.titulo, m.categoria_id, m.nome_arquivo, m.tamanho_bytes, m.tipo_mime,
         m.criado_por, m.criado_em, m.atualizado_em, cat.nome AS categoria_nome, u.nome AS criado_por_nome
  FROM modelos m
  LEFT JOIN categorias_modelos cat ON cat.id = m.categoria_id
  LEFT JOIN usuarios u ON u.id = m.criado_por
`;

// GET /api/modelos?categoriaId=&q=
router.get('/', (req, res) => {
  const { categoriaId, q } = req.query;
  let sql = SELECT_MODELO + ' WHERE 1=1';
  const params = [];
  if (categoriaId) { sql += ' AND m.categoria_id = ?'; params.push(categoriaId); }
  if (q) { sql += ' AND m.titulo LIKE ?'; params.push(`%${q}%`); }
  sql += ' ORDER BY m.titulo';
  res.json({ modelos: db.prepare(sql).all(...params) });
});

// GET /api/modelos/categorias
router.get('/categorias', (req, res) => {
  res.json({ categorias: db.prepare('SELECT * FROM categorias_modelos ORDER BY nome').all() });
});

// POST /api/modelos/categorias
router.post('/categorias', (req, res) => {
  const { nome } = req.body || {};
  if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Informe o nome da categoria.' });
  try {
    const resultado = db.prepare('INSERT INTO categorias_modelos (nome) VALUES (?)').run(nome.trim());
    res.status(201).json({ categoria: { id: resultado.lastInsertRowid, nome: nome.trim() } });
  } catch (e) {
    res.status(409).json({ erro: 'Ja existe uma categoria com esse nome.' });
  }
});

// DELETE /api/modelos/categorias/:id
router.delete('/categorias/:id', (req, res) => {
  db.prepare('UPDATE modelos SET categoria_id = NULL WHERE categoria_id = ?').run(req.params.id);
  db.prepare('DELETE FROM categorias_modelos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/modelos/:id
router.get('/:id', (req, res) => {
  const modelo = db.prepare(SELECT_MODELO + ' WHERE m.id = ?').get(req.params.id);
  if (!modelo) return res.status(404).json({ erro: 'Modelo nao encontrado.' });
  res.json({ modelo });
});

// GET /api/modelos/:id/arquivo - baixa o arquivo original
router.get('/:id/arquivo', (req, res) => {
  const modelo = db.prepare('SELECT * FROM modelos WHERE id = ?').get(req.params.id);
  if (!modelo || !modelo.caminho_arquivo) return res.status(404).json({ erro: 'Arquivo nao encontrado.' });
  res.download(caminhoAbsoluto('modelos', modelo.caminho_arquivo), modelo.nome_arquivo);
});

// POST /api/modelos (multipart/form-data: titulo, categoria_id, arquivo)
router.post('/', uploadModelo.single('arquivo'), (req, res) => {
  const { titulo, categoria_id } = req.body || {};
  if (!titulo || !titulo.trim()) return res.status(400).json({ erro: 'Informe o titulo do modelo.' });
  if (!req.file) return res.status(400).json({ erro: 'Selecione um arquivo para enviar.' });

  const resultado = db.prepare(`
    INSERT INTO modelos (titulo, categoria_id, nome_arquivo, caminho_arquivo, tamanho_bytes, tipo_mime, criado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(titulo.trim(), categoria_id || null, req.file.originalname, req.file.filename,
    req.file.size, req.file.mimetype, req.session.usuario.id);

  const modelo = db.prepare(SELECT_MODELO + ' WHERE m.id = ?').get(resultado.lastInsertRowid);
  res.status(201).json({ modelo });
});

// PUT /api/modelos/:id (multipart/form-data: titulo, categoria_id, arquivo opcional)
router.put('/:id', uploadModelo.single('arquivo'), (req, res) => {
  const existente = db.prepare('SELECT * FROM modelos WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Modelo nao encontrado.' });

  const { titulo, categoria_id } = req.body || {};
  if (!titulo || !titulo.trim()) return res.status(400).json({ erro: 'Informe o titulo do modelo.' });

  if (req.file) {
    removerArquivo('modelos', existente.caminho_arquivo);
    db.prepare(`
      UPDATE modelos SET titulo = ?, categoria_id = ?, nome_arquivo = ?, caminho_arquivo = ?,
        tamanho_bytes = ?, tipo_mime = ?, atualizado_em = datetime('now', 'localtime')
      WHERE id = ?
    `).run(titulo.trim(), categoria_id || null, req.file.originalname, req.file.filename,
      req.file.size, req.file.mimetype, req.params.id);
  } else {
    db.prepare(`
      UPDATE modelos SET titulo = ?, categoria_id = ?, atualizado_em = datetime('now', 'localtime')
      WHERE id = ?
    `).run(titulo.trim(), categoria_id || null, req.params.id);
  }

  const modelo = db.prepare(SELECT_MODELO + ' WHERE m.id = ?').get(req.params.id);
  res.json({ modelo });
});

// DELETE /api/modelos/:id
router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM modelos WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Modelo nao encontrado.' });
  db.prepare('DELETE FROM modelos WHERE id = ?').run(req.params.id);
  removerArquivo('modelos', existente.caminho_arquivo);
  res.json({ ok: true });
});

module.exports = router;
