# src/

| Arquivo | Conteúdo |
|---|---|
| `main.js` | Entrada: sessão → perfil → tela. Monta o topo (nome, papel, Sair e, para admin, abas Balança/Portaria/Usuários) |
| `api.js` | Camada de dados com a mesma interface em duas versões: Supabase (produção) e demonstração (`localStorage`). As telas só usam este módulo. Também guarda a sessão de login (nativo no APK) e lança `SemConexao` quando há sessão salva mas não há rede |
| `offline.js` | Modo offline, por cima de `api.js` com a mesma interface: cópia local das listas e do perfil, fila de cadastro/saída/cancelamento feitos sem rede (com hora real e id do aparelho), envio quando a rede volta e lista do que o servidor recusou |
| `atualizador.js` | Só no APK: confere a última Release do GitHub e, se houver versão nova, baixa e abre o instalador (plugin nativo `Atualizador`). `verificarAgora()` é o toque na versão do topo |
| `config.js` | URL e chave anon do Supabase (por `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`). Vazio = modo demonstração |
| `util.js` | Placa (normalizar, validar, formatar), lacre (normalizar), validação de cadastro e do motivo de cancelamento, `SemConexao`/`ehErroDeRede`, datas, escape de HTML, aviso flutuante, `ehApp()` |
| `style.css` | Estilo das três telas; tokens de cor em `:root` |
| `telas/` | Telas de login, balança, portaria e usuários |
