# android/

Projeto Android gerado pelo Capacitor (`npx cap add android`). Quase tudo aqui é padrão do Capacitor; mexer só quando preciso.

- `app/build.gradle`: única alteração manual. `versionCode`/`versionName` vêm de `APP_VERSION_CODE`/`APP_VERSION_NAME` (o Actions passa o número do run) e a assinatura `release` usa a chave PKCS12 apontada por `ANDROID_KEYSTORE_PATH`.
- `app/src/main/java/com/bwernerdev/controlesaidami/`: `MainActivity.java` registra o plugin local `AtualizadorPlugin.java` (autoatualização: versão instalada, liberação de "apps desconhecidos", download do APK novo e abertura do instalador).
- `app/src/main/AndroidManifest.xml`: além do padrão, pede `REQUEST_INSTALL_PACKAGES` (autoatualização).
- `app/src/main/res/`: ícones e splash gerados por `npx capacitor-assets generate --android` a partir de `../assets/`.
- `app/src/main/assets/public/`: cópia do `dist/` feita por `npx cap sync android` (fora do Git).
- Compilar local exige JDK 21 e Android SDK (não instalados nesta máquina); o APK oficial sai do workflow `apk.yml`.
