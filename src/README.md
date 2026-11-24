# src/

| Arquivo | Conteúdo |
|---|---|
| `main.js` | Entrada: sessão → perfil → tela. Monta o topo (nome, papel, Sair e, para admin, abas Balança/Portaria/Usuários) |
| `api.js` | Camada de dados com a mesma interface em duas versões: Supabase (produção) e demonstração (`localStorage`). As telas só usam este módulo |
| `config.js` | URL e chave anon do Supabase (por `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`). Vazio = modo demonstração |
| `util.js` | Placa (normalizar, validar, formatar), lacre (normalizar), datas, escape de HTML, aviso flutuante, `ehApp()` |
| `style.css` | Estilo das três telas; tokens de cor em `:root` |
| `telas/` | Telas de login, balança, portaria e usuários |
