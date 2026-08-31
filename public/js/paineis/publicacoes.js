// Tela: Publicações (fila de revisão de intimações importadas, ex.: API da AASP)
let _abaPublicacoes = 'nao-lidas';
let _filtroTribunalPublicacoes = '';
let _ordenacaoPublicacoes = 'recentes'; // 'recentes' | 'antigas'

Roteador.registrar('publicacoes', async (container) => {
  await renderizarPublicacoes(container);
});

async function renderizarPublicacoes(container) {
  const filtro = _abaPublicacoes === 'nao-lidas' ? '?lida=0' : '';
  const { publicacoes } = await api.get('/api/publicacoes' + filtro);

  const tribunais = [...new Set(publicacoes.map((p) => p.jornal).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (_filtroTribunalPublicacoes && !tribunais.includes(_filtroTribunalPublicacoes)) _filtroTribunalPublicacoes = '';

  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div>
        <h1>Publicações</h1>
        <div class="subtitulo">Intimações importadas automaticamente — confira e crie o prazo quando for o caso</div>
      </div>
      <div class="flex gap-8">
        ${Estado.usuario.perfil === 'admin' ? `<button class="botao" id="botao-config-aasp">${Icone('ajustes', 15)} Configurações</button>` : ''}
        <button class="botao botao-primario" id="botao-sincronizar">${Icone('atualizar', 15)} Buscar agora</button>
      </div>
    </div>

    <div class="abas">
      <button data-aba="nao-lidas" class="${_abaPublicacoes === 'nao-lidas' ? 'ativa' : ''}">Não lidas</button>
      <button data-aba="todas" class="${_abaPublicacoes === 'todas' ? 'ativa' : ''}">Todas</button>
    </div>

    <div class="flex gap-8" style="margin-bottom:14px; flex-wrap:wrap;">
      <select id="filtro-tribunal-publicacoes" style="padding:8px 11px; border:1px solid var(--cor-borda); border-radius:6px; background:var(--cor-superficie); color:var(--cor-texto);">
        <option value="">Todos os tribunais/jornais</option>
        ${tribunais.map((t) => `<option value="${Utilidades.escaparHtml(t)}" ${t === _filtroTribunalPublicacoes ? 'selected' : ''}>${Utilidades.escaparHtml(t)}</option>`).join('')}
      </select>
      <select id="ordenar-publicacoes" style="padding:8px 11px; border:1px solid var(--cor-borda); border-radius:6px; background:var(--cor-superficie); color:var(--cor-texto);">
        <option value="recentes" ${_ordenacaoPublicacoes === 'recentes' ? 'selected' : ''}>Data: mais recentes primeiro</option>
        <option value="antigas" ${_ordenacaoPublicacoes === 'antigas' ? 'selected' : ''}>Data: mais antigas primeiro</option>
      </select>
    </div>

    <div id="lista-publicacoes"></div>
  `;

  container.querySelectorAll('[data-aba]').forEach((botao) => {
    botao.addEventListener('click', () => { _abaPublicacoes = botao.dataset.aba; renderizarPublicacoes(container); });
  });

  const botaoConfig = container.querySelector('#botao-config-aasp');
  if (botaoConfig) botaoConfig.addEventListener('click', abrirModalConfiguracoes);

  container.querySelector('#botao-sincronizar').addEventListener('click', async (ev) => {
    const botao = ev.currentTarget;
    botao.disabled = true;
    botao.textContent = 'Buscando...';
    try {
      const resultado = await api.post('/api/publicacoes/sincronizar');
      const falhas = resultado.diasComFalha || [];
      if (falhas.length) {
        // Publicacao baixada da AASP nao volta numa consulta futura, entao uma
        // falha de gravacao precisa ser visivel na hora, nao so no log.
        alert(
          `${resultado.novas} publicação(ões) nova(s) importada(s), mas ${falhas.length} dia(s) falharam ao gravar: ` +
          `${falhas.map((f) => f.dia).join(', ')}.\n\n` +
          'Os dados foram salvos em disco e não se perderam. Avise o suporte para rodar a reimportação.'
        );
      } else {
        alert(resultado.novas > 0
          ? `${resultado.novas} publicação(ões) nova(s) encontrada(s).`
          : 'Nenhuma publicação nova no momento.');
      }
      renderizarPublicacoes(container);
    } catch (erro) {
      alert('Não foi possível buscar publicações: ' + erro.message);
    } finally {
      botao.disabled = false;
      botao.innerHTML = `${Icone('atualizar', 15)} Buscar agora`;
    }
  });

  container.querySelector('#filtro-tribunal-publicacoes').addEventListener('change', (ev) => {
    _filtroTribunalPublicacoes = ev.target.value;
    montarListaPublicacoes(container, publicacoes);
  });
  container.querySelector('#ordenar-publicacoes').addEventListener('change', (ev) => {
    _ordenacaoPublicacoes = ev.target.value;
    montarListaPublicacoes(container, publicacoes);
  });

  montarListaPublicacoes(container, publicacoes);
}

function montarListaPublicacoes(container, publicacoesTodas) {
  let publicacoes = _filtroTribunalPublicacoes
    ? publicacoesTodas.filter((p) => p.jornal === _filtroTribunalPublicacoes)
    : publicacoesTodas;

  publicacoes = [...publicacoes].sort((a, b) => {
    const da = a.data_disponibilizacao || '';
    const db = b.data_disponibilizacao || '';
    return _ordenacaoPublicacoes === 'recentes' ? db.localeCompare(da) : da.localeCompare(db);
  });

  const lista = container.querySelector('#lista-publicacoes');
  if (!publicacoes.length) {
    const mensagem = _filtroTribunalPublicacoes
      ? 'Nenhuma publicação desse tribunal/jornal encontrada.'
      : (_abaPublicacoes === 'nao-lidas' ? 'Nenhuma publicação pendente de revisão.' : 'Nenhuma publicação importada ainda.');
    lista.innerHTML = `<div class="estado-vazio"><div class="icone-grande">${Icone('caixaEntrada', 34)}</div>${mensagem}</div>`;
  } else {
    lista.innerHTML = publicacoes.map((p) => `
      <div class="cartao" style="margin-bottom:10px; ${p.lida ? 'opacity:.65;' : ''}">
        <div class="cartao-corpo">
          <div class="flex-entre" style="align-items:flex-start;">
            <div>
              <strong>${Utilidades.escaparHtml(p.titulo)}</strong>
              <div class="texto-suave texto-pequeno">
                ${p.jornal ? Utilidades.escaparHtml(p.jornal) + ' · ' : ''}${Utilidades.formatarData(p.data_disponibilizacao)}
                ${p.numero_processo ? ' · ' + Utilidades.escaparHtml(p.numero_processo) : ''}
              </div>
              <div style="margin-top:6px;">
                ${p.processo_id
                  ? `<span class="selo selo-sucesso">Vinculado a ${Utilidades.escaparHtml(p.cliente_nome || p.processo_numero_cnj || 'processo')}</span>`
                  : '<span class="selo selo-neutro">Sem processo vinculado</span>'}
                ${p.lida ? '<span class="selo selo-neutro">Lida</span>' : ''}
              </div>
            </div>
            <div class="flex gap-8">
              ${!p.processo_id ? `<button class="botao botao-pequeno" data-cadastrar-processo="${p.id}">${Icone('clipe', 14)} Cadastrar processo</button>` : ''}
              <button class="botao botao-pequeno botao-primario" data-criar-prazo="${p.id}">+ Criar prazo</button>
              <button class="botao botao-pequeno" data-alternar-lida="${p.id}">${p.lida ? 'Marcar não lida' : 'Marcar lida'}</button>
              <button class="botao botao-icone" data-excluir="${p.id}" title="Remover">✕</button>
            </div>
          </div>
          ${p.resumo
            ? `<div style="margin-top:10px; padding:10px 12px; background:var(--cor-destaque-suave); border-radius:6px;">
                 <div class="texto-pequeno flex gap-8" style="color:var(--cor-texto); white-space:pre-wrap; align-items:flex-start;">${Icone('brilho', 15)} <span>${Utilidades.formatarTextoIA(p.resumo)}</span></div>
                 <button class="botao botao-texto botao-pequeno" style="margin-top:4px; padding-left:0;" data-resumir="${p.id}">${Icone('atualizar', 13)} Gerar novamente</button>
               </div>`
            : `<button class="botao botao-texto botao-pequeno" style="margin-top:8px; padding-left:0;" data-resumir="${p.id}">${Icone('brilho', 14)} Resumir com IA</button>`}
          <details style="margin-top:10px;">
            <summary style="cursor:pointer; color:var(--cor-destaque); font-size:13px;">Ver texto da publicação</summary>
            <pre style="white-space:pre-wrap; font-family:inherit; font-size:13px; margin-top:8px; padding:12px; background:var(--cor-superficie-alt); border-radius:6px; max-height:300px; overflow-y:auto;">${Utilidades.escaparHtml(p.texto)}</pre>
          </details>
        </div>
      </div>`).join('');

    lista.querySelectorAll('[data-criar-prazo]').forEach((botao) => {
      botao.addEventListener('click', () => {
        const p = publicacoes.find((x) => x.id == botao.dataset.criarPrazo);
        abrirModalPrazo(null, { titulo: p.titulo, descricao: p.texto.slice(0, 500), processo_id: p.processo_id }, async () => {
          await api.patch('/api/publicacoes/' + p.id + '/lida');
          if (typeof atualizarBadgePublicacoes === 'function') atualizarBadgePublicacoes();
          renderizarPublicacoes(container);
        });
      });
    });
    lista.querySelectorAll('[data-cadastrar-processo]').forEach((botao) => {
      botao.addEventListener('click', () => {
        const p = publicacoes.find((x) => x.id == botao.dataset.cadastrarProcesso);
        abrirModalCriarProcesso(p, () => renderizarPublicacoes(container));
      });
    });
    lista.querySelectorAll('[data-alternar-lida]').forEach((botao) => {
      botao.addEventListener('click', async () => {
        await api.patch('/api/publicacoes/' + botao.dataset.alternarLida + '/lida');
        if (typeof atualizarBadgePublicacoes === 'function') atualizarBadgePublicacoes();
        renderizarPublicacoes(container);
      });
    });
    lista.querySelectorAll('[data-resumir]').forEach((botao) => {
      const rotuloOriginal = botao.innerHTML;
      botao.addEventListener('click', async () => {
        botao.disabled = true;
        botao.textContent = 'Resumindo...';
        try {
          await api.post('/api/publicacoes/' + botao.dataset.resumir + '/resumir');
          renderizarPublicacoes(container);
        } catch (erro) {
          alert('Não foi possível gerar o resumo: ' + erro.message);
          botao.disabled = false;
          botao.innerHTML = rotuloOriginal;
        }
      });
    });
    lista.querySelectorAll('[data-excluir]').forEach((botao) => {
      botao.addEventListener('click', async () => {
        if (!confirm('Remover esta publicação da lista?')) return;
        await api.del('/api/publicacoes/' + botao.dataset.excluir);
        if (typeof atualizarBadgePublicacoes === 'function') atualizarBadgePublicacoes();
        renderizarPublicacoes(container);
      });
    });
  }
}

// =======================================================================
// Modal: configurações de integração (somente administrador)
// - API de Intimações (AASP): busca as publicações
// - DataJud/CNJ: andamento processual
// - Resumo com IA (Groq, gratuito): resume o texto de cada publicação
// =======================================================================
async function abrirModalConfiguracoes() {
  const [aasp, groq, datajud] = await Promise.all([
    api.get('/api/configuracoes/aasp'),
    api.get('/api/configuracoes/groq'),
    api.get('/api/configuracoes/datajud')
  ]);

  Modal.abrir({
    titulo: 'Configurações de integrações',
    largo: true,
    corpoHtml: `
      <h2 style="font-size:15px;">API de Intimações (AASP)</h2>
      <p class="texto-suave texto-pequeno">Busca as publicações automaticamente. Disponível em intimacaoapi.aasp.org.br, na área de Intimações do seu cadastro AASP.</p>
      <form id="form-config-aasp">
        <div class="campo">
          <label>Chave da API</label>
          <input type="text" name="chave" placeholder="${aasp.configurada ? aasp.chaveMascarada : 'Cole aqui a chave da AASP'}">
          <div class="campo-ajuda">${aasp.configurada ? 'Uma chave já está configurada. Deixe em branco para mantê-la, ou cole uma nova para substituir.' : ''}</div>
        </div>
        <div id="resultado-teste-aasp" class="oculto" style="margin-bottom:10px;"></div>
        <div id="erro-config-aasp" class="campo-erro oculto"></div>
        <div class="flex gap-8" style="margin-bottom:8px;">
          ${aasp.configurada ? '<button class="botao botao-perigo botao-pequeno" id="botao-remover-aasp" type="button" style="margin-right:auto;">Remover</button>' : ''}
          <button class="botao botao-pequeno" id="botao-testar-aasp" type="button">Testar conexão</button>
          <button class="botao botao-primario botao-pequeno" id="botao-salvar-aasp" type="button">Salvar</button>
        </div>
      </form>

      <hr style="border:none; border-top:1px solid var(--cor-borda); margin:18px 0;">

      <h2 style="font-size:15px;">Andamento processual (DataJud / CNJ)</h2>
      <p class="texto-suave texto-pequeno">Consulta movimentações dos processos cadastrados. A chave pública está na wiki do DataJud (CNJ). Não mistura com as intimações da AASP.</p>
      <form id="form-config-datajud">
        <div class="campo">
          <label>Chave da API</label>
          <input type="text" name="chave" placeholder="${datajud.configurada ? datajud.chaveMascarada : 'Cole aqui a chave pública do DataJud'}">
          <div class="campo-ajuda">${datajud.configurada ? 'Uma chave já está configurada. Deixe em branco para mantê-la, ou cole uma nova para substituir.' : 'Authorization: APIKey … — copie a chave pública da documentação do CNJ.'}</div>
        </div>
        <div id="resultado-teste-datajud" class="oculto" style="margin-bottom:10px;"></div>
        <div id="erro-config-datajud" class="campo-erro oculto"></div>
        <div class="flex gap-8" style="margin-bottom:8px;">
          ${datajud.configurada ? '<button class="botao botao-perigo botao-pequeno" id="botao-remover-datajud" type="button" style="margin-right:auto;">Remover</button>' : ''}
          <button class="botao botao-pequeno" id="botao-testar-datajud" type="button">Testar conexão</button>
          <button class="botao botao-primario botao-pequeno" id="botao-salvar-datajud" type="button">Salvar</button>
        </div>
      </form>

      <hr style="border:none; border-top:1px solid var(--cor-borda); margin:18px 0;">

      <h2 style="font-size:15px;">Resumo automático com IA (Groq — gratuito)</h2>
      <p class="texto-suave texto-pequeno">Ao buscar publicações novas, gera automaticamente um resumo curto de cada uma. Chave gratuita (sem cartão) em console.groq.com/keys. O texto da publicação é enviado para a Groq processar.</p>
      <form id="form-config-groq">
        <div class="campo">
          <label>Chave da API</label>
          <input type="text" name="chave" placeholder="${groq.configurada ? groq.chaveMascarada : 'Cole aqui a chave da Groq'}">
          <div class="campo-ajuda">${groq.configurada ? 'Uma chave já está configurada. Deixe em branco para mantê-la, ou cole uma nova para substituir.' : ''}</div>
        </div>
        <div id="resultado-teste-groq" class="oculto" style="margin-bottom:10px;"></div>
        <div id="erro-config-groq" class="campo-erro oculto"></div>
        <div class="flex gap-8">
          ${groq.configurada ? '<button class="botao botao-perigo botao-pequeno" id="botao-remover-groq" type="button" style="margin-right:auto;">Remover</button>' : ''}
          <button class="botao botao-pequeno" id="botao-testar-groq" type="button">Testar conexão</button>
          <button class="botao botao-primario botao-pequeno" id="botao-salvar-groq" type="button">Salvar</button>
        </div>
      </form>`,
    rodapeHtml: `<button class="botao" data-fechar-modal type="button">Fechar</button>`,
    aoMontar: (modal) => {
      // --- AASP ---
      modal.querySelector('#botao-testar-aasp').addEventListener('click', async () => {
        const chave = modal.querySelector('#form-config-aasp [name="chave"]').value.trim();
        const resultadoEl = modal.querySelector('#resultado-teste-aasp');
        if (!chave) { resultadoEl.textContent = 'Cole a chave para testar.'; resultadoEl.className = 'campo-erro'; return; }
        try {
          await Modal.durante('Testando...', async () => {
            const r = await api.post('/api/configuracoes/aasp/testar', { chave });
            resultadoEl.textContent = `✓ Conexão OK — ${r.pendentes} dia(s) com publicações pendentes nos últimos 30 dias.`;
            resultadoEl.className = 'selo selo-sucesso';
          }, { botao: modal.querySelector('#botao-testar-aasp') });
        } catch (erro) {
          resultadoEl.textContent = '✕ ' + erro.message;
          resultadoEl.className = 'campo-erro';
        }
      });
      modal.querySelector('#botao-salvar-aasp').addEventListener('click', async () => {
        const chave = modal.querySelector('#form-config-aasp [name="chave"]').value.trim();
        const el = modal.querySelector('#erro-config-aasp');
        if (!chave) { el.textContent = 'Cole a chave da API.'; el.classList.remove('oculto'); return; }
        try {
          await Modal.durante('Salvando...', async () => {
            await api.put('/api/configuracoes/aasp', { chave });
            Modal.fechar();
          }, { botao: modal.querySelector('#botao-salvar-aasp') });
        } catch (erro) {
          el.textContent = erro.message; el.classList.remove('oculto');
        }
      });
      const botaoRemoverAasp = modal.querySelector('#botao-remover-aasp');
      if (botaoRemoverAasp) botaoRemoverAasp.addEventListener('click', async () => {
        if (!confirm('Remover a integração? A busca automática de publicações será desativada.')) return;
        await Modal.durante('Removendo...', async () => {
          await api.del('/api/configuracoes/aasp');
          Modal.fechar();
        }, { botao: botaoRemoverAasp });
      });

      modal.querySelector('#botao-testar-datajud').addEventListener('click', async () => {
        const chave = modal.querySelector('#form-config-datajud [name="chave"]').value.trim();
        const resultadoEl = modal.querySelector('#resultado-teste-datajud');
        if (!chave) { resultadoEl.textContent = 'Cole a chave para testar.'; resultadoEl.className = 'campo-erro'; return; }
        try {
          await Modal.durante('Testando...', async () => {
            await api.post('/api/configuracoes/datajud/testar', { chave });
            resultadoEl.textContent = '✓ Conexão OK com o DataJud.';
            resultadoEl.className = 'selo selo-sucesso';
          }, { botao: modal.querySelector('#botao-testar-datajud') });
        } catch (erro) {
          resultadoEl.textContent = '✕ ' + erro.message;
          resultadoEl.className = 'campo-erro';
        }
      });
      modal.querySelector('#botao-salvar-datajud').addEventListener('click', async () => {
        const chave = modal.querySelector('#form-config-datajud [name="chave"]').value.trim();
        const el = modal.querySelector('#erro-config-datajud');
        if (!chave) { el.textContent = 'Cole a chave da API.'; el.classList.remove('oculto'); return; }
        try {
          await Modal.durante('Salvando...', async () => {
            await api.put('/api/configuracoes/datajud', { chave });
            Modal.fechar();
          }, { botao: modal.querySelector('#botao-salvar-datajud') });
        } catch (erro) {
          el.textContent = erro.message; el.classList.remove('oculto');
        }
      });
      const botaoRemoverDatajud = modal.querySelector('#botao-remover-datajud');
      if (botaoRemoverDatajud) botaoRemoverDatajud.addEventListener('click', async () => {
        if (!confirm('Remover a integração? O acompanhamento automático de movimentações será desativado.')) return;
        await Modal.durante('Removendo...', async () => {
          await api.del('/api/configuracoes/datajud');
          Modal.fechar();
        }, { botao: botaoRemoverDatajud });
      });

      // --- Groq (resumo com IA) ---
      modal.querySelector('#botao-testar-groq').addEventListener('click', async () => {
        const chave = modal.querySelector('#form-config-groq [name="chave"]').value.trim();
        const resultadoEl = modal.querySelector('#resultado-teste-groq');
        if (!chave) { resultadoEl.textContent = 'Cole a chave para testar.'; resultadoEl.className = 'campo-erro'; return; }
        try {
          await Modal.durante('Testando...', async () => {
            await api.post('/api/configuracoes/groq/testar', { chave });
            resultadoEl.textContent = '✓ Conexão OK.';
            resultadoEl.className = 'selo selo-sucesso';
          }, { botao: modal.querySelector('#botao-testar-groq') });
        } catch (erro) {
          resultadoEl.textContent = '✕ ' + erro.message;
          resultadoEl.className = 'campo-erro';
        }
      });
      modal.querySelector('#botao-salvar-groq').addEventListener('click', async () => {
        const chave = modal.querySelector('#form-config-groq [name="chave"]').value.trim();
        const el = modal.querySelector('#erro-config-groq');
        if (!chave) { el.textContent = 'Cole a chave da API.'; el.classList.remove('oculto'); return; }
        try {
          await Modal.durante('Salvando...', async () => {
            await api.put('/api/configuracoes/groq', { chave });
            Modal.fechar();
          }, { botao: modal.querySelector('#botao-salvar-groq') });
        } catch (erro) {
          el.textContent = erro.message; el.classList.remove('oculto');
        }
      });
      const botaoRemoverGroq = modal.querySelector('#botao-remover-groq');
      if (botaoRemoverGroq) botaoRemoverGroq.addEventListener('click', async () => {
        if (!confirm('Remover a integração? O resumo automático com IA será desativado.')) return;
        await Modal.durante('Removendo...', async () => {
          await api.del('/api/configuracoes/groq');
          Modal.fechar();
        }, { botao: botaoRemoverGroq });
      });
    }
  });
}

// =======================================================================
// Modal: cadastrar processo + cliente a partir de uma publicação
// A extração de nome de parte é só uma sugestão (regex simples sobre o
// texto da intimação) - sempre editável, nunca cadastrada sem confirmação.
// A verificação de duplicidade (numero CNJ e nome do cliente) é feita no
// servidor: se já existir, reaproveita em vez de cadastrar de novo.
// =======================================================================
function extrairNomeParte(texto) {
  let m = (texto || '').match(/Parte\(s\):\s*([^\r\n]+)/i);
  if (m) return m[1].trim();
  m = (texto || '').match(/AUTOR:\s*([^\r\n]+?)ADVOGADO/i);
  if (m) return m[1].trim();
  m = (texto || '').match(/Autor\s*:\s*([^;]+);/i);
  if (m) return m[1].trim();
  m = (texto || '').match(/EXEQUENTE:\s*([^\nA-Z]+?)(?:ADVOGADO|$)/i);
  if (m) return m[1].trim();
  return '';
}

function abrirModalCriarProcesso(publicacao, aoConcluir) {
  const nomeSugerido = extrairNomeParte(publicacao.texto);

  Modal.abrir({
    titulo: 'Cadastrar processo a partir da publicação',
    corpoHtml: `
      <p class="texto-suave texto-pequeno">Os dados abaixo foram pré-preenchidos a partir da intimação — confira e ajuste antes de cadastrar. Se já existir um processo com este número ou um cliente com este nome, o sistema reaproveita em vez de duplicar.</p>
      <form id="form-criar-processo">
        <div class="campo">
          <label>Nome do cliente *</label>
          <input type="text" name="cliente_nome" value="${Utilidades.escaparHtml(nomeSugerido)}" placeholder="Nome completo da parte">
          ${!nomeSugerido ? '<div class="campo-ajuda">Não foi possível identificar o nome automaticamente no texto — preencha manualmente.</div>' : '<div class="campo-ajuda">Sugestão extraída do texto da publicação — confira antes de salvar.</div>'}
        </div>
        <div class="campo">
          <label>CPF ou CNPJ do cliente</label>
          <input type="text" name="cliente_documento" placeholder="Opcional">
        </div>
        <div class="campo">
          <label>Número do processo (CNJ)</label>
          <input type="text" name="numero_cnj" value="${Utilidades.escaparHtml(publicacao.numero_processo || '')}">
        </div>
        <div class="campo">
          <label>Vara/Comarca</label>
          <input type="text" name="vara_comarca" placeholder="Opcional">
        </div>
        <div class="campo">
          <label>Área do direito</label>
          <input type="text" name="area_direito" placeholder="Opcional">
        </div>
        <div id="erro-criar-processo" class="campo-erro oculto"></div>
      </form>`,
    rodapeHtml: `
      <button class="botao" data-fechar-modal type="button">Cancelar</button>
      <button class="botao botao-primario" id="botao-confirmar-criar-processo" type="button">Cadastrar</button>`,
    aoMontar: (modal) => {
      modal.querySelector('#botao-confirmar-criar-processo').addEventListener('click', async () => {
        const form = modal.querySelector('#form-criar-processo');
        const dados = Object.fromEntries(new FormData(form).entries());
        const el = modal.querySelector('#erro-criar-processo');
        if (!dados.cliente_nome || !dados.cliente_nome.trim()) {
          el.textContent = 'Informe o nome do cliente.'; el.classList.remove('oculto'); return;
        }
        try {
          await Modal.durante('Cadastrando...', async () => {
            const resultado = await api.post('/api/publicacoes/' + publicacao.id + '/criar-processo', dados);
            Modal.fechar();
            if (resultado.vinculado) {
              alert('Já existia um processo com este número — a publicação foi vinculada a ele.');
            } else if (resultado.clienteReaproveitado) {
              alert('Processo cadastrado, reaproveitando o cliente já existente.');
            } else {
              alert('Processo e cliente cadastrados com sucesso.');
            }
            if (typeof aoConcluir === 'function') aoConcluir();
          });
        } catch (erro) {
          el.textContent = erro.message; el.classList.remove('oculto');
        }
      });
    }
  });
}
