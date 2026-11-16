#!/usr/bin/env node
// Renders the app icons and the link-preview (Open Graph) image into public/.
// Usage: node scripts/make-images.mjs   (needs Google Chrome)
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const font = (pkg, file) => `data:font/woff2;base64,${readFileSync(join(root, 'node_modules/@fontsource', pkg, 'files', file)).toString('base64')}`;
const fonts = `
@font-face { font-family: Anton; src: url(${font('anton', 'anton-latin-400-normal.woff2')}); }
@font-face { font-family: BC; font-weight: 800; src: url(${font('barlow-condensed', 'barlow-condensed-latin-800-normal.woff2')}); }
@font-face { font-family: B; font-weight: 600; src: url(${font('barlow', 'barlow-latin-600-normal.woff2')}); }`;

const mark = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="30" fill="#fbf5e3" stroke="#10200f" stroke-width="3.5"/>
  <ellipse cx="32" cy="47" rx="17" ry="5" fill="#1d6b35"/>
  <ellipse cx="34" cy="47" rx="4.2" ry="1.7" fill="#10200f"/>
  <path d="M34 47V13" stroke="#10200f" stroke-width="3" stroke-linecap="round"/>
  <path d="M35.5 13.5 50 19l-14.5 5.6Z" fill="#ffd23f" stroke="#10200f" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="21" cy="40" r="6.2" fill="#fff" stroke="#10200f" stroke-width="2.5"/>
  <path d="m21 36.4 2.6 1.9-1 3h-3.2l-1-3Z" fill="#10200f"/>
</svg>`;

const pitch = `background-color:#1b6532;background-image:radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.12), transparent 65%),repeating-linear-gradient(90deg,#1b6532 0 8%,#1f7239 8% 16%);`;

const icon = (size, pad) => `<!doctype html><html><head><style>${fonts}
html,body{margin:0;width:${size}px;height:${size}px;${pitch}display:grid;place-items:center;overflow:hidden}
svg{filter:drop-shadow(0 ${size / 40}px 0 rgba(0,0,0,.35))}</style></head><body>${mark(Math.round(size * (1 - pad * 2)))}</body></html>`;

const og = `<!doctype html><html><head><style>${fonts}
html,body{margin:0;width:1200px;height:630px;overflow:hidden;${pitch}font-family:B,sans-serif;color:#fff}
.wrap{display:flex;align-items:center;gap:56px;height:100%;padding:0 80px;box-sizing:border-box}
.left{flex:1}
h1{margin:18px 0 0;font:400 120px/.9 Anton;text-transform:uppercase;text-shadow:0 7px 0 #10200f}
h1 span{display:block;color:#ffd23f}
p{margin:26px 0 0;font:600 34px/1.3 B;max-width:560px;opacity:.95}
.card{width:400px;transform:rotate(2deg);background:#fbf5e3;color:#10200f;border:5px solid #10200f;border-radius:26px;box-shadow:0 10px 0 #10200f;padding:28px 30px 32px}
.chip{display:inline-flex;gap:8px;align-items:center;background:#10200f;color:#ffd23f;border-radius:99px;padding:9px 16px;font:800 22px/1 BC;text-transform:uppercase;letter-spacing:.08em}
.n{margin-top:14px;font:400 150px/.9 Anton}.n sup{font-size:62px;vertical-align:top;line-height:1.6}
.q{margin-top:10px;font:800 40px/1.02 BC;text-transform:uppercase}
.cta{display:inline-block;margin-top:34px;background:#ffd23f;color:#10200f;border:5px solid #10200f;border-radius:18px;box-shadow:0 7px 0 #10200f;padding:16px 30px;font:800 34px/1 BC;text-transform:uppercase;letter-spacing:.05em}
</style></head><body><div class="wrap"><div class="left">${mark(110)}<h1>Football <span>Golf</span></h1>
<p>Name the thing closest to the target rank. Fewest strokes wins.</p><div class="cta">Tap to play</div></div>
<div class="card"><span class="chip">⚑ Hole 1</span><div class="n">42<sup>nd</sup></div><div class="q">most Champions League match wins</div></div></div></body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
async function render(html, w, h, out) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(root, 'public', out), type: 'png' });
  console.log('wrote public/' + out);
}
await render(icon(180, 0.1), 180, 180, 'apple-touch-icon.png');
await render(icon(192, 0.08), 192, 192, 'icon-192.png');
await render(icon(512, 0.08), 512, 512, 'icon-512.png');
await render(icon(512, 0.2), 512, 512, 'icon-512-maskable.png');
await render(og, 1200, 630, 'og.png');
await browser.close();
