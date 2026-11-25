# controle-saida-mi — mapa rápido

**Controle de Saída - MI.** A balança cadastra no PC a saída de um veículo (PLACA + LACRE, observação opcional). A portaria abre o APK no celular, vê a fila "Aguardando saída", digita o lacre que está no veículo e confirma. O sistema só libera se o lacre digitado for o cadastrado (comparação sem espaços e sem diferença de maiúsculas). Uso interno da equipe, com login.

Um código só para os dois: app web (Vite, JavaScript puro, sem framework) empacotado para Android com Capacitor 8. Dados e login no Supabase.

## Pastas
| Pasta | Conteúdo |
|---|---|
| `src/` | App web: `main.js` (decide login/balança/portaria), `api.js` (dados: Supabase ou demonstração), `config.js`, `util.js`, `style.css`, `telas/` |
| `supabase/` | `schema.sql` (tabelas, funções, RLS, realtime), `usuarios.sql` (dar acesso por SQL) e `functions/usuarios/` (Edge Function da aba Usuários) |
| `tests/` | `sql.test.mjs`: regras do banco (`schema.sql`) num Postgres em memória (PGlite). Roda com `npm test` e nos dois workflows antes do build |
| `android/` | Projeto Android gerado pelo Capacitor (`npx cap add android`), com assinatura fixa em `app/build.gradle` |
| `public/` | Arquivos copiados como estão para o build (`icone.svg`) |
| `assets/` | Fontes do ícone e do splash do Android e o script que os gera |
| `.github/workflows/` | `pages.yml` (painel web no GitHub Pages) e `apk.yml` (APK numa Release) |
| `assinatura/` | **Fora do Git.** Chave do APK (`controle-saida-mi.p12`) e a senha (`senha.txt`). Perder isso impede atualizar o app instalado |

## Papéis (tabela `perfis`)
- `balança`: cadastra e cancela saídas pendentes. Tela de PC.
- `portaria`: vê pendentes e registra a saída. Tela de celular.
- `admin`: abas Balança, Portaria e Usuários no topo. No APK abre na Portaria; no PC, na Balança (depois, na última aba usada).
- Login sem linha em `perfis` não vê nada ("Usuário sem acesso").

## Aba Usuários (admin)
Cria login (nome, e-mail, papel, senha inicial com botão "Gerar"), edita nome/papel (inclui "Sem acesso", que apaga a linha de `perfis` e mantém o login), define nova senha e exclui. O admin não pode tirar o próprio acesso nem se excluir. Login com saídas registradas não pode ser excluído (chave estrangeira em `saidas`): usar "Sem acesso".

Passa pela Edge Function `usuarios` (`supabase/functions/usuarios/index.ts`), porque criar login exige a chave secreta, que nunca vai para o site/APK. A função confere o token e o papel `admin` por conta própria ("Verify JWT" desligado no painel) e lê a chave secreta das variáveis que o Supabase injeta (`SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_SECRET_KEYS`). Publicar/atualizar: painel do Supabase > Edge Functions > Deploy a new function > Via Editor, nome `usuarios`, colar o arquivo. Sem a função publicada a aba mostra "A função "usuarios" ainda não foi publicada". Testada com Supabase simulado no Node (node 24 roda o `.ts`, trocando o import `npm:` por um stub).

Status de uma saída: `pendente` → `liberado` (portaria) ou `cancelado` (balança). Ninguém altera a tabela direto: só `insert` (balança, e o gatilho preenche autor e status) e as funções `registrar_saida` e `cancelar_saida`. Mesma placa não pode ter duas pendentes. Cancelar exige motivo (3 a 200 caracteres), conferido na tela, em `api.js`/`offline.js` (`validarMotivo`) e no banco.

## Apagar histórico
Botão "Apagar histórico" na tela da Balança (ao lado da busca), só para login com `perfis.pode_apagar_historico = true`. Essa permissão só se liga por SQL (`usuarios.sql`); nem o papel admin nem a aba Usuários dão. Por pedido do usuário (24/11/2026), está ligada só no login dele. O diálogo pede para digitar APAGAR; por padrão apaga liberados e cancelados, e a caixa "Apagar também os que estão aguardando saída" inclui os pendentes. Função `apagar_historico(p_incluir_pendentes)` no banco, com `delete` (as telas abertas recebem pelo Realtime). Precisa de internet. No modo demonstração, `admin@demo` tem a permissão.

## Modo offline (`src/offline.js`)
Fica por cima de `api.js` com a mesma interface. Guarda neste aparelho (Preferences no APK, localStorage no PC) a última lista do servidor (pendentes e finalizados do dia) e o perfil; sem rede o app abre direto na tela com o perfil guardado e mostra a cópia. Cadastro, saída e cancelamento feitos sem rede entram numa fila com a hora real (`quando`) e um id do aparelho; a saída offline confere o lacre contra a cópia local. A fila sobe em ordem no evento `online`, ao voltar o app para a frente, a cada 20 s e logo após cada registro. Reenvio é seguro: `id_cliente` único no cadastro e `registrar_saida`/`cancelar_saida` aceitam de novo o que o mesmo login já fez. O banco aceita a hora do aparelho de até 7 dias atrás (`hora_do_aparelho`), nunca antes do cadastro. Recusas (ex.: a balança cancelou enquanto a portaria estava sem rede) vão para "não aceitos" (faixa vermelha no topo, botão Ver). Sair com fila pendente pede confirmação (a fila é perdida). Com o `schema.sql` antigo no Supabase o app segue funcionando, só sem hora real/id do aparelho. No PC só funciona sem rede com a página já aberta (sem service worker). Aba Usuários: só online.
Teste no navegador: `npm run dev:demo` (porta 5191, preview `controle-saida-mi-demo`, modo demonstração pelo `.env.demo`); `window.__semRede = true` ou `sessionStorage.__semRede = '1'` (vale ao recarregar) simula a falta de rede; `dispatchEvent(new Event('online'))` faz subir a fila.

## Login salvo
O login fica salvo até a pessoa tocar em **Sair** (o refresh token do Supabase não expira; não há limite de sessão no projeto). No APK a sessão fica no armazenamento nativo (`@capacitor/preferences`, SharedPreferences), não no localStorage do WebView; a primeira abertura depois da v1.0.8 migra a sessão antiga sem deslogar. No PC fica no localStorage. Sair usa `scope: 'local'` (só aquele aparelho). No APK a renovação do token pausa em segundo plano e volta ao reabrir (`startAutoRefresh`/`stopAutoRefresh`).
Sem internet ao abrir: o supabase-js re-tenta a renovação por mais de 45 s (medido), então `api.sessao()`/`perfil()` desistem em 8 s e, se houver sessão gravada, lançam `SemConexao`; o app mostra "Sem conexão — seu login continua salvo" e reabre sozinho no evento `online`. Sessão revogada no servidor (`SIGNED_OUT` fora do botão) volta ao login. No modo dev, `window.__iniciar` existe para testes (some no build).

## Autoatualização do APK
`src/atualizador.js` (só roda no app): ao abrir, ao voltar para a frente (no máximo a cada 5 min), a cada 30 min com o app aberto e quando a rede volta, descobre a última Release; a tag `v1.0.<N>` dá o versionCode N. A tag vem do método nativo `ultimaVersao` (HEAD em `github.com/.../releases/latest`, lendo o redirecionamento 302; sem o limite de 60/h da API) e o APK de `releases/download/<tag>/Controle-de-Saida-MI-<versão>.apk`; APKs até a 1.0.10 não têm esse método e usam `api.github.com/repos/bwernerdev/controle-saida-mi/releases/latest`, que continua como reserva. Tocar em "v1.0.N" no topo do app confere na hora e mostra o resultado ou o erro. Testado em 24/11/2026: a 1.0.9 instalada à mão achou a 1.0.10 sozinha ao ser reaberta (com o app só em segundo plano a 1.0.9 conferia no máximo a cada 15 min). Se N for maior que o instalado, baixa o `.apk` da Release com barra de progresso e abre o instalador do Android (a pessoa toca em "Atualizar"). Na primeira vez pede a liberação "Instalar apps desconhecidos" (botão Liberar). Instalar sem nenhum toque não é permitido fora da Play Store/app de sistema.
O lado nativo é o plugin local `android/app/src/main/java/.../AtualizadorPlugin.java` (registrado em `MainActivity`), com `info`, `ultimaVersao`, `abrirPermissao` e `baixarEInstalar` (baixa para o cache e usa o FileProvider do Capacitor); o manifesto pede `REQUEST_INSTALL_PACKAGES`. A tela de login do APK mostra "Versão 1.0.N". APKs até a 1.0.6 não têm o atualizador: instalar a primeira versão com ele à mão. Teste no navegador: `_usarPluginDeTeste()` com um plugin simulado e `window.Capacitor.isNativePlatform = () => true`.

## Modo demonstração
Sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` no build, o app usa `localStorage` (selo amarelo "demonstração" no topo). Usuários `balanca@demo`, `portaria@demo`, `admin@demo`, qualquer senha; os criados na aba Usuários exigem a senha dada. Serve para testar a interface; dados ficam só naquele navegador.

## Comandos
- `npm install` (se o cache do npm der EEXIST/EBADF nesta máquina, usar `--cache` numa pasta nova).
- `npm run dev`: servidor em http://localhost:5190 (no app Claude: preview `controle-saida-mi` do `launch.json` da raiz). Usa o `.env`, ou seja, o Supabase de verdade.
- `npm run dev:demo`: http://localhost:5191 em modo demonstração (`.env.demo`), para testar sem mexer nos dados reais.
- `npm run build`: gera `dist/`.
- `npm test`: testa as regras do banco (cadastro, saída, cancelamento, reenvio offline, apagar histórico, anônimo). Mudou o `schema.sql`, rode antes do commit.
- `npx cap sync android`: copia `dist/` para o projeto Android (depois de cada build).
- APK: compilado pelo GitHub Actions (`apk.yml`), porque esta máquina não tem JDK nem Android SDK. Cada push em `main` que mexa no app gera a Release `v1.0.<run>` com `Controle-de-Saida-MI-1.0.<run>.apk`. Manual: Actions > "Gerar APK Android" > Run workflow.
- Ícones do Android: `node assets/gerar-icones.cjs && npx capacitor-assets generate --android`.

## Configuração no GitHub (repo bwernerdev/controle-saida-mi)
- Variáveis (Settings > Secrets and variables > Actions > Variables): `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Vazias = build em modo demonstração.
- Segredos: `ANDROID_KEYSTORE_B64` (base64 de `assinatura/controle-saida-mi.p12`) e `ANDROID_KEYSTORE_PASSWORD` (conteúdo de `assinatura/senha.txt`). Alias da chave: `controle-saida-mi`. Gravar os dois pelo **Bash**, nunca por pipe do PowerShell 5.1 (corrompe o base64): `base64 -w0 assinatura/controle-saida-mi.p12 | gh secret set ANDROID_KEYSTORE_B64 -R bwernerdev/controle-saida-mi` e `gh secret set ANDROID_KEYSTORE_PASSWORD -R bwernerdev/controle-saida-mi < assinatura/senha.txt`. SHA-256 do certificado: `5acc9446d5dc94b64500727311b7deaa81d0058c54ec406580c3f1190f4ed414`.
- Pages: build type `workflow` (publica `dist/`).

## Configurar o Supabase (uma vez)
1. Criar projeto em supabase.com (região São Paulo).
2. SQL Editor: rodar `supabase/schema.sql` inteiro.
3. Authentication > Sign In / Providers: desligar "Allow new users to sign up" (só o admin cria usuários).
4. Primeiro admin: Authentication > Users > Add user (e-mail + senha, "Auto Confirm User") e `supabase/usuarios.sql` com papel `admin`. Os demais pela aba Usuários do app.
4b. Edge Functions: publicar `supabase/functions/usuarios/index.ts` com o nome `usuarios` e "Verify JWT" desligado.
5. Project Settings > API: copiar URL e chave anon/publishable para as variáveis do GitHub (e para `.env` se quiser testar local).

## Convenções
- Textos da interface e do código em português do Brasil. Sem framework de UI. Cores por tokens CSS em `:root`, só tema claro.
- Balança pensado para PC (abaixo de 900 px vira uma coluna). Portaria pensada para celular (lista de cards, folha que sobe de baixo).
- O lacre cadastrado não aparece para a portaria: ela digita o que vê no veículo.
- Regras de lacre e placa existem duas vezes (app em `util.js`/`api.js` e banco em `schema.sql`); mudar nos dois.
- `schema.sql` pode ser rodado de novo sem perder dados (create if not exists / create or replace).
- Verificação do SQL: feita com PGlite (Postgres em WebAssembly) simulando `auth.uid()` e os papéis do Supabase.
