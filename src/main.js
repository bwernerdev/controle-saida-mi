// Entrada do app: decide entre login, tela da balança e tela da portaria.
import './style.css';
import { api, SemConexao } from './api.js';
import { telaLogin } from './telas/login.js';
import { telaBalanca } from './telas/balanca.js';
import { telaPortaria } from './telas/portaria.js';
import { telaUsuarios } from './telas/usuarios.js';
import { ehApp, esc } from './util.js';
import { iniciarAtualizador } from './atualizador.js';

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

let naTelaDeLogin = false;
let saidaPeloBotao = false;
let tentarDeNovo = null;

/** Sessão salva, mas sem internet: não pede login; tenta de novo sozinho quando a rede volta. */
function telaSemConexao() {
  limpar();
  raiz.innerHTML = `<div class="centro"><div class="cartao msg">
    <h2>Sem conexão</h2>
    <p>Seu login continua salvo. Assim que a internet voltar, o app abre sozinho.</p>
    <button class="btn" id="tentar">Tentar agora</button></div></div>`;
  raiz.querySelector('#tentar').onclick = iniciar;
  if (!tentarDeNovo) {
    tentarDeNovo = () => { window.removeEventListener('online', tentarDeNovo); tentarDeNovo = null; iniciar(); };
    window.addEventListener('online', tentarDeNovo);
  }
}

/** Botão Sair: encerra a sessão só neste aparelho e volta ao login. */
async function sair() {
  saidaPeloBotao = true; // o evento SIGNED_OUT que vem junto não precisa reiniciar
  await api.sair();
  iniciar();
}

const ehSemConexao = (e) => e instanceof SemConexao || /Sem conexão/i.test(e?.message || '');

async function iniciar() {
  limpar();
  naTelaDeLogin = false;
  raiz.innerHTML = '<div class="carregando">Carregando…</div>';
  let sessao = null;
  try { sessao = await api.sessao(); } catch (e) {
    if (ehSemConexao(e)) { telaSemConexao(); return; }
    /* outro erro: trata como deslogado */
  }
  if (!sessao) {
    limpar();
    naTelaDeLogin = true;
    telaLogin(raiz, iniciar);
    return;
  }

  let perfil = null;
  try { perfil = await api.perfil(); } catch (e) {
    if (ehSemConexao(e)) { telaSemConexao(); return; }
    limpar();
    raiz.innerHTML = `<div class="centro"><div class="cartao msg">
      <h2>Não foi possível carregar seu perfil</h2><p>${esc(e.message)}</p>
      <button class="btn" id="tentar">Tentar de novo</button> <button class="btn sec" id="sair">Sair</button></div></div>`;
    raiz.querySelector('#tentar').onclick = iniciar;
    raiz.querySelector('#sair').onclick = sair;
    return;
  }
  if (!perfil) {
    limpar();
    raiz.innerHTML = `<div class="centro"><div class="cartao msg">
      <h2>Usuário sem acesso</h2>
      <p>Seu login existe, mas ainda não tem perfil (Balança ou Portaria). Peça ao administrador para liberar.</p>
      <button class="btn sec" id="sair">Sair</button></div></div>`;
    raiz.querySelector('#sair').onclick = sair;
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
  topo.querySelector('#sair').onclick = sair;
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

// Sessão encerrada fora do botão Sair (revogada no servidor, usuário excluído): volta ao login.
api.aoMudarSessao((evento) => {
  if (evento !== 'SIGNED_OUT') return;
  if (saidaPeloBotao) { saidaPeloBotao = false; return; }
  if (!naTelaDeLogin) iniciar();
});
iniciar();
iniciarAtualizador(); // só faz algo no APK
if (import.meta.env.DEV) window.__iniciar = iniciar; // testes no preview; some no build
