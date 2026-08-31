// Store de sessao do express-session gravando no proprio SQLite do sistema.
//
// O store padrao (MemoryStore) guarda tudo na memoria do processo: todo mundo
// e deslogado a cada reinicio ou deploy, e a memoria nunca e liberada (o proprio
// express-session avisa que ele nao serve para producao). Como o banco ja esta
// aberto e e sincrono, um store proprio resolve sem adicionar dependencia nativa.

const session = require('express-session');
const db = require('../db/conexao');

const INTERVALO_LIMPEZA_MS = 60 * 60 * 1000; // 1 hora

class SessaoSqliteStore extends session.Store {
  constructor() {
    super();

    this._buscar = db.prepare('SELECT dados, expira_em FROM sessoes WHERE sid = ?');
    this._gravar = db.prepare(`
      INSERT INTO sessoes (sid, dados, expira_em) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET dados = excluded.dados, expira_em = excluded.expira_em
    `);
    this._apagar = db.prepare('DELETE FROM sessoes WHERE sid = ?');
    this._apagarExpiradas = db.prepare('DELETE FROM sessoes WHERE expira_em <= ?');
    this._contar = db.prepare('SELECT COUNT(*) AS total FROM sessoes WHERE expira_em > ?');

    this.limparExpiradas();
    // unref() para o temporizador nao segurar o processo vivo no encerramento.
    this._temporizador = setInterval(() => this.limparExpiradas(), INTERVALO_LIMPEZA_MS);
    if (this._temporizador.unref) this._temporizador.unref();
  }

  // Sem validade explicita, usa 12 horas (mesmo maxAge configurado no server.js).
  _calcularExpiracao(sessao) {
    const validade = sessao && sessao.cookie && sessao.cookie.expires;
    if (validade) return new Date(validade).getTime();
    return Date.now() + 12 * 60 * 60 * 1000;
  }

  get(sid, callback) {
    try {
      const linha = this._buscar.get(sid);
      if (!linha) return callback(null, null);
      if (linha.expira_em <= Date.now()) {
        this._apagar.run(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(linha.dados));
    } catch (erro) {
      callback(erro);
    }
  }

  set(sid, sessao, callback) {
    try {
      this._gravar.run(sid, JSON.stringify(sessao), this._calcularExpiracao(sessao));
      callback(null);
    } catch (erro) {
      callback(erro);
    }
  }

  // Chamado a cada requisicao de uma sessao ativa: renova a validade sem
  // reescrever os dados, para o usuario nao ser deslogado enquanto trabalha.
  touch(sid, sessao, callback) {
    try {
      db.prepare('UPDATE sessoes SET expira_em = ? WHERE sid = ?')
        .run(this._calcularExpiracao(sessao), sid);
      callback(null);
    } catch (erro) {
      callback(erro);
    }
  }

  destroy(sid, callback) {
    try {
      this._apagar.run(sid);
      callback(null);
    } catch (erro) {
      callback(erro);
    }
  }

  length(callback) {
    try {
      callback(null, this._contar.get(Date.now()).total);
    } catch (erro) {
      callback(erro);
    }
  }

  limparExpiradas() {
    try {
      this._apagarExpiradas.run(Date.now());
    } catch (erro) {
      console.error('[Sessao] Falha ao limpar sessoes expiradas:', erro.message);
    }
  }
}

module.exports = SessaoSqliteStore;
