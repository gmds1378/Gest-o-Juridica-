// Trilha de auditoria: registra quem criou, alterou ou excluiu cada coisa.
//
// Auditoria que quebra a operacao e pior do que auditoria nenhuma, entao uma
// falha ao registrar nunca interrompe a acao do usuario - ela e logada e a vida
// segue. O nome do usuario e copiado para a linha porque o registro precisa
// continuar legivel mesmo depois que a conta for excluida.

const db = require('../db/conexao');

const inserir = db.prepare(`
  INSERT INTO auditoria (usuario_id, usuario_nome, acao, entidade, entidade_id, descricao, ip)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function registrar(req, { acao, entidade, entidadeId = null, descricao = '' }) {
  try {
    const usuario = (req.session && req.session.usuario) || null;
    inserir.run(
      usuario ? usuario.id : null,
      usuario ? usuario.nome : 'desconhecido',
      acao,
      entidade,
      entidadeId === null || entidadeId === undefined ? null : String(entidadeId),
      descricao,
      req.ip || null
    );
  } catch (erro) {
    console.error('[Auditoria] Falha ao registrar evento:', erro.message);
  }
}

module.exports = { registrar };
