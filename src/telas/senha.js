// Tela de trocar senha: obrigatória no primeiro acesso (senha expirada) ou voluntária.
import { api } from '../api.js';
import { esc } from '../util.js';

export function telaTrocarSenha(raiz, { obrigatoria, aoConcluir, aoCancelar, aoSair }) {
  raiz.innerHTML = `
    <div class="centro login">
      <form class="cartao" id="form-senha" autocomplete="off">
        <h2>${obrigatoria ? 'Defina uma nova senha' : 'Trocar senha'}</h2>
        ${obrigatoria ? '<p class="dica">Sua senha é provisória. Crie a sua para continuar.</p>' : ''}
        <label>Nova senha<input name="nova" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></label>
        <label>Repita a nova senha<input name="repete" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></label>
        <p class="dica">Mínimo de 8 caracteres.</p>
        <p class="erro" id="erro-senha" hidden></p>
        <button class="btn grande" type="submit">Salvar senha</button>
        <button class="btn sec" type="button" id="voltar">${obrigatoria ? 'Sair' : 'Cancelar'}</button>
      </form>
    </div>`;
  const form = raiz.querySelector('#form-senha');
  const erro = raiz.querySelector('#erro-senha');
  raiz.querySelector('#voltar').onclick = obrigatoria ? aoSair : aoCancelar;
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    erro.hidden = true;
    const botao = form.querySelector('button[type=submit]');
    if (form.nova.value !== form.repete.value) {
      erro.textContent = 'As duas senhas não são iguais.'; erro.hidden = false; return;
    }
    botao.disabled = true; botao.textContent = 'Salvando…';
    try {
      await api.trocarSenha(form.nova.value);
      aoConcluir();
    } catch (e) {
      erro.innerHTML = esc(e.message); erro.hidden = false;
      botao.disabled = false; botao.textContent = 'Salvar senha';
    }
  };
  form.nova.focus();
}
