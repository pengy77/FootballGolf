#!/usr/bin/env node
// Builds one list per finished season of each top-five league: the final table, in official finishing order.
// Writes data/categories/<league>-<yyyy>-<yy>.json, e.g. premier-league-2015-16.json.
//
// Usage:
//   node scripts/build-season-tables.mjs           # build from the Wikipedia cache (fetches only what's missing)
//   node scripts/build-season-tables.mjs --refresh # re-download every season page
//   node scripts/build-season-tables.mjs --check   # after build-entities.mjs: confirm every club linked to the club Wikipedia names
//
// Then run `node scripts/build-entities.mjs`, this script with --check, and `npm run validate`.
//
// Source: each season's article on English Wikipedia (CC BY-SA). Each club's Wikidata id comes from the article
// the table links to, so "Brest" or "Ajaccio" can't be matched to the wrong club. Raw pages are cached in
// .cache/wikipedia/ (git-ignored).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catDir = join(root, 'data', 'categories');
const cacheDir = join(root, '.cache', 'wikipedia');
const REFRESH = process.argv.includes('--refresh');
const CHECK = process.argv.includes('--check');

/** First season to include (2010 = 2010–11). Older seasons are too obscure to be fun. */
const FIRST = 2010;
/** Last finished season: a season ends by June, so from July the one that started last year is complete. */
const now = new Date();
const LAST = now.getUTCMonth() >= 6 ? now.getUTCFullYear() - 1 : now.getUTCFullYear() - 2;

const LEAGUES = [
  { key: 'premier-league', name: 'Premier League', tags: ['premier-league', 'clubs', 'seasons'] },
  { key: 'la-liga', name: 'La Liga', tags: ['europe', 'clubs', 'seasons'] },
  { key: 'serie-a', name: 'Serie A', tags: ['europe', 'clubs', 'seasons'] },
  { key: 'bundesliga', name: 'Bundesliga', tags: ['europe', 'clubs', 'seasons'] },
  { key: 'ligue-1', name: 'Ligue 1', tags: ['europe', 'clubs', 'seasons'] },
];

const UA = 'FootballGolfDataBuilder/1.0 (open-source football quiz; data build script)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const seasonLabel = (y) => `${y}–${String((y + 1) % 100).padStart(2, '0')}`;
const decode = (s) =>
  s
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
/** Cell HTML → plain text, without footnote markers. */
const text = (html) =>
  decode(html.replace(/<sup[\s\S]*?<\/sup>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ''))
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const num = (html) => {
  const t = text(html).replace(/[−–]/g, '-').replace(/^\+/, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new Error(`not a number: "${t}"`);
  return Number(t);
};

async function api(params) {
  const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } }).catch((e) => ({ ok: false, status: String(e), headers: new Headers() }));
    if (res.ok) return res.json();
    if (attempt >= 6) throw new Error(`Wikipedia request failed (${res.status}): ${url}`);
    // 429 = slow down: wait as long as Wikipedia asks, or back off.
    const wait = Number(res.headers.get('retry-after')) * 1000 || attempt * 15_000;
    process.stdout.write(`(${res.status}, waiting ${Math.round(wait / 1000)}s) `);
    await sleep(wait);
  }
}

async function page(title) {
  const file = join(cacheDir, `${slug(title)}.json`);
  if (!REFRESH && existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, 'utf8'));
    // The list is correct as of the day its page was fetched.
    return { ...cached, fetched: cached.fetched ?? statSync(file).mtime.toISOString().slice(0, 10) };
  }
  process.stdout.write(`  fetching ${title}… `);
  const json = await api({ action: 'parse', page: title, prop: 'text|revid', redirects: '1' });
  if (json.error) throw new Error(`${title}: ${json.error.info}`);
  const out = { title: json.parse.title, revid: json.parse.revid, fetched: new Date().toISOString().slice(0, 10), html: json.parse.text };
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, JSON.stringify(out));
  console.log('ok');
  await sleep(2500);
  return out;
}

/** Wikipedia article title → Wikidata id, following redirects. */
async function qids(titles) {
  const file = join(cacheDir, 'qids.json');
  const known = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const missing = [...new Set(titles)].filter((t) => REFRESH || !(t in known));
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    const json = await api({ action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', titles: batch.join('|') });
    const hop = new Map();
    for (const n of json.query.normalized ?? []) hop.set(n.from, n.to);
    for (const r of json.query.redirects ?? []) hop.set(r.from, r.to);
    const byTitle = new Map(json.query.pages.map((p) => [p.title, p.pageprops?.wikibase_item]));
    for (const t of batch) {
      let x = t;
      for (let k = 0; k < 3 && hop.has(x); k++) x = hop.get(x);
      known[t] = byTitle.get(x) ?? null;
    }
    await sleep(500);
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, JSON.stringify(known, null, 1));
  return known;
}

/** The final league table: the first wikitable with Pos/Team/Pld/…/Pts columns and a row per club. */
function parseTable(html, where) {
  for (const [table] of html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/g)) {
    const rows = table.split(/<tr[\s>]/).slice(1);
    const cells = (row) => [...row.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)(?=<\/t[dh]>|<t[dh]\b|$)/g)].map((m) => ({ tag: m[1], attrs: m[2], html: m[3] }));
    const head = rows.length ? cells(rows[0]).map((c) => text(c.html.replace(/<div class="navbar[\s\S]*?<\/div>/g, ''))) : [];
    const col = (name) => head.indexOf(name);
    if (['Pos', 'Team', 'Pld', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'].some((h) => col(h) < 0)) continue;
    const clubs = [];
    for (const row of rows.slice(1)) {
      const c = cells(row);
      const team = c.find((x) => x.tag === 'th' && /scope="row"/.test(x.attrs));
      if (!team) continue;
      const link = /<a href="\/wiki\/[^"]+"[^>]*? title="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(team.html);
      if (!link) throw new Error(`${where}: no club link in row "${text(team.html)}"`);
      const v = (name) => num(c[col(name)].html);
      clubs.push({
        pos: v('Pos'),
        title: decode(link[1]),
        label: text(link[2]),
        pld: v('Pld'),
        w: v('W'),
        d: v('D'),
        l: v('L'),
        gf: v('GF'),
        ga: v('GA'),
        gd: v('GD'),
        pts: v('Pts'),
      });
    }
    if (clubs.length < 16) continue;
    // "Rules for classification: 1) Points; 2) Goal difference; …" (older pages: "1st points; 2nd goal difference; …")
    // sits just after the table.
    const after = text(html.slice(html.indexOf(table) + table.length, html.indexOf(table) + table.length + 6000));
    const rules = /Rules for classification:\s*(.*?)(?:\(C\)|Notes:|Source|$)/.exec(after)?.[1] ?? '';
    return {
      clubs,
      rules: [...rules.matchAll(/(?:\d+\)|\b\d+(?:st|nd|rd|th))\s*([^;.(]+)/g)].map((m) =>
        m[1]
          .trim()
          .replace(/^number of /i, '')
          .replace(/^./, (ch) => ch.toLowerCase()),
      ),
    };
  }
  throw new Error(`${where}: no league table found`);
}

// ---------- names: reuse what other lists already call each club ----------

const lists = readdirSync(catDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(catDir, f), 'utf8')));
const curated = new Map();
for (const c of lists) {
  if (c.kind !== 'club' || c.series) continue;
  for (const it of c.items) if (it.wd && !curated.has(it.wd)) curated.set(it.wd, { name: it.name, aliases: it.aliases ?? [] });
}
const entities = new Map(JSON.parse(readFileSync(join(root, 'data', 'entities', 'clubs.json'), 'utf8')).map((e) => [e[0], { name: e[1], aliases: e[3] ?? [] }]));

// ---------- fetch + parse ----------

const seasons = [];
for (const lg of LEAGUES) {
  for (let y = FIRST; y <= LAST; y++) {
    const season = seasonLabel(y);
    const p = await page(`${season} ${lg.name}`);
    seasons.push({ lg, y, season, page: p, ...parseTable(p.html, p.title) });
  }
}
const wd = await qids(seasons.flatMap((s) => s.clubs.map((c) => c.title)));

if (CHECK) {
  let bad = 0;
  for (const s of seasons) {
    const file = join(catDir, `${s.lg.key}-${s.y}-${String((s.y + 1) % 100).padStart(2, '0')}.json`);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    s.clubs.forEach((c, i) => {
      const want = wd[c.title];
      const got = data.items[i]?.wd;
      if (want && got !== want) {
        bad++;
        console.log(`✗ ${data.id}: ${data.items[i]?.name} linked to ${got}, Wikipedia says ${want} (${c.title})`);
      } else if (!want) console.log(`! ${data.id}: ${c.title} has no Wikidata id (linked to ${got})`);
    });
  }
  console.log(bad ? `${bad} clubs linked to the wrong entity` : `✓ every club in ${seasons.length} season tables is linked to the club its table links to`);
  process.exit(bad ? 1 : 0);
}

// One display name per club across every season (the most recent table's wording), so search and reveals agree.
const label = new Map();
for (const s of seasons) for (const c of s.clubs) label.set(wd[c.title] ?? c.title, c.label);

const problems = [];
let written = 0;
for (const s of seasons) {
  const { lg, season, clubs, rules } = s;
  const where = `${season} ${lg.name}`;
  if (![18, 20].includes(clubs.length)) problems.push(`${where}: ${clubs.length} clubs`);
  const pldVaries = new Set(clubs.map((c) => c.pld)).size > 1;
  const deductions = [];
  clubs.forEach((c, i) => {
    if (c.pos !== i + 1) problems.push(`${where}: row ${i + 1} says position ${c.pos}`);
    if (c.w + c.d + c.l !== c.pld) problems.push(`${where}: ${c.label} W+D+L ≠ Pld`);
    if (c.gf - c.ga !== c.gd) problems.push(`${where}: ${c.label} GF−GA ≠ GD`);
    const adj = c.pts - (3 * c.w + c.d);
    if (adj) deductions.push({ c, adj });
  });

  const byPpg = /per game/i.test(rules[0] ?? '');
  // The first two tiebreaks make the "Level on points? Split by …" line. A play-off for the title or the last
  // relegation place ("tiebreaker for Champions team…") only settles those two spots, so it isn't one of them.
  const level = rules.slice(1).filter((r) => !/tiebreaker|play-?off/i.test(r)).slice(0, 2);
  if (!rules.length) problems.push(`${where}: no "Rules for classification" note`);
  if (!byPpg && !/^points$/i.test(rules[0] ?? 'Points')) problems.push(`${where}: first rule is "${rules[0]}"`);

  const items = clubs.map((c) => {
    const q = wd[c.title];
    const cur = q && curated.get(q);
    const name = cur?.name ?? label.get(q ?? c.title);
    const ent = q && entities.get(q);
    // Only list-side names: build-entities keeps each club's Wikidata label searchable on its own.
    const aliases = [...new Set([...(cur?.aliases ?? []), c.label].filter((a) => a && slug(a) !== slug(name)))];
    return {
      id: slug(name),
      name,
      value: c.pts,
      display: pldVaries ? `${c.pts} pts (${c.pld} played)` : `${c.pts} pts`,
      ...(aliases.length ? { aliases } : {}),
      ...(q && ent ? { wd: q } : {}),
    };
  });

  const notes = [];
  if (byPpg) notes.push('The season was stopped early, so places were decided by points per game.');
  if (deductions.length)
    notes.push(
      `Points include ${deductions.length === 1 ? 'a deduction' : 'deductions'}: ${deductions
        .map(({ c, adj }) => `${items[c.pos - 1].name} ${adj > 0 ? '+' : '−'}${Math.abs(adj)}`)
        .join(', ')}.`,
    );
  const id = `${lg.key}-${s.y}-${String((s.y + 1) % 100).padStart(2, '0')}`;
  // A word joiner after the dash keeps "2015–16" on one line in the big hole heading.
  const unbroken = season.replace('–', '–⁠');
  const cat = {
    id,
    title: `${unbroken} ${lg.name} table`,
    prompt: `club in the ${unbroken} ${lg.name} table`,
    noun: 'club',
    nounPlural: 'clubs',
    kind: 'club',
    metric: byPpg ? 'Points per game' : 'Points',
    order: 'desc',
    standings: true,
    series: `${lg.key}-table`,
    season,
    ...(level.length ? { tiebreak: level.join(', then ') } : {}),
    description: [`Final ${season} ${lg.name} table: all ${clubs.length} clubs in the order they finished.`, ...notes].join(' '),
    tags: lg.tags,
    source: {
      name: `Wikipedia: ${season} ${lg.name}`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.page.title.replace(/ /g, '_'))}#League_table`,
      asOf: s.page.fetched,
    },
    items,
  };
  const file = join(catDir, `${id}.json`);
  if (existsSync(file)) {
    const old = JSON.parse(readFileSync(file, 'utf8'));
    // build-entities.mjs owns the "wd" links once it has run.
    cat.items.forEach((it, i) => {
      if (old.items[i]?.id === it.id && old.items[i].wd) it.wd = old.items[i].wd;
    });
  }
  const out = JSON.stringify(cat, null, 2) + '\n';
  if (!existsSync(file) || readFileSync(file, 'utf8') !== out) {
    writeFileSync(file, out);
    written++;
  }
}

const noQid = seasons.flatMap((s) => s.clubs.filter((c) => !wd[c.title]).map((c) => `${s.season} ${s.lg.name}: ${c.title}`));
if (noQid.length) console.log(`! no Wikidata id for:\n  ${[...new Set(noQid)].join('\n  ')}`);
if (problems.length) console.log(`! check these:\n  ${problems.join('\n  ')}`);
console.log(`${seasons.length} season tables (${FIRST}–${LAST}), ${written} written`);
