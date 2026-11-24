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
    // Gestão de logins (só admin): passa pela Edge Function "usuarios", que guarda a
    // chave secreta no servidor. Ver supabase/functions/usuarios/index.ts.
    usuarios: {
      async listar() { return (await chamarUsuarios({ acao: 'listar' })).usuarios; },
      async criar(dados) { await chamarUsuarios({ acao: 'criar', ...dados }); },
      async alterar(dados) { await chamarUsuarios({ acao: 'alterar', ...dados }); },
      async senha(dados) { await chamarUsuarios({ acao: 'senha', ...dados }); },
      async excluir(dados) { await chamarUsuarios({ acao: 'excluir', ...dados }); },
    },
  };

  async function chamarUsuarios(corpo) {
    const { data, error } = await sb.functions.invoke('usuarios', { body: corpo });
    if (!error) return data;
    const status = error.context?.status;
    let msg = '';
    try { msg = (await error.context.json())?.erro || ''; } catch { /* corpo não é JSON */ }
    if (!msg && status === 404) {
      msg = 'A função "usuarios" ainda não foi publicada no Supabase (Edge Functions).';
    }
    if (!msg && error.name === 'FunctionsFetchError') {
      msg = 'Não foi possível falar com a função "usuarios". Confira a conexão e se ela foi publicada.';
    }
    throw new Error(msg || error.message);
  }
}

// ---------------------------------------------------------- Demonstração
function criarApiDemo() {
  const CHAVE = 'csmi-demo-v1';
  // Usuários de teste fixos (qualquer senha). Os criados pela aba Usuários exigem a senha dada.
  const FIXOS = [
    { id: 'demo-balanca', email: 'balanca@demo', nome: 'Balança (demo)', papel: 'balança' },
    { id: 'demo-portaria', email: 'portaria@demo', nome: 'Portaria (demo)', papel: 'portaria' },
    { id: 'demo-admin', email: 'admin@demo', nome: 'Admin (demo)', papel: 'admin' },
  ];
  const ouvintes = new Set();
  const ouvintesSessao = new Set();

  const novo = () => ({ seq: 0, saidas: [], email: null });
  const ler = () => {
    let db;
    try { db = JSON.parse(localStorage.getItem(CHAVE)) || novo(); } catch { db = novo(); }
    if (!Array.isArray(db.usuarios)) {
      const agora = new Date().toISOString();
      db.usuarios = FIXOS.map((u) => ({ ...u, senha: null, criado_em: agora, ultimo_acesso: null }));
    }
    return db;
  };
  const gravar = (db) => {
    try { localStorage.setItem(CHAVE, JSON.stringify(db)); } catch { /* modo privado */ }
    ouvintes.forEach((f) => f());
  };
  // Outra aba mexeu nos dados: avisa as telas desta aba também.
  window.addEventListener('storage', (e) => { if (e.key === CHAVE) ouvintes.forEach((f) => f()); });

  const usuario = () => {
    const db = ler();
    const u = db.usuarios.find((x) => x.email === db.email);
    return u && u.papel ? { nome: u.nome, papel: u.papel } : null;
  };
  const exigirAdmin = () => {
    const db = ler();
    const u = db.usuarios.find((x) => x.email === db.email);
    if (!u) throw new Error('Sessão expirada. Entre de novo.');
    if (u.papel !== 'admin') throw new Error('Só o administrador pode gerenciar usuários.');
    return { db, eu: u };
  };
  const validarSenha = (s) => {
    if (typeof s !== 'string' || s.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
    return s;
  };
  const PAPEIS = ['balança', 'portaria', 'admin'];
  const exigir = (...papeis) => {
    const u = usuario();
    if (!u) throw new Error('Sessão expirada. Entre de novo.');
    if (!papeis.includes(u.papel) && u.papel !== 'admin') throw new Error('Seu usuário não tem permissão para isso.');
    return u;
  };

  return {
    demo: true,
    async sessao() { const e = ler().email; return e ? { email: e } : null; },
    async entrar(email, senha) {
      const e = email.trim().toLowerCase();
      const db = ler();
      const u = db.usuarios.find((x) => x.email === e);
      if (!u) throw new Error('No modo demonstração use balanca@demo, portaria@demo ou admin@demo.');
      if (u.senha && u.senha !== senha) throw new Error('E-mail ou senha incorretos.');
      u.ultimo_acesso = new Date().toISOString();
      db.email = e; gravar(db);
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
    usuarios: {
      async listar() {
        const { db, eu } = exigirAdmin();
        return db.usuarios
          .map(({ senha, ...u }) => ({ ...u, eu: u.id === eu.id }))
          .sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR'));
      },
      async criar({ email, nome, papel, senha }) {
        const { db } = exigirAdmin();
        const e = String(email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('E-mail inválido.');
        if (!String(nome || '').trim()) throw new Error('Informe o nome.');
        if (!PAPEIS.includes(papel)) throw new Error('Papel inválido.');
        validarSenha(senha);
        if (db.usuarios.some((u) => u.email === e)) throw new Error('Já existe um usuário com este e-mail.');
        db.usuarios.push({
          id: `demo-${Date.now()}`, email: e, nome: nome.trim(), papel, senha,
          criado_em: new Date().toISOString(), ultimo_acesso: null,
        });
        gravar(db);
      },
      async alterar({ id, nome, papel }) {
        const { db, eu } = exigirAdmin();
        const u = db.usuarios.find((x) => x.id === id);
        if (!u) throw new Error('Usuário não encontrado.');
        if (!String(nome || '').trim()) throw new Error('Informe o nome.');
        if (papel !== null && !PAPEIS.includes(papel)) throw new Error('Papel inválido.');
        if (id === eu.id && papel !== 'admin') throw new Error('Você não pode tirar o seu próprio acesso de administrador.');
        u.nome = nome.trim(); u.papel = papel;
        gravar(db);
      },
      async senha({ id, senha }) {
        const { db } = exigirAdmin();
        const u = db.usuarios.find((x) => x.id === id);
        if (!u) throw new Error('Usuário não encontrado.');
        u.senha = validarSenha(senha);
        gravar(db);
      },
      async excluir({ id }) {
        const { db, eu } = exigirAdmin();
        if (id === eu.id) throw new Error('Você não pode excluir o seu próprio usuário.');
        db.usuarios = db.usuarios.filter((x) => x.id !== id);
        gravar(db);
      },
    },
  };
}

export const api = MODO_DEMO ? criarApiDemo() : criarApiSupabase();
