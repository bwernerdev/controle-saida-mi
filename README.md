# Controle de Saída - MI

Painel de controle de saída de veículos. A balança cadastra **placa + lacre** no PC; a portaria confirma a saída no celular (APK Android), digitando o lacre que está no veículo.

- Painel web: https://bwernerdev.github.io/controle-saida-mi/
- APK: página de Releases do repositório (arquivo `Controle-de-Saida-MI-<versão>.apk`).

Detalhes, configuração e comandos: [CLAUDE.md](CLAUDE.md).

## Arquivos desta pasta
| Arquivo | Para que serve |
|---|---|
| `index.html` | Página única do app (carrega `src/main.js`) |
| `package.json` | Dependências e scripts (`dev`, `build`, `android:sync`) |
| `vite.config.js` | Build com caminho relativo (serve Pages e APK), porta 5190 |
| `capacitor.config.json` | Nome e id do app Android (`com.bwernerdev.controlesaidami`) |
| `.env.example` | Modelo do `.env` com URL e chave do Supabase |
| `CLAUDE.md` | Mapa do projeto, regras e passo a passo de configuração |
