# tests/

| Arquivo | Conteúdo |
|---|---|
| `sql.test.mjs` | Roda o `supabase/schema.sql` duas vezes num Postgres em memória (PGlite), simula os papéis do Supabase (`anon`, `authenticated`, `auth.uid()`) e confere: cadastro com campos do servidor, placa pendente sem duplicar, reenvio offline pelo `id_cliente`, `registrar_saida` (papel, lacre, reenvio), `cancelar_saida` (motivo obrigatório), hora do aparelho, `apagar_historico` só com permissão e anônimo bloqueado. Rodar: `npm test` |
