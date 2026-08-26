-- Banco de dados do sistema de gestao juridica
-- SQLite - arquivo unico, persistente, guardado em /dados/escritorio.db

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Usuarios do escritorio (login fixo: 1 administrador + 2 usuarias)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL,
  login         TEXT NOT NULL UNIQUE,
  senha_hash    TEXT NOT NULL,
  perfil        TEXT NOT NULL DEFAULT 'usuario' CHECK (perfil IN ('admin', 'usuario')),
  cor           TEXT NOT NULL DEFAULT '#64748b',   -- cor usada para identificar o usuario em cards/agenda
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL,
  documento     TEXT,                 -- CPF ou CNPJ
  telefone      TEXT,
  email         TEXT,
  observacoes   TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------
-- Processos (vinculados a um cliente)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id        INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  numero_cnj        TEXT,                 -- numero no padrao CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO)
  vara_comarca      TEXT,
  parte_contraria   TEXT,
  area_direito      TEXT,
  status            TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'arquivado')),
  link_tribunal     TEXT,                 -- link do processo no eproc / PJe / etc.
  link_drive_pasta  TEXT,                 -- link da pasta do processo no Google Drive
  observacoes       TEXT,
  criado_em         TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  atualizado_em     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_processos_cliente ON processos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_processos_status ON processos(status);

-- ---------------------------------------------------------------------
-- Etiquetas coloridas (organizacao livre) e vinculo N:N com processos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS etiquetas (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  nome  TEXT NOT NULL UNIQUE,
  cor   TEXT NOT NULL DEFAULT '#64748b'
);

CREATE TABLE IF NOT EXISTS processos_etiquetas (
  processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  etiqueta_id INTEGER NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
  PRIMARY KEY (processo_id, etiqueta_id)
);

-- ---------------------------------------------------------------------
-- Categorias de modelos (customizaveis pelo usuario)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias_modelos (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  nome  TEXT NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------
-- Modelos de peca (biblioteca do escritorio) - arquivo local (Word etc.),
-- enviado pelo usuario e guardado em uploads/modelos/. Edicao e feita
-- offline, no Word; aqui so ficam os metadados e o arquivo em si.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modelos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo          TEXT NOT NULL,
  categoria_id    INTEGER REFERENCES categorias_modelos(id) ON DELETE SET NULL,
  nome_arquivo    TEXT NOT NULL DEFAULT '',   -- nome original do arquivo (para exibir/baixar)
  caminho_arquivo TEXT NOT NULL DEFAULT '',   -- nome do arquivo salvo em uploads/modelos/
  tamanho_bytes   INTEGER NOT NULL DEFAULT 0,
  tipo_mime       TEXT NOT NULL DEFAULT '',
  criado_por      INTEGER REFERENCES usuarios(id),
  criado_em       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  atualizado_em   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------
-- Documentos (arquivos locais, podem nascer de um modelo - o arquivo do
-- modelo e copiado como ponto de partida) - mesma logica de arquivo local.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documentos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo            TEXT NOT NULL,
  nome_arquivo      TEXT NOT NULL DEFAULT '',
  caminho_arquivo   TEXT NOT NULL DEFAULT '',   -- nome do arquivo salvo em uploads/documentos/
  tamanho_bytes     INTEGER NOT NULL DEFAULT 0,
  tipo_mime         TEXT NOT NULL DEFAULT '',
  processo_id       INTEGER REFERENCES processos(id) ON DELETE SET NULL,
  cliente_id        INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  modelo_origem_id  INTEGER REFERENCES modelos(id) ON DELETE SET NULL,
  link_drive        TEXT,                 -- link do arquivo no Google Drive (opcional)
  criado_por        INTEGER REFERENCES usuarios(id),
  criado_em         TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  atualizado_em     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_documentos_processo ON documentos(processo_id);

-- ---------------------------------------------------------------------
-- Prazos e compromissos (agenda)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prazos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo         TEXT NOT NULL,
  descricao      TEXT,
  vencimento     TEXT NOT NULL,        -- data ISO (AAAA-MM-DD)
  processo_id    INTEGER REFERENCES processos(id) ON DELETE SET NULL,
  cliente_id     INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  prioridade     TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta')),
  responsavel_id INTEGER REFERENCES usuarios(id),
  concluido      INTEGER NOT NULL DEFAULT 0,
  criado_por     INTEGER REFERENCES usuarios(id),
  criado_em      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  atualizado_em  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_prazos_vencimento ON prazos(vencimento);
CREATE INDEX IF NOT EXISTS idx_prazos_responsavel ON prazos(responsavel_id);

-- ---------------------------------------------------------------------
-- Anotacoes rapidas (avulsas ou vinculadas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anotacoes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo         TEXT NOT NULL DEFAULT '',
  conteudo       TEXT NOT NULL DEFAULT '',
  processo_id    INTEGER REFERENCES processos(id) ON DELETE SET NULL,
  cliente_id     INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  fixado         INTEGER NOT NULL DEFAULT 0,
  criado_por     INTEGER REFERENCES usuarios(id),
  criado_em      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  atualizado_em  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------
-- Feriados (usados na calculadora de prazos em dias uteis)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feriados (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  data        TEXT NOT NULL UNIQUE,   -- AAAA-MM-DD
  descricao   TEXT NOT NULL,
  abrangencia TEXT NOT NULL DEFAULT 'nacional' CHECK (abrangencia IN ('nacional', 'estadual', 'municipal'))
);

-- ---------------------------------------------------------------------
-- Atalhos (links de tribunais e outros sites uteis), exibidos no Painel
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atalhos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo    TEXT NOT NULL,
  url       TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------
-- Configuracoes gerais do escritorio (chave-valor), ex.: chave da API
-- de intimacoes da AASP. Somente o administrador pode ver/editar.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

-- ---------------------------------------------------------------------
-- Publicacoes importadas automaticamente (ex.: API de Intimacoes da AASP).
-- Ficam numa fila de revisao: alguem do escritorio confere e, se for o
-- caso, cria um prazo manualmente a partir da publicacao (o sistema nao
-- calcula prazos sozinho a partir do texto).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS publicacoes (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  origem                TEXT NOT NULL DEFAULT 'aasp',
  codigo_externo        TEXT UNIQUE,   -- id da publicacao na origem (evita duplicar)
  numero_processo       TEXT,          -- numero unico do processo (padrao CNJ), se veio na publicacao
  titulo                TEXT NOT NULL,
  texto                 TEXT NOT NULL,
  jornal                TEXT,
  data_disponibilizacao TEXT,
  processo_id           INTEGER REFERENCES processos(id) ON DELETE SET NULL, -- vinculo automatico por numero_processo
  lida                  INTEGER NOT NULL DEFAULT 0,
  prazo_id              INTEGER REFERENCES prazos(id) ON DELETE SET NULL,    -- preenchido quando um prazo e criado a partir daqui
  resumo                TEXT,          -- resumo gerado por IA (opcional, so com chave Claude configurada)
  criado_em             TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_publicacoes_lida ON publicacoes(lida);
