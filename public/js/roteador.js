// Roteador simples baseado em hash (#/rota/parametro). Sem dependencias externas.
const Roteador = {
  rotas: {},

  registrar(nome, funcaoRenderizar) {
    this.rotas[nome] = funcaoRenderizar;
  },

  async navegar() {
    const hash = window.location.hash.replace(/^#\/?/, '') || 'painel';
    const [nomeRota, parametro] = hash.split('/');

    document.querySelectorAll('#navegacao a').forEach((a) => {
      a.classList.toggle('ativo', a.dataset.rota === nomeRota);
    });

    const container = document.getElementById('conteudo-pagina');
    const funcao = this.rotas[nomeRota];

    if (!funcao) {
      container.innerHTML = `<div class="estado-vazio"><div class="icone-grande">${Icone('busca', 34)}</div>Página não encontrada.</div>`;
      return;
    }

    container.innerHTML = '<div class="carregando">Carregando...</div>';
    try {
      await funcao(container, parametro);
    } catch (erro) {
      console.error(erro);
      container.innerHTML = `<div class="estado-vazio"><div class="icone-grande">${Icone('alerta', 34)}</div>Não foi possível carregar esta página.<br><span class="texto-pequeno">${erro.message || ''}</span></div>`;
    }
  },

  irPara(caminho) {
    window.location.hash = '#/' + caminho;
  }
};

window.addEventListener('hashchange', () => Roteador.navegar());
