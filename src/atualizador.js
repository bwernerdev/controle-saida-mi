// Autoatualização do APK. Só roda no app Android; no site não faz nada (o site já
// se atualiza sozinho a cada publicação).
//
// Como funciona: a cada abertura (e quando o app volta para a frente, no máximo a cada
// 15 min) consulta a última Release do GitHub. A tag é v1.0.<N>, e N é o versionCode do
// APK (número do run do workflow apk.yml). Se N for maior que o instalado, baixa o APK
// sozinho, mostrando o progresso, e abre o instalador do Android: a pessoa só toca em
// "Atualizar". Na primeira vez o Android pede para liberar "instalar apps desta fonte".
//
// Teste de 24/11/2026: a 1.0.9 foi instalada à mão e esta versão (1.0.10) existe só para
// conferir se a 1.0.9 encontra a atualização sozinha.
import { registerPlugin } from '@capacitor/core';
import { ehApp, esc } from './util.js';

const REPO = 'bwernerdev/controle-saida-mi';
const INTERVALO_MS = 15 * 60 * 1000;
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
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
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

function pedirPermissao(rel, instalada) {
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
  void instalada;
}

/** Verifica e, se houver versão nova, atualiza. forcar ignora o intervalo mínimo. */
export async function verificarAtualizacao({ forcar = false } = {}) {
  if (!ehApp() || emAndamento) return;
  if (!forcar && Date.now() - ultimaVerificacao < INTERVALO_MS) return;
  ultimaVerificacao = Date.now();
  try {
    const instalada = await Atualizador.info();
    const rel = await ultimaRelease();
    if (!rel || rel.codigo <= Number(instalada.versionCode)) return;
    if (!instalada.podeInstalar) {
      pedirPermissao(rel, instalada);
      return;
    }
    await baixar(rel, instalada);
  } catch (e) {
    // Sem internet ou GitHub fora: tenta de novo na próxima abertura, sem incomodar.
    console.warn('Verificação de atualização falhou:', e);
  }
}

/** Liga a verificação: agora e sempre que o app volta para a frente. */
export function iniciarAtualizador() {
  if (!ehApp()) return;
  verificarAtualizacao({ forcar: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') verificarAtualizacao();
  });
}
