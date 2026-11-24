const sharp = require('sharp');
const fundo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#12305a"/></svg>';
const frente = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
 <g transform="translate(512 512) scale(9) translate(-32 -32)">
  <rect x="10" y="22" width="44" height="20" rx="4" fill="#fff"/>
  <rect x="10" y="22" width="44" height="6" rx="3" fill="#1f6feb"/>
  <text x="32" y="40" font-family="Arial, sans-serif" font-size="10" font-weight="700" text-anchor="middle" fill="#12305a">MI</text>
  <path d="M44 48h10l-4-4m4 4-4 4" stroke="#7ee2a8" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
 </g></svg>`;
const completo = fundo.replace('</svg>', frente.replace(/<svg[^>]*>/, '').replace('</svg>', '') + '</svg>');
(async () => {
  await sharp(Buffer.from(fundo)).png().toFile('assets/icon-background.png');
  await sharp(Buffer.from(frente)).png().toFile('assets/icon-foreground.png');
  await sharp(Buffer.from(completo)).png().toFile('assets/icon-only.png');
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#12305a' } })
    .composite([{ input: await sharp(Buffer.from(frente)).resize(900, 900).png().toBuffer(), gravity: 'center' }])
    .png().toFile('assets/splash.png');
  console.log('ok');
})();
