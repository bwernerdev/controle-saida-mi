// Funções pequenas usadas pelas telas e pela camada de dados.

/** Placa só com letras e números, em maiúsculas ("abc-1d23" -> "ABC1D23"). */
export function normalizarPlaca(texto) {
  return String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Placa brasileira: antiga (ABC1234) ou Mercosul (ABC1D23). */
export function placaValida(placa) {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa);
}

/** Placa para exibir: antiga com hífen (ABC-1234), Mercosul sem (ABC1D23). */
export function formatarPlaca(placa) {
  return /^[A-Z]{3}[0-9]{4}$/.test(placa) ? `${placa.slice(0, 3)}-${placa.slice(3)}` : placa;
}

/** Lacre para comparar: maiúsculas, sem espaços. Mesma regra do SQL (normalizar_lacre). */
export function normalizarLacre(texto) {
  return String(texto || '').toUpperCase().replace(/\s+/g, '');
}

const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

/** "14:05" se for hoje, "23/11 14:05" se for outro dia. */
export function dataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia ? fmtHora.format(d) : `${fmtData.format(d)} ${fmtHora.format(d)}`;
}

/** Início do dia local (00:00) de uma data "AAAA-MM-DD", em ISO. */
export function inicioDoDia(aaaammdd) {
  const [a, m, d] = aaaammdd.split('-').map(Number);
  return new Date(a, m - 1, d).toISOString();
}

/** Data de hoje no formato do <input type="date">. */
export function hojeISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Escapa texto para colocar dentro de HTML. */
export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

let timerAviso;
/** Aviso flutuante no rodapé. tipo: 'ok' | 'erro'. */
export function aviso(msg, tipo = 'ok') {
  let el = document.getElementById('aviso');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aviso';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `aviso ${tipo} visivel`;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => el.classList.remove('visivel'), tipo === 'erro' ? 5000 : 2800);
}

/** Erro de rede: a sessão/os dados continuam salvos, só não deu para falar com o servidor. */
export class SemConexao extends Error {}

/** O erro veio da falta de rede (e não de uma regra do servidor)? */
export function ehErroDeRede(e) {
  if (e instanceof SemConexao) return true;
  return /Sem conexão|Failed to fetch|NetworkError|Load failed|Network request failed|tempo esgotado/i
    .test(e?.message || String(e || ''));
}

/** Confere placa e lacre de um cadastro novo (as mesmas regras do banco). */
export function validarNovo({ placa, lacre }) {
  const p = normalizarPlaca(placa);
  if (!placaValida(p)) throw new Error('Placa inválida. Use ABC1234 ou ABC1D23.');
  const l = String(lacre || '').trim();
  if (!l) throw new Error('Informe o lacre.');
  if (l.length > 40) throw new Error('Lacre muito longo (máximo 40 caracteres).');
  return { placa: p, lacre: l };
}

/** Motivo do cancelamento: obrigatório, de 3 a 200 caracteres (mesma regra do schema.sql). */
export function validarMotivo(motivo) {
  const m = String(motivo || '').trim();
  if (m.length < 3) throw new Error('Informe o motivo do cancelamento (pelo menos 3 caracteres).');
  if (m.length > 200) throw new Error('Motivo muito longo (máximo 200 caracteres).');
  return m;
}

/** Roda no app Android (Capacitor) e não no navegador. */
export function ehApp() {
  return !!window.Capacitor?.isNativePlatform?.();
}
