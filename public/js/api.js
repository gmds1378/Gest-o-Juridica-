// Wrapper simples para chamadas fetch a API local. Sempre envia cookies de sessao.
const api = {
  async _chamar(metodo, url, corpo) {
    const opcoes = {
      method: metodo,
      credentials: 'same-origin',
      headers: {}
    };
    if (corpo instanceof FormData) {
      // Upload de arquivo: deixa o navegador definir o Content-Type
      // (multipart/form-data com o boundary correto).
      opcoes.body = corpo;
    } else if (corpo !== undefined) {
      opcoes.headers['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }
    const resposta = await fetch(url, opcoes);

    const tipo = resposta.headers.get('content-type') || '';
    const dados = tipo.includes('application/json') ? await resposta.json().catch(() => null) : null;

    if (resposta.status === 401) {
      // Na propria tela de login, um 401 e esperado (ainda nao autenticado ou
      // credenciais invalidas) - nao deve forcar um redirecionamento, senao
      // vira um loop infinito de recarregamento da pagina.
      const naPaginaDeLogin = window.location.pathname.endsWith('/login.html');
      if (!naPaginaDeLogin) {
        window.location.href = '/login.html';
      }
      throw new Error((dados && dados.erro) || 'Nao autenticado.');
    }

    if (!resposta.ok) {
      throw new Error((dados && dados.erro) || `Erro ${resposta.status}`);
    }
    return dados;
  },
  get(url) { return this._chamar('GET', url); },
  post(url, corpo) { return this._chamar('POST', url, corpo); },
  put(url, corpo) { return this._chamar('PUT', url, corpo); },
  patch(url, corpo) { return this._chamar('PATCH', url, corpo); },
  del(url) { return this._chamar('DELETE', url); }
};
