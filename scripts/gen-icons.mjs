// Renders the SVG sources to PNG with the preinstalled Chromium (Playwright).
// Usage: npm run icons
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const out = [
  ['scripts/icon.svg', 'public/icons/icon-192.png', 192],
  ['scripts/icon.svg', 'public/icons/icon-512.png', 512],
  ['scripts/icon-maskable.svg', 'public/icons/maskable-512.png', 512],
  ['scripts/icon.svg', 'public/apple-touch-icon.png', 180],
  ['public/favicon.svg', 'public/icons/favicon-32.png', 32],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, dest, size] of out) {
  const svg = readFileSync(src, 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: dest, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', dest);
}
await browser.close();
