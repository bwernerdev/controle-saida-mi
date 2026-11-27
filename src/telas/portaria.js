// Tela da portaria (celular / APK): lista quem aguarda saída e registra a saída
// depois de conferir o lacre. O lacre cadastrado não aparece: o porteiro digita o
// número que vê no veículo e o sistema compara.
import { api } from '../api.js';
import {
  aviso, dataHora, esc, formatarPlaca, hojeISO, inicioDoDia, normalizarLacre, normalizarPlaca,
} from '../util.js';

export function telaPortaria(corpo) {
  corpo.className = 'portaria';
  corpo.innerHTML = `
    <div class="busca-portaria">
      <input type="search" id="busca" placeholder="Buscar placa" autocapitalize="characters"
             spellcheck="false" autocomplete="off">
      <button class="btn sec" id="atualizar" title="Atualizar" aria-label="Atualizar">↻</button>
    </div>
    <h2 class="secao">Aguardando saída <span class="contador" id="n-pend">0</span></h2>
    <ul class="cards" id="pendentes"><li class="vazio">Carregando…</li></ul>
    <h2 class="secao">Saíram hoje <span class="contador cinza" id="n-hoje">0</span></h2>
    <ul class="cards compactos" id="saidos"></ul>

    <dialog id="dlg-saida" class="folha">
      <form id="form-saida" autocomplete="off">
        <p class="rotulo">Registrar saída</p>
        <div class="placa grande" id="saida-placa"></div>
        <p class="obs" id="saida-obs"></p>
        <p class="obs" id="saida-vazio" hidden><b>Lacre: VAZIO</b> — só confirmar a saída.</p>
        <label>Número do lacre no veículo
          <input name="lacre" required maxlength="40" autocapitalize="characters" spellcheck="false"
                 inputmode="text" placeholder="Digite o lacre que está no veículo">
        </label>
        <p class="erro" id="erro-saida" hidden></p>
        <div class="acoes">
          <button type="button" class="btn sec grande" id="voltar">Voltar</button>
          <button type="submit" class="btn ok grande">Confirmar saída</button>
        </div>
      </form>
    </dialog>`;

  const $ = (s) => corpo.querySelector(s);
  let pendentes = [];
  let saidos = [];
  let atual = null;

  async function carregar() {
    try {
      const [p, f] = await Promise.all([
        api.listar({ status: 'pendente' }),
        api.finalizadosDesde(inicioDoDia(hojeISO())),
      ]);
      pendentes = p.slice().reverse(); // mais antigo primeiro: fila de saída
      saidos = f.filter((s) => s.status === 'liberado')
        .sort((a, b) => b.saida_em.localeCompare(a.saida_em));
      desenhar();
    } catch (e) {
      $('#pendentes').innerHTML = `<li class="vazio erro">${esc(e.message)}</li>`;
    }
  }

  function desenhar() {
    const termo = normalizarPlaca($('#busca').value);
    const filtrar = (l) => (termo ? l.filter((s) => s.placa.includes(termo)) : l);
    const p = filtrar(pendentes);
    const s = filtrar(saidos);
    $('#n-pend').textContent = pendentes.length;
    $('#n-hoje').textContent = saidos.length;

    $('#pendentes').innerHTML = p.length
      ? p.map((r) => `<li><button class="card" data-id="${r.id}">
          <span class="placa">${esc(formatarPlaca(r.placa))}</span>
          <span class="info">Cadastrado ${dataHora(r.criado_em)}${
            r._local ? ' · <span class="nao-enviado">não enviado</span>' : ''}${
            r.observacao ? `<br><span class="obs">${esc(r.observacao)}</span>` : ''}</span>
          <span class="seta" aria-hidden="true">›</span>
        </button></li>`).join('')
      : `<li class="vazio">${termo ? 'Nenhuma placa encontrada.' : 'Nenhum veículo aguardando saída.'}</li>`;

    $('#saidos').innerHTML = s.length
      ? s.map((r) => `<li class="card saiu">
          <span class="placa">${esc(formatarPlaca(r.placa))}</span>
          <span class="info">Saiu ${dataHora(r.saida_em)} · ${esc(r.saida_por_nome || '')}${
            r._local ? ' · <span class="nao-enviado">não enviado</span>' : ''}</span>
        </li>`).join('')
      : '<li class="vazio">Nenhuma saída hoje.</li>';

    corpo.querySelectorAll('#pendentes [data-id]').forEach((b) => {
      b.onclick = () => abrir(pendentes.find((r) => String(r.id) === b.dataset.id));
    });
  }

  const dlg = $('#dlg-saida');
  const form = $('#form-saida');
  const erro = $('#erro-saida');

  function abrir(r) {
    atual = r;
    $('#saida-placa').textContent = formatarPlaca(r.placa);
    $('#saida-obs').textContent = r.observacao || '';
    // Cadastro com flag VAZIO: não pede o lacre, só confirmar a saída.
    const vazio = normalizarLacre(r.lacre) === 'VAZIO';
    form.lacre.value = vazio ? 'VAZIO' : '';
    form.lacre.closest('label').hidden = vazio;
    $('#saida-vazio').hidden = !vazio;
    erro.hidden = true;
    dlg.showModal();
    if (!vazio) form.lacre.focus();
  }
  $('#voltar').onclick = () => dlg.close();

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const botao = form.querySelector('[type=submit]');
    botao.disabled = true; erro.hidden = true;
    try {
      const r = await api.registrarSaida(atual.id, form.lacre.value);
      dlg.close();
      aviso(r?._naFila
        ? `Sem internet: saída de ${formatarPlaca(atual.placa)} registrada aqui; será enviada quando a rede voltar.`
        : `Saída de ${formatarPlaca(atual.placa)} registrada.`);
      $('#busca').value = '';
      carregar();
    } catch (e) {
      erro.textContent = e.message; erro.hidden = false;
      form.lacre.select();
    } finally {
      botao.disabled = false;
    }
  };

  $('#busca').oninput = () => {
    const v = normalizarPlaca($('#busca').value);
    if ($('#busca').value !== v) $('#busca').value = v;
    desenhar();
  };
  $('#atualizar').onclick = async () => {
    await carregar();
    aviso(api.estadoEnvio().online ? 'Lista atualizada.' : 'Sem internet: mostrando os dados salvos.');
  };

  // Atualiza sozinho (Realtime), a cada 30 s, e quando o app volta para a frente.
  let espera;
  const agendar = () => { clearTimeout(espera); espera = setTimeout(carregar, 250); };
  const parar = api.assinar(agendar);
  const relogio = setInterval(carregar, 30000);
  const aoVoltar = () => { if (document.visibilityState === 'visible') carregar(); };
  document.addEventListener('visibilitychange', aoVoltar);
  carregar();

  return () => {
    parar(); clearInterval(relogio); clearTimeout(espera);
    document.removeEventListener('visibilitychange', aoVoltar);
  };
}
