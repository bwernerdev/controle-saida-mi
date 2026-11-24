// Edge Function "usuarios": o admin cria, lista, altera e exclui logins pelo app web.
//
// Por que uma função: criar usuário no Supabase Auth exige a chave secreta
// (service_role / secret), que nunca pode ir para o site nem para o APK. Aqui ela
// vem das variáveis que o próprio Supabase injeta na função.
//
// Publicar: painel do Supabase > Edge Functions > Deploy a new function > Via Editor,
// nome "usuarios", colar este arquivo e publicar. Deixar "Verify JWT" desligado:
// a função confere o login sozinha (abaixo), inclusive com as chaves novas do Supabase.
//
// Toda chamada: POST com Authorization: Bearer <token do usuário logado> e corpo
// { acao: 'listar' | 'criar' | 'alterar' | 'senha' | 'excluir', ... }.
// Só quem tem papel 'admin' na tabela perfis passa.
import { createClient } from 'npm:@supabase/supabase-js@2';

const PAPEIS = ['balança', 'portaria', 'admin'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class Falha extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

function responder(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function texto(v: unknown) {
  return typeof v === 'string' ? v.trim() : '';
}

function validarPapel(papel: unknown) {
  if (!PAPEIS.includes(papel as string)) throw new Falha(400, 'Papel inválido. Use Balança, Portaria ou Administrador.');
  return papel as string;
}

function validarSenha(senha: unknown) {
  const s = typeof senha === 'string' ? senha : '';
  if (s.length < 8) throw new Falha(400, 'A senha precisa ter pelo menos 8 caracteres.');
  if (s.length > 72) throw new Falha(400, 'A senha pode ter no máximo 72 caracteres.');
  return s;
}

function traduzirErroAuth(m: string) {
  if (/already (been )?registered|already exists/i.test(m)) return 'Já existe um usuário com este e-mail.';
  if (/password/i.test(m) && /weak|short|least/i.test(m)) return 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.';
  if (/invalid.*email|email.*invalid/i.test(m)) return 'E-mail inválido.';
  return m;
}

// deno-lint-ignore no-explicit-any
type Cliente = any;

/** Monta o tratador. `criarAdmin` devolve um cliente Supabase com a chave secreta. */
export function criarTratador(criarAdmin: () => Cliente) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return responder(405, { erro: 'Use POST.' });

    try {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!token) throw new Falha(401, 'Faça login de novo.');

      const admin = criarAdmin();
      const { data: quem, error: erroQuem } = await admin.auth.getUser(token);
      if (erroQuem || !quem?.user) throw new Falha(401, 'Sessão expirada. Faça login de novo.');
      const eu = quem.user.id;

      const { data: meuPerfil, error: erroPerfil } = await admin.from('perfis').select('papel').eq('id', eu).maybeSingle();
      // Falha de leitura não é "não é admin": mostra o erro real (ex.: falta de grant ao service_role).
      if (erroPerfil) throw new Falha(500, `Não foi possível ler os perfis: ${erroPerfil.message}`);
      if (meuPerfil?.papel !== 'admin') throw new Falha(403, 'Só o administrador pode gerenciar usuários.');

      let corpo: Record<string, unknown> = {};
      try { corpo = await req.json(); } catch { throw new Falha(400, 'Corpo da requisição inválido.'); }
      const acao = corpo.acao;

      if (acao === 'listar') {
        const { data: lista, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (error) throw new Falha(500, error.message);
        const { data: perfis, error: erroPerfis } = await admin.from('perfis').select('id, nome, papel');
        if (erroPerfis) throw new Falha(500, erroPerfis.message);
        const porId = new Map((perfis ?? []).map((p: { id: string }) => [p.id, p]));
        const usuarios = (lista?.users ?? []).map((u: Record<string, unknown>) => {
          const p = porId.get(u.id as string) as { nome?: string; papel?: string } | undefined;
          return {
            id: u.id,
            email: u.email,
            nome: p?.nome ?? '',
            papel: p?.papel ?? null,
            criado_em: u.created_at,
            ultimo_acesso: u.last_sign_in_at ?? null,
            eu: u.id === eu,
          };
        }).sort((a: { nome: string; email: string }, b: { nome: string; email: string }) =>
          (a.nome || a.email || '').localeCompare(b.nome || b.email || '', 'pt-BR'));
        return responder(200, { usuarios });
      }

      if (acao === 'criar') {
        const email = texto(corpo.email).toLowerCase();
        const nome = texto(corpo.nome);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Falha(400, 'E-mail inválido.');
        if (!nome) throw new Falha(400, 'Informe o nome.');
        if (nome.length > 80) throw new Falha(400, 'Nome muito longo (máximo 80 caracteres).');
        const papel = validarPapel(corpo.papel);
        const senha = validarSenha(corpo.senha);

        const { data: criado, error } = await admin.auth.admin.createUser({
          email, password: senha, email_confirm: true, user_metadata: { nome },
        });
        if (error || !criado?.user) throw new Falha(400, traduzirErroAuth(error?.message ?? 'Falha ao criar usuário.'));

        const { error: erroPerfil } = await admin.from('perfis').upsert({ id: criado.user.id, nome, papel });
        if (erroPerfil) {
          // Sem perfil o login ficaria órfão: desfaz.
          await admin.auth.admin.deleteUser(criado.user.id);
          throw new Falha(500, `Usuário não criado: ${erroPerfil.message}`);
        }
        return responder(200, { id: criado.user.id });
      }

      if (acao === 'alterar') {
        const id = texto(corpo.id);
        const nome = texto(corpo.nome);
        if (!id) throw new Falha(400, 'Usuário não informado.');
        if (!nome) throw new Falha(400, 'Informe o nome.');
        if (nome.length > 80) throw new Falha(400, 'Nome muito longo (máximo 80 caracteres).');
        const papel = corpo.papel === null ? null : validarPapel(corpo.papel);
        if (id === eu && papel !== 'admin') throw new Falha(400, 'Você não pode tirar o seu próprio acesso de administrador.');

        if (papel === null) {
          const { error } = await admin.from('perfis').delete().eq('id', id);
          if (error) throw new Falha(500, error.message);
        } else {
          const { error } = await admin.from('perfis').upsert({ id, nome, papel });
          if (error) throw new Falha(500, error.message);
        }
        return responder(200, { ok: true });
      }

      if (acao === 'senha') {
        const id = texto(corpo.id);
        if (!id) throw new Falha(400, 'Usuário não informado.');
        const senha = validarSenha(corpo.senha);
        const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
        if (error) throw new Falha(400, traduzirErroAuth(error.message));
        return responder(200, { ok: true });
      }

      if (acao === 'excluir') {
        const id = texto(corpo.id);
        if (!id) throw new Falha(400, 'Usuário não informado.');
        if (id === eu) throw new Falha(400, 'Você não pode excluir o seu próprio usuário.');
        // perfis apaga junto (on delete cascade). Saídas antigas guardam o nome em texto.
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) {
          if (/foreign key|violates/i.test(error.message)) {
            throw new Falha(400, 'Este usuário tem saídas registradas. Em vez de excluir, mude o papel para "Sem acesso".');
          }
          throw new Falha(400, error.message);
        }
        return responder(200, { ok: true });
      }

      throw new Falha(400, 'Ação desconhecida.');
    } catch (e) {
      if (e instanceof Falha) return responder(e.status, { erro: e.message });
      console.error(e);
      return responder(500, { erro: 'Erro interno na função usuarios.' });
    }
  };
}

/** Chave secreta: a antiga (service_role) ou a nova (sb_secret_...), conforme o projeto. */
function chaveSecreta(): string {
  const env = (globalThis as unknown as { Deno: { env: { get(n: string): string | undefined } } }).Deno.env;
  const antiga = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (antiga) return antiga;
  try {
    const novas = JSON.parse(env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const k = novas.default ?? Object.values(novas)[0];
    if (k) return k as string;
  } catch { /* segue */ }
  throw new Error('Chave secreta do Supabase não encontrada nas variáveis da função.');
}

const D = (globalThis as unknown as { Deno?: { serve(h: (r: Request) => Promise<Response>): void; env: { get(n: string): string | undefined } } }).Deno;
if (D) {
  D.serve(criarTratador(() => createClient(D.env.get('SUPABASE_URL')!, chaveSecreta(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })));
}
