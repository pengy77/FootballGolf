#!/usr/bin/env node
// Drives the real app in mobile Chrome through every flow and saves screenshots.
// Usage: node scripts/e2e.mjs [baseUrl] [outDir] [width] [height]
// Needs a running server (npm run dev / npm run preview) and Google Chrome installed.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const OUT = process.argv[3] ?? 'screenshots';
const W = Number(process.argv[4] ?? 390);
const H = Number(process.argv[5] ?? 844);
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let shot = 0;

async function snap(page, name, full = true) {
  const file = join(OUT, `${String(++shot).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  console.log('  📸', file);
}

async function newPage(browser) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  );
  // Capture share-sheet payloads instead of opening a real share sheet.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'share', { value: async (d) => void (window.__shared = d), configurable: true });
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  return { ctx, page };
}

async function clickText(page, text, selector = 'button') {
  const handle = await page.waitForFunction(
    (sel, t) => [...document.querySelectorAll(sel)].find((b) => b.textContent.trim().toLowerCase().includes(t.toLowerCase()) && !b.disabled),
    { timeout: 8000 },
    selector,
    text,
  );
  await handle.asElement().tap();
}

// Pick the first suggestion; if nothing matches, type a longer name and play it as out of bounds.
async function pickFirst(page) {
  if (await page.$('.suggestions li')) return page.tap('.suggestions li');
  await page.type('.search input', 'zzqq');
  await page.waitForSelector('.sugg-anyway');
  await page.tap('.sugg-anyway');
}

async function playHole(page, label, query, hole) {
  await page.waitForSelector('.search input', { timeout: 8000 });
  if (hole === 0) await snap(page, `${label}-hole-${hole + 1}`, false);
  await page.tap('.search input');
  await page.type('.search input', query, { delay: 40 });
  await sleep(250);
  if (hole === 0) await snap(page, `${label}-suggestions`, false);
  await pickFirst(page);
  await sleep(300);
  if (hole === 0) await snap(page, `${label}-chosen`, false);
  await clickText(page, 'Take the shot');
  if (hole === 0) {
    // The beats of the reveal: ball in the air, landed + zoom, gap measured, answer + list, scored.
    let at = 0;
    for (const [ms, beat] of [[700, 'air'], [1500, 'zoom'], [2700, 'gap'], [3700, 'answer']]) {
      await sleep(ms - at);
      at = ms;
      await snap(page, `${label}-reveal-1-${beat}`, false);
    }
    await sleep(5000 - at);
  } else await sleep(5000);
  await snap(page, `${label}-reveal-${hole + 1}`, false);
  const btn = await page.waitForFunction(() => [...document.querySelectorAll('.sticky-cta button')].find((b) => /hole|final/i.test(b.textContent)));
  await btn.asElement().tap();
  await sleep(500);
}

async function playRound(page, label, queries) {
  for (let i = 0; i < queries.length; i++) {
    if (await page.$('.final')) break;
    await playHole(page, label, queries[i], i);
  }
  await page.waitForSelector('.final', { timeout: 8000 });
  await sleep(800);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
try {
  // --- Player A creates a challenge
  console.log('Player A: create & play');
  const A = await newPage(browser);
  await A.page.goto(BASE, { waitUntil: 'networkidle0' });
  await snap(A.page, 'home');
  await A.page.tap('.home-top [aria-label="How to play"]');
  await sleep(400);
  await snap(A.page, 'how-to', false);
  await A.page.keyboard.press('Escape');
  // Tee off on today's course: with no name saved yet, the shot button opens a name field in place.
  await A.page.tap('.cm-go');
  await A.page.waitForSelector('#daily-name');
  await A.page.type('#daily-name', 'Hanif');
  await snap(A.page, 'daily-intro');
  await clickText(A.page, 'Tee off');
  await playRound(A.page, 'A', ['st', 'ma', 'ro', 'li', 'ar']);
  await snap(A.page, 'A-final-solo');
  await clickText(A.page, 'Challenge a mate');
  await sleep(300);
  const sharedA = await A.page.evaluate(() => window.__shared);
  const shareA = sharedA.url;
  console.log('  A shared:', sharedA.text, `(link ${shareA.length} chars)`);

  // --- Player B opens the link
  console.log('Player B: join & play');
  const B = await newPage(browser);
  await B.page.goto(shareA, { waitUntil: 'networkidle0' });
  await sleep(300);
  await snap(B.page, 'B-landing');
  await B.page.type('#join-name', 'Jay');
  await clickText(B.page, 'Tee off');
  await sleep(300);
  await playRound(B.page, 'B', ['ar', 'li', 'sa', 'ch', 'ma']);
  await snap(B.page, 'B-final-h2h');
  await clickText(B.page, 'Send to Hanif');
  await sleep(300);
  const shared = await B.page.evaluate(() => window.__shared);
  console.log('  B shared:', shared?.text);

  // --- Player A opens the result link
  console.log('Player A: watch the head-to-head');
  await A.page.goto(shared.url, { waitUntil: 'networkidle0' });
  await sleep(5200);
  await snap(A.page, 'A-replay-hole-1', false);
  await clickText(A.page, 'Skip');
  await sleep(900);
  await snap(A.page, 'A-final-h2h');
  await A.page.goto(BASE, { waitUntil: 'networkidle0' });
  await snap(A.page, 'A-home-recent');
  // Today's daily is done: the top of the course shows the scores and the share button instead of a tee shot.
  await A.page.waitForFunction(() => document.querySelector('.today.is-played .ballrow') && document.querySelector('.today .share-row'));

  // --- A opens B's result in a fresh browser (e.g. Home Screen app): one tap to claim the card
  console.log('Player A: fresh browser');
  const A2 = await newPage(browser);
  await A2.page.goto(shared.url, { waitUntil: 'networkidle0' });
  await sleep(300);
  await snap(A2.page, 'A2-result-landing', false);
  await clickText(A2.page, "I'm");
  await sleep(5200);
  await snap(A2.page, 'A2-replay-hole-1', false);

  // --- Pass & play
  console.log('Pass & play');
  const L = await newPage(browser);
  await L.page.goto(`${BASE}#/new/local`, { waitUntil: 'networkidle0' });
  const inputs = await L.page.$$('.name-row input');
  await inputs[0].type('Sam');
  await inputs[1].type('Alex');
  await clickText(L.page, 'Add player');
  const inputs2 = await L.page.$$('.name-row input');
  await inputs2[2].type('Kim');
  await snap(L.page, 'local-setup');
  await clickText(L.page, 'Tee off');
  for (const [i, q] of ['ch', 'an', 'el'].entries()) {
    if (i > 0) {
      await L.page.waitForSelector('.handoff-body');
      if (i === 1) await snap(L.page, 'local-handoff', false);
      await clickText(L.page, 'show me the hole');
    }
    await L.page.waitForSelector('.search input');
    await L.page.tap('.search input');
    await L.page.type('.search input', q);
    await sleep(200);
    await pickFirst(L.page);
    await clickText(L.page, 'Take the shot');
    await sleep(400);
  }
  await sleep(6500);
  await snap(L.page, 'local-reveal-3p', false);

  // --- Bad link
  const X = await newPage(browser);
  await X.page.goto(`${BASE}#/c/garbage`, { waitUntil: 'networkidle0' });
  await sleep(200);
  await snap(X.page, 'bad-link', false);
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\nErrors seen:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nNo page errors.');
