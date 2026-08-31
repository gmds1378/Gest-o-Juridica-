// Tela: Documentos (arquivos locais, ex.: .docx, com origem opcional em um Modelo)
Roteador.registrar('documentos', async (container) => {
  await renderizarDocumentos(container);
});

async function renderizarDocumentos(container) {
  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div>
        <h1>Documentos</h1>
        <div class="subtitulo">Arquivos no Google Drive, vinculados a um processo — envie pelo sistema e baixe para editar no Word</div>
      </div>
      <button class="botao botao-primario" id="botao-novo-documento">+ Novo documento</button>
    </div>
    <div class="cartao"><div class="cartao-corpo">
      <input type="text" id="busca-documento" placeholder="Buscar por título..." style="width:100%; max-width:360px; padding:9px 11px; border:1px solid var(--cor-borda); border-radius:6px; background:var(--cor-superficie); margin-bottom:14px;">
      <div id="lista-documentos"><div class="carregando">Carregando...</div></div>
    </div></div>
  `;

  const areaLista = container.querySelector('#lista-documentos');

  async function carregar(termo = '') {
    const { documentos } = await api.get('/api/documentos' + (termo ? '?q=' + encodeURIComponent(termo) : ''));
    if (!documentos.length) {
      areaLista.innerHTML = `<div class="estado-vazio"><div class="icone-grande">${Icone('documento', 34)}</div>Nenhum documento enviado ainda.</div>`;
      return;
    }
    areaLista.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Título</th><th>Arquivo</th><th>Vinculado a</th><th>Atualizado em</th><th></th></tr></thead>
        <tbody>${documentos.map((d) => `
          <tr class="clicavel" data-id="${d.id}">
            <td><strong>${Utilidades.escaparHtml(d.titulo)}</strong></td>
            <td class="texto-suave">${Utilidades.iconePorTipo(d.nome_arquivo)} ${Utilidades.escaparHtml(d.nome_arquivo)}<br><span class="texto-fraco texto-pequeno">${Utilidades.formatarTamanho(d.tamanho_bytes)}</span></td>
            <td class="texto-suave">${d.numero_cnj ? Utilidades.escaparHtml(d.numero_cnj) : (d.cliente_nome ? Utilidades.escaparHtml(d.cliente_nome) : '-')}</td>
            <td class="texto-suave">${Utilidades.formatarDataHora(d.atualizado_em)}</td>
            <td style="text-align:right;"><a class="botao botao-texto botao-pequeno" href="/api/documentos/${d.id}/arquivo" onclick="event.stopPropagation()">${Icone('baixar', 14)} Baixar</a></td>
          </tr>`).join('')}</tbody>
      </table>`;
    areaLista.querySelectorAll('tr[data-id]').forEach((linha) => {
      linha.addEventListener('click', async () => {
        const { documento } = await api.get('/api/documentos/' + linha.dataset.id);
        abrirModalDocumento(documento, {}, () => carregar(container.querySelector('#busca-documento').value));
      });
    });
  }

  container.querySelector('#busca-documento').addEventListener('input', Utilidades.debounce((ev) => carregar(ev.target.value), 300));
  container.querySelector('#botao-novo-documento').addEventListener('click', () => abrirModalDocumento(null, {}, () => carregar()));

  await carregar();
}

// =======================================================================
// Modal: novo/editar documento (upload de arquivo, ou copiado de um Modelo)
// =======================================================================
async function abrirModalDocumento(documentoExistente, contextoPadrao, aoSalvar) {
  const d = documentoExistente || {};
  const dadosIniciais = { ...contextoPadrao, ...d };
  const { processos } = await api.get('/api/processos');
  const modelos = dadosIniciais.modelo_origem_id ? null : (await api.get('/api/modelos')).modelos;

  Modal.abrir({
    titulo: d.id ? 'Editar documento' : 'Novo documento',
    corpoHtml: `
      <form id="form-documento">
        <div class="campo"><label>Título *</label><input type="text" name="titulo" value="${Utilidades.escaparHtml(dadosIniciais.titulo || '')}"></div>
        <div class="campo"><label>Processo vinculado</label>
          <select name="processo_id">
            <option value="">Nenhum</option>
            ${processos.map((p) => `<option value="${p.id}" data-cliente="${p.cliente_id}" ${dadosIniciais.processo_id === p.id ? 'selected' : ''}>${Utilidades.escaparHtml(p.cliente_nome)} - ${Utilidades.escaparHtml(p.numero_cnj || 'sem número')}</option>`).join('')}
          </select>
        </div>
        ${d.id ? `
        <div class="campo">
          <label>Arquivo atual</label>
          <div class="flex-entre" style="padding:9px 11px; border:1px solid var(--cor-borda); border-radius:6px; background:var(--cor-superficie-alt);">
            <span>${Utilidades.iconePorTipo(d.nome_arquivo)} ${Utilidades.escaparHtml(d.nome_arquivo)} <span class="texto-fraco texto-pequeno">(${Utilidades.formatarTamanho(d.tamanho_bytes)})</span></span>
            <a class="botao botao-texto botao-pequeno" href="/api/documentos/${d.id}/arquivo">${Icone('baixar', 14)} Baixar</a>
          </div>
        </div>
        <div class="campo"><label>Substituir arquivo (opcional)</label><input type="file" name="arquivo"></div>
        ` : dadosIniciais.modelo_origem_id ? `
        <input type="hidden" name="modelo_origem_id" value="${dadosIniciais.modelo_origem_id}">
        <div class="campo">
          <label>Arquivo</label>
          <div class="campo-ajuda">Será copiado o arquivo do modelo "${Utilidades.escaparHtml(dadosIniciais.modelo_origem_nome || '')}" — depois é só baixar e editar no Word.</div>
        </div>
        ` : `
        <div class="campo"><label>Carregar a partir de um modelo (opcional)</label>
          <select id="doc-modelo-origem">
            <option value="">Nenhum — enviar arquivo diretamente</option>
            ${modelos.map((m) => `<option value="${m.id}" data-nome="${Utilidades.escaparHtml(m.nome_arquivo)}">${Utilidades.escaparHtml(m.titulo)}</option>`).join('')}
          </select>
        </div>
        <div class="campo" id="campo-arquivo-novo"><label>Arquivo *</label><input type="file" name="arquivo">
          <div class="campo-ajuda">Recomendado: .docx, .doc, .odt, .rtf ou .pdf. Tamanho máximo 30 MB.</div>
        </div>
        `}
        <div id="erro-documento" class="campo-erro oculto"></div>
      </form>`,
    rodapeHtml: `
      ${d.id ? '<button class="botao botao-perigo" id="botao-excluir-documento" style="margin-right:auto;">Excluir</button>' : ''}
      <button class="botao" data-fechar-modal type="button">Cancelar</button>
      <button class="botao botao-primario" id="botao-salvar-documento">Salvar</button>`,
    aoMontar: (modal) => {
      const seletorModelo = modal.querySelector('#doc-modelo-origem');
      if (seletorModelo) {
        seletorModelo.addEventListener('change', () => {
          const campoArquivo = modal.querySelector('#campo-arquivo-novo');
          campoArquivo.classList.toggle('oculto', !!seletorModelo.value);
          if (seletorModelo.value && !modal.querySelector('#doc-titulo-preenchido-por-modelo')) {
            const tituloInput = modal.querySelector('[name="titulo"]');
            if (!tituloInput.value) tituloInput.value = seletorModelo.selectedOptions[0].textContent;
          }
        });
      }

      modal.querySelector('#botao-salvar-documento').addEventListener('click', async () => {
        const form = modal.querySelector('#form-documento');
        const el = modal.querySelector('#erro-documento');
        const titulo = form.titulo.value.trim();
        if (!titulo) { el.textContent = 'Informe o título do documento.'; el.classList.remove('oculto'); return; }

        const processoSelect = form.processo_id;
        const opcaoSelecionada = processoSelect.selectedOptions[0];
        const arquivo = form.arquivo ? form.arquivo.files[0] : null;
        const modeloOrigemId = form.modelo_origem_id ? form.modelo_origem_id.value : (seletorModelo ? seletorModelo.value : '');

        if (!d.id && !arquivo && !modeloOrigemId) {
          el.textContent = 'Envie um arquivo ou selecione um modelo de origem.'; el.classList.remove('oculto'); return;
        }

        const dados = new FormData();
        dados.append('titulo', titulo);
        dados.append('processo_id', processoSelect.value || '');
        dados.append('cliente_id', (opcaoSelecionada && opcaoSelecionada.dataset.cliente) || '');
        if (modeloOrigemId) dados.append('modelo_origem_id', modeloOrigemId);
        if (arquivo) dados.append('arquivo', arquivo);

        const rotulo = arquivo ? 'Enviando ao Drive...' : 'Salvando...';
        try {
          await Modal.durante(rotulo, async () => {
            if (d.id) await api.put('/api/documentos/' + d.id, dados);
            else await api.post('/api/documentos', dados);
            Modal.fechar();
            aoSalvar();
          }, { botao: modal.querySelector('#botao-salvar-documento') });
        } catch (erro) {
          el.textContent = erro.message; el.classList.remove('oculto');
        }
      });

      const botaoExcluir = modal.querySelector('#botao-excluir-documento');
      if (botaoExcluir) botaoExcluir.addEventListener('click', async () => {
        if (!confirm('Excluir este documento da lista? O arquivo fica 60 dias na lixeira do Drive e só então é apagado de vez.')) return;
        const el = modal.querySelector('#erro-documento');
        try {
          await Modal.durante('Excluindo...', async () => {
            await api.del('/api/documentos/' + d.id);
            Modal.fechar();
            aoSalvar();
          }, { botao: botaoExcluir });
        } catch (erro) {
          el.textContent = erro.message; el.classList.remove('oculto');
        }
      });
    }
  });
}
