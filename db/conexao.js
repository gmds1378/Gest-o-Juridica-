// Abre (ou cria) o arquivo SQLite e garante que as tabelas existam.
// Todo o app compartilha esta unica conexao. Usamos o modulo nativo "node:sqlite"
// (embutido no Node.js 22.5+/24, sem nenhuma compilacao/dependencia nativa),
// o que evita problemas de instalacao (Python/Visual Studio Build Tools) em
// maquinas de escritorio que nao tem ferramentas de desenvolvimento instaladas.

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// ---------------------------------------------------------------------
// Fuso horario - precisa ser resolvido ANTES da primeira gravacao.
// O schema e as rotas usam datetime('now','localtime'), que o SQLite
// resolve pela variavel TZ do processo. Num servidor de nuvem (que roda
// em UTC por padrao) todo horario entre 21h e meia-noite cairia no dia
// seguinte - ou seja, prazos processuais com a data errada. Fica aqui,
// e nao no server.js, porque todo ponto de entrada (servidor, seed,
// scripts) passa por este modulo.
// ---------------------------------------------------------------------
const FUSO = 'America/Sao_Paulo';
const DESLOCAMENTO_ESPERADO_MIN = 180; // UTC-3; o Brasil nao tem mais horario de verao desde 2019

if (!process.env.TZ) {
  process.env.TZ = FUSO; // atribuir a process.env.TZ faz o Node chamar tzset()
}

// Se a imagem do servidor estiver sem o banco de fusos (tzdata), o TZ acima
// e aceito silenciosamente mas cai para UTC - por isso conferimos o resultado
// em vez de confiar na variavel.
const deslocamentoAtual = new Date().getTimezoneOffset();
if (deslocamentoAtual !== DESLOCAMENTO_ESPERADO_MIN) {
  throw new Error(
    `Fuso horario incorreto: TZ="${process.env.TZ}" resultou em UTC${deslocamentoAtual > 0 ? '-' : '+'}${Math.abs(deslocamentoAtual) / 60}, ` +
    `mas o sistema exige ${FUSO} (UTC-3). Datas de prazo ficariam erradas. ` +
    `Defina TZ=${FUSO} no ambiente e confirme que o pacote tzdata esta instalado no servidor.`
  );
}

const PASTA_DADOS = path.join(__dirname, '..', 'dados');
if (!fs.existsSync(PASTA_DADOS)) {
  fs.mkdirSync(PASTA_DADOS, { recursive: true });
}

const CAMINHO_BANCO = process.env.GESTAO_DB || path.join(PASTA_DADOS, 'escritorio.db');
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

adicionarColunaSeNaoExistir('processos', 'movimentacao_tentativa_em', 'movimentacao_tentativa_em TEXT');
adicionarColunaSeNaoExistir('processos', 'movimentacao_ok_em', 'movimentacao_ok_em TEXT');
adicionarColunaSeNaoExistir('processos', 'movimentacao_erro', 'movimentacao_erro TEXT');
adicionarColunaSeNaoExistir('processos', 'movimentacao_status', 'movimentacao_status TEXT');
adicionarColunaSeNaoExistir('processos', 'movimentacao_provedor', 'movimentacao_provedor TEXT');
adicionarColunaSeNaoExistir('processos', 'movimentacao_qtd_recebidos', 'movimentacao_qtd_recebidos INTEGER');
adicionarColunaSeNaoExistir('processos', 'movimentacao_qtd_novos', 'movimentacao_qtd_novos INTEGER');
db.exec('CREATE INDEX IF NOT EXISTS idx_processos_mov_tentativa ON processos(movimentacao_tentativa_em)');

// Colunas novas em "usuarios" (login com Google e troca obrigatoria de senha).
// O SQLite nao aceita UNIQUE em ALTER TABLE ADD COLUMN, entao a unicidade de
// google_sub vem de um indice criado logo abaixo, e nao da definicao da coluna.
adicionarColunaSeNaoExistir('usuarios', 'email', 'email TEXT');
adicionarColunaSeNaoExistir('usuarios', 'google_sub', 'google_sub TEXT');
adicionarColunaSeNaoExistir('usuarios', 'senha_provisoria', 'senha_provisoria INTEGER NOT NULL DEFAULT 0');

adicionarColunaSeNaoExistir('documentos', 'excluido_em', 'excluido_em TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email) WHERE email IS NOT NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_google_sub ON usuarios(google_sub) WHERE google_sub IS NOT NULL');

module.exports = db;
