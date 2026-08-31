// Busca global: encontra documentos, processos e anotacoes por palavra-chave.
const express = require('express');
const db = require('../db/conexao');

const router = express.Router();

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ processos: [], documentos: [], anotacoes: [], clientes: [] });

  const termo = `%${q}%`;

  const processos = db.prepare(`
    SELECT p.id, p.numero_cnj, c.nome AS cliente_nome
    FROM processos p JOIN clientes c ON c.id = p.cliente_id
    WHERE p.numero_cnj LIKE ? OR c.nome LIKE ? OR p.parte_contraria LIKE ?
    LIMIT 10
  `).all(termo, termo, termo);

  const documentos = db.prepare(`
    SELECT id, titulo FROM documentos WHERE excluido_em IS NULL AND (titulo LIKE ? OR nome_arquivo LIKE ?) LIMIT 10
  `).all(termo, termo);

  const anotacoes = db.prepare(`
    SELECT id, titulo, conteudo FROM anotacoes WHERE titulo LIKE ? OR conteudo LIKE ? LIMIT 10
  `).all(termo, termo);

  const clientes = db.prepare(`
    SELECT id, nome FROM clientes WHERE nome LIKE ? LIMIT 10
  `).all(termo);

  res.json({ processos, documentos, anotacoes, clientes });
});

module.exports = router;
