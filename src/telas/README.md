# src/telas/

Cada tela recebe o elemento onde se desenha e devolve uma função que a desmonta (para assinaturas e relógios).

| Arquivo | Tela |
|---|---|
| `login.js` | E-mail e senha. No modo demonstração mostra os usuários de teste |
| `escritorio.js` | PC. Formulário "Nova saída" (placa, lacre, observação), indicadores (aguardando, saíram hoje, cancelados hoje), lista "Aguardando saída" / "Histórico" por dia, busca por placa ou lacre, cancelar pendente com motivo. Atualiza por Realtime e a cada 60 s |
| `portaria.js` | Celular. Busca por placa, fila "Aguardando saída" (mais antigo primeiro), "Saíram hoje". Tocar num veículo abre a folha "Registrar saída": digita o lacre do veículo e confirma. Atualiza por Realtime, a cada 30 s e quando o app volta para a frente |
