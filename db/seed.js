// Cria os 3 usuarios iniciais do escritorio (1 administrador + 2 usuarias comuns).
// Rodar uma unica vez com: npm run seed
// Pode ser rodado de novo sem problema: usuarios existentes (mesmo login) sao ignorados.

const bcrypt = require('bcryptjs');
const db = require('./conexao');

const USUARIOS_INICIAIS = [
  { nome: 'Gabriel', login: 'gabriel', senha: '1234', perfil: 'admin', cor: '#334155' },
  { nome: 'Roseni', login: 'roseni', senha: '1234', perfil: 'usuario', cor: '#0f766e' },
  { nome: 'Bruna', login: 'bruna', senha: '1234', perfil: 'usuario', cor: '#7c3aed' }
];

const jaExiste = db.prepare('SELECT id FROM usuarios WHERE login = ?');
const inserir = db.prepare(`
  INSERT INTO usuarios (nome, login, senha_hash, perfil, cor)
  VALUES (?, ?, ?, ?, ?)
`);

for (const usuario of USUARIOS_INICIAIS) {
  if (jaExiste.get(usuario.login)) {
    console.log(`Usuario "${usuario.login}" ja existe, pulando.`);
    continue;
  }
  const senha_hash = bcrypt.hashSync(usuario.senha, 10);
  inserir.run(usuario.nome, usuario.login, senha_hash, usuario.perfil, usuario.cor);
  console.log(`Usuario "${usuario.login}" criado (senha inicial: ${usuario.senha}).`);
}

// Categorias de modelo padrao, para o escritorio ja comecar com algo organizado.
const categoriaExiste = db.prepare('SELECT id FROM categorias_modelos WHERE nome = ?');
const inserirCategoria = db.prepare('INSERT INTO categorias_modelos (nome) VALUES (?)');
for (const nome of ['Procurações', 'Petição Inicial', 'Contestação', 'Recursos', 'Contratos', 'Outros']) {
  if (!categoriaExiste.get(nome)) inserirCategoria.run(nome);
}

console.log('\nSeed concluido.');
