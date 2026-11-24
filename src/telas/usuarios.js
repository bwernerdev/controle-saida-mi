// Tela Usuários (só admin): criar login, trocar nome/papel, definir nova senha, excluir.
// No Supabase passa pela Edge Function "usuarios" (a chave secreta fica no servidor).
import { api } from '../api.js';
import { aviso, dataHora, esc } from '../util.js';

const OPCOES_PAPEL = [
  ['balança', 'Balança'],
  ['portaria', 'Portaria'],
  ['admin', 'Administrador'],
];

/** Senha aleatória legível (sem 0/O, 1/l/I) para o admin repassar. */
function gerarSenha() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const n = new Uint32Array(10);
  crypto.getRandomValues(n);
  return Array.from(n, (x) => letras[x % letras.length]).join('');
}

function opcoes(selecionado, comSemAcesso) {
  const lista = comSemAcesso ? [['', 'Sem acesso'], ...OPCOES_PAPEL] : OPCOES_PAPEL;
  return lista.map(([v, r]) => `<option value="${esc(v)}" ${v === (selecionado ?? '') ? 'selected' : ''}>${r}</option>`).join('');
}

export function telaUsuarios(corpo) {
  corpo.className = 'usuarios';
  corpo.innerHTML = `
    <section class="cartao cadastro">
      <h2>Novo usuário</h2>
      <form id="form-usuario" autocomplete="off">
        <label>Nome<input name="nome" required maxlength="80" placeholder="Nome da pessoa"></label>
        <label>E-mail<input name="email" type="email" required placeholder="pessoa@empresa.com.br" autocomplete="off"></label>
        <label>Papel<select name="papel">${opcoes('portaria', false)}</select></label>
        <label>Senha inicial
          <span class="campo-com-botao">
            <input name="senha" required minlength="8" maxlength="72" spellcheck="false" autocomplete="new-password">
            <button type="button" class="btn sec" id="gerar">Gerar</button>
          </span>
          <small>Mínimo de 8 caracteres. Anote e repasse para a pessoa.</small>
        </label>
        <p class="erro" id="erro-usuario" hidden></p>
        <button class="btn grande" type="submit">Criar usuário</button>
      </form>
    </section>

    <section class="painel">
      <div class="cartao lista">
        <div class="lista-topo">
          <h2 class="titulo-lista">Usuários <span class="contador cinza" id="n-usuarios">0</span></h2>
          <div class="ferramentas"><input type="search" id="busca" placeholder="Buscar nome ou e-mail" spellcheck="false"></div>
        </div>
        <div class="tabela-rolagem">
          <table>
            <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Último acesso</th><th></th></tr></thead>
            <tbody id="linhas"><tr><td colspan="5" class="vazio">Carregando…</td></tr></tbody>
          </table>
        </div>
      </div>
    </section>

    <dialog id="dlg-editar" class="cartao">
      <form method="dialog">
        <h3>Editar <span class="mono" id="ed-email"></span></h3>
        <label>Nome<input name="nome" required maxlength="80"></label>
        <label>Papel<select name="papel"></select></label>
        <p class="erro" id="erro-editar" hidden></p>
        <div class="acoes">
          <button class="btn sec" value="nao" formnovalidate>Voltar</button>
          <button class="btn" value="sim">Salvar</button>
        </div>
      </form>
    </dialog>

    <dialog id="dlg-senha" class="cartao">
      <form method="dialog">
        <h3>Nova senha para <span class="mono" id="se-email"></span></h3>
        <label>Senha
          <span class="campo-com-botao">
            <input name="senha" required minlength="8" maxlength="72" spellcheck="false" autocomplete="new-password">
            <button type="button" class="btn sec" id="gerar-2">Gerar</button>
          </span>
        </label>
        <p class="erro" id="erro-senha" hidden></p>
        <div class="acoes">
          <button class="btn sec" value="nao" formnovalidate>Voltar</button>
          <button class="btn" value="sim">Trocar senha</button>
        </div>
      </form>
    </dialog>

    <dialog id="dlg-excluir" class="cartao">
      <form method="dialog">
        <h3>Excluir <span class="mono" id="ex-email"></span>?</h3>
        <p>O login deixa de existir e não dá para desfazer. Para só bloquear o acesso,
          use <b>Editar</b> e escolha "Sem acesso".</p>
        <div class="acoes">
          <button class="btn sec" value="nao">Voltar</button>
          <button class="btn perigo" value="sim">Excluir</button>
        </div>
      </form>
    </dialog>`;

  const $ = (s) => corpo.querySelector(s);
  const form = $('#form-usuario');
  let usuarios = [];

  $('#gerar').onclick = () => { form.senha.value = gerarSenha(); };

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const erro = $('#erro-usuario');
    const botao = form.querySelector('[type=submit]');
    erro.hidden = true; botao.disabled = true; botao.textContent = 'Criando…';
    try {
      await api.usuarios.criar({
        nome: form.nome.value, email: form.email.value, papel: form.papel.value, senha: form.senha.value,
      });
      aviso(`Usuário ${form.email.value.trim()} criado.`);
      form.reset();
      form.papel.value = 'portaria';
      carregar();
    } catch (e) {
      erro.textContent = e.message; erro.hidden = false;
    } finally {
      botao.disabled = false; botao.textContent = 'Criar usuário';
    }
  };

  $('#busca').oninput = desenhar;

  async function carregar() {
    try {
      usuarios = await api.usuarios.listar();
      desenhar();
    } catch (e) {
      $('#linhas').innerHTML = `<tr><td colspan="5" class="vazio erro">${esc(e.message)}</td></tr>`;
    }
  }

  function desenhar() {
    const termo = $('#busca').value.trim().toLowerCase();
    const lista = termo
      ? usuarios.filter((u) => `${u.nome} ${u.email}`.toLowerCase().includes(termo))
      : usuarios;
    $('#n-usuarios').textContent = usuarios.length;
    if (!lista.length) {
      $('#linhas').innerHTML = '<tr><td colspan="5" class="vazio">Nenhum usuário encontrado.</td></tr>';
      return;
    }
    const rotulo = Object.fromEntries(OPCOES_PAPEL);
    $('#linhas').innerHTML = lista.map((u) => `<tr>
      <td>${esc(u.nome || '—')}${u.eu ? ' <small>(você)</small>' : ''}</td>
      <td class="mono">${esc(u.email)}</td>
      <td>${u.papel ? `<span class="papel">${rotulo[u.papel] || esc(u.papel)}</span>` : '<span class="status cancelado">Sem acesso</span>'}</td>
      <td>${u.ultimo_acesso ? dataHora(u.ultimo_acesso) : '<small>nunca</small>'}</td>
      <td class="acoes-linha">
        <button class="btn-link" data-editar="${esc(u.id)}">Editar</button>
        <button class="btn-link" data-senha="${esc(u.id)}">Nova senha</button>
        ${u.eu ? '' : `<button class="btn-link perigo" data-excluir="${esc(u.id)}">Excluir</button>`}
      </td>
    </tr>`).join('');
    const achar = (id) => usuarios.find((u) => u.id === id);
    corpo.querySelectorAll('[data-editar]').forEach((b) => { b.onclick = () => editar(achar(b.dataset.editar)); });
    corpo.querySelectorAll('[data-senha]').forEach((b) => { b.onclick = () => trocarSenha(achar(b.dataset.senha)); });
    corpo.querySelectorAll('[data-excluir]').forEach((b) => { b.onclick = () => excluir(achar(b.dataset.excluir)); });
  }

  // Diálogo que só fecha quando a ação dá certo (o erro aparece dentro dele).
  function dialogoComAcao(dlg, erroEl, acao) {
    const f = dlg.querySelector('form');
    erroEl.hidden = true;
    f.onsubmit = async (ev) => {
      if (ev.submitter?.value !== 'sim') return; // Voltar fecha normal
      ev.preventDefault();
      const botao = ev.submitter;
      botao.disabled = true; erroEl.hidden = true;
      try {
        await acao(f);
        dlg.close();
        carregar();
      } catch (e) {
        erroEl.textContent = e.message; erroEl.hidden = false;
      } finally {
        botao.disabled = false;
      }
    };
    dlg.showModal();
  }

  function editar(u) {
    const dlg = $('#dlg-editar');
    const f = dlg.querySelector('form');
    $('#ed-email').textContent = u.email;
    f.nome.value = u.nome || '';
    f.papel.innerHTML = opcoes(u.papel, !u.eu);
    dialogoComAcao(dlg, $('#erro-editar'), async () => {
      await api.usuarios.alterar({ id: u.id, nome: f.nome.value, papel: f.papel.value || null });
      aviso(`${u.email} atualizado.`);
    });
  }

  function trocarSenha(u) {
    const dlg = $('#dlg-senha');
    const f = dlg.querySelector('form');
    $('#se-email').textContent = u.email;
    f.senha.value = '';
    $('#gerar-2').onclick = () => { f.senha.value = gerarSenha(); };
    dialogoComAcao(dlg, $('#erro-senha'), async () => {
      await api.usuarios.senha({ id: u.id, senha: f.senha.value });
      aviso(`Senha de ${u.email} trocada.`);
    });
  }

  function excluir(u) {
    const dlg = $('#dlg-excluir');
    $('#ex-email').textContent = u.email;
    dlg.onclose = async () => {
      if (dlg.returnValue !== 'sim') return;
      try {
        await api.usuarios.excluir({ id: u.id });
        aviso(`${u.email} excluído.`);
        carregar();
      } catch (e) { aviso(e.message, 'erro'); }
    };
    dlg.showModal();
  }

  carregar();
  form.nome.focus();
  return () => {};
}
