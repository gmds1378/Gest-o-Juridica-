// Tela: Anotações (bloco de notas rápidas, avulsas ou vinculadas a processo/cliente)
Roteador.registrar('anotacoes', async (container) => {
  await renderizarAnotacoes(container);
});

async function renderizarAnotacoes(container) {
  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div>
        <h1>Anotações</h1>
        <div class="subtitulo">Bloco de notas rápidas do escritório</div>
      </div>
      <button class="botao botao-primario" id="botao-nova-anotacao">+ Nova anotação</button>
    </div>
    <input type="text" id="busca-anotacao" placeholder="Buscar por palavra-chave..." style="width:100%; max-width:360px; padding:9px 11px; border:1px solid var(--cor-borda); border-radius:6px; background:var(--cor-superficie); margin-bottom:16px;">
    <div class="grade-4" id="grade-anotacoes"><div class="carregando">Carregando...</div></div>
  `;

  const grade = container.querySelector('#grade-anotacoes');

  async function carregar(termo = '') {
    const { anotacoes } = await api.get('/api/anotacoes' + (termo ? '?q=' + encodeURIComponent(termo) : ''));
    if (!anotacoes.length) {
      grade.innerHTML = `<div class="estado-vazio" style="grid-column:1/-1;"><div class="icone-grande">${Icone('nota', 34)}</div>Nenhuma anotação ainda.</div>`;
      return;
    }
    grade.innerHTML = anotacoes.map((a) => `
      <div class="cartao card-clicavel" data-id="${a.id}">
        <div class="cartao-corpo">
          <div class="flex-entre">
            <strong>${Utilidades.escaparHtml(a.titulo || '(sem título)')}</strong>
            <button class="botao-icone botao" style="border:none; color:${a.fixado ? 'var(--cor-destaque)' : 'var(--cor-texto-fraco)'};" data-fixar="${a.id}" title="Fixar no topo">${Icone('fixar', 15)}</button>
          </div>
          <p class="texto-suave texto-pequeno" style="margin:6px 0;">${Utilidades.escaparHtml((a.conteudo || '').slice(0, 140))}${(a.conteudo || '').length > 140 ? '…' : ''}</p>
          <div class="texto-fraco texto-pequeno">
            ${a.processo_id ? `Vinculada a ${Utilidades.escaparHtml(a.numero_cnj || a.cliente_nome || 'processo')} · ` : ''}${Utilidades.formatarDataHora(a.atualizado_em)}
          </div>
        </div>
      </div>`).join('');

    grade.querySelectorAll('[data-fixar]').forEach((b) => {
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await api.patch('/api/anotacoes/' + b.dataset.fixar + '/fixar');
        carregar(container.querySelector('#busca-anotacao').value);
      });
    });
    grade.querySelectorAll('[data-id]').forEach((cartao) => {
      cartao.addEventListener('click', async () => {
        const anotacao = anotacoes.find((a) => a.id == cartao.dataset.id);
        abrirModalAnotacao(anotacao, {}, () => carregar(container.querySelector('#busca-anotacao').value));
      });
    });
  }

  container.querySelector('#busca-anotacao').addEventListener('input', Utilidades.debounce((ev) => carregar(ev.target.value), 300));
  container.querySelector('#botao-nova-anotacao').addEventListener('click', () => abrirModalAnotacao(null, {}, () => carregar()));

  await carregar();
}

// =======================================================================
// Modal: nova/editar anotação
// =======================================================================
async function abrirModalAnotacao(anotacaoExistente, contextoPadrao, aoSalvar) {
  const a = anotacaoExistente || contextoPadrao || {};
  const [{ processos }, { clientes }] = await Promise.all([api.get('/api/processos'), api.get('/api/clientes')]);

  Modal.abrir({
    titulo: anotacaoExistente && anotacaoExistente.id ? 'Editar anotação' : 'Nova anotação',
    corpoHtml: `
      <form id="form-anotacao">
        <div class="campo"><label>Título (opcional)</label><input type="text" name="titulo" value="${Utilidades.escaparHtml(a.titulo || '')}"></div>
        <div class="campo"><label>Anotação *</label><textarea name="conteudo" rows="6" required>${Utilidades.escaparHtml(a.conteudo || '')}</textarea></div>
        <div class="campo"><label>Vincular a um processo (opcional)</label>
          <select name="processo_id">
            <option value="">Nenhum</option>
            ${processos.map((p) => `<option value="${p.id}" ${a.processo_id === p.id ? 'selected' : ''}>${Utilidades.escaparHtml(p.cliente_nome)} - ${Utilidades.escaparHtml(p.numero_cnj || 'sem número')}</option>`).join('')}
          </select>
        </div>
        <div id="erro-anotacao" class="campo-erro oculto"></div>
      </form>`,
    rodapeHtml: `
      ${anotacaoExistente && anotacaoExistente.id ? '<button class="botao botao-perigo" id="botao-excluir-anotacao" style="margin-right:auto;">Excluir</button>' : ''}
      <button class="botao" data-fechar-modal type="button">Cancelar</button>
      <button class="botao botao-primario" id="botao-salvar-anotacao">Salvar</button>`,
    aoMontar: (modal) => {
      modal.querySelector('#botao-salvar-anotacao').addEventListener('click', async () => {
        const form = modal.querySelector('#form-anotacao');
        const dados = Object.fromEntries(new FormData(form).entries());
        if (contextoPadrao && contextoPadrao.cliente_id) dados.cliente_id = contextoPadrao.cliente_id;
        if (!dados.conteudo.trim()) {
          const el = modal.querySelector('#erro-anotacao');
          el.textContent = 'A anotação não pode ficar vazia.'; el.classList.remove('oculto');
          return;
        }
        try {
          await Modal.durante('Salvando...', async () => {
            if (anotacaoExistente && anotacaoExistente.id) await api.put('/api/anotacoes/' + anotacaoExistente.id, dados);
            else await api.post('/api/anotacoes', dados);
            Modal.fechar();
            aoSalvar();
          });
        } catch (erro) {
          const el = modal.querySelector('#erro-anotacao');
          el.textContent = erro.message; el.classList.remove('oculto');
        }
      });
      const botaoExcluir = modal.querySelector('#botao-excluir-anotacao');
      if (botaoExcluir) botaoExcluir.addEventListener('click', async () => {
        if (!confirm('Excluir esta anotação?')) return;
        await Modal.durante('Excluindo...', async () => {
          await api.del('/api/anotacoes/' + anotacaoExistente.id);
          Modal.fechar();
          aoSalvar();
        }, { botao: botaoExcluir });
      });
    }
  });
}
