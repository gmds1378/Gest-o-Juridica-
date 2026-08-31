// Tela: Agenda e Prazos (calendário mensal + calculadora de prazos processuais)
let _agendaData = new Date();

Roteador.registrar('agenda', async (container) => {
  await renderizarAgenda(container);
});

async function renderizarAgenda(container) {
  const ano = _agendaData.getFullYear();
  const mes = _agendaData.getMonth(); // 0-11
  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia = new Date(ano, mes + 1, 0);
  const inicioISO = fmtISO(primeiroDia);
  const fimISO = fmtISO(ultimoDia);

  const { prazos } = await api.get(`/api/prazos?inicio=${inicioISO}&fim=${fimISO}`);

  const nomesMes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div>
        <h1>Agenda e Prazos</h1>
        <div class="subtitulo">Calendário do escritório</div>
      </div>
      <button class="botao botao-primario" id="botao-novo-prazo">+ Novo prazo</button>
    </div>

    <div class="grade-2" style="grid-template-columns: 2.2fr 1fr; align-items:start;">
      <div class="cartao"><div class="cartao-corpo">
        <div class="calendario-cabecalho">
          <button class="botao botao-icone" id="mes-anterior">←</button>
          <h2 style="margin:0;">${nomesMes[mes]} de ${ano}</h2>
          <div class="flex gap-8">
            <button class="botao botao-pequeno" id="ir-hoje">Hoje</button>
            <button class="botao botao-icone" id="mes-proximo">→</button>
          </div>
        </div>
        <div class="calendario-grade" id="grade-calendario"></div>
      </div></div>

      <div>
        <div class="cartao" style="margin-bottom:14px;"><div class="cartao-corpo">
          <h2 style="font-size:15px;">Calculadora de prazos processuais</h2>
          <div class="campo"><label>Data de início</label><input type="date" id="calc-data-inicio" value="${fmtISO(new Date())}"></div>
          <div class="campo"><label>Quantidade de dias</label><input type="number" id="calc-quantidade" min="1" value="15"></div>
          <div class="campo">
            <label>Contagem</label>
            <select id="calc-tipo">
              <option value="uteis">Dias úteis</option>
              <option value="corridos">Dias corridos</option>
            </select>
          </div>
          <button class="botao botao-primario" id="calc-botao" style="width:100%; justify-content:center;">Calcular</button>
          <div id="calc-resultado" style="margin-top:12px;"></div>
          <button class="botao botao-texto botao-pequeno" id="botao-feriados" style="margin-top:6px; padding-left:0;">${Icone('ajustes', 14)} Configurar feriados</button>
        </div></div>

        <div class="cartao"><div class="cartao-corpo">
          <h2 style="font-size:15px;">Prazos do mês</h2>
          <div id="lista-prazos-mes"></div>
        </div></div>
      </div>
    </div>
  `;

  container.querySelector('#mes-anterior').addEventListener('click', () => { _agendaData = new Date(ano, mes - 1, 1); renderizarAgenda(container); });
  container.querySelector('#mes-proximo').addEventListener('click', () => { _agendaData = new Date(ano, mes + 1, 1); renderizarAgenda(container); });
  container.querySelector('#ir-hoje').addEventListener('click', () => { _agendaData = new Date(); renderizarAgenda(container); });
  container.querySelector('#botao-novo-prazo').addEventListener('click', () => abrirModalPrazo(null, {}, () => renderizarAgenda(container)));
  container.querySelector('#botao-feriados').addEventListener('click', () => abrirModalFeriados());

  container.querySelector('#calc-botao').addEventListener('click', async () => {
    const dataInicio = container.querySelector('#calc-data-inicio').value;
    const quantidade = parseInt(container.querySelector('#calc-quantidade').value, 10);
    const tipo = container.querySelector('#calc-tipo').value;
    if (!dataInicio || !quantidade) return;

    const { feriados } = await api.get('/api/feriados');
    const dataFinal = calcularDataFinalPrazo(dataInicio, quantidade, tipo, feriados.map((f) => f.data));

    container.querySelector('#calc-resultado').innerHTML = `
      <div class="selo selo-sucesso" style="font-size:14px; padding:8px 12px;">Vencimento: ${Utilidades.formatarData(dataFinal)}</div>
      <div class="texto-pequeno texto-fraco" style="margin-top:6px;">
        ${tipo === 'uteis' ? 'Contando apenas dias úteis (sem sábados, domingos e feriados cadastrados).' : 'Contando dias corridos; se cair em fim de semana ou feriado, prorroga-se para o próximo dia útil.'}
      </div>`;
  });

  montarGradeCalendario(container, ano, mes, prazos);

  const listaMes = container.querySelector('#lista-prazos-mes');
  listaMes.innerHTML = prazos.length ? prazos.map((p) => `
    <div class="flex-entre" style="padding:8px 0; border-bottom:1px solid var(--cor-borda);">
      <span style="${p.concluido ? 'text-decoration:line-through; color:var(--cor-texto-fraco);' : ''}">${Utilidades.escaparHtml(p.titulo)}</span>
      <span class="texto-pequeno texto-fraco">${Utilidades.formatarData(p.vencimento)}</span>
    </div>`).join('') : '<div class="texto-fraco texto-pequeno">Nenhum prazo neste mês.</div>';
}

function montarGradeCalendario(container, ano, mes, prazos) {
  const grade = container.querySelector('#grade-calendario');
  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  let html = diasSemana.map((d) => `<div class="calendario-dia-semana">${d}</div>`).join('');

  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const totalDiasMes = new Date(ano, mes + 1, 0).getDate();
  const hojeISO = fmtISO(new Date());

  const prazosPorDia = {};
  for (const p of prazos) {
    (prazosPorDia[p.vencimento] = prazosPorDia[p.vencimento] || []).push(p);
  }

  const totalCelulas = Math.ceil((primeiroDiaSemana + totalDiasMes) / 7) * 7;
  for (let i = 0; i < totalCelulas; i++) {
    const numeroDia = i - primeiroDiaSemana + 1;
    const dentroDoMes = numeroDia >= 1 && numeroDia <= totalDiasMes;
    const dataCelula = dentroDoMes ? new Date(ano, mes, numeroDia) : null;
    const iso = dataCelula ? fmtISO(dataCelula) : null;
    const eventosDia = iso ? (prazosPorDia[iso] || []) : [];

    html += `<div class="calendario-dia ${dentroDoMes ? '' : 'fora-do-mes'} ${iso === hojeISO ? 'hoje' : ''}" ${iso ? `data-dia="${iso}"` : ''}>
      <div class="numero">${dentroDoMes ? numeroDia : ''}</div>
      ${eventosDia.slice(0, 3).map((e) => {
        const dias = Utilidades.diasEntre(e.vencimento);
        return `<div class="calendario-evento ${dias < 2 && !e.concluido ? 'vencido' : ''}">${Utilidades.escaparHtml(e.titulo)}</div>`;
      }).join('')}
      ${eventosDia.length > 3 ? `<div class="texto-pequeno texto-fraco">+${eventosDia.length - 3}</div>` : ''}
    </div>`;
  }

  grade.innerHTML = html;
  grade.querySelectorAll('[data-dia]').forEach((celula) => {
    celula.addEventListener('click', () => {
      const iso = celula.dataset.dia;
      const eventosDia = prazosPorDia[iso] || [];
      abrirModalDiaAgenda(iso, eventosDia, () => renderizarAgenda(container));
    });
  });
}

function abrirModalDiaAgenda(iso, eventosDia, aoAtualizar) {
  Modal.abrir({
    titulo: Utilidades.formatarData(iso),
    corpoHtml: `
      <div id="lista-dia">
        ${eventosDia.length ? eventosDia.map((e) => `
          <div class="flex-entre" style="padding:9px 0; border-bottom:1px solid var(--cor-borda);">
            <label class="flex gap-8" style="cursor:pointer;">
              <input type="checkbox" data-concluir="${e.id}" ${e.concluido ? 'checked' : ''}>
              <span data-editar="${e.id}" style="${e.concluido ? 'text-decoration:line-through; color:var(--cor-texto-fraco);' : ''}">${Utilidades.escaparHtml(e.titulo)}</span>
            </label>
            ${Utilidades.seloPrioridade(e.prioridade)}
          </div>`).join('') : '<div class="estado-vazio">Nenhum prazo nesta data.</div>'}
      </div>`,
    rodapeHtml: `<button class="botao" data-fechar-modal type="button">Fechar</button>
      <button class="botao botao-primario" id="botao-add-dia">+ Novo prazo neste dia</button>`,
    aoMontar: (modal) => {
      modal.querySelector('#botao-add-dia').addEventListener('click', () => {
        Modal.fechar();
        abrirModalPrazo(null, { vencimento: iso }, aoAtualizar);
      });
      modal.querySelectorAll('[data-concluir]').forEach((chk) => {
        chk.addEventListener('change', async () => {
          await api.patch(`/api/prazos/${chk.dataset.concluir}/concluir`);
          Modal.fechar();
          aoAtualizar();
        });
      });
      modal.querySelectorAll('[data-editar]').forEach((el) => {
        el.addEventListener('click', async () => {
          const { prazo } = await api.get('/api/prazos/' + el.dataset.editar);
          Modal.fechar();
          abrirModalPrazo(prazo, {}, aoAtualizar);
        });
      });
    }
  });
}

// =======================================================================
// Modal: Novo/editar prazo (reutilizado pela Agenda e por Processos)
// =======================================================================
async function abrirModalPrazo(prazoExistente, contextoPadrao, aoSalvar) {
  const pr = prazoExistente || contextoPadrao || {};
  const [{ processos }, { clientes }] = await Promise.all([api.get('/api/processos'), api.get('/api/clientes')]);

  Modal.abrir({
    titulo: prazoExistente && prazoExistente.id ? 'Editar prazo' : 'Novo prazo',
    corpoHtml: `
      <form id="form-prazo">
        <div class="campo"><label>Título *</label><input type="text" name="titulo" required value="${Utilidades.escaparHtml(pr.titulo || '')}"></div>
        <div class="campo"><label>Descrição</label><textarea name="descricao">${Utilidades.escaparHtml(pr.descricao || '')}</textarea></div>
        <div class="campo-linha">
          <div class="campo"><label>Vencimento *</label><input type="date" name="vencimento" required value="${pr.vencimento || ''}"></div>
          <div class="campo"><label>Prioridade</label>
            <select name="prioridade">
              <option value="baixa" ${pr.prioridade === 'baixa' ? 'selected' : ''}>Baixa</option>
              <option value="media" ${!pr.prioridade || pr.prioridade === 'media' ? 'selected' : ''}>Média</option>
              <option value="alta" ${pr.prioridade === 'alta' ? 'selected' : ''}>Alta</option>
            </select>
          </div>
        </div>
        <div class="campo"><label>Responsável</label>
          <select name="responsavel_id">
            <option value="">Sem responsável definido</option>
            ${Estado.usuarios.map((u) => `<option value="${u.id}" ${(pr.responsavel_id || Estado.usuario.id) === u.id ? 'selected' : ''}>${Utilidades.escaparHtml(u.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="campo"><label>Processo vinculado</label>
          <select name="processo_id">
            <option value="">Nenhum</option>
            ${processos.map((p) => `<option value="${p.id}" ${pr.processo_id === p.id ? 'selected' : ''}>${Utilidades.escaparHtml(p.cliente_nome)} - ${Utilidades.escaparHtml(p.numero_cnj || 'sem número')}</option>`).join('')}
          </select>
        </div>
        ${prazoExistente && prazoExistente.id ? `
        <div class="campo"><label class="flex gap-8" style="font-weight:400;"><input type="checkbox" name="concluido" ${pr.concluido ? 'checked' : ''} style="width:auto;"> Concluído</label></div>` : ''}
        <div id="erro-prazo" class="campo-erro oculto"></div>
      </form>`,
    rodapeHtml: `
      ${prazoExistente && prazoExistente.id ? '<button class="botao botao-perigo" id="botao-excluir-prazo" style="margin-right:auto;">Excluir</button>' : ''}
      <button class="botao" data-fechar-modal type="button">Cancelar</button>
      <button class="botao botao-primario" id="botao-salvar-prazo">Salvar</button>`,
    aoMontar: (modal) => {
      modal.querySelector('#botao-salvar-prazo').addEventListener('click', async () => {
        const form = modal.querySelector('#form-prazo');
        const dados = Object.fromEntries(new FormData(form).entries());
        dados.concluido = form.querySelector('[name="concluido"]')?.checked || false;
        if (contextoPadrao && contextoPadrao.cliente_id) dados.cliente_id = contextoPadrao.cliente_id;
        if (!dados.titulo.trim() || !dados.vencimento) {
          const el = modal.querySelector('#erro-prazo');
          el.textContent = 'Preencha título e vencimento.'; el.classList.remove('oculto');
          return;
        }
        try {
          await Modal.durante('Salvando...', async () => {
            if (prazoExistente && prazoExistente.id) await api.put('/api/prazos/' + prazoExistente.id, dados);
            else await api.post('/api/prazos', dados);
            Modal.fechar();
            aoSalvar();
          });
        } catch (erro) {
          const el = modal.querySelector('#erro-prazo');
          el.textContent = erro.message; el.classList.remove('oculto');
        }
      });
      const botaoExcluir = modal.querySelector('#botao-excluir-prazo');
      if (botaoExcluir) botaoExcluir.addEventListener('click', async () => {
        if (!confirm('Excluir este prazo?')) return;
        await Modal.durante('Excluindo...', async () => {
          await api.del('/api/prazos/' + prazoExistente.id);
          Modal.fechar();
          aoSalvar();
        }, { botao: botaoExcluir });
      });
    }
  });
}

// =======================================================================
// Modal: gerenciar feriados (usados pela calculadora de dias úteis)
// =======================================================================
async function abrirModalFeriados() {
  const { feriados } = await api.get('/api/feriados');

  Modal.abrir({
    titulo: 'Feriados cadastrados',
    corpoHtml: `
      <div class="campo-linha" style="align-items:flex-end;">
        <div class="campo"><label>Data</label><input type="date" id="novo-feriado-data"></div>
        <div class="campo"><label>Descrição</label><input type="text" id="novo-feriado-desc" placeholder="Ex: Natal"></div>
        <div class="campo"><label>Abrangência</label>
          <select id="novo-feriado-abrangencia">
            <option value="nacional">Nacional</option>
            <option value="estadual">Estadual</option>
            <option value="municipal">Municipal</option>
          </select>
        </div>
      </div>
      <button class="botao botao-primario botao-pequeno" id="botao-add-feriado">+ Adicionar feriado</button>
      <hr style="border:none; border-top:1px solid var(--cor-borda); margin:14px 0;">
      <div id="lista-feriados"></div>`,
    rodapeHtml: `<button class="botao" data-fechar-modal type="button">Fechar</button>`,
    aoMontar: (modal) => {
      const renderLista = (lista) => {
        modal.querySelector('#lista-feriados').innerHTML = lista.length ? lista.map((f) => `
          <div class="flex-entre" style="padding:7px 0; border-bottom:1px solid var(--cor-borda);">
            <span>${Utilidades.formatarData(f.data)} — ${Utilidades.escaparHtml(f.descricao)} <span class="texto-fraco texto-pequeno">(${f.abrangencia})</span></span>
            <button class="botao botao-texto botao-pequeno" data-remover-feriado="${f.id}">Remover</button>
          </div>`).join('') : '<div class="texto-fraco texto-pequeno">Nenhum feriado cadastrado.</div>';

        modal.querySelectorAll('[data-remover-feriado]').forEach((b) => {
          b.addEventListener('click', async () => {
            await Modal.durante('Excluindo...', async () => {
              await api.del('/api/feriados/' + b.dataset.removerFeriado);
              const { feriados } = await api.get('/api/feriados');
              renderLista(feriados);
            }, { botao: b });
          });
        });
      };
      renderLista(feriados);

      modal.querySelector('#botao-add-feriado').addEventListener('click', async () => {
        const data = modal.querySelector('#novo-feriado-data').value;
        const descricao = modal.querySelector('#novo-feriado-desc').value.trim();
        const abrangencia = modal.querySelector('#novo-feriado-abrangencia').value;
        if (!data || !descricao) return;
        await Modal.durante('Salvando...', async () => {
          await api.post('/api/feriados', { data, descricao, abrangencia });
          modal.querySelector('#novo-feriado-desc').value = '';
          const { feriados } = await api.get('/api/feriados');
          renderLista(feriados);
        }, { botao: modal.querySelector('#botao-add-feriado') });
      });
    }
  });
}

// =======================================================================
// Utilidades locais da agenda
// =======================================================================
function fmtISO(data) {
  return data.getFullYear() + '-' + String(data.getMonth() + 1).padStart(2, '0') + '-' + String(data.getDate()).padStart(2, '0');
}

function calcularDataFinalPrazo(dataInicioISO, quantidadeDias, tipo, feriadosISO) {
  const feriados = new Set(feriadosISO);
  const ehFimDeSemana = (d) => d.getDay() === 0 || d.getDay() === 6;
  const ehFeriado = (d) => feriados.has(fmtISO(d));

  let data = new Date(dataInicioISO + 'T00:00:00');

  if (tipo === 'uteis') {
    let contados = 0;
    while (contados < quantidadeDias) {
      data.setDate(data.getDate() + 1);
      if (!ehFimDeSemana(data) && !ehFeriado(data)) contados++;
    }
  } else {
    data.setDate(data.getDate() + quantidadeDias);
    while (ehFimDeSemana(data) || ehFeriado(data)) {
      data.setDate(data.getDate() + 1);
    }
  }
  return fmtISO(data);
}
