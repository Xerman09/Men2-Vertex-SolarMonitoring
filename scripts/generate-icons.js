const sharp = require('sharp');
const fs = require('fs');

if (!fs.existsSync('public')) {
  fs.mkdirSync('public', { recursive: true });
}

function generateSvg(size) {
  const cornerRadius = size * 0.22;
  const strokeWidth = (size / 24) * 2;
  const sunCenter = size / 2;
  const sunRadius = size * 0.18;
  const rayInner = size * 0.27;
  const rayOuter = size * 0.38;

  const d = 0.70710678; // cos(45deg)
  const dInner = rayInner * d;
  const dOuter = rayOuter * d;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#181b24" />
      <stop offset="100%" stop-color="#0c0e14" />
    </linearGradient>
    <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Container Box matching sidebar icon button: rounded-xl, dark slate, amber border -->
  <rect x="0" y="0" width="${size}" height="${size}" rx="${cornerRadius}" fill="url(#bgGrad)" />
  <rect x="${size * 0.04}" y="${size * 0.04}" width="${size * 0.92}" height="${size * 0.92}" rx="${cornerRadius * 0.9}" fill="none" stroke="#f59e0b" stroke-width="${size * 0.04}" stroke-opacity="0.45" />
  <circle cx="${sunCenter}" cy="${sunCenter}" r="${size * 0.42}" fill="url(#sunGlow)" />

  <!-- Lucide Sun Icon in amber-500 (#f59e0b) -->
  <g stroke="#f59e0b" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <circle cx="${sunCenter}" cy="${sunCenter}" r="${sunRadius}" fill="#f59e0b" fill-opacity="0.18" />
    <!-- Vertical / Horizontal Rays -->
    <line x1="${sunCenter}" y1="${sunCenter - rayOuter}" x2="${sunCenter}" y2="${sunCenter - rayInner}" />
    <line x1="${sunCenter}" y1="${sunCenter + rayInner}" x2="${sunCenter}" y2="${sunCenter + rayOuter}" />
    <line x1="${sunCenter - rayOuter}" y1="${sunCenter}" x2="${sunCenter - rayInner}" y2="${sunCenter}" />
    <line x1="${sunCenter + rayInner}" y1="${sunCenter}" x2="${sunCenter + rayOuter}" y2="${sunCenter}" />
    <!-- Diagonal Rays -->
    <line x1="${sunCenter - dOuter}" y1="${sunCenter - dOuter}" x2="${sunCenter - dInner}" y2="${sunCenter - dInner}" />
    <line x1="${sunCenter + dInner}" y1="${sunCenter + dInner}" x2="${sunCenter + dOuter}" y2="${sunCenter + dOuter}" />
    <line x1="${sunCenter - dOuter}" y1="${sunCenter + dOuter}" x2="${sunCenter - dInner}" y2="${sunCenter + dInner}" />
    <line x1="${sunCenter + dInner}" y1="${sunCenter - dInner}" x2="${sunCenter + dOuter}" y2="${sunCenter - dOuter}" />
  </g>
</svg>`;
}

async function run() {
  const svg512 = generateSvg(512);
  fs.writeFileSync('public/icon.svg', svg512);

  await sharp(Buffer.from(generateSvg(192))).png().toFile('public/icon-192.png');
  await sharp(Buffer.from(generateSvg(512))).png().toFile('public/icon-512.png');
  await sharp(Buffer.from(generateSvg(180))).png().toFile('public/apple-touch-icon.png');
  await sharp(Buffer.from(generateSvg(32))).png().toFile('public/favicon-32x32.png');
  await sharp(Buffer.from(generateSvg(16))).png().toFile('public/favicon-16x16.png');
  
  // favicon.ico
  const icoBuf = await sharp(Buffer.from(generateSvg(32))).png().toBuffer();
  fs.writeFileSync('public/favicon.ico', icoBuf);

  // Also put a copy in src/app/icon.svg and src/app/favicon.ico so Next.js metadata route picks it up natively
  fs.writeFileSync('src/app/icon.svg', svg512);
  fs.writeFileSync('src/app/favicon.ico', icoBuf);

  console.log('App icons generated successfully!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

