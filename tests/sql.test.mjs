// Testa as regras do banco (supabase/schema.sql) num Postgres em memória (PGlite).
// Rodar: npm test. Simula o Supabase com os papéis anon/authenticated e auth.uid().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const BAL = '00000000-0000-0000-0000-000000000001';
const PORT = '00000000-0000-0000-0000-000000000002';
const PORT2 = '00000000-0000-0000-0000-000000000003';
const ADM = '00000000-0000-0000-0000-000000000004';

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create publication supabase_realtime;
  alter default privileges in schema public revoke execute on functions from public;
  revoke all on schema public from public;
  insert into auth.users values ('${BAL}'), ('${PORT}'), ('${PORT2}'), ('${ADM}');
`);
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
await db.exec(schema);
await db.exec(schema); // o schema precisa poder rodar de novo
await db.exec(`insert into public.perfis (id, nome, papel) values
  ('${BAL}', 'Ana', 'balança'), ('${PORT}', 'Beto', 'portaria'),
  ('${PORT2}', 'Caio', 'portaria'), ('${ADM}', 'Dono', 'admin');`);

/** Roda o SQL como o login dado; devolve as linhas ou lança o erro do banco. */
async function como(uid, sql) {
  await db.exec(`reset role; select set_config('app.uid', '${uid}', false); set role authenticated;`);
  return (await db.query(sql)).rows;
}
const novaSaida = async (placa, lacre = 'L 77', extra = '') =>
  (await como(BAL, `insert into saidas (placa, lacre${extra ? ', id_cliente' : ''})
    values ('${placa}', '${lacre}'${extra ? `, '${extra}'` : ''}) returning id`))[0].id;

test('cadastro: o servidor decide status e autor; placa pendente não duplica', async () => {
  const [r] = await como(BAL, `insert into saidas (placa, lacre, status, criado_por_nome)
    values ('ABC1D23', ' L1 ', 'liberado', 'hacker') returning status, criado_por_nome, lacre`);
  assert.deepEqual(r, { status: 'pendente', criado_por_nome: 'Ana', lacre: 'L1' });
  await assert.rejects(como(BAL, `insert into saidas (placa, lacre) values ('ABC1D23', 'L2')`));
  await assert.rejects(como(PORT, `insert into saidas (placa, lacre) values ('XYZ9999', 'L2')`));
});

test('reenvio offline com o mesmo id_cliente não cria registro duplicado', async () => {
  const u = '11111111-1111-4111-8111-111111111111';
  await novaSaida('OFF1234', 'L9', u);
  await assert.rejects(como(BAL, `insert into saidas (placa, lacre, id_cliente) values ('OFF5678', 'L9', '${u}')`));
  const [{ n }] = await como(BAL, `select count(*)::int n from saidas where id_cliente = '${u}'`);
  assert.equal(n, 1);
});

test('registrar_saida: confere lacre e papel, e o reenvio do mesmo porteiro é aceito', async () => {
  const id = await novaSaida('REG1234');
  await assert.rejects(como(BAL, `select registrar_saida(${id}, 'L77')`), /permissão/);
  await assert.rejects(como(PORT, `select registrar_saida(${id}, 'L78')`), /Lacre não confere/);
  const [r] = await como(PORT, `select status, saida_por_nome from registrar_saida(${id}, 'l77')`);
  assert.deepEqual(r, { status: 'liberado', saida_por_nome: 'Beto' });
  const [again] = await como(PORT, `select status from registrar_saida(${id}, 'L77')`);
  assert.equal(again.status, 'liberado');
  await assert.rejects(como(PORT2, `select registrar_saida(${id}, 'L77')`), /não está mais aguardando/);
});

test('cancelar_saida: motivo obrigatório, só balança/admin, reenvio aceito', async () => {
  const id = await novaSaida('CAN1234');
  await assert.rejects(como(PORT, `select cancelar_saida(${id}, 'veículo voltou')`), /permissão/);
  await assert.rejects(como(BAL, `select cancelar_saida(${id})`), /motivo/);
  await assert.rejects(como(BAL, `select cancelar_saida(${id}, '  ab ')`), /motivo/);
  const [r] = await como(BAL, `select status, motivo_cancelamento from cancelar_saida(${id}, '  lacre trocado ')`);
  assert.deepEqual(r, { status: 'cancelado', motivo_cancelamento: 'lacre trocado' });
  const [again] = await como(BAL, `select status from cancelar_saida(${id}, 'lacre trocado')`);
  assert.equal(again.status, 'cancelado');
});

test('hora do aparelho: aceita até 7 dias para trás, futuro vira agora', async () => {
  const [r] = await como(BAL, `insert into saidas (placa, lacre, criado_em)
    values ('HOR1234', '1', now() + interval '3 days')
    returning abs(extract(epoch from now() - criado_em)) < 2 as agora`);
  assert.equal(r.agora, true);
  const [v] = await como(BAL, `insert into saidas (placa, lacre, criado_em)
    values ('HOR5678', '1', now() - interval '2 hours')
    returning (now() - criado_em) > interval '119 minutes' as mantida`);
  assert.equal(v.mantida, true);
});

test('apagar_historico: só com a permissão; sem ela nada some', async () => {
  const [{ n: antes }] = await como(ADM, `select count(*)::int n from saidas`);
  await assert.rejects(como(ADM, `select apagar_historico(true)`), /permissão/);
  await assert.rejects(como(ADM, `update perfis set pode_apagar_historico = true`));
  const [{ n: depois }] = await como(ADM, `select count(*)::int n from saidas`);
  assert.equal(depois, antes);

  await db.exec(`reset role; update public.perfis set pode_apagar_historico = true where id = '${ADM}'`);
  const [{ apagar_historico: apagados }] = await como(ADM, `select apagar_historico()`);
  assert.ok(apagados > 0);
  const restantes = await como(ADM, `select distinct status from saidas`);
  assert.deepEqual(restantes.map((x) => x.status), ['pendente']);
});

test('anônimo não lê nem chama as funções', async () => {
  await db.exec('reset role; set role anon;');
  await assert.rejects(db.query('select * from public.saidas'));
  await assert.rejects(db.query(`select public.registrar_saida(1, 'x')`));
  await db.exec('reset role');
});
