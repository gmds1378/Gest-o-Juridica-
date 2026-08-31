// Cria o administrador inicial do escritorio. Rodar uma unica vez com:
//
//   npm run seed
//
// As demais contas sao criadas pelo proprio administrador dentro do sistema
// (menu Usuarios) - nao ha mais lista fixa de nomes aqui.
//
// A senha e sorteada e aparece UMA VEZ no terminal: ninguem, nem quem instalou,
// consegue recupera-la depois (fica so o hash no banco). Ela ja nasce marcada
// como provisoria, entao o sistema exige a troca no primeiro acesso.
//
// Pode ser rodado de novo sem problema: se o administrador ja existir, nada muda.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./conexao');

const LOGIN_ADMIN = process.env.ADMIN_LOGIN || 'admin';
const NOME_ADMIN = process.env.ADMIN_NOME || 'Administrador';
const EMAIL_ADMIN = (process.env.ADMIN_EMAIL || '').trim().toLowerCase() || null;

// Alfabeto sem caracteres ambiguos (0/O, 1/l/I), para a senha poder ser ditada.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function gerarSenha(tamanho = 14) {
  const bytes = crypto.randomBytes(tamanho);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

const existente = db.prepare('SELECT id, login FROM usuarios WHERE login = ?').get(LOGIN_ADMIN);

if (existente) {
  console.log(`Usuario "${LOGIN_ADMIN}" ja existe - nada foi alterado.`);
  console.log('Para redefinir a senha dele, use "Esqueci a senha" com outro administrador,');
  console.log('ou rode: npm run resetar-senha -- ' + LOGIN_ADMIN);
} else {
  const senha = gerarSenha();
  db.prepare(`
    INSERT INTO usuarios (nome, login, email, senha_hash, perfil, cor, senha_provisoria)
    VALUES (?, ?, ?, ?, 'admin', '#334155', 1)
  `).run(NOME_ADMIN, LOGIN_ADMIN, EMAIL_ADMIN, bcrypt.hashSync(senha, 10));

  console.log('\n' + '='.repeat(58));
  console.log('  ADMINISTRADOR CRIADO - anote a senha agora');
  console.log('='.repeat(58));
  console.log(`  Login: ${LOGIN_ADMIN}`);
  console.log(`  Senha: ${senha}`);
  console.log('='.repeat(58));
  console.log('  Esta senha nao sera exibida de novo e o sistema vai pedir');
  console.log('  a troca dela no primeiro acesso.');
  console.log('='.repeat(58) + '\n');
}

// Categorias de modelo padrao, para o escritorio ja comecar com algo organizado.
const categoriaExiste = db.prepare('SELECT id FROM categorias_modelos WHERE nome = ?');
const inserirCategoria = db.prepare('INSERT INTO categorias_modelos (nome) VALUES (?)');
for (const nome of ['Procurações', 'Petição Inicial', 'Contestação', 'Recursos', 'Contratos', 'Outros']) {
  if (!categoriaExiste.get(nome)) inserirCategoria.run(nome);
}

// Feriados nacionais + Carnaval/Paixao/Corpus (foro) + 20/09 (RS) +
// 11/02 padroeira de Veranopolis. 15/01 (aniversario da cidade) nao entra:
// fontes municipais tratam como comemoracao, nao feriado legal.
const FERIADOS_INICIAIS = [
  ['2026-01-01', 'Confraternização Universal', 'nacional'],
  ['2026-02-16', 'Carnaval', 'nacional'],
  ['2026-02-17', 'Carnaval', 'nacional'],
  ['2026-04-03', 'Paixão de Cristo', 'nacional'],
  ['2026-04-21', 'Tiradentes', 'nacional'],
  ['2026-05-01', 'Dia do Trabalho', 'nacional'],
  ['2026-02-11', 'Nossa Senhora de Lourdes (Veranópolis)', 'municipal'],
  ['2026-06-04', 'Corpus Christi', 'nacional'],
  ['2026-09-07', 'Independência do Brasil', 'nacional'],
  ['2026-09-20', 'Revolução Farroupilha', 'estadual'],
  ['2026-10-12', 'Nossa Senhora Aparecida', 'nacional'],
  ['2026-11-02', 'Finados', 'nacional'],
  ['2026-11-15', 'Proclamação da República', 'nacional'],
  ['2026-11-20', 'Consciência Negra', 'nacional'],
  ['2026-12-25', 'Natal', 'nacional'],
  ['2027-01-01', 'Confraternização Universal', 'nacional'],
  ['2027-02-08', 'Carnaval', 'nacional'],
  ['2027-02-09', 'Carnaval', 'nacional'],
  ['2027-03-26', 'Paixão de Cristo', 'nacional'],
  ['2027-04-21', 'Tiradentes', 'nacional'],
  ['2027-02-11', 'Nossa Senhora de Lourdes (Veranópolis)', 'municipal'],
  ['2027-05-01', 'Dia do Trabalho', 'nacional'],
  ['2027-05-27', 'Corpus Christi', 'nacional'],
  ['2027-09-07', 'Independência do Brasil', 'nacional'],
  ['2027-09-20', 'Revolução Farroupilha', 'estadual'],
  ['2027-10-12', 'Nossa Senhora Aparecida', 'nacional'],
  ['2027-11-02', 'Finados', 'nacional'],
  ['2027-11-15', 'Proclamação da República', 'nacional'],
  ['2027-11-20', 'Consciência Negra', 'nacional'],
  ['2027-12-25', 'Natal', 'nacional']
];

const feriadoExiste = db.prepare('SELECT id FROM feriados WHERE data = ?');
const inserirFeriado = db.prepare('INSERT INTO feriados (data, descricao, abrangencia) VALUES (?, ?, ?)');
let feriadosNovos = 0;
for (const [data, descricao, abrangencia] of FERIADOS_INICIAIS) {
  if (feriadoExiste.get(data)) continue;
  inserirFeriado.run(data, descricao, abrangencia);
  feriadosNovos++;
}
if (feriadosNovos) console.log(`${feriadosNovos} feriado(s) cadastrado(s) (nacionais/RS/Veranópolis, 2026–2027).`);

console.log('Seed concluido.');
