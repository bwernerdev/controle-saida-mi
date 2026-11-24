# supabase/

| Arquivo | Conteúdo |
|---|---|
| `schema.sql` | Tudo do banco: tabelas `perfis` e `saidas`, índice que impede placa pendente duplicada, gatilho de cadastro, funções `registrar_saida` (confere papel, status e lacre) e `cancelar_saida` (motivo obrigatório), `hora_do_aparelho` e coluna `id_cliente` (modo offline), `apagar_historico` (só login com `perfis.pode_apagar_historico`), regras RLS e Realtime. Rodar inteiro no SQL Editor; pode rodar de novo |
| `functions/` | Edge Functions publicadas no Supabase (hoje só `usuarios`, usada pela aba Usuários) |
| `usuarios.sql` | Dar, conferir ou tirar acesso de uma pessoa (papel `balança`, `portaria` ou `admin`) depois de criar o login em Authentication > Users; ligar a permissão de apagar o histórico |
