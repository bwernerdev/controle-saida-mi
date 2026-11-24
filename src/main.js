// Entrada do app: decide entre login, tela da balança e tela da portaria.
import './style.css';
import { api } from './api.js';
import { telaLogin } from './telas/login.js';
import { telaBalanca } from './telas/balanca.js';
import { telaPortaria } from './telas/portaria.js';
import { telaUsuarios } from './telas/usuarios.js';
import { ehApp, esc } from './util.js';

const raiz = document.getElementById('app');
let desmontar = null;

const NOME_PAPEL = { balança: 'Balança', portaria: 'Portaria', admin: 'Administrador' };

function limpar() {
  if (desmontar) { desmontar(); desmontar = null; }
  raiz.innerHTML = '';
}

/** Admin escolhe a visão; guarda a última escolha neste aparelho. */
function visaoInicial(papel) {
  if (papel !== 'admin') return papel;
  try {
    const salva = localStorage.getItem('csmi-visao');
    if (salva === 'balança' || salva === 'portaria' || salva === 'usuarios') return salva;
  } catch { /* sem storage */ }
  return ehApp() ? 'portaria' : 'balança';
}

async function iniciar() {
  limpar();
  raiz.innerHTML = '<div class="carregando">Carregando…</div>';
  let sessao = null;
  try { sessao = await api.sessao(); } catch { /* trata como deslogado */ }
  if (!sessao) {
    limpar();
    telaLogin(raiz, iniciar);
    return;
  }

  let perfil = null;
  try { perfil = await api.perfil(); } catch (e) {
    limpar();
    raiz.innerHTML = `<div class="centro"><div class="cartao msg">
      <h2>Não foi possível carregar seu perfil</h2><p>${esc(e.message)}</p>
      <button class="btn" id="tentar">Tentar de novo</button> <button class="btn sec" id="sair">Sair</button></div></div>`;
    raiz.querySelector('#tentar').onclick = iniciar;
    raiz.querySelector('#sair').onclick = async () => { await api.sair(); iniciar(); };
    return;
  }
  if (!perfil) {
    limpar();
    raiz.innerHTML = `<div class="centro"><div class="cartao msg">
      <h2>Usuário sem acesso</h2>
      <p>Seu login existe, mas ainda não tem perfil (Balança ou Portaria). Peça ao administrador para liberar.</p>
      <button class="btn sec" id="sair">Sair</button></div></div>`;
    raiz.querySelector('#sair').onclick = async () => { await api.sair(); iniciar(); };
    return;
  }

  montar(perfil, visaoInicial(perfil.papel));
}

function montar(perfil, visao) {
  limpar();
  const topo = document.createElement('header');
  topo.className = 'topo';
  const abas = perfil.papel === 'admin'
    ? `<nav class="abas">
         <button data-v="balança" class="${visao === 'balança' ? 'ativa' : ''}">Balança</button>
         <button data-v="portaria" class="${visao === 'portaria' ? 'ativa' : ''}">Portaria</button>
         <button data-v="usuarios" class="${visao === 'usuarios' ? 'ativa' : ''}">Usuários</button>
       </nav>`
    : '';
  topo.innerHTML = `
    <div class="marca"><img src="./icone.svg" alt="" width="28" height="28"><span>Controle de Saída - MI</span>
      ${api.demo ? '<span class="selo-demo" title="Dados só neste navegador">demonstração</span>' : ''}</div>
    ${abas}
    <div class="usuario"><span>${esc(perfil.nome)} · ${NOME_PAPEL[perfil.papel] || perfil.papel}</span>
      <button class="btn-link" id="sair">Sair</button></div>`;
  raiz.appendChild(topo);
  topo.querySelector('#sair').onclick = async () => { await api.sair(); iniciar(); };
  topo.querySelectorAll('.abas button').forEach((b) => {
    b.onclick = () => {
      try { localStorage.setItem('csmi-visao', b.dataset.v); } catch { /* ok */ }
      montar(perfil, b.dataset.v);
    };
  });

  const corpo = document.createElement('main');
  raiz.appendChild(corpo);
  document.body.dataset.visao = visao;
  const telas = { portaria: telaPortaria, usuarios: telaUsuarios };
  desmontar = (telas[visao] || telaBalanca)(corpo, perfil);
}

api.aoMudarSessao(() => { /* login/logout em outra aba */ });
iniciar();
