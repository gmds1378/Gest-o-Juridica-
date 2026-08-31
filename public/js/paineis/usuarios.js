// Tela: Usuários (somente administrador).
// Contas nascem aqui, com senha provisória gerada pelo sistema. A senha aparece
// uma única vez, na hora - depois disso só existe o hash no banco.

Roteador.registrar('usuarios', async (container) => {
  await renderizarUsuarios(container);
});

const CORES_USUARIO = ['#334155', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#1d4ed8', '#4d7c0f', '#a21caf'];

async function renderizarUsuarios(container) {
  const { usuarios } = await api.get('/api/usuarios');

  container.innerHTML = `
    <div class="cabecalho-pagina">
      <div>
        <h1>Usuários</h1>
        <div class="subtitulo">Quem pode entrar no sistema — não existe autocadastro</div>
      </div>
      <button class="botao botao-primario" id="botao-novo-usuario">${Icone('mais', 15)} Novo usuário</button>
    </div>

    <div class="cartao">
      <table class="tabela">
        <thead>
          <tr>
            <th>Nome</th><th>Login</th><th>E-mail (Google)</th><th>Perfil</th><th>Situação</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${usuarios.map((u) => `
            <tr${u.ativo ? '' : ' style="opacity:.55;"'}>
              <td>
                <span class="avatar" style="background:${Utilidades.escaparHtml(u.cor)}; width:26px; height:26px; font-size:12px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; color:#fff; margin-right:8px; vertical-align:middle;">${Utilidades.escaparHtml(u.nome.charAt(0).toUpperCase())}</span>
                ${Utilidades.escaparHtml(u.nome)}
              </td>
              <td>${Utilidades.escaparHtml(u.login)}</td>
              <td>
                ${u.email ? Utilidades.escaparHtml(u.email) : '<span class="texto-fraco">—</span>'}
                ${u.google_vinculado ? '<span class="selo selo-sucesso" style="margin-left:6px;">vinculado</span>' : ''}
              </td>
              <td>${u.perfil === 'admin' ? '<span class="selo selo-alerta">Administrador</span>' : '<span class="selo selo-neutro">Usuário</span>'}</td>
              <td>
                ${u.ativo ? '<span class="selo selo-sucesso">Ativo</span>' : '<span class="selo selo-neutro">Inativo</span>'}
                ${u.senha_provisoria ? '<span class="selo selo-alerta" title="Ainda não definiu a senha própria">senha provisória</span>' : ''}
              </td>
              <td style="text-align:right; white-space:nowrap;">
                <button class="botao botao-pequeno" data-editar="${u.id}">${Icone('editar', 13)} Editar</button>
                <button class="botao botao-pequeno" data-resetar="${u.id}">${Icone('chave', 13)} Resetar senha</button>
                <button class="botao botao-pequeno${u.ativo ? ' botao-perigo' : ''}" data-alternar="${u.id}">${u.ativo ? 'Desativar' : 'Reativar'}</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="texto-suave texto-pequeno" style="margin-top:14px;">
      Contas nunca são excluídas, apenas desativadas — prazos, documentos e a trilha
      de auditoria precisam continuar mostrando quem fez cada coisa.
    </div>
  `;

  container.querySelector('#botao-novo-usuario')
    .addEventListener('click', () => abrirModalUsuario(null, () => renderizarUsuarios(container)));

  container.querySelectorAll('[data-editar]').forEach((botao) => {
    botao.addEventListener('click', () => {
      const usuario = usuarios.find((u) => u.id == botao.dataset.editar);
      abrirModalUsuario(usuario, () => renderizarUsuarios(container));
    });
  });

  container.querySelectorAll('[data-resetar]').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const usuario = usuarios.find((u) => u.id == botao.dataset.resetar);
      if (!confirm(`Gerar uma nova senha provisória para ${usuario.nome}? A senha atual deixa de funcionar imediatamente e as sessões abertas são encerradas.`)) return;
      try {
        const { senhaProvisoria } = await api.post(`/api/usuarios/${usuario.id}/resetar-senha`);
        mostrarSenhaGerada(usuario.nome, senhaProvisoria, () => renderizarUsuarios(container));
      } catch (erro) {
        alert('Não foi possível resetar a senha: ' + erro.message);
      }
    });
  });

  container.querySelectorAll('[data-alternar]').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const usuario = usuarios.find((u) => u.id == botao.dataset.alternar);
      const acao = usuario.ativo ? 'Desativar' : 'Reativar';
      if (!confirm(`${acao} o acesso de ${usuario.nome}?`)) return;
      try {
        await api.patch(`/api/usuarios/${usuario.id}/ativo`);
        renderizarUsuarios(container);
      } catch (erro) {
        alert('Não foi possível concluir: ' + erro.message);
      }
    });
  });
}

// A senha so existe neste instante - o banco guarda apenas o hash. Por isso a
// tela insiste para o administrador copiar antes de fechar.
function mostrarSenhaGerada(nome, senha, aoFechar) {
  Modal.abrir({
    titulo: 'Senha provisória gerada',
    corpoHtml: `
      <p>Entregue esta senha para <strong>${Utilidades.escaparHtml(nome)}</strong>. No primeiro
      acesso o sistema vai exigir que ela seja trocada.</p>
      <div class="senha-revelada" id="senha-gerada">${Utilidades.escaparHtml(senha)}</div>
      <div class="aviso-bloqueio">
        Esta senha não será exibida de novo. Se fechar sem copiar, será preciso gerar outra.
      </div>`,
    rodapeHtml: `
      <button class="botao" id="botao-copiar-senha" type="button">Copiar</button>
      <button class="botao botao-primario" data-fechar-modal type="button">Já anotei</button>`,
    aoMontar: (modal) => {
      modal.querySelector('#botao-copiar-senha').addEventListener('click', async (ev) => {
        try {
          await navigator.clipboard.writeText(senha);
          ev.currentTarget.textContent = 'Copiado!';
        } catch {
          // Sem permissao de area de transferencia: seleciona para copiar na mao.
          const el = modal.querySelector('#senha-gerada');
          const selecao = window.getSelection();
          selecao.removeAllRanges();
          const intervalo = document.createRange();
          intervalo.selectNodeContents(el);
          selecao.addRange(intervalo);
        }
      });
      const fechar = () => { if (typeof aoFechar === 'function') aoFechar(); };
      modal.querySelectorAll('[data-fechar-modal]').forEach((b) => b.addEventListener('click', fechar));
    }
  });
}

function abrirModalUsuario(usuario, aoConcluir) {
  const editando = !!usuario;

  Modal.abrir({
    titulo: editando ? 'Editar usuário' : 'Novo usuário',
    corpoHtml: `
      <form id="form-usuario">
        <div class="campo"><label>Nome completo *</label>
          <input type="text" name="nome" value="${editando ? Utilidades.escaparHtml(usuario.nome) : ''}" autofocus></div>
        <div class="campo"><label>Usuário de login *</label>
          <input type="text" name="login" value="${editando ? Utilidades.escaparHtml(usuario.login) : ''}">
          <div class="campo-ajuda">Sem espaços ou acentos. Ex.: roseni</div>
        </div>
        <div class="campo"><label>E-mail da conta Google</label>
          <input type="email" name="email" value="${editando && usuario.email ? Utilidades.escaparHtml(usuario.email) : ''}">
          <div class="campo-ajuda">Opcional. Preenchido, libera o "Entrar com Google" para este e-mail.${editando && usuario.google_vinculado ? ' Trocar o e-mail desfaz o vínculo com a conta Google atual.' : ''}</div>
        </div>
        <div class="campo-linha">
          <div class="campo"><label>Perfil</label>
            <select name="perfil">
              <option value="usuario"${editando && usuario.perfil === 'usuario' ? ' selected' : ''}>Usuário</option>
              <option value="admin"${editando && usuario.perfil === 'admin' ? ' selected' : ''}>Administrador</option>
            </select>
            <div class="campo-ajuda">Administradores gerenciam usuários, integrações e veem a auditoria.</div>
          </div>
          <div class="campo"><label>Cor de identificação</label>
            <div class="flex gap-8" style="align-items:center;">
              <select name="cor" id="campo-cor-usuario" style="flex:1;">
                ${CORES_USUARIO.map((c) => `<option value="${c}"${editando && usuario.cor === c ? ' selected' : ''}>${c}</option>`).join('')}
              </select>
              <span class="preview-cor" id="preview-cor-usuario" title="Prévia da cor"></span>
            </div>
          </div>
        </div>
        ${editando ? '' : '<div class="aviso-bloqueio">O sistema vai gerar uma senha provisória e exibi-la uma única vez ao salvar.</div>'}
        <div id="erro-usuario" class="campo-erro oculto"></div>
      </form>`,
    rodapeHtml: `
      <button class="botao" data-fechar-modal type="button">Cancelar</button>
      <button class="botao botao-primario" id="botao-salvar-usuario" type="button">${editando ? 'Salvar' : 'Criar usuário'}</button>`,
    aoMontar: (modal) => {
      const campoCor = modal.querySelector('#campo-cor-usuario');
      const previewCor = modal.querySelector('#preview-cor-usuario');
      const pintarPreview = () => { previewCor.style.background = campoCor.value; };
      pintarPreview();
      campoCor.addEventListener('change', pintarPreview);

      modal.querySelector('#botao-salvar-usuario').addEventListener('click', async () => {
        const form = modal.querySelector('#form-usuario');
        const el = modal.querySelector('#erro-usuario');
        const dados = Object.fromEntries(new FormData(form).entries());

        try {
          if (editando) {
            await api.put(`/api/usuarios/${usuario.id}`, dados);
            Modal.fechar();
            if (typeof aoConcluir === 'function') aoConcluir();
          } else {
            const { senhaProvisoria } = await api.post('/api/usuarios', dados);
            Modal.fechar();
            mostrarSenhaGerada(dados.nome, senhaProvisoria, aoConcluir);
          }
        } catch (erro) {
          el.textContent = erro.message;
          el.classList.remove('oculto');
        }
      });
    }
  });
}
