// Tela da balança (PC): cadastra PLACA + LACRE e acompanha as saídas.
import { api } from '../api.js';
import {
  aviso, dataHora, esc, formatarPlaca, hojeISO, inicioDoDia, normalizarPlaca, placaValida, validarMotivo,
} from '../util.js';

const ROTULO = { pendente: 'Aguardando saída', liberado: 'Saiu', cancelado: 'Cancelado' };

export function telaBalanca(corpo, perfil = {}) {
  corpo.className = 'balanca';
  corpo.innerHTML = `
    <section class="cartao cadastro">
      <h2>Nova saída</h2>
      <form id="form-nova" autocomplete="off">
        <label>Placa
          <input name="placa" required maxlength="8" placeholder="ABC1D23" class="campo-placa"
                 autocapitalize="characters" spellcheck="false">
        </label>
        <label>Lacre
          <input name="lacre" required maxlength="40" placeholder="Número do lacre" spellcheck="false">
        </label>
        <label class="linha-check"><input type="checkbox" id="lacre-vazio"> VAZIO</label>
        <label>Observação <small>(opcional)</small>
          <textarea name="observacao" rows="2" maxlength="200" placeholder="Motorista, destino, nota…"></textarea>
        </label>
        <p class="erro" id="erro-nova" hidden></p>
        <button class="btn grande" type="submit">Cadastrar saída</button>
      </form>
    </section>

    <section class="painel">
      <div class="indicadores">
        <div class="ind pendente"><span>Aguardando saída</span><b id="n-pend">–</b></div>
        <div class="ind liberado"><span>Saíram hoje</span><b id="n-lib">–</b></div>
        <div class="ind cancelado"><span>Cancelados hoje</span><b id="n-canc">–</b></div>
      </div>

      <div class="cartao lista">
        <div class="lista-topo">
          <nav class="filtro">
            <button data-f="pendente" class="ativa">Aguardando saída</button>
            <button data-f="historico">Histórico</button>
          </nav>
          <div class="ferramentas">
            <input type="search" id="busca" placeholder="Buscar placa ou lacre" spellcheck="false">
            <input type="date" id="dia" value="${hojeISO()}" hidden title="Dia do cadastro">
            ${perfil.pode_apagar_historico
    ? '<button class="btn-link perigo" id="apagar-historico" type="button">Apagar histórico</button>' : ''}
          </div>
        </div>
        <div class="tabela-rolagem">
          <table>
            <thead><tr>
              <th>Placa</th><th>Lacre</th><th>Observação</th><th>Cadastro</th>
              <th>Status</th><th>Saída / cancelamento</th><th></th>
            </tr></thead>
            <tbody id="linhas"><tr><td colspan="7" class="vazio">Carregando…</td></tr></tbody>
          </table>
        </div>
      </div>
    </section>

    <dialog id="dlg-cancelar" class="cartao">
      <form method="dialog">
        <h3>Cancelar saída <span id="canc-placa"></span>?</h3>
        <label>Motivo do cancelamento
          <input name="motivo" maxlength="200" placeholder="Ex.: veículo voltou, lacre trocado…"></label>
        <p class="erro" id="erro-canc" hidden></p>
        <div class="acoes">
          <button class="btn sec" value="nao" formnovalidate>Voltar</button>
          <button class="btn perigo" value="sim">Cancelar saída</button>
        </div>
      </form>
    </dialog>

    <dialog id="dlg-apagar" class="cartao">
      <form method="dialog">
        <h3>Apagar histórico?</h3>
        <p>Apaga do sistema todas as saídas já liberadas e canceladas, no site e no app.
          <b>Não tem volta.</b> Os logins continuam.</p>
        <label class="linha-check"><input type="checkbox" name="pendentes">
          Apagar também os que estão aguardando saída</label>
        <label>Para confirmar, digite <b>APAGAR</b>
          <input name="confirmacao" autocomplete="off" spellcheck="false" autocapitalize="characters"></label>
        <p class="erro" id="erro-apagar" hidden></p>
        <div class="acoes">
          <button class="btn sec" value="nao" formnovalidate>Voltar</button>
          <button class="btn perigo" value="sim">Apagar histórico</button>
        </div>
      </form>
    </dialog>`;

  const $ = (s) => corpo.querySelector(s);
  const form = $('#form-nova');
  const erro = $('#erro-nova');
  let filtro = 'pendente';
  let registros = [];

  // Placa: só letras/números, maiúsculas, enquanto digita.
  form.placa.addEventListener('input', () => {
    const p = normalizarPlaca(form.placa.value).slice(0, 7);
    if (form.placa.value !== p) form.placa.value = p;
    form.placa.classList.toggle('invalida', p.length === 7 && !placaValida(p));
  });

  // Flag VAZIO: grava o lacre "VAZIO" e trava o campo; a portaria só confirma a saída.
  const vazio = $('#lacre-vazio');
  const aplicarVazio = () => {
    if (vazio.checked) form.lacre.value = 'VAZIO';
    else if (form.lacre.readOnly) form.lacre.value = '';
    form.lacre.readOnly = vazio.checked;
  };
  vazio.onchange = aplicarVazio;
  form.addEventListener('reset', () => setTimeout(aplicarVazio));

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    erro.hidden = true;
    const botao = form.querySelector('button');
    botao.disabled = true;
    try {
      const novo = await api.criar({
        placa: form.placa.value, lacre: form.lacre.value, observacao: form.observacao.value,
      });
      aviso(novo._naFila
        ? `Sem internet: ${formatarPlaca(novo.placa)} ficou guardada e será enviada quando a rede voltar.`
        : `Saída de ${formatarPlaca(novo.placa)} cadastrada.`);
      form.reset();
      form.placa.focus();
      carregar();
    } catch (e) {
      erro.textContent = e.message; erro.hidden = false;
    } finally {
      botao.disabled = false;
    }
  };

  corpo.querySelectorAll('.filtro button').forEach((b) => {
    b.onclick = () => {
      filtro = b.dataset.f;
      corpo.querySelectorAll('.filtro button').forEach((x) => x.classList.toggle('ativa', x === b));
      $('#dia').hidden = filtro !== 'historico';
      carregar();
    };
  });
  $('#dia').onchange = carregar;
  $('#busca').oninput = desenhar;

  async function carregar() {
    try {
      const hoje = inicioDoDia(hojeISO());
      const [pend, finalizadosHoje] = await Promise.all([
        api.listar({ status: 'pendente' }),
        api.finalizadosDesde(hoje),
      ]);
      $('#n-pend').textContent = pend.length;
      $('#n-lib').textContent = finalizadosHoje.filter((s) => s.status === 'liberado' && s.saida_em >= hoje).length;
      $('#n-canc').textContent = finalizadosHoje.filter((s) => s.status === 'cancelado' && s.cancelado_em >= hoje).length;

      if (filtro === 'pendente') {
        registros = pend;
      } else {
        const dia = $('#dia').value || hojeISO();
        const ini = inicioDoDia(dia);
        const fim = new Date(new Date(ini).getTime() + 86400000).toISOString();
        registros = await api.listar({ desde: ini, ate: fim });
      }
      desenhar();
    } catch (e) {
      $('#linhas').innerHTML = `<tr><td colspan="7" class="vazio erro">${esc(e.message)}</td></tr>`;
    }
  }

  function desenhar() {
    const termo = normalizarPlaca($('#busca').value);
    const lista = termo
      ? registros.filter((s) => s.placa.includes(termo) || normalizarPlaca(s.lacre).includes(termo))
      : registros;
    if (!lista.length) {
      $('#linhas').innerHTML = `<tr><td colspan="7" class="vazio">${
        filtro === 'pendente' ? 'Nenhum veículo aguardando saída.' : 'Nenhum registro neste dia.'}</td></tr>`;
      return;
    }
    $('#linhas').innerHTML = lista.map((s) => {
      const fim = s.status === 'liberado'
        ? `${dataHora(s.saida_em)} · ${esc(s.saida_por_nome || '')}`
        : s.status === 'cancelado'
          ? `${dataHora(s.cancelado_em)} · ${esc(s.cancelado_por_nome || '')}${
            s.motivo_cancelamento ? `<br><small>${esc(s.motivo_cancelamento)}</small>` : ''}`
          : '';
      return `<tr>
        <td><span class="placa">${esc(formatarPlaca(s.placa))}</span></td>
        <td class="mono">${esc(s.lacre)}</td>
        <td class="obs">${esc(s.observacao || '')}</td>
        <td>${dataHora(s.criado_em)}<br><small>${esc(s.criado_por_nome || '')}</small></td>
        <td><span class="status ${s.status}">${ROTULO[s.status]}</span>${
          s._local ? '<br><small class="nao-enviado" title="Feito sem internet; será enviado quando a rede voltar">não enviado</small>' : ''}</td>
        <td>${fim}</td>
        <td>${s.status === 'pendente'
          ? `<button class="btn-link perigo" data-cancelar="${s.id}">Cancelar</button>` : ''}</td>
      </tr>`;
    }).join('');
    corpo.querySelectorAll('[data-cancelar]').forEach((b) => {
      b.onclick = () => pedirCancelamento(registros.find((s) => String(s.id) === b.dataset.cancelar));
    });
  }

  function pedirCancelamento(s) {
    const dlg = $('#dlg-cancelar');
    $('#canc-placa').textContent = formatarPlaca(s.placa);
    const formCanc = dlg.querySelector('form');
    const erroCanc = $('#erro-canc');
    formCanc.motivo.value = '';
    erroCanc.hidden = true;
    // Motivo obrigatório: sem ele, o diálogo não fecha.
    formCanc.onsubmit = (ev) => {
      if (ev.submitter?.value !== 'sim') return;
      try { validarMotivo(formCanc.motivo.value); } catch (e) {
        ev.preventDefault();
        erroCanc.textContent = e.message; erroCanc.hidden = false;
        formCanc.motivo.focus();
      }
    };
    dlg.onclose = async () => {
      if (dlg.returnValue !== 'sim') return;
      try {
        const r = await api.cancelar(s.id, dlg.querySelector('[name=motivo]').value.trim());
        aviso(r?._naFila
          ? `Sem internet: cancelamento de ${formatarPlaca(s.placa)} guardado; será enviado quando a rede voltar.`
          : `Saída de ${formatarPlaca(s.placa)} cancelada.`);
        carregar();
      } catch (e) { aviso(e.message, 'erro'); }
    };
    dlg.showModal();
  }

  // Só aparece para login com perfis.pode_apagar_historico (ligado por SQL, ver schema.sql).
  const botaoApagar = $('#apagar-historico');
  if (botaoApagar) {
    const dlgA = $('#dlg-apagar');
    const formA = dlgA.querySelector('form');
    const erroA = $('#erro-apagar');
    botaoApagar.onclick = () => {
      formA.reset();
      erroA.hidden = true;
      dlgA.showModal();
      formA.confirmacao.focus();
    };
    formA.onsubmit = async (ev) => {
      if (ev.submitter?.value !== 'sim') return;
      ev.preventDefault(); // fecha só depois de apagar (erro fica visível no diálogo)
      if (formA.confirmacao.value.trim().toUpperCase() !== 'APAGAR') {
        erroA.textContent = 'Digite APAGAR para confirmar.'; erroA.hidden = false;
        formA.confirmacao.focus();
        return;
      }
      const botao = ev.submitter;
      botao.disabled = true; erroA.hidden = true;
      try {
        const n = await api.apagarHistorico({ incluirPendentes: formA.pendentes.checked });
        dlgA.close();
        aviso(n === 1 ? '1 registro apagado.' : `${n} registros apagados.`);
        carregar();
      } catch (e) {
        erroA.textContent = e.message; erroA.hidden = false;
      } finally {
        botao.disabled = false;
      }
    };
  }

  // Atualiza sozinho quando a portaria libera (Realtime) e a cada 60 s como garantia.
  let espera;
  const agendar = () => { clearTimeout(espera); espera = setTimeout(carregar, 250); };
  const parar = api.assinar(agendar);
  const relogio = setInterval(carregar, 60000);
  carregar();
  form.placa.focus();

  return () => { parar(); clearInterval(relogio); clearTimeout(espera); };
}
