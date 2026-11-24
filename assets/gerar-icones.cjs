// Gera os PNG do ícone e do splash do Android (rodar: node assets/gerar-icones.cjs,
// depois: npx capacitor-assets generate --android).
//
// Ícone adaptativo: o Android mostra só o miolo de 72/108 da camada da frente e alguns
// aparelhos cortam em círculo (diâmetro 66/108 ≈ 626 px de 1024). A placa ocupa ~62%
// da largura (antes eram 39% e o ícone ficava pequeno no celular).
const sharp = require('sharp');

const AZUL = '#12305a';
const fundo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${AZUL}"/></svg>`;

// Placa Mercosul estilizada: 640 x 340, centrada; faixa azul em cima, "MI" e seta de saída.
const desenhoPlaca = `
  <rect x="192" y="342" width="640" height="340" rx="44" fill="#ffffff"/>
  <path d="M236 342h552a44 44 0 0 1 44 44v40H192v-40a44 44 0 0 1 44-44z" fill="#1f6feb"/>
  <text x="440" y="618" font-family="Arial, Helvetica, sans-serif" font-size="190" font-weight="700"
        text-anchor="middle" fill="${AZUL}" letter-spacing="6">MI</text>
  <path d="M610 556h130m-46-46 46 46-46 46" stroke="#18a058" stroke-width="34" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>`;

const frente = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${desenhoPlaca}</svg>`;
const completo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${AZUL}"/>${desenhoPlaca}</svg>`;

(async () => {
  await sharp(Buffer.from(fundo)).png().toFile('assets/icon-background.png');
  await sharp(Buffer.from(frente)).png().toFile('assets/icon-foreground.png');
  await sharp(Buffer.from(completo)).png().toFile('assets/icon-only.png');
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: AZUL } })
    .composite([{ input: await sharp(Buffer.from(frente)).resize(1100, 1100).png().toBuffer(), gravity: 'center' }])
    .png().toFile('assets/splash.png');
  console.log('ok');
})();
