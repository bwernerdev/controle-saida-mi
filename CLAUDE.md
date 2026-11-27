# controle-saida-mi — mapa rápido

**Controle de Saída - MI.** A balança cadastra no PC a saída de um veículo (PLACA + LACRE, observação opcional). A portaria abre o APK no celular, vê a fila "Aguardando saída", digita o lacre do veículo e confirma. Só libera se o lacre digitado for o cadastrado (sem espaços, sem diferença de maiúsculas). Uso interno, com login.

Um código só: app web (Vite, JS puro) empacotado para Android com Capacitor 8. Dados e login no Supabase.

## Pastas
| Pasta | Conteúdo |
|---|---|
| `src/` | `main.js` (decide login/balança/portaria), `api.js` (Supabase ou demonstração), `offline.js`, `atualizador.js`, `config.js`, `util.js`, `style.css`, `telas/` |
| `supabase/` | `schema.sql` (tabelas, funções, RLS, realtime), `usuarios.sql` (acesso por SQL), `functions/usuarios/` (Edge Function da aba Usuários) |
| `tests/` | `sql.test.mjs`: regras do banco em Postgres em memória (PGlite). `npm test`; roda nos dois workflows antes do build |
| `android/` | Projeto Capacitor (`npx cap add android`), assinatura fixa em `app/build.gradle` |
| `public/`, `assets/` | `public/`: copiado como está no build. `assets/`: fontes do ícone/splash e o script que os gera |
| `.github/workflows/` | `pages.yml` (painel web) e `apk.yml` (APK numa Release) |
| `assinatura/` | **Fora do Git.** `controle-saida-mi.p12` + `senha.txt`. Perder impede atualizar o app instalado |

## Papéis (tabela `perfis`)
- `balança`: cadastra e cancela saídas pendentes (PC).
- `portaria`: vê pendentes e registra a saída (celular).
- `admin`: abas Balança, Portaria e Usuários. APK abre na Portaria; PC na Balança (depois, na última aba usada).
- Login sem linha em `perfis`: "Usuário sem acesso".

## Saídas
- Status: `pendente` → `liberado` (portaria) ou `cancelado` (balança).
- Ninguém altera a tabela direto: só `insert` (balança; gatilho preenche autor e status) e as funções `registrar_saida` e `cancelar_saida`.
- Mesma placa não tem duas pendentes. Cancelar exige motivo de 3 a 200 caracteres (`validarMotivo` em `api.js`/`offline.js` e no banco).
- O lacre cadastrado não aparece para a portaria.

## Aba Usuários (admin)
- Cria login (nome, e-mail, papel, senha inicial com "Gerar"), edita nome/papel ("Sem acesso" apaga a linha de `perfis` e mantém o login), nova senha, exclui.
- Admin não tira o próprio acesso nem se exclui. Login com saídas registradas não pode ser excluído (FK em `saidas`): usar "Sem acesso".
- Passa pela Edge Function `usuarios` (`supabase/functions/usuarios/index.ts`): criar login exige a chave secreta, que nunca vai para site/APK. A função confere token e papel `admin` ("Verify JWT" desligado) e lê `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_SECRET_KEYS`.
- Publicar: Supabase > Edge Functions > Deploy a new function > Via Editor, nome `usuarios`, colar o arquivo. Sem ela a aba mostra "A função "usuarios" ainda não foi publicada".
- Teste: Node 24 roda o `.ts` com stub no lugar do import `npm:`.

## Apagar histórico
- Botão na Balança, só para `perfis.pode_apagar_historico = true`, ligado só por SQL (`usuarios.sql`); nem admin nem a aba Usuários dão. Hoje só no login do usuário (pedido de 24/11/2026).
- Diálogo pede digitar APAGAR. Padrão apaga liberados e cancelados; a caixa "Apagar também os que estão aguardando saída" inclui pendentes. Função `apagar_historico(p_incluir_pendentes)`; precisa de internet. Na demonstração, `admin@demo` tem a permissão.

## Modo offline (`src/offline.js`)
- Por cima de `api.js`, mesma interface. Guarda no aparelho (Preferences no APK, localStorage no PC) a última lista (pendentes e finalizados do dia) e o perfil; sem rede abre direto com a cópia.
- Cadastro, saída e cancelamento sem rede vão para uma fila com a hora real (`quando`) e id do aparelho; a saída offline confere o lacre na cópia local.
- A fila sobe em ordem no evento `online`, ao voltar o app à frente, a cada 20 s e após cada registro. Reenvio seguro: `id_cliente` único; `registrar_saida`/`cancelar_saida` aceitam de novo o que o mesmo login já fez.
- Banco aceita hora do aparelho até 7 dias atrás (`hora_do_aparelho`), nunca antes do cadastro.
- Recusas (ex.: balança cancelou enquanto a portaria estava offline) vão para "não aceitos" (faixa vermelha, botão Ver). Sair com fila pendente pede confirmação (a fila é perdida).
- `schema.sql` antigo no Supabase: app funciona, sem hora real/id do aparelho.
- PC: só funciona sem rede com a página já aberta (sem service worker). Aba Usuários: só online.
- Teste: `npm run dev:demo`; `window.__semRede = true` ou `sessionStorage.__semRede = '1'` simula sem rede; `dispatchEvent(new Event('online'))` sobe a fila.

## Login salvo
- Fica salvo até tocar em **Sair** (refresh token não expira; sem limite de sessão). Sair usa `scope: 'local'`.
- APK: sessão em `@capacitor/preferences` (não no localStorage do WebView; a v1.0.8 migra a antiga). PC: localStorage. No APK a renovação do token pausa em segundo plano (`startAutoRefresh`/`stopAutoRefresh`).
- Sem internet ao abrir: supabase-js re-tenta >45 s, então `api.sessao()`/`perfil()` desistem em 8 s e, com sessão gravada, lançam `SemConexao`: "Sem conexão — seu login continua salvo", reabre no evento `online`. Sessão revogada no servidor (`SIGNED_OUT` fora do botão) volta ao login.
- Dev: `window.__iniciar` para testes (some no build).

## Autoatualização do APK
- `src/atualizador.js` (só no app) confere a última Release ao abrir, ao voltar à frente (máx. 1 a cada 5 min), a cada 30 min e quando a rede volta. Tag `v1.0.<N>` = versionCode N.
- Tag via método nativo `ultimaVersao` (HEAD em `github.com/.../releases/latest`, lê o 302; sem o limite de 60/h da API). APK em `releases/download/<tag>/Controle-de-Saida-MI-<versão>.apk`. Até a 1.0.10 sem esse método: reserva `api.github.com/repos/bwernerdev/controle-saida-mi/releases/latest`.
- Tocar em "v1.0.N" no topo confere na hora. Se N for maior: baixa com barra de progresso e abre o instalador (a pessoa toca em "Atualizar"). Primeira vez pede "Instalar apps desconhecidos" (botão Liberar). Instalar sem toque não é permitido fora da Play Store.
- Nativo: plugin local `android/app/src/main/java/.../AtualizadorPlugin.java` (registrado em `MainActivity`): `info`, `ultimaVersao`, `abrirPermissao`, `baixarEInstalar` (cache + FileProvider do Capacitor); manifesto com `REQUEST_INSTALL_PACKAGES`. Login mostra "Versão 1.0.N".
- APKs até a 1.0.6 não têm atualizador: instalar a primeira versão com ele à mão.
- Teste no navegador: `_usarPluginDeTeste()` + `window.Capacitor.isNativePlatform = () => true`.

## Modo demonstração
Sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` no build, usa `localStorage` (selo amarelo "demonstração"). Usuários `balanca@demo`, `portaria@demo`, `admin@demo`, qualquer senha; os criados na aba Usuários exigem a senha dada. Dados só naquele navegador.

## Comandos
- `npm install` (cache do npm com EEXIST/EBADF nesta máquina: `--cache` numa pasta nova).
- `npm run dev`: http://localhost:5190, Supabase **de verdade** (`.env`). No app Claude: preview `controle-saida-mi`.
- `npm run dev:demo`: http://localhost:5191, demonstração (`.env.demo`); preview `controle-saida-mi-demo`.
- `npm run build`: gera `dist/`. `npx cap sync android` copia `dist/` para o Android (após cada build).
- `npm test`: regras do banco (cadastro, saída, cancelamento, reenvio offline, apagar histórico, anônimo). Mudou `schema.sql`: rode antes do commit.
- APK: só pelo GitHub Actions (`apk.yml`; sem JDK/Android SDK aqui). Push em `main` que mexa no app gera a Release `v1.0.<run>` com `Controle-de-Saida-MI-1.0.<run>.apk`. Manual: Actions > "Gerar APK Android" > Run workflow.
- Ícones: `node assets/gerar-icones.cjs && npx capacitor-assets generate --android`.

## GitHub (repo bwernerdev/controle-saida-mi)
- Variáveis (Settings > Secrets and variables > Actions): `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Vazias = build em demonstração.
- Segredos: `ANDROID_KEYSTORE_B64` (base64 do `.p12`) e `ANDROID_KEYSTORE_PASSWORD` (`assinatura/senha.txt`). Alias `controle-saida-mi`. Gravar pelo **Bash**, nunca por pipe do PowerShell 5.1 (corrompe o base64):
  - `base64 -w0 assinatura/controle-saida-mi.p12 | gh secret set ANDROID_KEYSTORE_B64 -R bwernerdev/controle-saida-mi`
  - `gh secret set ANDROID_KEYSTORE_PASSWORD -R bwernerdev/controle-saida-mi < assinatura/senha.txt`
- SHA-256 do certificado: `5acc9446d5dc94b64500727311b7deaa81d0058c54ec406580c3f1190f4ed414`.
- Pages: build type `workflow` (publica `dist/`).

## Configurar o Supabase (uma vez)
1. Criar projeto em supabase.com (região São Paulo).
2. SQL Editor: rodar `supabase/schema.sql` inteiro.
3. Authentication > Sign In / Providers: desligar "Allow new users to sign up".
4. Primeiro admin: Authentication > Users > Add user ("Auto Confirm User") + `supabase/usuarios.sql` com papel `admin`. Os demais, pela aba Usuários.
5. Publicar a Edge Function `usuarios` (ver Aba Usuários), "Verify JWT" desligado.
6. Project Settings > API: copiar URL e chave anon/publishable para as variáveis do GitHub (e `.env` para testar local).

## Convenções
- Interface e código em pt-BR. Sem framework de UI. Cores por tokens CSS em `:root`, só tema claro.
- Balança para PC (<900 px vira uma coluna). Portaria para celular (cards, folha que sobe de baixo).
- Regras de lacre e placa existem duas vezes (app: `util.js`/`api.js`; banco: `schema.sql`): mudar nos dois.
- `schema.sql` roda de novo sem perder dados (create if not exists / create or replace).
- SQL verificado com PGlite simulando `auth.uid()` e os papéis do Supabase.
