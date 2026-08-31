// CRUD de documentos. O arquivo vive no Google Drive (acervo); o SQLite
// guarda titulo, vinculos e o nome interno. Excluir no site e soft delete
// (lixeira 60 dias). Sem rclone configurado, cai para disco local.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const db = require('../db/conexao');
const { uploadDocumento, caminhoAbsoluto } = require('../middleware/upload');
const auditoria = require('../servicos/auditoria');
const acervo = require('../servicos/acervoDocumentos');

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

const ATIVO = ' AND d.excluido_em IS NULL';

function documentoAtivo(id) {
  return db.prepare('SELECT * FROM documentos WHERE id = ? AND excluido_em IS NULL').get(id);
}

router.get('/', (req, res) => {
  const { q, processoId } = req.query;
  let sql = SELECT_DOCUMENTO + ' WHERE d.excluido_em IS NULL';
  const params = [];
  if (processoId) { sql += ' AND d.processo_id = ?'; params.push(processoId); }
  if (q) { sql += ' AND d.titulo LIKE ?'; params.push(`%${q}%`); }
  sql += ' ORDER BY d.atualizado_em DESC';
  res.json({ documentos: db.prepare(sql).all(...params) });
});

router.get('/:id', (req, res) => {
  const documento = db.prepare(SELECT_DOCUMENTO + ' WHERE d.id = ?' + ATIVO).get(req.params.id);
  if (!documento) return res.status(404).json({ erro: 'Documento nao encontrado.' });
  res.json({ documento });
});

router.get('/:id/arquivo', (req, res) => {
  const documento = documentoAtivo(req.params.id);
  if (!documento || !documento.caminho_arquivo) return res.status(404).json({ erro: 'Arquivo nao encontrado.' });
  try {
    const arquivo = acervo.materializar(documento.caminho_arquivo);
    res.download(arquivo.caminho, documento.nome_arquivo, () => {
      if (arquivo.temporario) fs.unlink(arquivo.caminho, () => {});
    });
  } catch (erro) {
    const status = erro.status || 500;
    if (status < 500) return res.status(status).json({ erro: erro.message });
    console.error('[Acervo] download:', erro.message);
    res.status(503).json({ erro: 'Nao foi possivel baixar o arquivo no Drive. Tente de novo em instantes.' });
  }
});

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

  try {
    acervo.persistir(caminhoAbsoluto('documentos', arquivo.caminho_arquivo), arquivo.caminho_arquivo);
  } catch (erro) {
    fs.unlink(caminhoAbsoluto('documentos', arquivo.caminho_arquivo), () => {});
    const status = erro.status || 503;
    return res.status(status).json({
      erro: status < 500 ? erro.message : 'Nao foi possivel gravar o arquivo no Drive. Tente de novo.'
    });
  }

  const resultado = db.prepare(`
    INSERT INTO documentos (titulo, nome_arquivo, caminho_arquivo, tamanho_bytes, tipo_mime,
      processo_id, cliente_id, modelo_origem_id, link_drive, criado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(titulo.trim(), arquivo.nome_arquivo, arquivo.caminho_arquivo, arquivo.tamanho_bytes, arquivo.tipo_mime,
    processo_id || null, cliente_id || null, modelo_origem_id || null, link_drive || null, req.session.usuario.id);

  const documento = db.prepare(SELECT_DOCUMENTO + ' WHERE d.id = ?').get(resultado.lastInsertRowid);
  auditoria.registrar(req, { acao: 'criou', entidade: 'documentos', entidadeId: documento.id, descricao: `"${documento.titulo}" (${documento.nome_arquivo})` });
  res.status(201).json({ documento });
});

router.put('/:id', uploadDocumento.single('arquivo'), (req, res) => {
  const existente = documentoAtivo(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Documento nao encontrado.' });

  const { titulo, processo_id, cliente_id, link_drive } = req.body || {};
  if (!titulo || !titulo.trim()) return res.status(400).json({ erro: 'Informe o titulo do documento.' });

  if (req.file) {
    try {
      acervo.persistir(caminhoAbsoluto('documentos', req.file.filename), req.file.filename);
    } catch (erro) {
      fs.unlink(caminhoAbsoluto('documentos', req.file.filename), () => {});
      const status = erro.status || 503;
      return res.status(status).json({
        erro: status < 500 ? erro.message : 'Nao foi possivel gravar o arquivo no Drive. Tente de novo.'
      });
    }
    try { acervo.paraLixeira(existente.caminho_arquivo); } catch (erro) {
      console.error('[Acervo] lixeira (substituicao):', erro.message);
    }
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
  auditoria.registrar(req, {
    acao: 'alterou', entidade: 'documentos', entidadeId: documento.id,
    descricao: req.file ? `"${documento.titulo}" - arquivo substituído por ${documento.nome_arquivo}` : `"${documento.titulo}"`
  });
  res.json({ documento });
});

router.delete('/:id', (req, res) => {
  const existente = documentoAtivo(req.params.id);
  if (!existente) return res.status(404).json({ erro: 'Documento nao encontrado.' });
  try {
    acervo.paraLixeira(existente.caminho_arquivo);
  } catch (erro) {
    const status = erro.status || 503;
    return res.status(status).json({
      erro: 'Nao foi possivel mover o arquivo para a lixeira do Drive. Tente de novo.'
    });
  }
  db.prepare(`
    UPDATE documentos SET excluido_em = datetime('now', 'localtime'),
      atualizado_em = datetime('now', 'localtime') WHERE id = ?
  `).run(req.params.id);
  auditoria.registrar(req, { acao: 'excluiu', entidade: 'documentos', entidadeId: existente.id, descricao: `"${existente.titulo}" (${existente.nome_arquivo}) — lixeira 60 dias` });
  res.json({ ok: true });
});

module.exports = router;
