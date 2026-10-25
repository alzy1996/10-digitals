// Renders the PWA PNG icons from the brand mark with the pre-installed Playwright Chromium.
// Usage: node scripts/make-icons.cjs
const { chromium } = require('playwright');
const path = require('node:path');

const mark = (size, pad) => `<!doctype html><html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${pad ? 0 : 14}" fill="#5B2A4D"/>
  <g transform="${pad ? 'translate(12.8 12.8) scale(0.6)' : ''}">
    <path d="M24 12c-4 10 2 16 9 22s9 12 5 18" fill="none" stroke="#FBF8F4" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M33 11c-3 8 1 13 6 18s7 10 4 16" fill="none" stroke="#B76E62" stroke-width="2.2" stroke-linecap="round"/>
  </g>
</svg></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const out = path.join(__dirname, '..', 'public', 'icons');
  for (const [name, size, pad] of [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['icon-maskable-512.png', 512, true],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(mark(size, pad));
    await page.locator('svg').screenshot({ path: path.join(out, name), omitBackground: true });
  }
  await browser.close();
  console.log('icons written to', out);
})();
