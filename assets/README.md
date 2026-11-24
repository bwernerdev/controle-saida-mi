# assets/

Fontes do ícone e do splash do Android (mesmo desenho de `public/icone.svg`: placa com "MI" e seta de saída, fundo azul-escuro).

| Arquivo | Conteúdo |
|---|---|
| `gerar-icones.cjs` | Gera os PNG abaixo com `sharp` (`node assets/gerar-icones.cjs`) |
| `icon-only.png`, `icon-foreground.png`, `icon-background.png` | Ícone 1024 px (completo e em camadas para o ícone adaptativo) |
| `splash.png` | Tela de abertura 2732 px |

Depois de gerar: `npx capacitor-assets generate --android` escreve os tamanhos em `android/app/src/main/res/`.
