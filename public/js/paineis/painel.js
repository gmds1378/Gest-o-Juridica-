// Tela: Painel (visao geral / tela inicial) - blocos que podem ser arrastados
// (pela alca) para reordenar e redimensionados (metade/largura total). O
// layout escolhido fica salvo para o escritorio inteiro (nao e por usuario).
const WIDGETS_PAINEL = [
  { id: 'estatisticas', titulo: 'Estatísticas', tamanhoPadrao: 'inteira' },
  { id: 'prazos-proximos', titulo: 'Prazos dos próximos 7 dias', tamanhoPadrao: 'metade' },
  { id: 'prazos-responsavel', titulo: 'Prazos pendentes por responsável', tamanhoPadrao: 'metade' },
  { id: 'anotacoes', titulo: 'Anotações recentes', tamanhoPadrao: 'metade' },
  { id: 'atalhos', titulo: 'Tribunais e links úteis', tamanhoPadrao: 'metade' }
];

let _dadosPainel = null;
let _ordemPainel = [];
let _tamanhosPainel = {};
let _gradeWidgets = null;

Roteador.registrar('painel', async (container) => {
  const [dados, { atalhos }, { total: publicacoesNaoLidas }, { anotacoes }, layout] = await Promise.all([
    api.get('/api/dashboard'),
    api.get('/api/atalhos'),
    api.get('/api/publicacoes/contagem-nao-lidas'),
    api.get('/api/anotacoes'),
    api.get('/api/preferencias/painel')
  ]);

  _dadosPainel = { dados, atalhos, anotacoes };

  const idsConhecidos = WIDGETS_PAINEL.map((w) => w.id);
  _ordemPainel = (layout.ordem || []).filter((id) => idsConhecidos.includes(id));
  idsConhecidos.forEach((id) => { if (!_ordemPainel.includes(id)) _ordemPainel.push(id); });
  _tamanhosPainel = {};
  WIDGETS_PAINEL.forEach((w) => { _tamanhosPainel[w.id] = (layout.tamanhos && layout.tamanhos[w.id]) || w.tamanhoPadrao; });

  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div>
        <h1>Olá, ${Utilidades.escaparHtml(Estado.usuario.nome.split(' ')[0])}</h1>
        <div class="subtitulo">Aqui está o panorama do escritório hoje, ${Utilidades.formatarData(dados.hoje)}.</div>
      </div>
      <div class="flex gap-8">
        <button class="botao botao-primario" data-atalho="documento">+ Novo documento</button>
        <button class="botao" data-atalho="prazo">+ Novo prazo</button>
        <button class="botao" data-atalho="anotacao">+ Nova anotação</button>
      </div>
    </div>

    ${publicacoesNaoLidas > 0 ? `
    <div class="cartao card-clicavel" id="card-publicacoes-painel" style="margin-bottom:14px; border-color:var(--cor-alerta); cursor:pointer;">
      <div class="cartao-corpo flex-entre">
        <div class="flex gap-8">${Icone('caixaEntrada', 17)} <strong>${publicacoesNaoLidas} publicação(ões) nova(s)</strong> aguardando revisão</div>
        <span class="selo selo-alerta">Ver publicações →</span>
      </div>
    </div>` : ''}

    <div class="grade-2 grade-widgets" id="grade-widgets"></div>
  `;

  _gradeWidgets = container.querySelector('#grade-widgets');
  tornarArrastavel(_gradeWidgets);
  renderizarWidgets();

  // Delegacao: um so listener no container cobre os botoes fixos e todo o
  // conteudo dos blocos, mesmo depois que #grade-widgets e re-renderizado.
  container.addEventListener('click', (ev) => {
    const elAtalho = ev.target.closest('[data-atalho]');
    if (elAtalho) {
      const destino = { documento: 'documentos', prazo: 'agenda', anotacao: 'anotacoes' }[elAtalho.dataset.atalho];
      Roteador.irPara(destino);
      return;
    }

    if (ev.target.closest('#card-publicacoes-painel')) { Roteador.irPara('publicacoes'); return; }

    const elRedimensionar = ev.target.closest('[data-redimensionar]');
    if (elRedimensionar) {
      const id = elRedimensionar.dataset.redimensionar;
      _tamanhosPainel[id] = _tamanhosPainel[id] === 'inteira' ? 'metade' : 'inteira';
      renderizarWidgets();
      salvarLayoutPainel();
      return;
    }

    const elAbrirAnot = ev.target.closest('[data-abrir-anotacao]');
    if (elAbrirAnot) {
      const anotacao = _dadosPainel.anotacoes.find((a) => a.id == elAbrirAnot.dataset.abrirAnotacao);
      abrirModalAnotacao(anotacao, {}, async () => {
        _dadosPainel.anotacoes = (await api.get('/api/anotacoes')).anotacoes;
        renderizarWidgets();
      });
      return;
    }

    if (ev.target.closest('[data-novo-atalho]')) { abrirModalAtalho(null); return; }

    const elEditarAtalho = ev.target.closest('[data-editar-atalho]');
    if (elEditarAtalho) {
      const atalho = _dadosPainel.atalhos.find((a) => a.id == elEditarAtalho.dataset.editarAtalho);
      abrirModalAtalho(atalho);
      return;
    }

    const elRemoverAtalho = ev.target.closest('[data-remover-atalho]');
    if (elRemoverAtalho) {
      (async () => {
        await api.del('/api/atalhos/' + elRemoverAtalho.dataset.removerAtalho);
        _dadosPainel.atalhos = (await api.get('/api/atalhos')).atalhos;
        renderizarWidgets();
      })();
    }
  });
});

function acoesWidget(id) {
  if (id === 'anotacoes') return '<button class="botao botao-pequeno" data-atalho="anotacao">+ Nova</button>';
  if (id === 'atalhos') return '<button class="botao botao-pequeno" data-novo-atalho>+ Adicionar link</button>';
  return '';
}

function conteudoWidget(id) {
  const { dados, atalhos, anotacoes } = _dadosPainel;

  if (id === 'estatisticas') {
    return `
      <div class="grade-4">
        <div class="cartao estatistica"><div class="icone-estat">${Icone('balanca', 18)}</div><div><div class="valor">${dados.totais.processosAtivos}</div><div class="rotulo">Processos ativos</div></div></div>
        <div class="cartao estatistica"><div class="icone-estat">${Icone('usuario', 18)}</div><div><div class="valor">${dados.totais.clientes}</div><div class="rotulo">Clientes cadastrados</div></div></div>
        <div class="cartao estatistica"><div class="icone-estat">${Icone('documento', 18)}</div><div><div class="valor">${dados.totais.documentos}</div><div class="rotulo">Documentos redigidos</div></div></div>
        <div class="cartao estatistica"><div class="icone-estat">${Icone('camadas', 18)}</div><div><div class="valor">${dados.totais.modelos}</div><div class="rotulo">Modelos na biblioteca</div></div></div>
      </div>`;
  }

  if (id === 'prazos-proximos') {
    if (!dados.prazosProximos.length) return '<div class="estado-vazio">Nenhum prazo nos próximos 7 dias.</div>';
    return dados.prazosProximos.map((p) => {
      const dias = Utilidades.diasEntre(p.vencimento);
      const critico = dias < 2;
      return `
        <div class="flex-entre" style="padding:10px 0; border-bottom:1px solid var(--cor-borda);">
          <div>
            <div style="font-weight:600; ${critico ? 'color:var(--cor-perigo);' : ''}">${Utilidades.escaparHtml(p.titulo)}</div>
            <div class="texto-suave texto-pequeno">
              ${p.cliente_nome ? Utilidades.escaparHtml(p.cliente_nome) + ' · ' : ''}${p.responsavel_nome ? Utilidades.escaparHtml(p.responsavel_nome) : 'sem responsável'}
            </div>
          </div>
          <div style="text-align:right;">
            <span class="selo ${critico ? 'selo-perigo' : 'selo-alerta'}">${dias < 0 ? 'Atrasado' : dias === 0 ? 'Hoje' : dias + 'd'}</span>
            <div class="texto-pequeno texto-fraco">${Utilidades.formatarData(p.vencimento)}</div>
          </div>
        </div>`;
    }).join('');
  }

  if (id === 'prazos-responsavel') {
    return dados.prazosPorUsuario.map((u) => `
      <div class="flex-entre" style="padding:10px 0; border-bottom:1px solid var(--cor-borda);">
        <div class="flex gap-8"><span class="avatar" style="width:24px;height:24px;font-size:11px;background:${u.cor}">${u.nome.charAt(0)}</span> ${Utilidades.escaparHtml(u.nome)}</div>
        <span class="selo selo-neutro">${u.total} pendente(s)</span>
      </div>
    `).join('');
  }

  if (id === 'anotacoes') {
    if (!anotacoes.length) return '<div class="estado-vazio">Nenhuma anotação ainda.</div>';
    return anotacoes.slice(0, 4).map((a) => `
      <div class="flex-entre" style="padding:10px 0; border-bottom:1px solid var(--cor-borda); cursor:pointer; align-items:flex-start;" data-abrir-anotacao="${a.id}">
        <div style="min-width:0;">
          <div style="font-weight:600;" class="flex gap-8">${a.fixado ? Icone('fixar', 13) : ''} <span>${Utilidades.escaparHtml(a.titulo || '(sem título)')}</span></div>
          <div class="texto-suave texto-pequeno" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${Utilidades.escaparHtml((a.conteudo || '').slice(0, 80))}</div>
        </div>
        <span class="texto-fraco texto-pequeno" style="flex-shrink:0; margin-left:8px;">${Utilidades.formatarData(a.atualizado_em)}</span>
      </div>`).join('');
  }

  if (id === 'atalhos') {
    if (!atalhos.length) return '<div class="texto-fraco texto-pequeno">Nenhum link cadastrado ainda — adicione os tribunais que vocês mais acessam (PJe, e-SAJ, eproc...).</div>';
    return `<div class="flex gap-8" style="flex-wrap:wrap;">${atalhos.map((a) => `
      <span class="selo selo-neutro" style="padding:6px 10px; font-size:13px; gap:6px;">
        <a href="${Utilidades.escaparHtml(a.url)}" target="_blank" rel="noopener" style="color:inherit; display:inline-flex; align-items:center; gap:6px;">${Icone('link', 13)} ${Utilidades.escaparHtml(a.titulo)}</a>
        <button class="botao-icone" style="border:none; background:none; padding:0 0 0 2px; line-height:1; color:var(--cor-texto-fraco);" data-editar-atalho="${a.id}" title="Editar">${Icone('editar', 12)}</button>
        <button class="botao-icone" style="border:none; background:none; padding:0 0 0 2px; line-height:1; color:var(--cor-texto-fraco);" data-remover-atalho="${a.id}" title="Remover">${Icone('fechar', 12)}</button>
      </span>
    `).join('')}</div>`;
  }

  return '';
}

function renderizarWidgets() {
  _gradeWidgets.innerHTML = _ordemPainel.map((id) => {
    const widget = WIDGETS_PAINEL.find((w) => w.id === id);
    if (!widget) return '';
    const inteira = _tamanhosPainel[id] === 'inteira';
    return `
      <div class="cartao painel-bloco" data-widget="${id}" style="grid-column: span ${inteira ? 2 : 1};">
        <div class="cartao-corpo">
          <div class="flex-entre" style="margin-bottom:10px;">
            <div class="flex gap-8">
              <span class="alca-arrastar" draggable="true" title="Arrastar para reordenar">${Icone('arrastar', 15)}</span>
              <h2 style="font-size:15px; margin:0;">${widget.titulo}</h2>
            </div>
            <div class="flex gap-8">
              ${acoesWidget(id)}
              <button class="botao-icone" data-redimensionar="${id}" title="${inteira ? 'Diminuir bloco' : 'Aumentar bloco'}">${Icone(inteira ? 'encolher' : 'expandir', 14)}</button>
            </div>
          </div>
          <div>${conteudoWidget(id)}</div>
        </div>
      </div>`;
  }).join('');
}

function tornarArrastavel(grade) {
  let idOrigem = null;

  grade.addEventListener('dragstart', (ev) => {
    const alca = ev.target.closest('.alca-arrastar');
    if (!alca) { ev.preventDefault(); return; }
    const bloco = alca.closest('[data-widget]');
    idOrigem = bloco.dataset.widget;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', idOrigem);
    ev.dataTransfer.setDragImage(bloco, 20, 20);
    bloco.classList.add('arrastando');
  });

  grade.addEventListener('dragend', () => {
    grade.querySelectorAll('.arrastando, .soltar-aqui').forEach((el) => el.classList.remove('arrastando', 'soltar-aqui'));
    idOrigem = null;
  });

  grade.addEventListener('dragover', (ev) => {
    if (!idOrigem) return;
    const bloco = ev.target.closest('[data-widget]');
    if (!bloco) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    grade.querySelectorAll('.soltar-aqui').forEach((el) => { if (el !== bloco) el.classList.remove('soltar-aqui'); });
    bloco.classList.add('soltar-aqui');
  });

  grade.addEventListener('drop', (ev) => {
    if (!idOrigem) return;
    const bloco = ev.target.closest('[data-widget]');
    if (!bloco) return;
    ev.preventDefault();
    const idDestino = bloco.dataset.widget;
    if (idOrigem !== idDestino) {
      const indiceOrigem = _ordemPainel.indexOf(idOrigem);
      const indiceDestino = _ordemPainel.indexOf(idDestino);
      _ordemPainel.splice(indiceOrigem, 1);
      _ordemPainel.splice(indiceDestino, 0, idOrigem);
      renderizarWidgets();
      salvarLayoutPainel();
    }
  });
}

function salvarLayoutPainel() {
  api.put('/api/preferencias/painel', { ordem: _ordemPainel, tamanhos: _tamanhosPainel }).catch(() => {});
}

// =======================================================================
// Modal: novo/editar atalho (link de tribunal ou site util)
// =======================================================================
function abrirModalAtalho(atalhoExistente) {
  const a = atalhoExistente || {};
  Modal.abrir({
    titulo: a.id ? 'Editar link' : 'Novo link',
    corpoHtml: `
      <form id="form-atalho">
        <div class="campo"><label>Título *</label><input type="text" name="titulo" placeholder="Ex: TJSP - e-SAJ" value="${Utilidades.escaparHtml(a.titulo || '')}"></div>
        <div class="campo"><label>Link *</label><input type="text" name="url" placeholder="https://esaj.tjsp.jus.br" value="${Utilidades.escaparHtml(a.url || '')}"></div>
        <div id="erro-atalho" class="campo-erro oculto"></div>
      </form>`,
    rodapeHtml: `
      ${a.id ? '<button class="botao botao-perigo" id="botao-excluir-atalho" style="margin-right:auto;">Excluir</button>' : ''}
      <button class="botao" data-fechar-modal type="button">Cancelar</button>
      <button class="botao botao-primario" id="botao-salvar-atalho">${a.id ? 'Salvar' : 'Adicionar'}</button>`,
    aoMontar: (modal) => {
      modal.querySelector('#botao-salvar-atalho').addEventListener('click', async () => {
        const form = modal.querySelector('#form-atalho');
        const el = modal.querySelector('#erro-atalho');
        const titulo = form.titulo.value.trim();
        const url = form.url.value.trim();
        if (!titulo || !url) { el.textContent = 'Preencha o título e o link.'; el.classList.remove('oculto'); return; }
        try {
          if (a.id) await api.put('/api/atalhos/' + a.id, { titulo, url });
          else await api.post('/api/atalhos', { titulo, url });
          _dadosPainel.atalhos = (await api.get('/api/atalhos')).atalhos;
          renderizarWidgets();
          Modal.fechar();
        } catch (erro) {
          el.textContent = erro.message; el.classList.remove('oculto');
        }
      });
      const botaoExcluir = modal.querySelector('#botao-excluir-atalho');
      if (botaoExcluir) botaoExcluir.addEventListener('click', async () => {
        if (!confirm('Remover este link?')) return;
        await api.del('/api/atalhos/' + a.id);
        _dadosPainel.atalhos = (await api.get('/api/atalhos')).atalhos;
        renderizarWidgets();
        Modal.fechar();
      });
    }
  });
}
