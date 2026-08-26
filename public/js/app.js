// Bootstrap do app: autenticacao, sidebar, tema, sino de alertas e busca global.
// Tambem expoe utilitarios (Utilidades) e um helper de modal (Modal) usados pelas telas.

const Estado = { usuario: null, usuarios: [] };

const Utilidades = {
  escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto ?? '';
    return div.innerHTML;
  },
  formatarData(iso) {
    if (!iso) return '-';
    const [ano, mes, dia] = iso.slice(0, 10).split('-');
    return `${dia}/${mes}/${ano}`;
  },
  formatarDataHora(isoComHora) {
    if (!isoComHora) return '-';
    const partes = isoComHora.split(' ');
    return `${this.formatarData(partes[0])}${partes[1] ? ' ' + partes[1].slice(0, 5) : ''}`;
  },
  hojeISO() {
    return new Date().toISOString().slice(0, 10);
  },
  diasEntre(dataIso) {
    const hoje = new Date(this.hojeISO() + 'T00:00:00');
    const alvo = new Date(dataIso + 'T00:00:00');
    return Math.round((alvo - hoje) / 86400000);
  },
  debounce(fn, atraso = 300) {
    let temporizador;
    return (...args) => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => fn(...args), atraso);
    };
  },
  seloPrioridade(prioridade) {
    const classes = { alta: 'selo-perigo', media: 'selo-alerta', baixa: 'selo-neutro' };
    const rotulos = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
    return `<span class="selo ${classes[prioridade] || 'selo-neutro'}">${rotulos[prioridade] || prioridade}</span>`;
  },
  formatarTamanho(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  },
  // Escapa HTML e converte **negrito** (markdown simples que a IA às vezes usa) em <strong>.
  formatarTextoIA(texto) {
    const escapado = this.escaparHtml(texto);
    return escapado.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  },
  iconePorTipo(nomeArquivo = '') {
    const ext = nomeArquivo.split('.').pop().toLowerCase();
    if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return Icone('documento', 15);
    if (ext === 'pdf') return Icone('arquivo', 15);
    if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return Icone('planilha', 15);
    return Icone('clipe', 15);
  }
};

const Modal = {
  _sobreposicaoAtual: null,

  abrir({ titulo, corpoHtml, rodapeHtml = '', largo = false, aoMontar = null }) {
    this.fechar();

    const sobreposicao = document.createElement('div');
    sobreposicao.className = 'sobreposicao';
    sobreposicao.innerHTML = `
      <div class="modal ${largo ? 'modal-largo' : ''}">
        <div class="modal-cabecalho">
          <h2>${titulo}</h2>
          <button class="botao botao-icone" data-fechar-modal>✕</button>
        </div>
        <div class="modal-corpo">${corpoHtml}</div>
        ${rodapeHtml ? `<div class="modal-rodape">${rodapeHtml}</div>` : ''}
      </div>
    `;

    sobreposicao.addEventListener('click', (evento) => {
      if (evento.target === sobreposicao || evento.target.closest('[data-fechar-modal]')) {
        this.fechar();
      }
    });

    document.body.appendChild(sobreposicao);
    this._sobreposicaoAtual = sobreposicao;
    if (aoMontar) aoMontar(sobreposicao);
    return sobreposicao;
  },

  fechar() {
    if (this._sobreposicaoAtual) {
      this._sobreposicaoAtual.remove();
      this._sobreposicaoAtual = null;
      // Qualquer modal pode ter criado/editado/concluido um prazo - mante o sino em dia
      // sem esperar pela atualizacao periodica de 5 minutos.
      if (typeof atualizarSino === 'function') atualizarSino();
      if (typeof atualizarBadgePublicacoes === 'function') atualizarBadgePublicacoes();
    }
  }
};

// ---------------------------------------------------------------------
// Cartao do usuario logado (sidebar) e edicao do proprio perfil
// ---------------------------------------------------------------------
function atualizarCartaoUsuario() {
  document.getElementById('nome-usuario').textContent = Estado.usuario.nome;
  document.getElementById('perfil-usuario').textContent = Estado.usuario.perfil === 'admin' ? 'Administrador(a)' : 'Usuária(o)';
  const avatar = document.getElementById('avatar-usuario');
  avatar.textContent = Estado.usuario.nome.charAt(0).toUpperCase();
  avatar.style.background = Estado.usuario.cor || '#334155';
}

function abrirModalPerfil() {
  Modal.abrir({
    titulo: 'Meu perfil',
    corpoHtml: `
      <form id="form-perfil">
        <div class="campo"><label>Nome *</label><input type="text" name="nome" value="${Utilidades.escaparHtml(Estado.usuario.nome)}"></div>
        <div class="campo"><label>Usuário de login *</label><input type="text" name="login" value="${Utilidades.escaparHtml(Estado.usuario.login)}">
          <div class="campo-ajuda">Usado para entrar no sistema. Sem espaços ou acentos, de preferência.</div>
        </div>
        <hr style="border:none; border-top:1px solid var(--cor-borda); margin:16px 0;">
        <div class="campo-ajuda" style="margin-bottom:10px;">Para trocar de senha, preencha os três campos abaixo. Para manter a senha atual, deixe em branco.</div>
        <div class="campo"><label>Senha atual</label><input type="password" name="senha_atual" autocomplete="current-password"></div>
        <div class="campo-linha">
          <div class="campo"><label>Nova senha</label><input type="password" name="nova_senha" autocomplete="new-password"></div>
          <div class="campo"><label>Confirmar nova senha</label><input type="password" name="confirmar_nova_senha" autocomplete="new-password"></div>
        </div>
        <div id="erro-perfil" class="campo-erro oculto"></div>
      </form>`,
    rodapeHtml: `
      <button class="botao" data-fechar-modal type="button">Cancelar</button>
      <button class="botao botao-primario" id="botao-salvar-perfil">Salvar</button>`,
    aoMontar: (modal) => {
      modal.querySelector('#botao-salvar-perfil').addEventListener('click', async () => {
        const form = modal.querySelector('#form-perfil');
        const el = modal.querySelector('#erro-perfil');
        const nome = form.nome.value.trim();
        const login = form.login.value.trim();
        const senhaAtual = form.senha_atual.value;
        const novaSenha = form.nova_senha.value;
        const confirmar = form.confirmar_nova_senha.value;

        if (!nome) { el.textContent = 'Informe o nome.'; el.classList.remove('oculto'); return; }
        if (!login) { el.textContent = 'Informe o usuário de login.'; el.classList.remove('oculto'); return; }
        if (novaSenha && novaSenha !== confirmar) {
          el.textContent = 'A confirmação não confere com a nova senha.'; el.classList.remove('oculto'); return;
        }

        try {
          const { usuario } = await api.put('/api/auth/me', { nome, login, senha_atual: senhaAtual || undefined, nova_senha: novaSenha || undefined });
          Estado.usuario = usuario;
          atualizarCartaoUsuario();
          Modal.fechar();
        } catch (erro) {
          el.textContent = erro.message; el.classList.remove('oculto');
        }
      });
    }
  });
}

// ---------------------------------------------------------------------
// Tema claro/escuro
// ---------------------------------------------------------------------
function aplicarTemaSalvo() {
  const tema = localStorage.getItem('tema') || 'claro';
  document.documentElement.setAttribute('data-tema', tema);
}
function alternarTema() {
  const atual = document.documentElement.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro';
  document.documentElement.setAttribute('data-tema', atual);
  localStorage.setItem('tema', atual);
}

// ---------------------------------------------------------------------
// Sino de alertas (prazos que vencem em ate 3 dias)
// ---------------------------------------------------------------------
async function atualizarSino() {
  try {
    const { alertas } = await api.get('/api/dashboard/alertas');
    const contador = document.getElementById('sino-contador');
    const lista = document.getElementById('lista-alertas');

    if (alertas.length > 0) {
      contador.textContent = alertas.length;
      contador.classList.remove('oculto');
    } else {
      contador.classList.add('oculto');
    }

    lista.innerHTML = alertas.length
      ? alertas.map((a) => {
          const dias = Utilidades.diasEntre(a.vencimento);
          const urgencia = dias < 0 ? 'Atrasado' : dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia(s)`;
          return `<div class="item"><strong>${Utilidades.escaparHtml(a.titulo)}</strong><br>
            <span class="texto-suave">${urgencia} · ${Utilidades.formatarData(a.vencimento)}${a.responsavel_nome ? ' · ' + Utilidades.escaparHtml(a.responsavel_nome) : ''}</span></div>`;
        }).join('')
      : '<div class="item texto-suave">Nenhum prazo urgente.</div>';
  } catch (e) { /* silencioso: nao interrompe o uso do app */ }
}

// ---------------------------------------------------------------------
// Badge de publicacoes nao lidas (menu lateral)
// ---------------------------------------------------------------------
async function atualizarBadgePublicacoes() {
  try {
    const { total } = await api.get('/api/publicacoes/contagem-nao-lidas');
    const badge = document.getElementById('badge-publicacoes');
    if (!badge) return;
    if (total > 0) {
      badge.textContent = total;
      badge.classList.remove('oculto');
    } else {
      badge.classList.add('oculto');
    }
  } catch (e) { /* silencioso */ }
}

// ---------------------------------------------------------------------
// Busca global
// ---------------------------------------------------------------------
function montarResultadosBusca(dados) {
  const container = document.getElementById('resultados-busca');
  const grupos = [
    { chave: 'processos', titulo: 'Processos', render: (i) => `${i.numero_cnj || '(sem número)'} — ${Utilidades.escaparHtml(i.cliente_nome)}`, rota: (i) => `processos/${i.id}` },
    { chave: 'clientes', titulo: 'Clientes', render: (i) => Utilidades.escaparHtml(i.nome), rota: () => 'processos' },
    { chave: 'documentos', titulo: 'Documentos', render: (i) => Utilidades.escaparHtml(i.titulo), rota: () => 'documentos' },
    { chave: 'anotacoes', titulo: 'Anotações', render: (i) => Utilidades.escaparHtml(i.titulo || i.conteudo.slice(0, 60)), rota: () => 'anotacoes' }
  ];

  const partes = [];
  let algumResultado = false;
  for (const grupo of grupos) {
    const itens = dados[grupo.chave] || [];
    if (!itens.length) continue;
    algumResultado = true;
    partes.push(`<div class="grupo-titulo">${grupo.titulo}</div>`);
    for (const item of itens) {
      partes.push(`<div class="item" data-rota="${grupo.rota(item)}">${grupo.render(item)}</div>`);
    }
  }

  container.innerHTML = algumResultado ? partes.join('') : '<div class="item texto-suave">Nenhum resultado encontrado.</div>';
  container.classList.remove('oculto');

  container.querySelectorAll('[data-rota]').forEach((el) => {
    el.addEventListener('click', () => {
      container.classList.add('oculto');
      document.getElementById('campo-busca-global').value = '';
      Roteador.irPara(el.dataset.rota);
    });
  });
}

function iniciarBuscaGlobal() {
  const campo = document.getElementById('campo-busca-global');
  const buscar = Utilidades.debounce(async () => {
    const termo = campo.value.trim();
    if (termo.length < 2) {
      document.getElementById('resultados-busca').classList.add('oculto');
      return;
    }
    const dados = await api.get('/api/busca?q=' + encodeURIComponent(termo));
    montarResultadosBusca(dados);
  }, 300);

  campo.addEventListener('input', buscar);
  document.addEventListener('click', (evento) => {
    if (!evento.target.closest('.caixa-busca')) {
      document.getElementById('resultados-busca').classList.add('oculto');
    }
  });
}

// ---------------------------------------------------------------------
// Inicializacao
// ---------------------------------------------------------------------
function montarIconesEstaticos() {
  document.getElementById('icone-marca').innerHTML = Icone('balanca', 20);
  document.querySelectorAll('#navegacao [data-icone]').forEach((span) => {
    span.innerHTML = Icone(span.dataset.icone, 17);
  });
  document.getElementById('icone-tema').innerHTML = Icone('lua', 15);
  document.getElementById('botao-menu-mobile').innerHTML = Icone('menu', 18);
  document.getElementById('icone-busca').innerHTML = Icone('busca', 16);
  document.getElementById('icone-sino').innerHTML = Icone('sino', 18);
}

async function iniciar() {
  montarIconesEstaticos();
  aplicarTemaSalvo();

  try {
    const { usuario } = await api.get('/api/auth/me');
    Estado.usuario = usuario;
  } catch (e) {
    window.location.href = '/login.html';
    return;
  }

  try {
    const { usuarios } = await api.get('/api/auth/usuarios');
    Estado.usuarios = usuarios;
  } catch (e) { Estado.usuarios = []; }

  atualizarCartaoUsuario();
  document.getElementById('botao-meu-perfil').addEventListener('click', abrirModalPerfil);

  document.getElementById('botao-tema').addEventListener('click', alternarTema);
  document.getElementById('botao-sair').addEventListener('click', async () => {
    await api.post('/api/auth/logout');
    window.location.href = '/login.html';
  });

  document.getElementById('botao-menu-mobile').addEventListener('click', () => {
    document.getElementById('barra-lateral').classList.toggle('aberta');
  });

  const botaoSino = document.getElementById('botao-sino');
  const painelAlertas = document.getElementById('painel-alertas');
  botaoSino.addEventListener('click', () => painelAlertas.classList.toggle('oculto'));
  document.addEventListener('click', (evento) => {
    if (!evento.target.closest('.sino-wrap')) painelAlertas.classList.add('oculto');
  });

  iniciarBuscaGlobal();
  atualizarSino();
  atualizarBadgePublicacoes();
  setInterval(atualizarSino, 5 * 60 * 1000);
  setInterval(atualizarBadgePublicacoes, 5 * 60 * 1000);

  Roteador.navegar();
}

document.addEventListener('DOMContentLoaded', iniciar);
