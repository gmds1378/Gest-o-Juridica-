// Acervo de documentos: Google Drive via rclone quando o config existe
// (/etc/rclone-gestao.conf na VM). Sem rclone, os arquivos ficam em
// uploads/documentos/ (desenvolvimento local).
//
// Pasta no Drive (separada do backup diario): AcervoDocumentos/ativos e
// AcervoDocumentos/lixeira. Excluir no site move para a lixeira; o cron
// apaga de vez depois de 60 dias.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { caminhoAbsoluto } = require('../middleware/upload');

const CONFIG = process.env.RCLONE_CONFIG || '/etc/rclone-gestao.conf';
const ACERVO = process.env.RCLONE_ACERVO || 'gdrive:AcervoDocumentos';
const LIXEIRA_LOCAL = path.join(__dirname, '..', 'uploads', 'documentos', 'lixeira');

function rcloneDisponivel() {
  if (process.env.RCLONE_ACERVO === 'off') return false;
  if (!fs.existsSync(CONFIG)) return false;
  const r = spawnSync('rclone', ['version'], { encoding: 'utf8' });
  return r.status === 0;
}

const USA_DRIVE = rcloneDisponivel();

function rclone(args) {
  const r = spawnSync('rclone', args, {
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, RCLONE_CONFIG: CONFIG }
  });
  if (r.status !== 0) {
    const detalhe = (r.stderr || r.stdout || 'rclone falhou').trim();
    const erro = new Error(detalhe);
    erro.status = 503;
    throw erro;
  }
  return r.stdout;
}

function remotoAtivos(nome) {
  return `${ACERVO}/ativos/${nome}`;
}

function remotoLixeira(nome) {
  return `${ACERVO}/lixeira/${nome}`;
}

function garantirLixeiraLocal() {
  fs.mkdirSync(LIXEIRA_LOCAL, { recursive: true });
}

function persistir(caminhoLocal, nomeArquivo) {
  if (!fs.existsSync(caminhoLocal)) {
    const erro = new Error('Arquivo temporario nao encontrado apos o upload.');
    erro.status = 500;
    throw erro;
  }
  if (USA_DRIVE) {
    rclone(['copyto', caminhoLocal, remotoAtivos(nomeArquivo)]);
    fs.unlink(caminhoLocal, () => {});
    return;
  }
  // Local: o multer ja gravou em uploads/documentos/. Nada a fazer.
}

function paraLixeira(nomeArquivo) {
  if (!nomeArquivo) return;
  const origem = caminhoAbsoluto('documentos', nomeArquivo);
  if (USA_DRIVE) {
    try {
      rclone(['moveto', remotoAtivos(nomeArquivo), remotoLixeira(nomeArquivo)]);
      return;
    } catch (erro) {
      if (fs.existsSync(origem)) {
        garantirLixeiraLocal();
        fs.renameSync(origem, path.join(LIXEIRA_LOCAL, nomeArquivo));
        return;
      }
      throw erro;
    }
  }
  garantirLixeiraLocal();
  const destino = path.join(LIXEIRA_LOCAL, nomeArquivo);
  if (fs.existsSync(origem)) fs.renameSync(origem, destino);
}

function materializar(nomeArquivo) {
  const local = caminhoAbsoluto('documentos', nomeArquivo);
  if (fs.existsSync(local)) return { caminho: local, temporario: false };

  if (!USA_DRIVE) {
    const naLixeira = path.join(LIXEIRA_LOCAL, nomeArquivo);
    if (fs.existsSync(naLixeira)) {
      const erro = new Error('Documento excluido.');
      erro.status = 404;
      throw erro;
    }
    const erro = new Error('Arquivo nao encontrado.');
    erro.status = 404;
    throw erro;
  }

  const tmp = path.join(os.tmpdir(), `acervo-${nomeArquivo}`);
  rclone(['copyto', remotoAtivos(nomeArquivo), tmp]);
  return { caminho: tmp, temporario: true };
}

function migrarLocais(db) {
  if (!USA_DRIVE) return 0;
  const rows = db.prepare(`
    SELECT caminho_arquivo FROM documentos
    WHERE excluido_em IS NULL AND caminho_arquivo != ''
  `).all();
  let n = 0;
  for (const row of rows) {
    const local = caminhoAbsoluto('documentos', row.caminho_arquivo);
    if (!fs.existsSync(local)) continue;
    persistir(local, row.caminho_arquivo);
    n += 1;
  }
  if (n) console.log(`[Acervo] ${n} documento(s) enviado(s) ao Drive.`);
  return n;
}

module.exports = {
  USA_DRIVE,
  persistir,
  paraLixeira,
  materializar,
  migrarLocais,
  ACERVO
};
