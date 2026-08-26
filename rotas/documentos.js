// CRUD de documentos (arquivo local, ex.: .docx) - podem ser enviados diretamente
// ou criados a partir de um Modelo (o arquivo do modelo e copiado como ponto de partida).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const db = require('../db/conexao');
const { uploadDocumento, caminhoAbsoluto, removerArquivo } = require('../middleware/upload');

const router = express.Router();

const SELECT_DOCUMENTO = `
  SELECT d.id, d.titulo, d.nome_arquivo, d.tamanho_bytes, d.tipo_mime, d.processo_id, d.cliente_id,
         d.modelo_origem_id, d.link_drive, d.criado_por, d.criado_em, d.atualizado_em,
         p.numero_cnj, c.nome AS cliente_nome, u.nome AS criado_por_nome
  FROM documentos d
  LEFT JOIN processos p ON p.id = d.processo_id
  LEFT JOIN clientes c ON c.id = d.cliente_id
  LEFT JOIN usuarios u ON u.id = d.criado_por
`;

// GET /api/documentos?q=&processoId=
router.get('/', (req, res) => {
  const { q, processoId } = req.query;
  let sql = SELECT_DOCUMENTO + ' WHERE 1=1';
  const params = [];
  if (processoId) { sql += ' AND d.processo_id = ?'; params.push(processoId); }
  if (q) { sql += ' AND d.titulo LIKE ?'; params.push(`%${q}%`); }
  sql += ' ORDER BY d.atualizado_em DESC';
  res.json({ documentos: db.prepare(sql).all(...params) });
});

// GET /api/documentos/:id
router.get('/:id', (req, res) => {
  const documento = db.prepare(SELECT_DOCUMENTO + ' WHERE d.id = ?').get(req.params.id);
  if (!documento) return res.status(404).json({ erro: 'Documento nao encontrado.' });
  res.json({ documento });
});

// GET /api/documentos/:id/arquivo - baixa o arquivo
router.get('/:id/arquivo', (req, res) => {
  const documento = db.prepare('SELECT * FROM documentos WHERE id = ?').get(req.params.id);
  if (!documento || !documento.caminho_arquivo) return res.status(404).json({ erro: 'Arquivo nao encontrado.' });
  res.download(caminhoAbsoluto('documentos', documento.caminho_arquivo), documento.nome_arquivo);
});

// Copia o arquivo de um modelo para uploads/documentos/, retornando os metadados do novo arquivo
function clonarArquivoDeModelo(modeloId) {
  const modelo = db.prepare('SELECT * FROM modelos WHERE id = ?').get(modeloId);
  if (!modelo || !modelo.caminho_arquivo) return null;

  const origem = caminhoAbsoluto('modelos', modelo.caminho_arquivo);
  if (!fs.existsSync(origem)) return null;

  const novoNome = crypto.randomUUID() + path.extname(modelo.caminho_arquivo);
  const destino = caminhoAbsoluto('documentos', novoNome);
  fs.copyFileSync(origem, destino);

  return {
    nome_arquivo: modelo.nome_arquivo,
    caminho_arquivo: novoNome,
    tamanho_bytes: modelo.tamanho_bytes,
    tipo_mime: modelo.tipo_mime
  };
}

// POST /api/documentos (multipart/form-data: titulo, processo_id, cliente_id, link_drive,
// modelo_origem_id (opcional), arquivo (obrigatorio se nao vier modelo_origem_id))
router.post('/', uploadDocumento.single('arquivo'), (req, res) => {
  const { titulo, processo_id, cliente_id, link_drive, modelo_origem_id } = req.body || {};
  if (!titulo || !titulo.trim()) return res.status(400).json({ erro: 'Informe o titulo do documento.' });

  let arquivo = req.file
    ? { nome_arquivo: req.file.originalname, caminho_arquivo: req.file.filename, tamanho_bytes: req.file.size, tipo_mime: req.file.mimetype }
    : null;

  if (!arquivo && modelo_origem_id) {
    arquivo = clonarArquivoDeModelo(modelo_origem_id);
    if (!arquivo) return res.status(400).json({ erro: 'Nao foi possivel copiar o arquivo do modelo selecionado.' });
  }

  if (!arquivo) return res.status(400).json({ erro: 'Envie um arquivo ou selecione um modelo de origem.' });

  const resultado = db.prepare(`
    INSERT INTO documentos (titulo, nome_arquivo, caminho_arquivo, tamanho_bytes, tipo_mime,
      processo_id, cliente_id, modelo_origem_id, link_drive, criado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(titulo.trim(), arquivo.nome_arquivo, arquivo.caminho_arquivo, arquivo.tamanho_bytes, arquivo.tipo_mime,
    processo_id || null, cliente_id || null, modelo_origem_id || null, link_drive || null, req.session.usuario.id);

  const documento = db.prepare(SELECT_DOCUMENTO + ' WHERE d.id = ?').get(resultado.lastInsertRowid);
  res.status(201).json({ documento });
});

// PUT /api/documentos/:id (multipart/form-data: titulo, processo_id, cliente_id, link_drive, arquivo opcional)
router.put('/:id', uploadDocumento.single('arquivo'), (req, res) => {
  const existente = db.prepare('SELECT * FROM documentos WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Documento nao encontrado.' });

  const { titulo, processo_id, cliente_id, link_drive } = req.body || {};
  if (!titulo || !titulo.trim()) return res.status(400).json({ erro: 'Informe o titulo do documento.' });

  if (req.file) {
    removerArquivo('documentos', existente.caminho_arquivo);
    db.prepare(`
      UPDATE documentos SET titulo = ?, nome_arquivo = ?, caminho_arquivo = ?, tamanho_bytes = ?, tipo_mime = ?,
        processo_id = ?, cliente_id = ?, link_drive = ?, atualizado_em = datetime('now', 'localtime')
      WHERE id = ?
    `).run(titulo.trim(), req.file.originalname, req.file.filename, req.file.size, req.file.mimetype,
      processo_id || null, cliente_id || null, link_drive || null, req.params.id);
  } else {
    db.prepare(`
      UPDATE documentos SET titulo = ?, processo_id = ?, cliente_id = ?, link_drive = ?,
        atualizado_em = datetime('now', 'localtime')
      WHERE id = ?
    `).run(titulo.trim(), processo_id || null, cliente_id || null, link_drive || null, req.params.id);
  }

  const documento = db.prepare(SELECT_DOCUMENTO + ' WHERE d.id = ?').get(req.params.id);
  res.json({ documento });
});

// DELETE /api/documentos/:id
router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM documentos WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Documento nao encontrado.' });
  db.prepare('DELETE FROM documentos WHERE id = ?').run(req.params.id);
  removerArquivo('documentos', existente.caminho_arquivo);
  res.json({ ok: true });
});

module.exports = router;
