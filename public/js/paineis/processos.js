// Tela: Processos e Clientes (cadastro central do escritório)
let _abaListaProcessos = 'processos';

Roteador.registrar('processos', async (container, parametro) => {
  if (parametro && /^\d+$/.test(parametro)) {
    await renderizarDetalheProcesso(container, parametro);
  } else {
    if (parametro === 'clientes') _abaListaProcessos = 'clientes';
    await renderizarListaProcessos(container);
  }
});

// =======================================================================
// Lista de processos / clientes
// =======================================================================
async function renderizarListaProcessos(container) {
  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div>
        <h1>Processos e Clientes</h1>
        <div class="subtitulo">Cadastro central do escritório</div>
      </div>
      <div class="flex gap-8">
        <button class="botao" id="botao-novo-cliente">+ Novo cliente</button>
        <button class="botao botao-primario" id="botao-novo-processo">+ Novo processo</button>
      </div>
    </div>

    <div class="abas">
      <button data-aba="processos" class="${_abaListaProcessos === 'processos' ? 'ativa' : ''}">Processos</button>
      <button data-aba="clientes" class="${_abaListaProcessos === 'clientes' ? 'ativa' : ''}">Clientes</button>
    </div>

    <div class="cartao">
      <div class="cartao-corpo">
        <div class="flex gap-8" style="margin-bottom:14px;">
          <input type="text" id="filtro-busca" placeholder="Buscar..." style="max-width:320px; padding:8px 11px; border:1px solid var(--cor-borda); border-radius:6px; background:var(--cor-superficie);">
          <select id="filtro-status" class="oculto" style="padding:8px 11px; border:1px solid var(--cor-borda); border-radius:6px; background:var(--cor-superficie);">
            <option value="">Todos os status</option>
            <option value="ativo">Ativos</option>
            <option value="arquivado">Arquivados</option>
          </select>
        </div>
        <div id="area-tabela"><div class="carregando">Carregando...</div></div>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-aba]').forEach((botao) => {
    botao.addEventListener('click', () => {
      _abaListaProcessos = botao.dataset.aba;
      renderizarListaProcessos(container);
    });
  });

  container.querySelector('#filtro-status').classList.toggle('oculto', _abaListaProcessos !== 'processos');

  const recarregar = Utilidades.debounce(() => carregarTabela(container), 250);
  container.querySelector('#filtro-busca').addEventListener('input', recarregar);
  const filtroStatus = container.querySelector('#filtro-status');
  if (filtroStatus) filtroStatus.addEventListener('change', recarregar);

  container.querySelector('#botao-novo-processo').addEventListener('click', () => abrirModalProcesso(null, () => renderizarListaProcessos(container)));
  container.querySelector('#botao-novo-cliente').addEventListener('click', () => abrirModalCliente(null, () => renderizarListaProcessos(container)));

  await carregarTabela(container);
}

async function carregarTabela(container) {
  const area = container.querySelector('#area-tabela');
  const termo = container.querySelector('#filtro-busca').value.trim();

  if (_abaListaProcessos === 'clientes') {
    const { clientes } = await api.get('/api/clientes' + (termo ? '?q=' + encodeURIComponent(termo) : ''));
    if (!clientes.length) {
      area.innerHTML = `<div class="estado-vazio"><div class="icone-grande">${Icone('usuario', 34)}</div>Nenhum cliente cadastrado ainda.</div>`;
      return;
    }
    area.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Telefone</th><th>E-mail</th><th></th></tr></thead>
        <tbody>
          ${clientes.map((c) => `
            <tr class="clicavel" data-id="${c.id}">
              <td><strong>${Utilidades.escaparHtml(c.nome)}</strong></td>
              <td>${Utilidades.escaparHtml(c.documento || '-')}</td>
              <td>${Utilidades.escaparHtml(c.telefone || '-')}</td>
              <td>${Utilidades.escaparHtml(c.email || '-')}</td>
              <td style="text-align:right;"><button class="botao botao-texto botao-pequeno" data-editar-cliente="${c.id}">Editar</button></td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    area.querySelectorAll('[data-editar-cliente]').forEach((b) => {
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const { cliente } = await api.get('/api/clientes/' + b.dataset.editarCliente);
        abrirModalCliente(cliente, () => renderizarListaProcessos(container));
      });
    });
    return;
  }

  const status = container.querySelector('#filtro-status').value;
  const params = new URLSearchParams();
  if (termo) params.set('q', termo);
  if (status) params.set('status', status);
  const { processos } = await api.get('/api/processos?' + params.toString());

  if (!processos.length) {
    area.innerHTML = `<div class="estado-vazio"><div class="icone-grande">${Icone('balanca', 34)}</div>Nenhum processo cadastrado ainda.</div>`;
    return;
  }

  area.innerHTML = `
    <table class="tabela">
      <thead><tr><th>Cliente</th><th>Nº do processo</th><th>Vara/Comarca</th><th>Área</th><th>Status</th><th>Etiquetas</th></tr></thead>
      <tbody>
        ${processos.map((p) => `
          <tr class="clicavel" data-id="${p.id}">
            <td><strong>${Utilidades.escaparHtml(p.cliente_nome)}</strong><br><span class="texto-fraco texto-pequeno">${Utilidades.escaparHtml(p.parte_contraria || '')}</span></td>
            <td>${Utilidades.escaparHtml(p.numero_cnj || '-')}</td>
            <td>${Utilidades.escaparHtml(p.vara_comarca || '-')}</td>
            <td>${Utilidades.escaparHtml(p.area_direito || '-')}</td>
            <td><span class="selo ${p.status === 'ativo' ? 'selo-sucesso' : 'selo-neutro'}">${p.status === 'ativo' ? 'Ativo' : 'Arquivado'}</span></td>
            <td>${p.etiquetas.map((e) => `<span class="etiqueta-cor" style="background:${e.cor}22; color:${e.cor}"><span class="ponto" style="background:${e.cor}"></span>${Utilidades.escaparHtml(e.nome)}</span>`).join(' ')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  area.querySelectorAll('tr[data-id]').forEach((linha) => {
    linha.addEventListener('click', () => Roteador.irPara('processos/' + linha.dataset.id));
  });
}

// =======================================================================
// Detalhe do processo (abas: Detalhes, Documentos, Prazos, Anotações)
// =======================================================================
let _abaDetalheProcesso = 'detalhes';

async function renderizarDetalheProcesso(container, id) {
  const { processo } = await api.get('/api/processos/' + id);

  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div>
        <button class="botao botao-texto botao-pequeno" id="botao-voltar" style="padding-left:0;">← Voltar para processos</button>
        <h1>${Utilidades.escaparHtml(processo.cliente_nome)}</h1>
        <div class="subtitulo">${Utilidades.escaparHtml(processo.numero_cnj || 'Sem número de processo cadastrado')} · ${processo.status === 'ativo' ? 'Ativo' : 'Arquivado'}</div>
      </div>
      <div class="flex gap-8">
        ${processo.link_tribunal ? `<a class="botao" href="${Utilidades.escaparHtml(processo.link_tribunal)}" target="_blank" rel="noopener">${Icone('link', 15)} Tribunal</a>` : ''}
        ${processo.link_drive_pasta ? `<a class="botao" href="${Utilidades.escaparHtml(processo.link_drive_pasta)}" target="_blank" rel="noopener">${Icone('link', 15)} Pasta no Drive</a>` : ''}
        <button class="botao botao-primario" id="botao-editar-processo">Editar</button>
      </div>
    </div>

    <div class="abas">
      <button data-aba="detalhes" class="${_abaDetalheProcesso === 'detalhes' ? 'ativa' : ''}">Detalhes</button>
      <button data-aba="documentos" class="${_abaDetalheProcesso === 'documentos' ? 'ativa' : ''}">Documentos</button>
      <button data-aba="prazos" class="${_abaDetalheProcesso === 'prazos' ? 'ativa' : ''}">Prazos</button>
      <button data-aba="anotacoes" class="${_abaDetalheProcesso === 'anotacoes' ? 'ativa' : ''}">Anotações</button>
    </div>

    <div id="conteudo-aba"></div>
  `;

  container.querySelector('#botao-voltar').addEventListener('click', () => Roteador.irPara('processos'));
  container.querySelector('#botao-editar-processo').addEventListener('click', () => {
    abrirModalProcesso(processo, () => renderizarDetalheProcesso(container, id));
  });

  container.querySelectorAll('[data-aba]').forEach((botao) => {
    botao.addEventListener('click', () => {
      _abaDetalheProcesso = botao.dataset.aba;
      renderizarDetalheProcesso(container, id);
    });
  });

  const areaAba = container.querySelector('#conteudo-aba');

  if (_abaDetalheProcesso === 'detalhes') {
    areaAba.innerHTML = `
      <div class="grade-2">
        <div class="cartao"><div class="cartao-corpo">
          <h2 style="font-size:15px;">Dados do processo</h2>
          <p><strong>Vara/Comarca:</strong> ${Utilidades.escaparHtml(processo.vara_comarca || '-')}</p>
          <p><strong>Parte contrária:</strong> ${Utilidades.escaparHtml(processo.parte_contraria || '-')}</p>
          <p><strong>Área do direito:</strong> ${Utilidades.escaparHtml(processo.area_direito || '-')}</p>
          <p><strong>Etiquetas:</strong> ${processo.etiquetas.length ? processo.etiquetas.map((e) => `<span class="etiqueta-cor" style="background:${e.cor}22; color:${e.cor}"><span class="ponto" style="background:${e.cor}"></span>${Utilidades.escaparHtml(e.nome)}</span>`).join(' ') : '-'}</p>
        </div></div>
        <div class="cartao"><div class="cartao-corpo">
          <h2 style="font-size:15px;">Observações</h2>
          <p class="texto-suave">${Utilidades.escaparHtml(processo.observacoes || 'Nenhuma observação registrada.')}</p>
        </div></div>
      </div>`;
  } else if (_abaDetalheProcesso === 'documentos') {
    const { documentos } = await api.get(`/api/processos/${id}/documentos`);
    areaAba.innerHTML = `
      <div class="cartao"><div class="cartao-corpo">
        <div class="flex-entre" style="margin-bottom:10px;">
          <h2 style="font-size:15px; margin:0;">Documentos</h2>
          <button class="botao botao-pequeno botao-primario" id="botao-novo-doc-processo">+ Novo documento</button>
        </div>
        ${documentos.length ? documentos.map((d) => `
          <div class="flex-entre" style="padding:9px 0; border-bottom:1px solid var(--cor-borda);">
            <span data-abrir-doc="${d.id}" style="cursor:pointer; font-weight:500;">${Utilidades.iconePorTipo(d.nome_arquivo)} ${Utilidades.escaparHtml(d.titulo)}</span>
            <span class="flex gap-8">
              <span class="texto-fraco texto-pequeno">${Utilidades.formatarDataHora(d.atualizado_em)}</span>
              <a class="botao botao-texto botao-pequeno" href="/api/documentos/${d.id}/arquivo" onclick="event.stopPropagation()">${Icone('baixar', 15)}</a>
            </span>
          </div>`).join('') : '<div class="estado-vazio">Nenhum documento vinculado a este processo ainda.</div>'}
      </div></div>`;
    areaAba.querySelector('#botao-novo-doc-processo').addEventListener('click', () => {
      abrirModalDocumento(null, { processo_id: processo.id, cliente_id: processo.cliente_id }, () => renderizarDetalheProcesso(container, id));
    });
    areaAba.querySelectorAll('[data-abrir-doc]').forEach((el) => {
      el.addEventListener('click', async () => {
        const { documento } = await api.get('/api/documentos/' + el.dataset.abrirDoc);
        abrirModalDocumento(documento, {}, () => renderizarDetalheProcesso(container, id));
      });
    });
  } else if (_abaDetalheProcesso === 'prazos') {
    const { prazos } = await api.get(`/api/processos/${id}/prazos`);
    areaAba.innerHTML = `
      <div class="cartao"><div class="cartao-corpo">
        <div class="flex-entre" style="margin-bottom:10px;">
          <h2 style="font-size:15px; margin:0;">Prazos vinculados</h2>
          <button class="botao botao-pequeno botao-primario" id="botao-novo-prazo-processo">+ Novo prazo</button>
        </div>
        ${prazos.length ? prazos.map((p) => `
          <div class="flex-entre" style="padding:9px 0; border-bottom:1px solid var(--cor-borda);">
            <label class="flex gap-8" style="cursor:pointer;">
              <input type="checkbox" data-concluir-prazo="${p.id}" ${p.concluido ? 'checked' : ''}>
              <span style="${p.concluido ? 'text-decoration:line-through; color:var(--cor-texto-fraco);' : ''}">${Utilidades.escaparHtml(p.titulo)}</span>
            </label>
            <span class="flex gap-8">${Utilidades.seloPrioridade(p.prioridade)} <span class="texto-pequeno texto-fraco">${Utilidades.formatarData(p.vencimento)}</span></span>
          </div>`).join('') : '<div class="estado-vazio">Nenhum prazo vinculado a este processo.</div>'}
      </div></div>`;
    areaAba.querySelector('#botao-novo-prazo-processo').addEventListener('click', () => {
      abrirModalPrazo(null, { processo_id: processo.id, cliente_id: processo.cliente_id }, () => renderizarDetalheProcesso(container, id));
    });
    areaAba.querySelectorAll('[data-concluir-prazo]').forEach((chk) => {
      chk.addEventListener('change', async () => {
        await api.patch(`/api/prazos/${chk.dataset.concluirPrazo}/concluir`);
        if (typeof atualizarSino === 'function') atualizarSino();
        renderizarDetalheProcesso(container, id);
      });
    });
  } else if (_abaDetalheProcesso === 'anotacoes') {
    const { anotacoes } = await api.get(`/api/processos/${id}/anotacoes`);
    areaAba.innerHTML = `
      <div class="cartao"><div class="cartao-corpo">
        <div class="flex-entre" style="margin-bottom:10px;">
          <h2 style="font-size:15px; margin:0;">Anotações</h2>
          <button class="botao botao-pequeno botao-primario" id="botao-nova-anot-processo">+ Nova anotação</button>
        </div>
        ${anotacoes.length ? anotacoes.map((a) => `
          <div style="padding:9px 0; border-bottom:1px solid var(--cor-borda); cursor:pointer;" data-abrir-anot="${a.id}">
            <strong>${a.fixado ? Icone('fixar', 13) + ' ' : ''}${Utilidades.escaparHtml(a.titulo || '(sem título)')}</strong>
            <div class="texto-suave texto-pequeno">${Utilidades.escaparHtml((a.conteudo || '').slice(0, 120))}</div>
          </div>`).join('') : '<div class="estado-vazio">Nenhuma anotação vinculada a este processo.</div>'}
      </div></div>`;
    areaAba.querySelector('#botao-nova-anot-processo').addEventListener('click', () => {
      abrirModalAnotacao(null, { processo_id: processo.id, cliente_id: processo.cliente_id }, () => renderizarDetalheProcesso(container, id));
    });
    areaAba.querySelectorAll('[data-abrir-anot]').forEach((el) => {
      el.addEventListener('click', async () => {
        const anotacao = (await api.get('/api/anotacoes?processoId=' + id)).anotacoes.find((a) => a.id == el.dataset.abrirAnot);
        abrirModalAnotacao(anotacao, {}, () => renderizarDetalheProcesso(container, id));
      });
    });
  }
}

// =======================================================================
// Modal: Novo/editar cliente
// =======================================================================
function abrirModalCliente(clienteExistente, aoSalvar) {
  const c = clienteExistente || {};
  Modal.abrir({
    titulo: c.id ? 'Editar cliente' : 'Novo cliente',
    corpoHtml: `
      <form id="form-cliente">
        <div class="campo"><label>Nome completo / Razão social *</label><input type="text" name="nome" required value="${Utilidades.escaparHtml(c.nome || '')}"></div>
        <div class="campo-linha">
          <div class="campo"><label>CPF/CNPJ</label><input type="text" name="documento" value="${Utilidades.escaparHtml(c.documento || '')}"></div>
          <div class="campo"><label>Telefone</label><input type="text" name="telefone" value="${Utilidades.escaparHtml(c.telefone || '')}"></div>
        </div>
        <div class="campo"><label>E-mail</label><input type="email" name="email" value="${Utilidades.escaparHtml(c.email || '')}"></div>
        <div class="campo"><label>Observações</label><textarea name="observacoes">${Utilidades.escaparHtml(c.observacoes || '')}</textarea></div>
        <div id="erro-cliente" class="campo-erro oculto"></div>
      </form>`,
    rodapeHtml: `
      ${c.id ? '<button class="botao botao-perigo" id="botao-excluir-cliente" style="margin-right:auto;">Excluir</button>' : ''}
      <button class="botao" data-fechar-modal type="button">Cancelar</button>
      <button class="botao botao-primario" id="botao-salvar-cliente">Salvar</button>`,
    aoMontar: (modal) => {
      modal.querySelector('#botao-salvar-cliente').addEventListener('click', async () => {
        const form = modal.querySelector('#form-cliente');
        const dados = Object.fromEntries(new FormData(form).entries());
        if (!dados.nome.trim()) return;
        try {
          if (c.id) await api.put('/api/clientes/' + c.id, dados);
          else await api.post('/api/clientes', dados);
          Modal.fechar();
          aoSalvar();
        } catch (erro) {
          const el = modal.querySelector('#erro-cliente');
          el.textContent = erro.message; el.classList.remove('oculto');
        }
      });
      const botaoExcluir = modal.querySelector('#botao-excluir-cliente');
      if (botaoExcluir) botaoExcluir.addEventListener('click', async () => {
        if (!confirm('Excluir este cliente? Esta ação não pode ser desfeita.')) return;
        try {
          await api.del('/api/clientes/' + c.id);
          Modal.fechar();
          aoSalvar();
        } catch (erro) {
          const el = modal.querySelector('#erro-cliente');
          el.textContent = erro.message; el.classList.remove('oculto');
        }
      });
    }
  });
}

// =======================================================================
// Modal: Novo/editar processo
// =======================================================================
async function abrirModalProcesso(processoExistente, aoSalvar) {
  const p = processoExistente || {};
  const [{ clientes }, { etiquetas }] = await Promise.all([api.get('/api/clientes'), api.get('/api/etiquetas')]);
  const etiquetasSelecionadas = new Set((p.etiquetas || []).map((e) => e.id));

  Modal.abrir({
    titulo: p.id ? 'Editar processo' : 'Novo processo',
    largo: true,
    corpoHtml: `
      <form id="form-processo">
        <div class="campo-linha">
          <div class="campo"><label>Cliente *</label>
            <select name="cliente_id" required>
              <option value="">Selecione...</option>
              ${clientes.map((c) => `<option value="${c.id}" ${p.cliente_id === c.id ? 'selected' : ''}>${Utilidades.escaparHtml(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="campo"><label>Status</label>
            <select name="status">
              <option value="ativo" ${p.status !== 'arquivado' ? 'selected' : ''}>Ativo</option>
              <option value="arquivado" ${p.status === 'arquivado' ? 'selected' : ''}>Arquivado</option>
            </select>
          </div>
        </div>
        <div class="campo"><label>Número do processo (padrão CNJ)</label>
          <input type="text" name="numero_cnj" placeholder="0000000-00.0000.0.00.0000" value="${Utilidades.escaparHtml(p.numero_cnj || '')}"></div>
        <div class="campo-linha">
          <div class="campo"><label>Vara/Comarca</label><input type="text" name="vara_comarca" value="${Utilidades.escaparHtml(p.vara_comarca || '')}"></div>
          <div class="campo"><label>Área do direito</label><input type="text" name="area_direito" value="${Utilidades.escaparHtml(p.area_direito || '')}"></div>
        </div>
        <div class="campo"><label>Parte contrária</label><input type="text" name="parte_contraria" value="${Utilidades.escaparHtml(p.parte_contraria || '')}"></div>
        <div class="campo-linha">
          <div class="campo"><label>Link no sistema do tribunal (eproc, PJe...)</label><input type="url" name="link_tribunal" placeholder="https://..." value="${Utilidades.escaparHtml(p.link_tribunal || '')}"></div>
          <div class="campo"><label>Link da pasta no Google Drive</label><input type="url" name="link_drive_pasta" placeholder="https://drive.google.com/..." value="${Utilidades.escaparHtml(p.link_drive_pasta || '')}"></div>
        </div>
        <div class="campo"><label>Observações</label><textarea name="observacoes">${Utilidades.escaparHtml(p.observacoes || '')}</textarea></div>
        <div class="campo">
          <label>Etiquetas</label>
          <div id="area-etiquetas" class="flex gap-8" style="flex-wrap:wrap;">
            ${etiquetas.map((e) => `
              <label class="etiqueta-cor" style="background:${e.cor}22; color:${e.cor}; cursor:pointer;">
                <input type="checkbox" value="${e.id}" ${etiquetasSelecionadas.has(e.id) ? 'checked' : ''} style="margin:0;"> ${Utilidades.escaparHtml(e.nome)}
              </label>`).join('') || '<span class="texto-fraco texto-pequeno">Nenhuma etiqueta cadastrada.</span>'}
          </div>
          <div class="flex gap-8" style="margin-top:8px;">
            <input type="text" id="nova-etiqueta-nome" placeholder="Nova etiqueta" style="max-width:160px; padding:6px 9px; border:1px solid var(--cor-borda); border-radius:6px; background:var(--cor-superficie);">
            <input type="color" id="nova-etiqueta-cor" value="#2b3a55">
            <button type="button" class="botao botao-pequeno" id="botao-add-etiqueta">Adicionar</button>
          </div>
        </div>
        <div id="erro-processo" class="campo-erro oculto"></div>
      </form>`,
    rodapeHtml: `
      ${p.id ? '<button class="botao botao-perigo" id="botao-excluir-processo" style="margin-right:auto;">Excluir</button>' : ''}
      <button class="botao" data-fechar-modal type="button">Cancelar</button>
      <button class="botao botao-primario" id="botao-salvar-processo">Salvar</button>`,
    aoMontar: (modal) => {
      modal.querySelector('#botao-add-etiqueta').addEventListener('click', async () => {
        const nome = modal.querySelector('#nova-etiqueta-nome').value.trim();
        const cor = modal.querySelector('#nova-etiqueta-cor').value;
        if (!nome) return;
        const { etiqueta } = await api.post('/api/etiquetas', { nome, cor });
        const area = modal.querySelector('#area-etiquetas');
        const vazio = area.querySelector('span');
        if (vazio) vazio.remove();
        const label = document.createElement('label');
        label.className = 'etiqueta-cor';
        label.style.cssText = `background:${cor}22; color:${cor}; cursor:pointer;`;
        label.innerHTML = `<input type="checkbox" value="${etiqueta.id}" checked style="margin:0;"> ${Utilidades.escaparHtml(nome)}`;
        area.appendChild(label);
        modal.querySelector('#nova-etiqueta-nome').value = '';
      });

      modal.querySelector('#botao-salvar-processo').addEventListener('click', async () => {
        const form = modal.querySelector('#form-processo');
        const dados = Object.fromEntries(new FormData(form).entries());
        if (!dados.cliente_id) {
          const el = modal.querySelector('#erro-processo');
          el.textContent = 'Selecione o cliente.'; el.classList.remove('oculto');
          return;
        }
        dados.etiquetas = Array.from(modal.querySelectorAll('#area-etiquetas input:checked')).map((i) => parseInt(i.value, 10));
        try {
          if (p.id) await api.put('/api/processos/' + p.id, dados);
          else await api.post('/api/processos', dados);
          Modal.fechar();
          aoSalvar();
        } catch (erro) {
          const el = modal.querySelector('#erro-processo');
          el.textContent = erro.message; el.classList.remove('oculto');
        }
      });

      const botaoExcluir = modal.querySelector('#botao-excluir-processo');
      if (botaoExcluir) botaoExcluir.addEventListener('click', async () => {
        if (!confirm('Excluir este processo? Documentos, prazos e anotações vinculados perderão a referência.')) return;
        await api.del('/api/processos/' + p.id);
        Modal.fechar();
        Roteador.irPara('processos');
      });
    }
  });
}
