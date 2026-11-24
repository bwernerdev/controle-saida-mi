# .github/workflows/

- `pages.yml`: a cada push em `main` (ou manual), `npm ci` + `npm run build` com as variáveis `SUPABASE_URL`/`SUPABASE_ANON_KEY` do repositório e publica `dist/` no GitHub Pages.
- `apk.yml`: a cada push em `main` que mexa no app (ou manual), monta o APK com Node 24, Java 21 e o Android SDK que já vem no `ubuntu-latest` (a action `setup-android@v3` quebrou pedindo o pacote `tools`), assina com a chave do segredo `ANDROID_KEYSTORE_B64` (senha em `ANDROID_KEYSTORE_PASSWORD`), confere a assinatura com `apksigner` e cria a Release `v1.0.<run>` com o arquivo `Controle-de-Saida-MI-1.0.<run>.apk`. O `versionCode` do Android é o número do run, para cada APK instalar por cima do anterior.
