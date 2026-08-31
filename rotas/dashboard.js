// Dados agregados para o Painel (tela inicial).
const express = require('express');
const db = require('../db/conexao');
const movimentacoes = require('../servicos/movimentacoes');

const router = express.Router();

router.get('/', (req, res) => {
  const hoje = new Date();
  const daquiA7Dias = new Date(hoje);
  daquiA7Dias.setDate(daquiA7Dias.getDate() + 7);
  const fmt = (d) => d.toISOString().slice(0, 10);

  // Prazos que vencem nos proximos 7 dias (inclui atrasados nao concluidos), ordenados por data
  const prazosProximos = db.prepare(`
    SELECT pr.*, u.nome AS responsavel_nome, u.cor AS responsavel_cor, c.nome AS cliente_nome, p.numero_cnj
    FROM prazos pr
    LEFT JOIN usuarios u ON u.id = pr.responsavel_id
    LEFT JOIN clientes c ON c.id = pr.cliente_id
    LEFT JOIN processos p ON p.id = pr.processo_id
    WHERE pr.concluido = 0 AND pr.vencimento <= ?
    ORDER BY pr.vencimento ASC
  `).all(fmt(daquiA7Dias));

  // Contador de prazos pendentes por usuario responsavel
  const prazosPorUsuario = db.prepare(`
    SELECT u.id, u.nome, u.cor, COUNT(pr.id) AS total
    FROM usuarios u
    LEFT JOIN prazos pr ON pr.responsavel_id = u.id AND pr.concluido = 0
    WHERE u.ativo = 1
    GROUP BY u.id
    ORDER BY u.nome
  `).all();

  const totalDocumentos = db.prepare('SELECT COUNT(*) AS total FROM documentos').get().total;
  const totalModelos = db.prepare('SELECT COUNT(*) AS total FROM modelos').get().total;
  const totalProcessosAtivos = db.prepare("SELECT COUNT(*) AS total FROM processos WHERE status = 'ativo'").get().total;
  const totalClientes = db.prepare('SELECT COUNT(*) AS total FROM clientes').get().total;

  res.json({
    hoje: fmt(hoje),
    prazosProximos,
    prazosPorUsuario,
    totais: { documentos: totalDocumentos, modelos: totalModelos, processosAtivos: totalProcessosAtivos, clientes: totalClientes }
  });
});

// GET /api/dashboard/alertas - usado pelo sino no topo (prazos que vencem em ate 3 dias)
router.get('/alertas', (req, res) => {
  const hoje = new Date();
  const daquiA3Dias = new Date(hoje);
  daquiA3Dias.setDate(daquiA3Dias.getDate() + 3);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const prazos = db.prepare(`
    SELECT pr.id, pr.titulo, pr.vencimento, pr.responsavel_id, u.nome AS responsavel_nome
    FROM prazos pr LEFT JOIN usuarios u ON u.id = pr.responsavel_id
    WHERE pr.concluido = 0 AND pr.vencimento <= ?
    ORDER BY pr.vencimento ASC
  `).all(fmt(daquiA3Dias));

  const alertas = [
    ...prazos.map((p) => ({ tipo: 'prazo', ...p })),
    ...movimentacoes.alertasNaoLidos().map((m) => ({
      tipo: 'movimentacao',
      id: m.id,
      titulo: m.nome || 'Nova movimentação',
      processo_id: m.processo_id,
      numero_cnj: m.numero_cnj,
      ocorrido_em: m.ocorrido_em
    }))
  ];

  res.json({ alertas });
});

module.exports = router;
