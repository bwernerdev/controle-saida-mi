# controle-saida-mi — mapa rápido

**Controle de Saída - MI.** O escritório cadastra no PC a saída de um veículo (PLACA + LACRE, observação opcional). A portaria abre o APK no celular, vê a fila "Aguardando saída", digita o lacre que está no veículo e confirma. O sistema só libera se o lacre digitado for o cadastrado (comparação sem espaços e sem diferença de maiúsculas). Uso interno da equipe, com login.

Um código só para os dois: app web (Vite, JavaScript puro, sem framework) empacotado para Android com Capacitor 8. Dados e login no Supabase.

## Pastas
| Pasta | Conteúdo |
|---|---|
| `src/` | App web: `main.js` (decide login/escritório/portaria), `api.js` (dados: Supabase ou demonstração), `config.js`, `util.js`, `style.css`, `telas/` |
| `supabase/` | `schema.sql` (tabelas, funções, RLS, realtime) e `usuarios.sql` (dar acesso a alguém) |
| `android/` | Projeto Android gerado pelo Capacitor (`npx cap add android`), com assinatura fixa em `app/build.gradle` |
| `public/` | Arquivos copiados como estão para o build (`icone.svg`) |
| `assets/` | Fontes do ícone e do splash do Android e o script que os gera |
| `.github/workflows/` | `pages.yml` (painel web no GitHub Pages) e `apk.yml` (APK numa Release) |
| `assinatura/` | **Fora do Git.** Chave do APK (`controle-saida-mi.p12`) e a senha (`senha.txt`). Perder isso impede atualizar o app instalado |

## Papéis (tabela `perfis`)
- `escritorio`: cadastra e cancela saídas pendentes. Tela de PC.
- `portaria`: vê pendentes e registra a saída. Tela de celular.
- `admin`: as duas telas, com abas no topo. No APK abre na Portaria; no PC, no Escritório.
- Login sem linha em `perfis` não vê nada ("Usuário sem acesso").

Status de uma saída: `pendente` → `liberado` (portaria) ou `cancelado` (escritório). Ninguém altera a tabela direto: só `insert` (escritório, e o gatilho preenche autor e status) e as funções `registrar_saida` e `cancelar_saida`. Mesma placa não pode ter duas pendentes.

## Modo demonstração
Sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` no build, o app usa `localStorage` (selo amarelo "demonstração" no topo). Usuários `escritorio@demo`, `portaria@demo`, `admin@demo`, qualquer senha. Serve para testar a interface; dados ficam só naquele navegador.

## Comandos
- `npm install` (se o cache do npm der EEXIST/EBADF nesta máquina, usar `--cache` numa pasta nova).
- `npm run dev`: servidor em http://localhost:5190 (no app Claude: preview `controle-saida-mi` do `launch.json` da raiz).
- `npm run build`: gera `dist/`.
- `npx cap sync android`: copia `dist/` para o projeto Android (depois de cada build).
- APK: compilado pelo GitHub Actions (`apk.yml`), porque esta máquina não tem JDK nem Android SDK. Cada push em `main` que mexa no app gera a Release `v1.0.<run>` com `Controle-de-Saida-MI-1.0.<run>.apk`. Manual: Actions > "Gerar APK Android" > Run workflow.
- Ícones do Android: `node assets/gerar-icones.cjs && npx capacitor-assets generate --android`.

## Configuração no GitHub (repo bwernerdev/controle-saida-mi)
- Variáveis (Settings > Secrets and variables > Actions > Variables): `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Vazias = build em modo demonstração.
- Segredos: `ANDROID_KEYSTORE_B64` (base64 de `assinatura/controle-saida-mi.p12`) e `ANDROID_KEYSTORE_PASSWORD` (conteúdo de `assinatura/senha.txt`). Alias da chave: `controle-saida-mi`.
- Pages: build type `workflow` (publica `dist/`).

## Configurar o Supabase (uma vez)
1. Criar projeto em supabase.com (região São Paulo).
2. SQL Editor: rodar `supabase/schema.sql` inteiro.
3. Authentication > Sign In / Providers: desligar "Allow new users to sign up" (só o admin cria usuários).
4. Authentication > Users > Add user (e-mail + senha, "Auto Confirm User") para cada pessoa; depois rodar `supabase/usuarios.sql` com o e-mail, nome e papel.
5. Project Settings > API: copiar URL e chave anon/publishable para as variáveis do GitHub (e para `.env` se quiser testar local).

## Convenções
- Textos da interface e do código em português do Brasil. Sem framework de UI. Cores por tokens CSS em `:root`, só tema claro.
- Escritório pensado para PC (abaixo de 900 px vira uma coluna). Portaria pensada para celular (lista de cards, folha que sobe de baixo).
- O lacre cadastrado não aparece para a portaria: ela digita o que vê no veículo.
- Regras de lacre e placa existem duas vezes (app em `util.js`/`api.js` e banco em `schema.sql`); mudar nos dois.
- `schema.sql` pode ser rodado de novo sem perder dados (create if not exists / create or replace).
- Verificação do SQL: feita com PGlite (Postgres em WebAssembly) simulando `auth.uid()` e os papéis do Supabase.
