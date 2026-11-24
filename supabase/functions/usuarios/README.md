# supabase/functions/usuarios/

- `index.ts`: Edge Function `usuarios`. Recebe `POST { acao, ... }` com o token do usuário logado, confere se ele é `admin` em `perfis` e, com a chave secreta do projeto, executa: `listar` (logins + nome/papel), `criar` (login confirmado + perfil; desfaz o login se o perfil falhar), `alterar` (nome/papel; `papel: null` = sem acesso), `senha` e `excluir`. Erros voltam como `{ erro: "mensagem em português" }`.

Publicar ou atualizar: painel do Supabase > Edge Functions > Deploy a new function (ou abrir `usuarios` > Code) > colar `index.ts` > Deploy. Nas configurações da função, "Verify JWT" desligado (a função valida o token sozinha).
