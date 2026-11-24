// Camada de dados. As telas só falam com este módulo.
// Duas implementações com a mesma interface:
//  - Supabase (produção): login, tabela "saidas" e funções registrar_saida / cancelar_saida.
//  - Demonstração: localStorage, para testar sem Supabase configurado.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, MODO_DEMO } from './config.js';
import { normalizarLacre, normalizarPlaca, placaValida } from './util.js';

/**
 * Registro de saída (mesmos nomes das colunas do banco):
 * { id, placa, lacre, observacao, status: 'pendente'|'liberado'|'cancelado',
 *   criado_em, criado_por_nome, saida_em, saida_por_nome,
 *   cancelado_em, cancelado_por_nome, motivo_cancelamento }
 * Perfil: { nome, papel: 'balança'|'portaria'|'admin' }
 */

function validarNovo({ placa, lacre }) {
  const p = normalizarPlaca(placa);
  if (!placaValida(p)) throw new Error('Placa inválida. Use ABC1234 ou ABC1D23.');
  const l = String(lacre || '').trim();
  if (!l) throw new Error('Informe o lacre.');
  if (l.length > 40) throw new Error('Lacre muito longo (máximo 40 caracteres).');
  return { placa: p, lacre: l };
}

// ---------------------------------------------------------------- Supabase
function criarApiSupabase() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const traduzir = (error) => {
    if (!error) return null;
    const m = error.message || String(error);
    if (/Invalid login credentials/i.test(m)) return new Error('E-mail ou senha incorretos.');
    if (/saidas_placa_pendente/i.test(m)) return new Error('Esta placa já está aguardando saída.');
    if (/Failed to fetch|NetworkError/i.test(m)) return new Error('Sem conexão com o servidor.');
    return new Error(m);
  };
  const ok = ({ data, error }) => {
    if (error) throw traduzir(error);
    return data;
  };

  return {
    demo: false,
    async sessao() {
      const { data } = await sb.auth.getSession();
      return data.session ? { email: data.session.user.email } : null;
    },
    async entrar(email, senha) {
      ok(await sb.auth.signInWithPassword({ email: email.trim(), password: senha }));
    },
    async sair() {
      await sb.auth.signOut();
    },
    aoMudarSessao(cb) {
      sb.auth.onAuthStateChange((evento) => {
        if (evento === 'SIGNED_OUT' || evento === 'SIGNED_IN') cb();
      });
    },
    async perfil() {
      const { data: u } = await sb.auth.getUser();
      if (!u?.user) return null;
      const data = ok(await sb.from('perfis').select('nome, papel').eq('id', u.user.id).maybeSingle());
      return data;
    },
    /** status: 'pendente' | null (todos); desde: ISO para filtrar por criado_em. */
    async listar({ status = null, desde = null, ate = null } = {}) {
      let q = sb.from('saidas').select('*').order('criado_em', { ascending: false }).limit(500);
      if (status) q = q.eq('status', status);
      if (desde) q = q.gte('criado_em', desde);
      if (ate) q = q.lt('criado_em', ate);
      return ok(await q);
    },
    /** Liberados/cancelados desde uma data (pela hora da saída ou do cancelamento). */
    async finalizadosDesde(desde) {
      return ok(await sb.from('saidas').select('*')
        .or(`saida_em.gte."${desde}",cancelado_em.gte."${desde}"`)
        .order('criado_em', { ascending: false }).limit(500));
    },
    async criar(dados) {
      const { placa, lacre } = validarNovo(dados);
      const observacao = String(dados.observacao || '').trim() || null;
      return ok(await sb.from('saidas').insert({ placa, lacre, observacao }).select().single());
    },
    async registrarSaida(id, lacreConferido) {
      return ok(await sb.rpc('registrar_saida', { p_id: id, p_lacre: lacreConferido }));
    },
    async cancelar(id, motivo) {
      return ok(await sb.rpc('cancelar_saida', { p_id: id, p_motivo: motivo || null }));
    },
    /** Chama cb a cada mudança na tabela (Realtime). Devolve função para parar. */
    assinar(cb) {
      const canal = sb.channel('saidas-mudancas')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'saidas' }, () => cb())
        .subscribe();
      return () => sb.removeChannel(canal);
    },
  };
}

// ---------------------------------------------------------- Demonstração
function criarApiDemo() {
  const CHAVE = 'csmi-demo-v1';
  const USUARIOS = {
    'balanca@demo': { nome: 'Balança (demo)', papel: 'balança' },
    'portaria@demo': { nome: 'Portaria (demo)', papel: 'portaria' },
    'admin@demo': { nome: 'Admin (demo)', papel: 'admin' },
  };
  const ouvintes = new Set();
  const ouvintesSessao = new Set();

  const ler = () => {
    try { return JSON.parse(localStorage.getItem(CHAVE)) || { seq: 0, saidas: [], email: null }; }
    catch { return { seq: 0, saidas: [], email: null }; }
  };
  const gravar = (db) => {
    try { localStorage.setItem(CHAVE, JSON.stringify(db)); } catch { /* modo privado */ }
    ouvintes.forEach((f) => f());
  };
  // Outra aba mexeu nos dados: avisa as telas desta aba também.
  window.addEventListener('storage', (e) => { if (e.key === CHAVE) ouvintes.forEach((f) => f()); });

  const usuario = () => USUARIOS[ler().email] || null;
  const exigir = (...papeis) => {
    const u = usuario();
    if (!u) throw new Error('Sessão expirada. Entre de novo.');
    if (!papeis.includes(u.papel) && u.papel !== 'admin') throw new Error('Seu usuário não tem permissão para isso.');
    return u;
  };

  return {
    demo: true,
    async sessao() { const e = ler().email; return e ? { email: e } : null; },
    async entrar(email) {
      const e = email.trim().toLowerCase();
      if (!USUARIOS[e]) throw new Error('No modo demonstração use balanca@demo, portaria@demo ou admin@demo.');
      const db = ler(); db.email = e; gravar(db);
      ouvintesSessao.forEach((f) => f());
    },
    async sair() { const db = ler(); db.email = null; gravar(db); ouvintesSessao.forEach((f) => f()); },
    aoMudarSessao(cb) { ouvintesSessao.add(cb); },
    async perfil() { return usuario(); },
    async listar({ status = null, desde = null, ate = null } = {}) {
      return ler().saidas
        .filter((s) => (!status || s.status === status)
          && (!desde || s.criado_em >= desde) && (!ate || s.criado_em < ate))
        .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    },
    async finalizadosDesde(desde) {
      return ler().saidas
        .filter((s) => (s.saida_em && s.saida_em >= desde) || (s.cancelado_em && s.cancelado_em >= desde))
        .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    },
    async criar(dados) {
      const u = exigir('balança');
      const { placa, lacre } = validarNovo(dados);
      const db = ler();
      if (db.saidas.some((s) => s.placa === placa && s.status === 'pendente')) {
        throw new Error('Esta placa já está aguardando saída.');
      }
      const novo = {
        id: ++db.seq, placa, lacre, observacao: String(dados.observacao || '').trim() || null,
        status: 'pendente', criado_em: new Date().toISOString(), criado_por_nome: u.nome,
        saida_em: null, saida_por_nome: null, cancelado_em: null, cancelado_por_nome: null,
        motivo_cancelamento: null,
      };
      db.saidas.push(novo); gravar(db);
      return novo;
    },
    async registrarSaida(id, lacreConferido) {
      const u = exigir('portaria');
      const db = ler();
      const s = db.saidas.find((x) => x.id === id);
      if (!s) throw new Error('Registro não encontrado.');
      if (s.status !== 'pendente') throw new Error('Este veículo não está mais aguardando saída.');
      if (normalizarLacre(s.lacre) !== normalizarLacre(lacreConferido)) {
        throw new Error('Lacre não confere. Confira o lacre ou chame a balança.');
      }
      Object.assign(s, { status: 'liberado', saida_em: new Date().toISOString(), saida_por_nome: u.nome });
      gravar(db);
      return s;
    },
    async cancelar(id, motivo) {
      const u = exigir('balança');
      const db = ler();
      const s = db.saidas.find((x) => x.id === id);
      if (!s) throw new Error('Registro não encontrado.');
      if (s.status !== 'pendente') throw new Error('Só dá para cancelar o que ainda aguarda saída.');
      Object.assign(s, {
        status: 'cancelado', cancelado_em: new Date().toISOString(),
        cancelado_por_nome: u.nome, motivo_cancelamento: motivo || null,
      });
      gravar(db);
      return s;
    },
    assinar(cb) { ouvintes.add(cb); return () => ouvintes.delete(cb); },
  };
}

export const api = MODO_DEMO ? criarApiDemo() : criarApiSupabase();
