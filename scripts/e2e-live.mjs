#!/usr/bin/env node
// Two phones playing a live challenge through the real relay: lobby gate, shot clock, timeout,
// pause when a player drops out, ready-up between holes, final scores and a rematch.
// Usage: node scripts/e2e-live.mjs [baseUrl] [outDir]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const OUT = process.argv[3] ?? 'screenshots/live';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let shot = 0;
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

async function snap(page, name, full = false) {
  const file = join(OUT, `${String(++shot).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  log('📸', file);
}

async function phone(browser, label) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'share', { value: async (d) => void (window.__shared = d), configurable: true });
  });
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${label} console: ${m.text()}`));
  return page;
}

async function tapText(page, text, { selector = 'button', timeout = 15000 } = {}) {
  const h = await page.waitForFunction(
    (sel, t) => [...document.querySelectorAll(sel)].find((b) => b.textContent.trim().toLowerCase().includes(t.toLowerCase()) && !b.disabled),
    { timeout },
    selector,
    text,
  );
  const el = h.asElement();
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await sleep(100);
  await el.tap();
}

const waitText = (page, text, timeout = 20000) =>
  page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, text);

async function pick(page, query) {
  await page.waitForSelector('.search input', { timeout: 20000 });
  await page.tap('.search input');
  await page.type('.search input', query, { delay: 30 });
  await sleep(250);
  if (await page.$('.suggestions li')) await page.tap('.suggestions li');
  else {
    await page.type('.search input', 'zzqq');
    await page.waitForSelector('.sugg-anyway');
    await page.tap('.sugg-anyway');
  }
  await tapText(page, 'Take the shot');
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
try {
  // Host opens a room with the quick 30s clock and 3 holes.
  const A = await phone(browser, 'A');
  await A.goto(BASE, { waitUntil: 'networkidle0' });
  await snap(A, 'home', true);
  await tapText(A, 'Live', { selector: '.mode' });
  await A.waitForSelector('.name-row input');
  await A.type('.name-row input', 'Hanif');
  await tapText(A, '30s');
  await snap(A, 'setup', true);
  await tapText(A, 'Open the room');
  await waitText(A, 'Get your mates in');
  await waitText(A, 'Need 1 more player');
  await snap(A, 'lobby-alone', true);
  const startDisabled = await A.evaluate(() => [...document.querySelectorAll('.sticky-cta button')].every((b) => b.disabled));
  if (!startDisabled) throw new Error('Host could start alone');
  await tapText(A, 'Send the invite');
  await sleep(300);
  const invite = await A.evaluate(() => window.__shared);
  log('invite:', invite.text, invite.url);

  // Guest opens the link and joins.
  const B = await phone(browser, 'B');
  await B.goto(invite.url, { waitUntil: 'networkidle0' });
  await waitText(B, "Hanif's room");
  await snap(B, 'guest-invite', true);
  await B.type('#join-name', 'Jay');
  await tapText(B, 'Join the room');
  await waitText(B, 'Waiting for Hanif to tee off');
  await snap(B, 'guest-lobby', true);
  await tapText(A, 'Tee off · 2 players', { timeout: 20000 });
  log('teed off');

  // Hole 1: both pick; the hole closes as soon as both are in.
  await A.waitForSelector('.shot-clock');
  await B.waitForSelector('.shot-clock');
  await snap(B, 'hole1-guest');
  await pick(A, 'ar');
  await A.waitForSelector('.locked-note');
  await A.waitForSelector('.tb.is-thinking');
  await snap(A, 'hole1-host-locked');
  await pick(B, 'ch');
  await waitText(A, 'Ready for hole 2', 20000);
  await waitText(B, 'Ready for hole 2', 20000);
  await snap(B, 'reveal1-guest', true);
  await tapText(A, 'Ready for hole 2');
  await waitText(A, 'Waiting for Jay');
  await snap(A, 'reveal1-host-waiting');
  await tapText(B, 'Ready for hole 2');
  log('hole 2');

  // Hole 2: Jay's phone drops out. The clock pauses for Hanif; when Jay is back it resumes.
  await A.waitForSelector('.search input', { timeout: 20000 });
  await B.waitForSelector('.search input', { timeout: 20000 });
  const roomUrl = B.url();
  await B.goto('about:blank');
  await A.waitForSelector('.shot-clock.is-paused', { timeout: 30000 });
  await snap(A, 'hole2-paused');
  log('paused while Jay is away');
  await B.goto(roomUrl, { waitUntil: 'networkidle0' });
  await A.waitForFunction(() => !document.querySelector('.shot-clock.is-paused'), { timeout: 30000 });
  log('resumed');
  // Hanif picks, Jay lets the clock run out.
  await pick(A, 'ma');
  await B.waitForSelector('.shot-clock.is-low', { timeout: 45000 });
  await snap(B, 'hole2-low-clock');
  await waitText(B, 'Ready for hole 3', 45000);
  await B.waitForFunction(() => [...document.querySelectorAll('.m-bubble .m-ob-tag')].some((t) => t.textContent.trim() === '⏱'));
  await snap(B, 'reveal2-timed-out', true);
  log('Jay timed out');
  // Hanif's ready; Jay's still staring at the list. The host can skip the wait.
  await tapText(A, 'Ready for hole 3');
  await snap(A, 'reveal2-host-skip');
  await tapText(A, 'Start hole 3 now');

  // Hole 3: Jay chooses an answer but never taps "Take the shot". The buzzer locks it in for him.
  await pick(A, 'li');
  await B.waitForSelector('.search input', { timeout: 20000 });
  await B.tap('.search input');
  await B.type('.search input', 'sa', { delay: 30 });
  await sleep(250);
  if (await B.$('.suggestions li')) await B.tap('.suggestions li');
  else {
    await B.type('.search input', 'zzqq');
    await B.waitForSelector('.sugg-anyway');
    await B.tap('.sugg-anyway');
  }
  await snap(B, 'hole3-guest-chosen');
  await waitText(A, 'Final scores', 45000);
  await snap(A, 'reveal3-autolocked', true);
  await snap(B, 'reveal3-guest', true);
  const timedOut = await A.evaluate(() => [...document.querySelectorAll('.m-bubble .m-ob-tag')].some((t) => t.textContent.trim() === '⏱'));
  if (timedOut) throw new Error('Chosen answer was not auto-locked at the buzzer');
  log('auto-locked at the buzzer');
  await tapText(A, 'Final scores');
  await tapText(B, 'Final scores');
  await waitText(A, 'Full time', 20000);
  await waitText(B, 'Waiting for Hanif to start a rematch', 20000);
  await snap(A, 'final-host', true);
  await snap(B, 'final-guest', true);

  // Rematch pulls everyone straight into a new round.
  await tapText(A, 'Rematch');
  await B.waitForSelector('.search input', { timeout: 20000 });
  await snap(B, 'rematch-hole1');
  log('rematch started');

  // Home shows the room.
  await A.goto(BASE, { waitUntil: 'networkidle0' });
  await A.waitForFunction(() => [...document.querySelectorAll('.recent-row')].some((r) => /live/i.test(r.innerText) && /hole 1/i.test(r.innerText)), { timeout: 20000 });
  await snap(A, 'home-with-room', true);
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\nErrors seen:\n' + errors.join('\n'));
  process.exit(1);
}
log('No page errors.');
