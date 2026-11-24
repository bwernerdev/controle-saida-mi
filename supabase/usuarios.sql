-- Dar acesso a um usuário depois de criá-lo em Authentication > Users > "Add user"
-- (marcar "Auto Confirm User"). Trocar e-mail, nome e papel e rodar no SQL Editor.
-- Papéis: 'balança', 'portaria' ou 'admin'.

insert into public.perfis (id, nome, papel)
select id, 'Nome da pessoa', 'portaria'
  from auth.users
 where email = 'pessoa@empresa.com.br'
on conflict (id) do update set nome = excluded.nome, papel = excluded.papel;

-- Conferir quem tem acesso:
-- select u.email, p.nome, p.papel from public.perfis p join auth.users u on u.id = p.id order by p.papel, p.nome;

-- Tirar o acesso (o login continua existindo, mas não vê nada):
-- delete from public.perfis where id = (select id from auth.users where email = 'pessoa@empresa.com.br');
