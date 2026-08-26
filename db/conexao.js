// Abre (ou cria) o arquivo SQLite e garante que as tabelas existam.
// Todo o app compartilha esta unica conexao. Usamos o modulo nativo "node:sqlite"
// (embutido no Node.js 22.5+/24, sem nenhuma compilacao/dependencia nativa),
// o que evita problemas de instalacao (Python/Visual Studio Build Tools) em
// maquinas de escritorio que nao tem ferramentas de desenvolvimento instaladas.

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const PASTA_DADOS = path.join(__dirname, '..', 'dados');
if (!fs.existsSync(PASTA_DADOS)) {
  fs.mkdirSync(PASTA_DADOS, { recursive: true });
}

const CAMINHO_BANCO = path.join(PASTA_DADOS, 'escritorio.db');
const db = new DatabaseSync(CAMINHO_BANCO);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migracoes leves: adiciona colunas novas em tabelas que ja existiam antes
// delas serem criadas (CREATE TABLE IF NOT EXISTS nao altera tabelas existentes).
function adicionarColunaSeNaoExistir(tabela, coluna, definicaoSql) {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all();
  const jaExiste = colunas.some((c) => c.name === coluna);
  if (!jaExiste) {
    db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${definicaoSql}`);
  }
}

adicionarColunaSeNaoExistir('publicacoes', 'resumo', 'resumo TEXT');

module.exports = db;
