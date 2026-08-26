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

function criarUpload(subpasta) {
  const pasta = path.join(__dirname, '..', 'uploads', subpasta);
  if (!fs.existsSync(pasta)) {
    fs.mkdirSync(pasta, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, pasta),
    filename: (req, file, cb) => {
      const extensao = path.extname(file.originalname);
      cb(null, crypto.randomUUID() + extensao);
    }
  });

  return multer({
    storage,
    limits: { fileSize: TAMANHO_MAXIMO_MB * 1024 * 1024, files: 1 }
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

module.exports = { uploadModelo, uploadDocumento, caminhoAbsoluto, removerArquivo, TAMANHO_MAXIMO_MB };
