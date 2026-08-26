// Tela: Modelos (biblioteca de peças padrão do escritório - arquivos locais, ex.: .docx)
let _categoriaModeloSelecionada = '';

Roteador.registrar('modelos', async (container) => {
  await renderizarModelos(container);
});

async function renderizarModelos(container) {
  const [{ categorias }, { modelos }] = await Promise.all([
    api.get('/api/modelos/categorias'),
    api.get('/api/modelos' + (_categoriaModeloSelecionada ? '?categoriaId=' + _categoriaModeloSelecionada : ''))
  ]);

  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div>
        <h1>Modelos</h1>
        <div class="subtitulo">Biblioteca de peças padrão do escritório — envie um arquivo (.docx, .odt, .pdf...) e edite offline no Word</div>
      </div>
      <button class="botao botao-primario" id="botao-novo-modelo">+ Novo modelo</button>
    </div>

    <div class="grade-2" style="grid-template-columns: 240px 1fr; align-items:start;">
      <div class="cartao"><div class="cartao-corpo">
        <h2 style="font-size:13px; text-transform:uppercase; letter-spacing:.03em; color:var(--cor-texto-fraco);">Categorias</h2>
        <div id="lista-categorias"></div>
        <div class="flex gap-8" style="margin-top:12px;">
          <input type="text" id="nova-categoria-nome" placeholder="Nova categoria" style="padding:6px 9px; border:1px solid var(--cor-borda); border-radius:6px; background:var(--cor-superficie); min-width:0;">
          <button class="botao botao-pequeno" id="botao-add-categoria">+</button>
        </div>
      </div></div>

      <div class="cartao"><div class="cartao-corpo">
        <input type="text" id="busca-modelo" placeholder="Buscar modelo pelo título..." style="width:100%; padding:9px 11px; border:1px solid var(--cor-borda); border-radius:6px; background:var(--cor-superficie); margin-bottom:14px;">
        <div id="lista-modelos"></div>
      </div></div>
    </div>
  `;

  const listaCategorias = container.querySelector('#lista-categorias');
  const opcoes = [{ id: '', nome: 'Todas' }, ...categorias];
  listaCategorias.innerHTML = opcoes.map((c) => `
    <div class="flex-entre" style="padding:6px 4px;">
      <button class="botao-texto botao" style="border:none; background:${_categoriaModeloSelecionada == c.id ? 'var(--cor-destaque-suave)' : 'none'}; color:${_categoriaModeloSelecionada == c.id ? 'var(--cor-destaque)' : 'var(--cor-texto)'}; width:100%; justify-content:flex-start; padding:6px 8px;" data-categoria="${c.id}">${Utilidades.escaparHtml(c.nome)}</button>
      ${c.id ? `<button class="botao-icone botao" style="border:none;" data-remover-categoria="${c.id}" title="Remover categoria">✕</button>` : ''}
    </div>`).join('');

  listaCategorias.querySelectorAll('[data-categoria]').forEach((b) => {
    b.addEventListener('click', () => { _categoriaModeloSelecionada = b.dataset.categoria; renderizarModelos(container); });
  });
  listaCategorias.querySelectorAll('[data-remover-categoria]').forEach((b) => {
    b.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!confirm('Remover esta categoria? Os modelos não serão excluídos.')) return;
      await api.del('/api/modelos/categorias/' + b.dataset.removerCategoria);
      renderizarModelos(container);
    });
  });

  container.querySelector('#botao-add-categoria').addEventListener('click', async () => {
    const nome = container.querySelector('#nova-categoria-nome').value.trim();
    if (!nome) return;
    await api.post('/api/modelos/categorias', { nome });
    renderizarModelos(container);
  });

  const listaModelos = container.querySelector('#lista-modelos');
  function montarLista(itens) {
    listaModelos.innerHTML = itens.length ? `
      <table class="tabela">
        <thead><tr><th>Título</th><th>Arquivo</th><th>Categoria</th><th>Atualizado em</th><th></th></tr></thead>
        <tbody>${itens.map((m) => `
          <tr class="clicavel" data-id="${m.id}">
            <td><strong>${Utilidades.escaparHtml(m.titulo)}</strong></td>
            <td class="texto-suave">${Utilidades.iconePorTipo(m.nome_arquivo)} ${Utilidades.escaparHtml(m.nome_arquivo)}<br><span class="texto-fraco texto-pequeno">${Utilidades.formatarTamanho(m.tamanho_bytes)}</span></td>
            <td>${m.categoria_nome ? `<span class="selo selo-neutro">${Utilidades.escaparHtml(m.categoria_nome)}</span>` : '-'}</td>
            <td class="texto-suave">${Utilidades.formatarDataHora(m.atualizado_em)}</td>
            <td style="text-align:right;"><a class="botao botao-texto botao-pequeno" href="/api/modelos/${m.id}/arquivo" onclick="event.stopPropagation()">${Icone('baixar', 14)} Baixar</a></td>
          </tr>`).join('')}</tbody>
      </table>` : `<div class="estado-vazio"><div class="icone-grande">${Icone('camadas', 34)}</div>Nenhum modelo cadastrado ainda.</div>`;

    listaModelos.querySelectorAll('tr[data-id]').forEach((linha) => {
      linha.addEventListener('click', async () => {
        const { modelo } = await api.get('/api/modelos/' + linha.dataset.id);
        abrirModalModelo(modelo, () => renderizarModelos(container));
      });
    });
  }
  montarLista(modelos);

  container.querySelector('#busca-modelo').addEventListener('input', Utilidades.debounce((ev) => {
    const termo = ev.target.value.toLowerCase();
    montarLista(modelos.filter((m) => m.titulo.toLowerCase().includes(termo)));
  }, 200));

  container.querySelector('#botao-novo-modelo').addEventListener('click', () => abrirModalModelo(null, () => renderizarModelos(container)));
}

// =======================================================================
// Modal: novo/editar modelo (upload de arquivo local)
// =======================================================================
async function abrirModalModelo(modeloExistente, aoSalvar) {
  const m = modeloExistente || {};
  const { categorias } = await api.get('/api/modelos/categorias');

  Modal.abrir({
    titulo: m.id ? 'Editar modelo' : 'Novo modelo',
    corpoHtml: `
      <form id="form-modelo">
        <div class="campo"><label>Título *</label><input type="text" name="titulo" value="${Utilidades.escaparHtml(m.titulo || '')}"></div>
        <div class="campo"><label>Categoria</label>
          <select name="categoria_id">
            <option value="">Sem categoria</option>
            ${categorias.map((c) => `<option value="${c.id}" ${m.categoria_id === c.id ? 'selected' : ''}>${Utilidades.escaparHtml(c.nome)}</option>`).join('')}
          </select>
        </div>
        ${m.id ? `
        <div class="campo">
          <label>Arquivo atual</label>
          <div class="flex-entre" style="padding:9px 11px; border:1px solid var(--cor-borda); border-radius:6px; background:var(--cor-superficie-alt);">
            <span>${Utilidades.iconePorTipo(m.nome_arquivo)} ${Utilidades.escaparHtml(m.nome_arquivo)} <span class="texto-fraco texto-pequeno">(${Utilidades.formatarTamanho(m.tamanho_bytes)})</span></span>
            <a class="botao botao-texto botao-pequeno" href="/api/modelos/${m.id}/arquivo">${Icone('baixar', 14)} Baixar</a>
          </div>
        </div>` : ''}
        <div class="campo">
          <label>${m.id ? 'Substituir arquivo (opcional)' : 'Arquivo *'}</label>
          <input type="file" name="arquivo">
          <div class="campo-ajuda">Recomendado: .docx, .doc, .odt, .rtf ou .pdf. Tamanho máximo 30 MB.</div>
        </div>
        <div id="erro-modelo" class="campo-erro oculto"></div>
      </form>`,
    rodapeHtml: `
      ${m.id ? '<button class="botao botao-perigo" id="botao-excluir-modelo" style="margin-right:auto;">Excluir</button>' : ''}
      ${m.id ? '<button class="botao" id="botao-usar-modelo">Criar documento a partir deste modelo</button>' : ''}
      <button class="botao" data-fechar-modal type="button">Cancelar</button>
      <button class="botao botao-primario" id="botao-salvar-modelo">Salvar</button>`,
    aoMontar: (modal) => {
      modal.querySelector('#botao-salvar-modelo').addEventListener('click', async () => {
        const form = modal.querySelector('#form-modelo');
        const titulo = form.titulo.value.trim();
        const arquivo = form.arquivo.files[0];
        const el = modal.querySelector('#erro-modelo');

        if (!titulo) { el.textContent = 'Informe o título do modelo.'; el.classList.remove('oculto'); return; }
        if (!m.id && !arquivo) { el.textContent = 'Selecione um arquivo para enviar.'; el.classList.remove('oculto'); return; }

        const dados = new FormData();
        dados.append('titulo', titulo);
        dados.append('categoria_id', form.categoria_id.value || '');
        if (arquivo) dados.append('arquivo', arquivo);

        try {
          if (m.id) await api.put('/api/modelos/' + m.id, dados);
          else await api.post('/api/modelos', dados);
          Modal.fechar();
          aoSalvar();
        } catch (erro) {
          el.textContent = erro.message; el.classList.remove('oculto');
        }
      });

      const botaoExcluir = modal.querySelector('#botao-excluir-modelo');
      if (botaoExcluir) botaoExcluir.addEventListener('click', async () => {
        if (!confirm('Excluir este modelo? O arquivo enviado também será removido.')) return;
        await api.del('/api/modelos/' + m.id);
        Modal.fechar();
        aoSalvar();
      });

      const botaoUsar = modal.querySelector('#botao-usar-modelo');
      if (botaoUsar) botaoUsar.addEventListener('click', () => {
        Modal.fechar();
        abrirModalDocumento(null, { titulo: m.titulo, modelo_origem_id: m.id, modelo_origem_nome: m.nome_arquivo }, () => {});
      });
    }
  });
}
