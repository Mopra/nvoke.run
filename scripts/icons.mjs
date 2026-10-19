// Renders the app and site icons from the logo mark. Run `pnpm icons` after
// changing the mark in apps/site/components/site/logo.tsx and
// apps/desktop/src/renderer/src/components/Logo.tsx, and commit the output.
//
// The mark is the orange keycap (logo.tsx): signal orange from
// packages/theme/field.css converted to sRGB, because icon files cannot read
// CSS variables: lifted oklch(0.74 0.19 45) at the top of the cap, deeper
// oklch(0.62 0.22 36) at its foot, a darker lip oklch(0.5 0.18 35) along the
// bottom edge, and primary-foreground oklch(0.99 0.01 60) for the glyph.
// Square ends on the strokes, the lead lit like an LED.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TOP = '#ff7b30';
const BOTTOM = '#ec3c00';
const LIP = '#b22800';
const GLYPH = '#fffaf5';

/** The mark in a 24 unit box, as in Logo.tsx. */
const mark = (color) =>
  `<path d="M7 15V11a5 5 0 0 1 10 0v4M7 16.3v3.2M17 16.3v3.2" stroke="${color}" stroke-width="3" stroke-linecap="square" fill="none"/><circle cx="12" cy="16.7" r="1.9" fill="${color}"/>`;
const glyph = mark(GLYPH);

/**
 * A tile of `tile` px inside a `canvas` px square. `radius` is a fraction of
 * the tile, and the glyph fills 62% of it like the UI. `shadow` adds the soft
 * drop shadow macOS icons carry.
 */
function svg({ canvas, tile, radius, shadow = false }) {
  const o = (canvas - tile) / 2;
  const r = tile * radius;
  const g = tile * 0.62;
  const go = o + (tile - g) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
  <defs>
    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${TOP}"/><stop offset="1" stop-color="${BOTTOM}"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.2"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="lip" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.9" stop-color="${LIP}" stop-opacity="0"/><stop offset="0.91" stop-color="${LIP}" stop-opacity="0.55"/><stop offset="1" stop-color="${LIP}" stop-opacity="0.75"/>
    </linearGradient>
    <filter id="led" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.6" flood-color="${GLYPH}" flood-opacity="0.8"/>
    </filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${canvas * 0.012}" stdDeviation="${canvas * 0.014}" flood-color="#3a1200" flood-opacity="0.32"/>
    </filter>
  </defs>
  <rect x="${o}" y="${o}" width="${tile}" height="${tile}" rx="${r}" fill="url(#fill)"${shadow ? ' filter="url(#shadow)"' : ''}/>
  <rect x="${o}" y="${o}" width="${tile}" height="${tile}" rx="${r}" fill="url(#sheen)"/>
  <rect x="${o}" y="${o}" width="${tile}" height="${tile}" rx="${r}" fill="url(#lip)"/>
  <rect x="${o + 0.5}" y="${o + 0.5}" width="${tile - 1}" height="${tile - 1}" rx="${r}" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="${Math.max(1, canvas / 512)}"/>
  <svg x="${go}" y="${go}" width="${g}" height="${g}" viewBox="0 0 24 24"><g filter="url(#led)">${glyph}</g></svg>
</svg>`;
}

const png = (source, size) => sharp(Buffer.from(source)).resize(size, size).png().toBuffer();

/** An .ico holding PNG images, which every Windows since Vista reads. */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

function write(path, data) {
  const full = resolve(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
  console.log(path);
}

// macOS: Apple's grid, an 824 px tile on a 1024 canvas with a drop shadow.
const mac = svg({ canvas: 1024, tile: 824, radius: 0.225, shadow: true });
// Windows and Linux: the tile fills more of the canvas, with no shadow.
const desk = svg({ canvas: 1024, tile: 928, radius: 0.18 });
// Favicons: the tile fills the square, the keycap's small radius like the UI's LogoMark.
const fav = svg({ canvas: 512, tile: 512, radius: 0.14 });
// Apple touch icon: full bleed, iOS rounds the corners itself.
const touch = svg({ canvas: 512, tile: 512, radius: 0 });

write('apps/desktop/build/icon.png', await png(mac, 1024));
write('apps/desktop/build/icon-desktop.png', await png(desk, 1024));
write(
  'apps/desktop/build/icon.ico',
  ico(await Promise.all([16, 24, 32, 48, 64, 128, 256].map(async (size) => ({ size, data: await png(desk, size) })))),
);
// The tray (Windows, Linux): the favicon tile, small. The macOS menu bar
// takes a template image, the bare mark in black that macOS tints itself.
// electron-vite bundles these from apps/desktop/resources.
write(
  'apps/desktop/resources/tray.ico',
  ico(await Promise.all([16, 20, 24, 32, 40, 48, 64].map(async (size) => ({ size, data: await png(fav, size) })))),
);
write('apps/desktop/resources/tray.png', await png(fav, 64));
const template = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="3 3 18 18">${mark('#000000')}</svg>`;
write('apps/desktop/resources/trayTemplate.png', await png(template, 16));
write('apps/desktop/resources/trayTemplate@2x.png', await png(template, 32));
write('apps/site/app/icon.svg', fav);
write('apps/site/app/apple-icon.png', await png(touch, 180));
write(
  'apps/site/app/favicon.ico',
  ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(fav, size) })))),
);

// The macOS DMG window: 540 by 380 points, the app at (150, 190) and the
// Applications folder at (390, 190), as electron-builder.yml places them.
// Light like Finder, with an orange aura behind the arrow. dmg-builder joins
// the @2x file into a retina tiff.
const dmg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="380" viewBox="0 0 540 380">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fdfdfe"/><stop offset="1" stop-color="#f3f4f7"/>
    </linearGradient>
    <radialGradient id="aura" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${BOTTOM}" stop-opacity="0.16"/><stop offset="1" stop-color="${BOTTOM}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="540" height="380" fill="url(#bg)"/>
  <ellipse cx="270" cy="180" rx="250" ry="150" fill="url(#aura)"/>
  <path d="M238 180h60M288 170l10 10-10 10" stroke="${BOTTOM}" stroke-opacity="0.7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <text x="270" y="334" text-anchor="middle" font-family="SF Pro Text, Helvetica Neue, Segoe UI, Arial, sans-serif" font-size="13" fill="#8a8e99">Drag nvoke to Applications</text>
</svg>`;
write('apps/desktop/build/background.png', await sharp(Buffer.from(dmg), { density: 72 }).png().toBuffer());
write('apps/desktop/build/background@2x.png', await sharp(Buffer.from(dmg), { density: 144 }).png().toBuffer());
