-- Controle de Saída - MI: esquema do banco (Supabase / PostgreSQL).
-- Rodar inteiro no SQL Editor do projeto Supabase. Pode rodar de novo sem perder dados.
--
-- Papéis (tabela perfis):
--   balança -> cadastra placa + lacre e cancela pendentes (PC)
--   portaria   -> vê pendentes e registra a saída conferindo o lacre (APK)
--   admin      -> as duas coisas
-- Usuário logado sem linha em "perfis" não vê nada.
--
-- Nenhum usuário altera "saidas" diretamente: só insere (balança) e usa as funções
-- registrar_saida / cancelar_saida, que conferem papel, status e lacre.

-- ------------------------------------------------------------------ tabelas
create table if not exists public.perfis (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null,
  papel      text not null check (papel in ('balança', 'portaria', 'admin')),
  criado_em  timestamptz not null default now()
);

-- Migração (24/11/2026): o papel "escritorio" passou a se chamar "balança".
-- Refaz a regra de papéis e converte quem já tinha o nome antigo.
alter table public.perfis drop constraint if exists perfis_papel_check;
update public.perfis set papel = 'balança' where papel = 'escritorio';
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('balança', 'portaria', 'admin'));

create table if not exists public.saidas (
  id                  bigint generated always as identity primary key,
  placa               text not null check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  lacre               text not null check (length(btrim(lacre)) between 1 and 40),
  observacao          text check (observacao is null or length(observacao) <= 200),
  status              text not null default 'pendente'
                        check (status in ('pendente', 'liberado', 'cancelado')),
  criado_em           timestamptz not null default now(),
  criado_por          uuid references auth.users (id),
  criado_por_nome     text,
  saida_em            timestamptz,
  saida_por           uuid references auth.users (id),
  saida_por_nome      text,
  cancelado_em        timestamptz,
  cancelado_por       uuid references auth.users (id),
  cancelado_por_nome  text,
  motivo_cancelamento text
);

-- Mesma placa não pode ter duas saídas pendentes ao mesmo tempo.
create unique index if not exists saidas_placa_pendente on public.saidas (placa) where status = 'pendente';
create index if not exists saidas_criado_em on public.saidas (criado_em desc);
create index if not exists saidas_saida_em on public.saidas (saida_em desc) where saida_em is not null;

-- ------------------------------------------------------------------ funções
create or replace function public.meu_papel()
returns text language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid()
$$;

create or replace function public.meu_nome()
returns text language sql stable security definer set search_path = public as $$
  select nome from public.perfis where id = auth.uid()
$$;

-- Lacre para comparar: maiúsculas, sem espaços (mesma regra do app, util.js).
create or replace function public.normalizar_lacre(t text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(t, ''), '\s+', '', 'g'))
$$;

-- No cadastro, quem grava é o servidor: autor, status e campos de saída não vêm do app.
create or replace function public.saidas_antes_de_inserir()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.placa := upper(regexp_replace(new.placa, '[^A-Za-z0-9]', '', 'g'));
  new.lacre := btrim(new.lacre);
  new.observacao := nullif(btrim(coalesce(new.observacao, '')), '');
  new.status := 'pendente';
  new.criado_em := now();
  new.criado_por := auth.uid();
  new.criado_por_nome := public.meu_nome();
  new.saida_em := null; new.saida_por := null; new.saida_por_nome := null;
  new.cancelado_em := null; new.cancelado_por := null; new.cancelado_por_nome := null;
  new.motivo_cancelamento := null;
  return new;
end $$;

drop trigger if exists saidas_antes_de_inserir on public.saidas;
create trigger saidas_antes_de_inserir before insert on public.saidas
  for each row execute function public.saidas_antes_de_inserir();

-- Portaria registra a saída. Falha se o lacre digitado não for o cadastrado.
create or replace function public.registrar_saida(p_id bigint, p_lacre text)
returns public.saidas language plpgsql security definer set search_path = public as $$
declare
  r public.saidas;
begin
  if public.meu_papel() not in ('portaria', 'admin') or public.meu_papel() is null then
    raise exception 'Seu usuário não tem permissão para registrar saída.';
  end if;
  select * into r from public.saidas where id = p_id for update;
  if not found then
    raise exception 'Registro não encontrado.';
  end if;
  if r.status <> 'pendente' then
    raise exception 'Este veículo não está mais aguardando saída.';
  end if;
  if public.normalizar_lacre(r.lacre) <> public.normalizar_lacre(p_lacre) then
    raise exception 'Lacre não confere. Confira o lacre ou chame a balança.';
  end if;
  update public.saidas
     set status = 'liberado', saida_em = now(), saida_por = auth.uid(), saida_por_nome = public.meu_nome()
   where id = p_id
  returning * into r;
  return r;
end $$;

-- Balança cancela uma saída que ainda não aconteceu.
create or replace function public.cancelar_saida(p_id bigint, p_motivo text default null)
returns public.saidas language plpgsql security definer set search_path = public as $$
declare
  r public.saidas;
begin
  if public.meu_papel() not in ('balança', 'admin') or public.meu_papel() is null then
    raise exception 'Seu usuário não tem permissão para cancelar.';
  end if;
  select * into r from public.saidas where id = p_id for update;
  if not found then
    raise exception 'Registro não encontrado.';
  end if;
  if r.status <> 'pendente' then
    raise exception 'Só dá para cancelar o que ainda aguarda saída.';
  end if;
  update public.saidas
     set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(),
         cancelado_por_nome = public.meu_nome(), motivo_cancelamento = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = p_id
  returning * into r;
  return r;
end $$;

-- ------------------------------------------------------------------ permissões (RLS)
alter table public.perfis enable row level security;
alter table public.saidas enable row level security;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (id = auth.uid() or public.meu_papel() = 'admin');

drop policy if exists saidas_ler on public.saidas;
create policy saidas_ler on public.saidas for select to authenticated
  using (public.meu_papel() is not null);

drop policy if exists saidas_cadastrar on public.saidas;
create policy saidas_cadastrar on public.saidas for insert to authenticated
  with check (public.meu_papel() in ('balança', 'admin'));

-- Acesso pela API dado explicitamente: funciona com ou sem a opção "Grant API access
-- to new tables automatically" do projeto (o recomendado é deixá-la desligada).
-- Sem políticas de update/delete: alterações só pelas funções acima.
grant usage on schema public to authenticated;
revoke all on public.saidas from anon;
revoke all on public.perfis from anon;
revoke update, delete, truncate on public.saidas from authenticated;
revoke insert, update, delete, truncate on public.perfis from authenticated;
grant select, insert on public.saidas to authenticated;
grant select on public.perfis to authenticated;
-- service_role = chave secreta, usada só pela Edge Function "usuarios" (aba Usuários).
-- Ignora RLS, mas sem estes grants nem consegue ler perfis (projetos sem grant automático).
grant usage on schema public to service_role;
grant select, insert, update, delete on public.perfis to service_role;
grant select on public.saidas to service_role;

revoke execute on function public.registrar_saida(bigint, text) from public, anon;
revoke execute on function public.cancelar_saida(bigint, text) from public, anon;
revoke execute on function public.meu_papel() from public, anon;
revoke execute on function public.meu_nome() from public, anon;
revoke execute on function public.saidas_antes_de_inserir() from public, anon;
grant execute on function public.registrar_saida(bigint, text) to authenticated;
grant execute on function public.cancelar_saida(bigint, text) to authenticated;
grant execute on function public.meu_papel() to authenticated;
grant execute on function public.meu_nome() to authenticated;
grant execute on function public.normalizar_lacre(text) to authenticated;

-- ------------------------------------------------------------------ tempo real
-- A tela da balança e a da portaria atualizam sozinhas quando algo muda.
do $$
begin
  alter publication supabase_realtime add table public.saidas;
exception when duplicate_object then null;
end $$;
