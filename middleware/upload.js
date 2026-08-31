// Configuracao do multer para upload de arquivos locais (modelos e documentos).
// Os arquivos ficam salvos em disco, dentro de uploads/<tipo>/, com nome aleatorio
// (evita colisao e nao depende do nome original, que pode conter caracteres invalidos
// ou ser usado para path traversal). O nome original e guardado no banco para exibir
// e para o nome do arquivo baixado.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const TAMANHO_MAXIMO_MB = 30;

// Só o que faz sentido num escritorio: peca, documento digitalizado, planilha e
// imagem. Executaveis e paginas HTML ficam de fora - o download e sempre como
// anexo, mas nao ha motivo para aceitar esse tipo de arquivo em primeiro lugar.
const EXTENSOES_PERMITIDAS = [
  '.doc', '.docx', '.odt', '.rtf', '.txt',
  '.pdf',
  '.xls', '.xlsx', '.ods', '.csv',
  '.ppt', '.pptx', '.odp',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic',
  '.zip'
];

function criarUpload(subpasta) {
  const pasta = path.join(__dirname, '..', 'uploads', subpasta);
  if (!fs.existsSync(pasta)) {
    fs.mkdirSync(pasta, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, pasta),
    filename: (req, file, cb) => {
      const extensao = path.extname(file.originalname).toLowerCase();
      cb(null, crypto.randomUUID() + extensao);
    }
  });

  return multer({
    storage,
    limits: { fileSize: TAMANHO_MAXIMO_MB * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      const extensao = path.extname(file.originalname).toLowerCase();
      if (EXTENSOES_PERMITIDAS.includes(extensao)) return cb(null, true);
      const erro = new Error(
        `Tipo de arquivo não permitido (${extensao || 'sem extensão'}). ` +
        `Aceitos: ${EXTENSOES_PERMITIDAS.join(', ')}.`
      );
      erro.status = 400;
      cb(erro);
    }
  });
}

const uploadModelo = criarUpload('modelos');
const uploadDocumento = criarUpload('documentos');

function caminhoAbsoluto(subpasta, nomeArquivo) {
  return path.join(__dirname, '..', 'uploads', subpasta, nomeArquivo);
}

function removerArquivo(subpasta, nomeArquivo) {
  if (!nomeArquivo) return;
  const caminho = caminhoAbsoluto(subpasta, nomeArquivo);
  fs.unlink(caminho, () => {}); // silencioso: se ja nao existir, tudo bem
}

module.exports = {
  uploadModelo,
  uploadDocumento,
  caminhoAbsoluto,
  removerArquivo,
  TAMANHO_MAXIMO_MB,
  EXTENSOES_PERMITIDAS
};
