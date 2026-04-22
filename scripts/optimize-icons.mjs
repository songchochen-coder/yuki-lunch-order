// One-off image optimizer for /public/snoopy/*.png
//
// These PNGs were copied from ledger-pwa at original phone-photo resolution
// (up to ~1.2 MB each), but we only display them at 22-44 CSS pixels. Resizing
// to 128 px width gives ~3x retina headroom with dramatically smaller files.
//
// Usage: node scripts/optimize-icons.mjs
// (Skips /public/icon-192.png and /public/icon-512.png because those are
// canonical PWA install icons and need their exact dimensions.)

import sharp from 'sharp';
import { readdir, stat, rename } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'public/snoopy';
const MAX_WIDTH = 128;

const files = (await readdir(DIR)).filter(f => f.toLowerCase().endsWith('.png'));
let totalBefore = 0;
let totalAfter = 0;

for (const f of files) {
  const src = join(DIR, f);
  const tmp = join(DIR, `.tmp-${f}`);
  const before = (await stat(src)).size;
  totalBefore += before;

  const meta = await sharp(src).metadata();
  // Use palette (much smaller) only for images without alpha. Images with
  // transparency lose their alpha channel when forced into an 8-bit palette
  // on some sources, so we stay full-color PNG for those — still compressed
  // hard via effort: 10.
  const usePalette = !meta.hasAlpha;

  await sharp(src)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .png({ compressionLevel: 9, effort: 10, palette: usePalette })
    .toFile(tmp);

  const after = (await stat(tmp)).size;
  totalAfter += after;

  await rename(tmp, src);
  const pct = ((1 - after / before) * 100).toFixed(1);
  const tag = usePalette ? 'palette' : 'rgba   ';
  console.log(`${f.padEnd(20)} ${tag}  ${(before / 1024).toFixed(0).padStart(5)} KB → ${(after / 1024).toFixed(0).padStart(4)} KB  (-${pct}%)`);
}

console.log('─'.repeat(56));
console.log(`TOTAL${' '.repeat(16)} ${(totalBefore / 1024).toFixed(0).padStart(5)} KB → ${(totalAfter / 1024).toFixed(0).padStart(4)} KB  (-${((1 - totalAfter / totalBefore) * 100).toFixed(1)}%)`);
