document.getElementById('marca-login').innerHTML = Icone('balanca', 26);

const erroEl = document.getElementById('mensagem-erro');

function mostrarErro(texto) {
  erroEl.textContent = texto;
  erroEl.classList.remove('oculto');
}

const parametros = new URLSearchParams(window.location.search);
if (parametros.get('erro')) {
  mostrarErro(parametros.get('erro'));
  history.replaceState(null, '', window.location.pathname);
}

document.getElementById('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  erroEl.classList.add('oculto');

  const login = document.getElementById('campo-login').value.trim();
  const senha = document.getElementById('campo-senha').value;

  try {
    await api.post('/api/auth/login', { login, senha });
    window.location.href = '/index.html';
  } catch (erro) {
    mostrarErro(erro.message || 'Não foi possível entrar.');
  }
});

document.getElementById('botao-google').addEventListener('click', () => {
  window.location.href = '/api/auth/google';
});

api.get('/api/auth/config')
  .then(({ googleAtivo }) => {
    if (googleAtivo) document.getElementById('area-google').classList.remove('oculto');
  })
  .catch(() => {});

api.get('/api/auth/me').then(() => { window.location.href = '/index.html'; }).catch(() => {});
