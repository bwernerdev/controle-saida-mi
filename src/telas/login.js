// Tela de login (e-mail + senha do Supabase Auth).
import { api } from '../api.js';
import { esc } from '../util.js';

export function telaLogin(raiz, aoEntrar) {
  raiz.innerHTML = `
    <div class="centro login">
      <form class="cartao" id="form-login" autocomplete="on">
        <div class="login-marca"><img src="./icone.svg" alt="" width="48" height="48">
          <h1>Controle de Saída - MI</h1></div>
        ${api.demo ? `<p class="dica">Modo demonstração: use <b>escritorio@demo</b>, <b>portaria@demo</b>
          ou <b>admin@demo</b>, com qualquer senha.</p>` : ''}
        <label>E-mail<input name="email" type="email" required autocomplete="username" inputmode="email"></label>
        <label>Senha<input name="senha" type="password" ${api.demo ? '' : 'required'} autocomplete="current-password"></label>
        <p class="erro" id="erro-login" hidden></p>
        <button class="btn grande" type="submit">Entrar</button>
      </form>
    </div>`;
  const form = raiz.querySelector('#form-login');
  const erro = raiz.querySelector('#erro-login');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const botao = form.querySelector('button');
    botao.disabled = true; botao.textContent = 'Entrando…'; erro.hidden = true;
    try {
      await api.entrar(form.email.value, form.senha.value);
      aoEntrar();
    } catch (e) {
      erro.innerHTML = esc(e.message); erro.hidden = false;
      botao.disabled = false; botao.textContent = 'Entrar';
    }
  };
  form.email.focus();
}
