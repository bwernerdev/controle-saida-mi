// Conexão com o Supabase (Project Settings > API no painel do Supabase).
// A chave "anon"/"publishable" é pública por natureza: quem protege os dados são o login
// e as regras RLS de supabase/schema.sql. Nunca colocar aqui a chave "service_role".
//
// Também dá para passar por variável de ambiente no build (VITE_SUPABASE_URL e
// VITE_SUPABASE_ANON_KEY), que é como o GitHub Actions faz.
//
// Com os dois valores vazios, o app roda em MODO DEMONSTRAÇÃO: dados só neste navegador
// (localStorage), usuários escritorio@demo e portaria@demo, qualquer senha.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const MODO_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;
