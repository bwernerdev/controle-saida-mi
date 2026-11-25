// Autoatualização do APK. Só roda no app Android; no site não faz nada (o site já
// se atualiza sozinho a cada publicação).
//
// Como funciona: ao abrir, ao voltar para a frente (no máximo a cada 5 min) e a cada
// 30 min com o app aberto, descobre a última Release do GitHub. A tag é v1.0.<N>, e N é
// o versionCode do APK (número do run do workflow apk.yml). Se N for maior que o
// instalado, baixa o APK sozinho, mostrando o progresso, e abre o instalador do Android:
// a pessoa só toca em "Atualizar". Na primeira vez o Android pede para liberar
// "instalar apps desta fonte". Tocar na versão (topo do app) confere na hora.
//
// A tag vem do plugin nativo (redirecionamento de github.com/.../releases/latest, sem o
// limite de 60 consultas/hora da API). APK sem esse método (até a 1.0.10) ou falha nele:
// usa a API do GitHub como reserva. Testado em 24/11/2026: a 1.0.9 achou a 1.0.10 sozinha
// ao ser reaberta.
import { registerPlugin } from '@capacitor/core';
import { dataHora, ehApp, esc } from './util.js';

const REPO = 'bwernerdev/controle-saida-mi';
const INTERVALO_MS = 5 * 60 * 1000;
const PERIODO_MS = 30 * 60 * 1000;
let Atualizador = registerPlugin('Atualizador');

/** Só para teste no navegador: troca o plugin nativo por um simulado. */
export function _usarPluginDeTeste(plugin) { Atualizador = plugin; ultimaVerificacao = 0; }

let ultimaVerificacao = 0;
let emAndamento = false;
let dialogo = null;

/** Versão instalada { versionCode, versionName, podeInstalar } ou null fora do app. */
export async function versaoInstalada() {
  if (!ehApp()) return null;
  try { return await Atualizador.info(); } catch { return null; }
}

/** Última Release com APK: { codigo, nome, url } ou null. */
async function ultimaRelease() {
  let falhaNativa = null;
  try {
    const { tag } = await Atualizador.ultimaVersao({ repo: REPO });
    const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag || '');
    if (m) {
      const nome = `${m[1]}.${m[2]}.${m[3]}`;
      // Nome do arquivo fixo no apk.yml: Controle-de-Saida-MI-<versão>.apk
      return {
        codigo: Number(m[3]), nome,
        url: `https://github.com/${REPO}/releases/download/${tag}/Controle-de-Saida-MI-${nome}.apk`,
      };
    }
  } catch (e) { falhaNativa = e; }
  try {
    return await ultimaReleasePelaApi();
  } catch (e) {
    throw falhaNativa && !/not implemented/i.test(falhaNativa.message || '') ? falhaNativa : e;
  }
}

async function ultimaReleasePelaApi() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });
  if (!r.ok) {
    throw new Error(r.status === 403 || r.status === 429
      ? 'O GitHub limitou as consultas desta rede. Tente de novo mais tarde.'
      : `GitHub respondeu ${r.status}`);
  }
  const rel = await r.json();
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(rel.tag_name || '');
  const apk = (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
  if (!m || !apk) return null;
  return { codigo: Number(m[3]), nome: `${m[1]}.${m[2]}.${m[3]}`, url: apk.browser_download_url };
}

function abrirDialogo(html) {
  if (!dialogo) {
    dialogo = document.createElement('dialog');
    dialogo.className = 'cartao atualizacao';
    // Sem Esc: a atualização é obrigatória enquanto o download roda.
    dialogo.addEventListener('cancel', (e) => { if (emAndamento) e.preventDefault(); });
    document.body.appendChild(dialogo);
  }
  dialogo.innerHTML = html;
  if (!dialogo.open) dialogo.showModal();
  return dialogo;
}

function fecharDialogo() {
  if (dialogo?.open) dialogo.close();
}

async function baixar(rel, instalada) {
  emAndamento = true;
  const d = abrirDialogo(`
    <h3>Atualizando o app</h3>
    <p>Versão ${esc(instalada.versionName)} → <b>${esc(rel.nome)}</b></p>
    <div class="barra"><span id="atu-barra" style="width:0%"></span></div>
    <p class="atu-status" id="atu-status">Baixando… 0%</p>`);
  const ouvinte = await Atualizador.addListener('progresso', ({ pct }) => {
    const barra = d.querySelector('#atu-barra');
    if (barra) barra.style.width = `${pct}%`;
    const st = d.querySelector('#atu-status');
    if (st) st.textContent = `Baixando… ${pct}%`;
  });
  try {
    await Atualizador.baixarEInstalar({ url: rel.url });
    abrirDialogo(`
      <h3>Atualização baixada</h3>
      <p>Na tela do Android, toque em <b>Atualizar</b>. O app reabre na versão ${esc(rel.nome)}.</p>
      <div class="acoes"><button class="btn sec" id="atu-fechar">Fechar</button></div>`)
      .querySelector('#atu-fechar').onclick = fecharDialogo;
  } catch (e) {
    abrirDialogo(`
      <h3>Não foi possível atualizar</h3>
      <p class="erro">${esc(e.message || e)}</p>
      <div class="acoes">
        <button class="btn sec" id="atu-fechar">Agora não</button>
        <button class="btn" id="atu-tentar">Tentar de novo</button>
      </div>`);
    dialogo.querySelector('#atu-fechar').onclick = fecharDialogo;
    dialogo.querySelector('#atu-tentar').onclick = () => { emAndamento = false; baixar(rel, instalada); };
  } finally {
    ouvinte.remove();
    emAndamento = false;
  }
}

function pedirPermissao(rel) {
  const d = abrirDialogo(`
    <h3>Nova versão ${esc(rel.nome)}</h3>
    <p>Para o app se atualizar sozinho, o Android precisa de uma liberação (só uma vez):
      toque em <b>Liberar</b>, ative <b>Permitir desta fonte</b> e volte para o app.</p>
    <div class="acoes">
      <button class="btn sec" id="atu-fechar">Agora não</button>
      <button class="btn" id="atu-liberar">Liberar</button>
    </div>`);
  d.querySelector('#atu-fechar').onclick = fecharDialogo;
  d.querySelector('#atu-liberar').onclick = () => {
    Atualizador.abrirPermissao();
    // Ao voltar para o app, a verificação roda de novo (forçada) e segue para o download.
    ultimaVerificacao = 0;
  };
}

/** Resultado da última verificação automática (mostrado no "Verificar atualização"). */
let ultimoResultado = null;

/**
 * Verifica e, se houver versão nova, atualiza. forcar ignora o intervalo mínimo.
 * Devolve 'atualizando' | 'em-dia' | 'permissao' | 'ignorado', ou lança o erro.
 */
async function verificar({ forcar = false } = {}) {
  if (!ehApp() || emAndamento) return 'ignorado';
  if (!forcar && Date.now() - ultimaVerificacao < INTERVALO_MS) return 'ignorado';
  ultimaVerificacao = Date.now();
  const instalada = await Atualizador.info();
  const rel = await ultimaRelease();
  if (!rel || rel.codigo <= Number(instalada.versionCode)) return 'em-dia';
  if (!instalada.podeInstalar) {
    pedirPermissao(rel);
    return 'permissao';
  }
  baixar(rel, instalada);
  return 'atualizando';
}

/** Verificação automática: erro fica guardado (sem rede não é motivo para incomodar). */
export async function verificarAtualizacao(opcoes) {
  try {
    const r = await verificar(opcoes);
    if (r !== 'ignorado') ultimoResultado = { em: new Date().toISOString(), erro: null };
  } catch (e) {
    ultimoResultado = { em: new Date().toISOString(), erro: e.message || String(e) };
    console.warn('Verificação de atualização falhou:', e);
  }
}

/** Toque na versão do topo: confere na hora e mostra o resultado. */
export async function verificarAgora() {
  if (!ehApp() || emAndamento) return;
  abrirDialogo('<h3>Atualização</h3><p class="atu-status">Procurando versão nova…</p>');
  try {
    const r = await verificar({ forcar: true });
    ultimoResultado = { em: new Date().toISOString(), erro: null };
    if (r === 'em-dia') {
      const v = await versaoInstalada();
      abrirDialogo(`<h3>Atualização</h3>
        <p>Este aparelho já está na versão mais nova (<b>${esc(v?.versionName || '')}</b>).</p>
        <p><small>Conferido às ${dataHora(ultimoResultado.em)}.</small></p>
        <div class="acoes"><button class="btn sec" id="atu-fechar">Fechar</button></div>`)
        .querySelector('#atu-fechar').onclick = fecharDialogo;
    }
  } catch (e) {
    ultimoResultado = { em: new Date().toISOString(), erro: e.message || String(e) };
    abrirDialogo(`<h3>Não foi possível verificar</h3>
      <p class="erro">${esc(ultimoResultado.erro)}</p>
      <p>Confira a internet e tente de novo.</p>
      <div class="acoes">
        <button class="btn sec" id="atu-fechar">Fechar</button>
        <button class="btn" id="atu-tentar">Tentar de novo</button>
      </div>`);
    dialogo.querySelector('#atu-fechar').onclick = fecharDialogo;
    dialogo.querySelector('#atu-tentar').onclick = verificarAgora;
  }
}

/** Liga a verificação: agora, quando o app volta para a frente e a cada 30 min aberto. */
export function iniciarAtualizador() {
  if (!ehApp()) return;
  verificarAtualizacao({ forcar: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') verificarAtualizacao();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') verificarAtualizacao({ forcar: true });
  }, PERIODO_MS);
  // A rede voltou: a verificação que falhou sem internet roda de novo.
  window.addEventListener('online', () => verificarAtualizacao({ forcar: true }));
}
