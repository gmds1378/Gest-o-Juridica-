// Reseta a senha de um usuario pela linha de comando, direto no servidor.
//
//   npm run resetar-senha -- <login>
//
// Existe para o unico caso sem saida pela interface: o administrador esqueceu a
// senha e nao ha outro administrador ativo para reseta-la. Exige acesso ao
// servidor, entao quem consegue rodar isto ja tem acesso ao banco de qualquer forma.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./conexao');

const login = (process.argv[2] || '').trim();

if (!login) {
  console.error('Uso: npm run resetar-senha -- <login>');
  console.error('\nUsuarios cadastrados:');
  for (const u of db.prepare('SELECT login, nome, perfil, ativo FROM usuarios ORDER BY nome').all()) {
    console.error(`  ${u.login.padEnd(16)} ${u.nome} (${u.perfil}${u.ativo ? '' : ', inativo'})`);
  }
  process.exit(1);
}

const usuario = db.prepare('SELECT * FROM usuarios WHERE login = ?').get(login);
if (!usuario) {
  console.error(`Usuario "${login}" nao encontrado.`);
  process.exit(1);
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const senha = Array.from(crypto.randomBytes(14), (b) => ALFABETO[b % ALFABETO.length]).join('');

db.prepare('UPDATE usuarios SET senha_hash = ?, senha_provisoria = 1, ativo = 1 WHERE id = ?')
  .run(bcrypt.hashSync(senha, 10), usuario.id);

// Derruba as sessoes abertas dessa pessoa.
for (const sessao of db.prepare('SELECT sid, dados FROM sessoes').all()) {
  try {
    const dados = JSON.parse(sessao.dados);
    if (dados.usuario && dados.usuario.id === usuario.id) {
      db.prepare('DELETE FROM sessoes WHERE sid = ?').run(sessao.sid);
    }
  } catch { /* sessao ilegivel: ignora */ }
}

db.prepare(`
  INSERT INTO auditoria (usuario_id, usuario_nome, acao, entidade, entidade_id, descricao)
  VALUES (?, ?, 'alterou', 'usuarios', ?, ?)
`).run(usuario.id, usuario.nome, String(usuario.id), 'Senha resetada pela linha de comando do servidor');

console.log('\n' + '='.repeat(58));
console.log(`  Senha de "${usuario.nome}" (${login}) redefinida`);
console.log('='.repeat(58));
console.log(`  Nova senha: ${senha}`);
console.log('='.repeat(58));
console.log('  Sera pedida a troca no proximo acesso.');
console.log('='.repeat(58) + '\n');
