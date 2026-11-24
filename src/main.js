// Entrada do app: decide entre login, tela da balança e tela da portaria.
import './style.css';
import { api, SemConexao } from './api.js';
import { telaLogin } from './telas/login.js';
import { telaBalanca } from './telas/balanca.js';
import { telaPortaria } from './telas/portaria.js';
import { telaUsuarios } from './telas/usuarios.js';
import { dataHora, ehApp, esc } from './util.js';
import { iniciarAtualizador, verificarAgora, versaoInstalada } from './atualizador.js';

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
  const { naFila } = api.estadoEnvio();
  if (naFila && !window.confirm(`${naFila === 1 ? 'Há 1 registro feito sem internet que ainda não foi enviado'
    : `Há ${naFila} registros feitos sem internet que ainda não foram enviados`}. Se sair agora, eles serão perdidos. Sair mesmo assim?`)) return;
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
      <button class="btn-link versao-topo" id="versao" hidden title="Verificar atualização"></button>
      <button class="btn-link" id="sair">Sair</button></div>`;
  raiz.appendChild(topo);
  topo.querySelector('#sair').onclick = sair;
  // No APK: versão instalada; tocar confere na hora se há atualização.
  versaoInstalada().then((v) => {
    const b = topo.querySelector('#versao');
    if (!v || !b) return;
    b.textContent = `v${v.versionName}`;
    b.hidden = false;
    b.onclick = verificarAgora;
  });
  topo.querySelectorAll('.abas button').forEach((b) => {
    b.onclick = () => {
      try { localStorage.setItem('csmi-visao', b.dataset.v); } catch { /* ok */ }
      montar(perfil, b.dataset.v);
    };
  });

  const faixa = document.createElement('div');
  faixa.className = 'faixa-rede';
  faixa.hidden = true;
  raiz.appendChild(faixa);
  const pararFaixa = api.aoMudarEstadoEnvio((e) => desenharFaixa(faixa, e));

  const corpo = document.createElement('main');
  raiz.appendChild(corpo);
  document.body.dataset.visao = visao;
  const telas = { portaria: telaPortaria, usuarios: telaUsuarios };
  const pararTela = (telas[visao] || telaBalanca)(corpo, perfil);
  desmontar = () => { pararFaixa(); if (pararTela) pararTela(); };
}

const contar = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Faixa abaixo do topo: sem internet, fila de envio e registros recusados pelo servidor. */
function desenharFaixa(el, e) {
  const linhas = [];
  let tipo = '';
  const fila = contar(e.naFila, 'registro aguardando envio', 'registros aguardando envio');
  if (!e.online) {
    tipo = 'offline';
    linhas.push(`<span><b>Sem internet.</b> ${e.atualizadoEm ? `Mostrando os dados de ${dataHora(e.atualizadoEm)}. ` : ''}${
      e.naFila ? `${fila}.` : 'O que for registrado será enviado quando a rede voltar.'}</span>`);
  } else if (e.enviando) {
    tipo = 'enviando';
    linhas.push(`<span>Enviando ${contar(e.naFila, 'registro feito sem internet', 'registros feitos sem internet')}…</span>`);
  } else if (e.naFila) {
    tipo = 'enviando';
    linhas.push(`<span>${fila}. <button class="btn-link" data-acao="enviar">Enviar agora</button></span>`);
  }
  if (e.rejeitadas) {
    tipo = tipo || 'recusa';
    linhas.push(`<span class="recusa">${contar(e.rejeitadas, 'registro feito sem internet não foi aceito',
      'registros feitos sem internet não foram aceitos')} pelo servidor.
      <button class="btn-link" data-acao="ver">Ver</button></span>`);
  }
  el.hidden = !linhas.length;
  el.className = `faixa-rede ${tipo}`;
  el.innerHTML = linhas.join('');
  const enviar = el.querySelector('[data-acao=enviar]');
  if (enviar) enviar.onclick = () => api.sincronizar();
  const ver = el.querySelector('[data-acao=ver]');
  if (ver) ver.onclick = mostrarRecusas;
}

const DESCRICAO = { criar: 'Cadastro', saida: 'Saída', cancelar: 'Cancelamento' };

/** Lista do que o servidor recusou (ex.: saída de um veículo que a balança cancelou). */
function mostrarRecusas() {
  let dlg = document.getElementById('dlg-recusas');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'dlg-recusas';
    dlg.className = 'cartao recusas';
    document.body.appendChild(dlg);
  }
  const desenhar = () => {
    const lista = api.rejeitadas();
    if (!lista.length) { dlg.close(); return; }
    dlg.innerHTML = `
      <h3>Não aceitos pelo servidor</h3>
      <p>Foram registrados sem internet e recusados quando a rede voltou. Confira com a balança/portaria.</p>
      <ul>${lista.map((o) => `<li>
        <b>${DESCRICAO[o.tipo] || o.tipo}${o.placa ? ` de <span class="placa">${esc(o.placa)}</span>` : ''}</b>
        <small>feito ${dataHora(o.quando)}</small>
        <span class="erro">${esc(o.erro)}</span>
        <button class="btn-link" data-dispensar="${esc(o.id)}">Dispensar</button></li>`).join('')}</ul>
      <div class="acoes"><button class="btn sec" id="recusas-fechar">Fechar</button></div>`;
    dlg.querySelector('#recusas-fechar').onclick = () => dlg.close();
    dlg.querySelectorAll('[data-dispensar]').forEach((b) => {
      b.onclick = async () => { await api.dispensarRejeitada(b.dataset.dispensar); desenhar(); };
    });
  };
  desenhar();
  if (api.rejeitadas().length && !dlg.open) dlg.showModal();
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
