// Tela: Auditoria (somente administrador).
// Registro de quem criou, alterou ou excluiu cada coisa. Só leitura - a trilha
// não é editável pela interface, senão não serviria como trilha.

Roteador.registrar('auditoria', async (container) => {
  await renderizarAuditoria(container);
});

const ROTULOS_ENTIDADE = {
  processos: 'Processos',
  clientes: 'Clientes',
  documentos: 'Documentos',
  modelos: 'Modelos',
  prazos: 'Prazos',
  anotacoes: 'Anotações',
  publicacoes: 'Publicações',
  usuarios: 'Usuários',
  configuracoes: 'Configurações',
  sessao: 'Acessos'
};

const SELOS_ACAO = {
  criou: 'selo-sucesso',
  alterou: 'selo-alerta',
  excluiu: 'selo-perigo',
  entrou: 'selo-neutro'
};

async function renderizarAuditoria(container) {
  const { entidades } = await api.get('/api/auditoria/entidades');

  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div>
        <h1>Auditoria</h1>
        <div class="subtitulo">Quem fez o quê, e quando</div>
      </div>
    </div>

    <div class="flex gap-8" style="margin-bottom:16px; flex-wrap:wrap; align-items:center;">
      <select id="filtro-entidade" style="padding:9px 11px; border:1px solid var(--cor-borda); border-radius:6px; background:var(--cor-superficie); color:inherit;">
        <option value="">Todos os tipos</option>
        ${entidades.map((e) => `<option value="${Utilidades.escaparHtml(e)}">${Utilidades.escaparHtml(ROTULOS_ENTIDADE[e] || e)}</option>`).join('')}
      </select>
      <select id="filtro-usuario" style="padding:9px 11px; border:1px solid var(--cor-borda); border-radius:6px; background:var(--cor-superficie); color:inherit;">
        <option value="">Todas as pessoas</option>
        ${Estado.usuarios.map((u) => `<option value="${u.id}">${Utilidades.escaparHtml(u.nome)}</option>`).join('')}
      </select>
      <span class="texto-fraco texto-pequeno" id="contagem-eventos"></span>
    </div>

    <div class="cartao" id="lista-auditoria"><div class="carregando">Carregando...</div></div>
  `;

  const lista = container.querySelector('#lista-auditoria');
  const contagem = container.querySelector('#contagem-eventos');

  async function carregar() {
    const parametros = new URLSearchParams();
    const entidade = container.querySelector('#filtro-entidade').value;
    const usuarioId = container.querySelector('#filtro-usuario').value;
    if (entidade) parametros.set('entidade', entidade);
    if (usuarioId) parametros.set('usuarioId', usuarioId);

    const { eventos } = await api.get('/api/auditoria?' + parametros);
    contagem.textContent = eventos.length ? `${eventos.length} registro(s), do mais recente para o mais antigo` : '';

    if (!eventos.length) {
      lista.innerHTML = `<div class="estado-vazio"><div class="icone-grande">${Icone('historico', 34)}</div>Nenhum registro para este filtro.</div>`;
      return;
    }

    lista.innerHTML = `
      <table class="tabela">
        <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>O quê</th></tr></thead>
        <tbody>
          ${eventos.map((e) => `
            <tr>
              <td style="white-space:nowrap;" class="texto-pequeno">${Utilidades.formatarDataHora(e.criado_em)}</td>
              <td>${Utilidades.escaparHtml(e.usuario_nome)}</td>
              <td><span class="selo ${SELOS_ACAO[e.acao] || 'selo-neutro'}">${Utilidades.escaparHtml(e.acao)}</span></td>
              <td>
                <span class="texto-fraco texto-pequeno">${Utilidades.escaparHtml(ROTULOS_ENTIDADE[e.entidade] || e.entidade)}</span><br>
                ${Utilidades.escaparHtml(e.descricao)}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  container.querySelector('#filtro-entidade').addEventListener('change', carregar);
  container.querySelector('#filtro-usuario').addEventListener('change', carregar);
  await carregar();
}
