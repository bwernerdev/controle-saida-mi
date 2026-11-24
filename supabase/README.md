# supabase/

| Arquivo | Conteúdo |
|---|---|
| `schema.sql` | Tudo do banco: tabelas `perfis` e `saidas`, índice que impede placa pendente duplicada, gatilho de cadastro, funções `registrar_saida` (confere papel, status e lacre) e `cancelar_saida`, regras RLS e Realtime. Rodar inteiro no SQL Editor; pode rodar de novo |
| `functions/` | Edge Functions publicadas no Supabase (hoje só `usuarios`, usada pela aba Usuários) |
| `usuarios.sql` | Dar, conferir ou tirar acesso de uma pessoa (papel `balança`, `portaria` ou `admin`) depois de criar o login em Authentication > Users |
