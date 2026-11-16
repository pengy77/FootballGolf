#!/usr/bin/env node
// Builds the search database in data/entities/ (every notable player, manager, club, stadium and nation)
// and links each list entry in data/categories/ to its entity ("wd").
//
// The pick box searches this database, not the list, so typing a name never gives away whether it's on the list.
//
// Usage:
//   node scripts/build-entities.mjs            # rebuild from the Wikidata cache (fetches only what's missing)
//   node scripts/build-entities.mjs --refresh  # re-download everything from Wikidata
//
// Source: Wikidata (CC0). Raw query results are cached in .cache/wikidata/ (git-ignored).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catDir = join(root, 'data', 'categories');
const outDir = join(root, 'data', 'entities');
const cacheDir = join(root, '.cache', 'wikidata');
const REFRESH = process.argv.includes('--refresh');

/** Minimum Wikipedia language editions for a person to be searchable: covers journeymen pros, skips amateurs. */
const PERSON_MIN_SITELINKS = 12;
const CLUB_MIN_SITELINKS = 8;
const STADIUM_MIN_SITELINKS = 5;

// ---------- helpers ----------

const SPECIAL = { ø: 'o', Ø: 'o', æ: 'ae', Æ: 'ae', ß: 'ss', ł: 'l', Ł: 'l', đ: 'd', Đ: 'd', ı: 'i', œ: 'oe', Œ: 'oe', þ: 'th', ð: 'd' };
/** Same as norm() in src/lib/search.ts. */
const norm = (s) =>
  s
    .replace(/[øØæÆßłŁđĐıœŒþð]/g, (ch) => SPECIAL[ch] ?? ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const qid = (uri) => (uri ? uri.slice(uri.lastIndexOf('/') + 1) : undefined);
/** "1987-05-04T00:00:00Z" → 1987 */
const year = (date) => Number(/^[+]?(\d{4})-/.exec(date)?.[1]) || undefined;

async function sparql(name, query, maxAttempts = 4) {
  const file = join(cacheDir, `${name}.json`);
  if (!REFRESH && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  for (let attempt = 1; ; attempt++) {
    process.stdout.write(`  fetching ${name}… `);
    const res = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/sparql-results+json',
        'User-Agent': 'FootballGolfDataBuilder/1.0 (open-source football quiz; data build script)',
      },
      body: new URLSearchParams({ query }),
    }).catch((e) => ({ ok: false, status: String(e) }));
    // A query that hits Wikidata's 60s limit can come back "200 OK" with the JSON cut off: treat that as a failure.
    const body = res.ok ? await res.text().catch(() => '') : '';
    let json;
    try {
      json = body ? JSON.parse(body) : undefined;
    } catch {
      json = undefined;
    }
    if (json) {
      const rows = json.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
      console.log(`${rows.length} rows`);
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(file, JSON.stringify(rows));
      await sleep(1500);
      return rows;
    }
    console.log(res.ok ? 'failed (timed out mid-response)' : `failed (${res.status})`);
    if (attempt >= maxAttempts) throw new Error(`Wikidata query ${name} failed`);
    await sleep(attempt * 10_000);
  }
}

const LABELS = `
  OPTIONAL { ?p rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?p rdfs:label ?mul FILTER(LANG(?mul) = "mul") }`;

async function labelsFor(name, ids) {
  const out = new Map();
  const list = [...ids].filter(Boolean);
  for (let i = 0; i < list.length; i += 400) {
    const chunk = list.slice(i, i + 400);
    const rows = await sparql(
      `${name}-${i / 400}`,
      `SELECT ?p ?en ?mul WHERE { VALUES ?p { ${chunk.map((q) => `wd:${q}`).join(' ')} } ${LABELS} }`,
    );
    for (const r of rows) if (r.en || r.mul) out.set(qid(r.p), r.en ?? r.mul);
  }
  return out;
}

// Short, familiar country names for "Spain · b. 1987" style subtitles.
const COUNTRY_FIX = {
  'United States': 'USA',
  'United States of America': 'USA',
  "People's Republic of China": 'China',
  'Kingdom of the Netherlands': 'Netherlands',
  'Kingdom of Denmark': 'Denmark',
  'Democratic Republic of the Congo': 'DR Congo',
  'Republic of the Congo': 'Congo',
  'Republic of Ireland': 'Ireland',
  "Côte d'Ivoire": 'Ivory Coast',
  'Federal Republic of Yugoslavia': 'Yugoslavia',
  'Socialist Federal Republic of Yugoslavia': 'Yugoslavia',
  'Kingdom of Yugoslavia': 'Yugoslavia',
  'Czech Republic': 'Czechia',
  'Republic of Korea': 'South Korea',
  'Korea, South': 'South Korea',
  "Democratic People's Republic of Korea": 'North Korea',
  'United Kingdom of Great Britain and Ireland': 'UK',
  'United Kingdom': 'UK',
  'Weimar Republic': 'Germany',
  'Nazi Germany': 'Germany',
  'German Reich': 'Germany',
  'German Empire': 'Germany',
  'Kingdom of Italy': 'Italy',
  'Russian Empire': 'Russia',
  'Russian Soviet Federative Socialist Republic': 'Soviet Union',
  'Kingdom of Hungary': 'Hungary',
  'Kingdom of Romania': 'Romania',
  'Second Polish Republic': 'Poland',
  'Polish People\'s Republic': 'Poland',
  'Czechoslovak Socialist Republic': 'Czechoslovakia',
  'Hungarian People\'s Republic': 'Hungary',
  'Socialist Republic of Romania': 'Romania',
  'People\'s Republic of Bulgaria': 'Bulgaria',
  'German Democratic Republic': 'East Germany',
  'Kingdom of Spain': 'Spain',
  'Kingdom of Portugal': 'Portugal',
  'First Portuguese Republic': 'Portugal',
  'Mandatory Palestine': 'Palestine',
  'State of Palestine': 'Palestine',
};
const country = (s) => (s ? (COUNTRY_FIX[s] ?? s) : '');

// "FC Bayern Munich" → "Bayern Munich", "Arsenal F.C." → "Arsenal". The full name stays searchable.
function cleanClub(label) {
  let s = label
    .replace(/\s+\((?:football club|men's football|club)\)$/i, '')
    .replace(/\s+(?:F\.C\.|FC|A\.F\.C\.|AFC|CF|C\.F\.|S\.K\.|SAD|S\.A\.D\.|J\.K\.|F\.K\.|FK|C\.D\.|CD|S\.C\.|SC|S\.A\.)$/u, '')
    .replace(/^(?:FC|AFC|F\.C\.|SL|SSC|AS|A\.S\.|SS|ACF|OGC|RC|SV|VfL|TSG|1\. FC|1\. FSV|FK|NK|HNK|GNK|PFC|KRC|KAA|RSC|SK|AC Sparta|Real Club Deportivo|RCD)\s+/u, '')
    .trim();
  if (/^AC Sparta/.test(label)) s = label.replace(/^AC /, '');
  return s.length >= 3 ? s : label;
}

// ---------- 1. Wikidata ----------

/** Who counts as a footballer/manager. Occupation alone misses people (Matthäus is only "coach" on Wikidata). */
const PERSON = {
  Q937857: ['{ ?p wdt:P106 wd:Q937857 }', '{ ?p wdt:P641 wd:Q2736; wdt:P413 [] }'],
  Q628099: ['{ ?p wdt:P106 wd:Q628099 }'],
};
const union = (parts) => parts.join(' UNION ');

async function fetchPeople(kind, occupation) {
  // Split by fame so each query stays under the 60s Wikidata limit.
  const bands = [
    [PERSON_MIN_SITELINKS, 14],
    [14, 15],
    [15, 16],
    [16, 17],
    [17, 19],
    [19, 21],
    [21, 24],
    [24, 27],
    [27, 33],
    [33, 40],
    [40, 60],
    [60, 100000],
  ];
  // A band that keeps timing out is split in half, and at a single sitelink count, into one query per criterion.
  const band = async (lo, hi, parts, tag = '') => {
    const name = `${kind}-v2-${lo}-${hi}${tag}`;
    const query = `SELECT ?p ?sl ?en ?mul ?born ?sport ?cit WHERE {
        ${union(parts)}
        ?p wikibase:sitelinks ?sl.
        FILTER(?sl >= ${lo} && ?sl < ${hi})
        ${LABELS}
        OPTIONAL { ?p wdt:P569 ?born }
        OPTIONAL { ?p wdt:P1532 ?sport }
        OPTIONAL { ?p wdt:P27 ?cit }
      }`;
    try {
      return await sparql(name, query, 2);
    } catch (e) {
      if (hi - lo > 1 && hi < 100000) {
        const mid = Math.floor((lo + hi) / 2);
        return [...(await band(lo, mid, parts, tag)), ...(await band(mid, hi, parts, tag))];
      }
      if (hi >= 100000 && lo < 200) return [...(await band(lo, lo * 2, parts, tag)), ...(await band(lo * 2, hi, parts, tag))];
      if (parts.length > 1) {
        const out = [];
        for (const [i, p] of parts.entries()) out.push(...(await band(lo, hi, [p], `-c${i}`)));
        return out;
      }
      throw e;
    }
  };
  const people = new Map();
  for (const [lo, hi] of bands) {
    const rows = await band(lo, hi, PERSON[occupation]);
    for (const r of rows) {
      const id = qid(r.p);
      const e = people.get(id) ?? { id, sl: Number(r.sl), name: r.en ?? r.mul, born: undefined, sport: undefined, cit: undefined };
      e.name ??= r.en ?? r.mul;
      if (r.born && !e.born) e.born = year(r.born);
      e.sport ??= qid(r.sport);
      e.cit ??= qid(r.cit);
      people.set(id, e);
    }
  }
  return [...people.values()].filter((e) => e.name && !/^Q\d+$/.test(e.name));
}

async function fetchClubs() {
  const rows = await sparql(
    'clubs-v2',
    `SELECT ?p ?sl ?en ?mul ?c WHERE {
      VALUES ?ct { wd:Q476028 wd:Q103229495 } ?p wdt:P31 ?ct; wikibase:sitelinks ?sl. FILTER(?sl >= ${CLUB_MIN_SITELINKS})
      ${LABELS}
      OPTIONAL { ?p wdt:P17 ?c }
    }`,
  );
  const aliasRows = await sparql(
    'club-aliases-v2',
    `SELECT ?p ?a WHERE {
      VALUES ?ct { wd:Q476028 wd:Q103229495 } ?p wdt:P31 ?ct; wikibase:sitelinks ?sl. FILTER(?sl >= ${CLUB_MIN_SITELINKS})
      ?p skos:altLabel ?a FILTER(LANG(?a) = "en")
    }`,
  );
  const clubs = new Map();
  for (const r of rows) {
    const id = qid(r.p);
    const e = clubs.get(id) ?? { id, sl: Number(r.sl), label: r.en ?? r.mul, c: undefined, aliases: [] };
    e.label ??= r.en ?? r.mul;
    e.c ??= qid(r.c);
    clubs.set(id, e);
  }
  for (const r of aliasRows) clubs.get(qid(r.p))?.aliases.push(r.a);
  return [...clubs.values()].filter((e) => e.label && !/^Q\d+$/.test(e.label));
}

async function fetchStadiums() {
  const rows = await sparql(
    'stadiums-v2',
    `SELECT ?p ?sl ?en ?mul ?city ?c ?occ WHERE {
      { ?p wdt:P31 wd:Q1154710 } UNION {
        VALUES ?st { wd:Q483110 wd:Q1049757 } ?p wdt:P31 ?st.
        { ?p wdt:P641 wd:Q2736 } UNION { VALUES ?ot { wd:Q476028 wd:Q103229495 wd:Q6979593 } ?p wdt:P466 ?o. ?o wdt:P31 ?ot }
      }
      ?p wikibase:sitelinks ?sl. FILTER(?sl >= ${STADIUM_MIN_SITELINKS})
      ${LABELS}
      OPTIONAL { ?p wdt:P131 ?city }
      OPTIONAL { ?p wdt:P17 ?c }
      OPTIONAL { ?p wdt:P466 ?occ }
    }`,
  );
  const aliasRows = await sparql(
    'stadium-aliases-v2',
    `SELECT ?p ?a WHERE {
      { ?p wdt:P31 wd:Q1154710 } UNION {
        VALUES ?st { wd:Q483110 wd:Q1049757 } ?p wdt:P31 ?st.
        { ?p wdt:P641 wd:Q2736 } UNION { VALUES ?ot { wd:Q476028 wd:Q103229495 wd:Q6979593 } ?p wdt:P466 ?o. ?o wdt:P31 ?ot }
      }
      ?p wikibase:sitelinks ?sl. FILTER(?sl >= ${STADIUM_MIN_SITELINKS})
      ?p skos:altLabel ?a FILTER(LANG(?a) = "en")
    }`,
  );
  const st = new Map();
  for (const r of rows) {
    const id = qid(r.p);
    const e = st.get(id) ?? { id, sl: Number(r.sl), label: r.en ?? r.mul, city: undefined, c: undefined, occ: new Set(), aliases: [] };
    e.label ??= r.en ?? r.mul;
    e.city ??= qid(r.city);
    e.c ??= qid(r.c);
    if (r.occ) e.occ.add(qid(r.occ));
    st.set(id, e);
  }
  for (const r of aliasRows) st.get(qid(r.p))?.aliases.push(r.a);
  return [...st.values()].filter((e) => e.label && !/^Q\d+$/.test(e.label));
}

/** Footballers/managers below the fame cut-off who are on one of our lists, looked up by exact name. */
async function fetchByName(kind, occupation, names) {
  const out = [];
  const list = [...new Set(names)];
  for (let i = 0; i < list.length; i += 60) {
    const chunk = list.slice(i, i + 60);
    const values = chunk.flatMap((n) => [`"${n.replace(/"/g, '\\"')}"@en`, `"${n.replace(/"/g, '\\"')}"@mul`]).join(' ');
    const rows = await sparql(
      `${kind}-byname-${hash(chunk.join('|'))}`,
      `SELECT ?p ?sl ?name ?born ?sport ?cit WHERE {
        VALUES ?name { ${values} }
        { ?p rdfs:label ?name } UNION { ?p skos:altLabel ?name }
        ${union(PERSON[occupation])}
        ?p wikibase:sitelinks ?sl.
        OPTIONAL { ?p wdt:P569 ?born }
        OPTIONAL { ?p wdt:P1532 ?sport }
        OPTIONAL { ?p wdt:P27 ?cit }
      }`,
    );
    const by = new Map();
    for (const r of rows) {
      const id = qid(r.p);
      const e = by.get(id) ?? { id, sl: Number(r.sl), name: r.name, born: undefined, sport: undefined, cit: undefined };
      if (r.born && !e.born) e.born = year(r.born);
      e.sport ??= qid(r.sport);
      e.cit ??= qid(r.cit);
      by.set(id, e);
    }
    out.push(...by.values());
  }
  return out;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

// ---------- 2. Lists ----------

const cats = readdirSync(catDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ file: join(catDir, f), data: JSON.parse(readFileSync(join(catDir, f), 'utf8')) }));
const byKind = (k) => cats.filter((c) => c.data.kind === k);

/** The nation a list entry represents, if its list or subtitle says. */
function countryHint(cat, item) {
  if (/^england-/.test(cat.id)) return 'England';
  const first = (item.sub ?? '').split(' · ')[0].trim();
  return /^[A-Z][A-Za-z .'-]+$/.test(first) && !/^(Defender|Midfielder|Forward|Goalkeeper|PL debut)/.test(first) ? first : '';
}

// ---------- 3. Build ----------

console.log('Wikidata…');
const players = await fetchPeople('players', 'Q937857');
const managers = await fetchPeople('managers', 'Q628099');
const clubs = await fetchClubs();
const stadiums = await fetchStadiums();

// Pull in list entries that sit below the fame cut-off.
const known = (arr) => new Set(arr.map((e) => norm(e.name)));
for (const [kind, arr, occ] of [
  ['player', players, 'Q937857'],
  ['manager', managers, 'Q628099'],
]) {
  const have = known(arr);
  const missing = byKind(kind).flatMap((c) => c.data.items.filter((it) => ![it.name, ...(it.aliases ?? [])].some((n) => have.has(norm(n)))).map((it) => it.name));
  if (missing.length) {
    const extra = await fetchByName(kind, occ, missing);
    const ids = new Set(arr.map((e) => e.id));
    for (const e of extra) if (!ids.has(e.id)) arr.push(e);
  }
}

const countryIds = new Set([...players, ...managers].flatMap((e) => [e.sport, e.cit]).concat(clubs.map((c) => c.c), stadiums.map((s) => s.c)));
const countryNames = await labelsFor('countries', countryIds);
const placeNames = await labelsFor('places', new Set(stadiums.map((s) => s.city)));
const clubById = new Map(clubs.map((c) => [c.id, c]));
const extraOcc = new Set(stadiums.flatMap((s) => [...s.occ]).filter((id) => !clubById.has(id)));
const occNames = await labelsFor('occupants', extraOcc);

/**
 * Entity: { id, name, sub, keys:Set, sl, hint }. `keys` are what search matches (name + aliases).
 * Written out as [id, name, sub, aliases?] sorted by fame, so search can rank familiar names first.
 */
const entities = { player: [], manager: [], club: [], stadium: [], nation: [] };

const personSub = (e) => {
  const c = country(countryNames.get(e.sport) ?? countryNames.get(e.cit));
  return [c, e.born ? `b. ${e.born}` : ''].filter(Boolean).join(' · ');
};
for (const [kind, arr] of [
  ['player', players],
  ['manager', managers],
]) {
  for (const e of arr) entities[kind].push({ id: e.id, name: e.name, sub: personSub(e), aliases: [], sl: e.sl, hint: country(countryNames.get(e.sport) ?? countryNames.get(e.cit)) });
}
for (const c of clubs) {
  const name = cleanClub(c.label);
  entities.club.push({ id: c.id, name, sub: country(countryNames.get(c.c)), aliases: [c.label, ...c.aliases].filter((a) => a !== name), sl: c.sl, hint: country(countryNames.get(c.c)) });
}
for (const s of stadiums) {
  // The main club decides the subtitle ("Arsenal · London"); every resident club's name finds the stadium.
  const occ = [...s.occ].map((id) => clubById.get(id) ?? { id, label: occNames.get(id), sl: 0, aliases: [] }).filter((o) => o.label);
  occ.sort((a, b) => b.sl - a.sl);
  const main = occ[0] ? cleanClub(occ[0].label) : '';
  const city = placeNames.get(s.city) ?? '';
  const sub = [main, city || country(countryNames.get(s.c))].filter(Boolean).join(' · ');
  const aliases = [...s.aliases, ...occ.flatMap((o) => [cleanClub(o.label), o.label])];
  entities.stadium.push({ id: s.id, name: s.label, sub, aliases, sl: s.sl, hint: country(countryNames.get(s.c)) });
}

// Nations come from our own lists (the FIFA ranking covers every member); first list to name one sets its subtitle.
{
  const nationCats = byKind('nation').sort((a, b) => (a.data.id === 'fifa-ranking' ? -1 : b.data.id === 'fifa-ranking' ? 1 : 0));
  for (const c of nationCats) {
    for (const it of c.data.items) {
      const keys = [it.name, ...(it.aliases ?? [])].map(norm);
      const hit = entities.nation.find((e) => [e.name, ...e.aliases].some((k) => keys.includes(norm(k))));
      if (hit) {
        for (const a of [it.name, ...(it.aliases ?? [])]) if (norm(a) !== norm(hit.name) && !hit.aliases.some((x) => norm(x) === norm(a))) hit.aliases.push(a);
        continue;
      }
      const confed = /^(UEFA|CONMEBOL|CONCACAF|CAF|AFC|OFC)$/.test(it.sub ?? '') ? it.sub : '';
      entities.nation.push({ id: it.id, name: it.name, sub: confed, aliases: [...(it.aliases ?? [])], sl: 1000 - entities.nation.length, hint: '' });
    }
  }
  // Nations first named by a non-FIFA list (e.g. UEFA coefficients) get their confederation from the others or none.
}

// ---------- 4. Link list entries ----------

const report = [];
for (const kind of Object.keys(entities)) {
  const ents = entities[kind];
  const index = new Map();
  const add = (k, e, primary) => {
    const key = norm(k);
    if (!key) return;
    const arr = index.get(key) ?? [];
    arr.push({ e, primary });
    index.set(key, arr);
  };
  for (const e of ents) {
    add(e.name, e, true);
    for (const a of e.aliases) add(a, e, false);
  }
  for (const c of byKind(kind)) {
    const used = new Map();
    for (const it of c.data.items) {
      const hint = countryHint(c.data, it);
      // Exact name on the entity's own name first, then the entry's aliases, then the entity's aliases.
      const names = [it.name, ...(it.aliases ?? [])];
      let cands = [];
      for (const [i, n] of names.entries()) {
        const hits = (index.get(norm(n)) ?? []).filter((h) => (i === 0 ? true : h.primary) && !(kind === 'player' || kind === 'manager' ? norm(n).split(' ').length < 2 && i > 0 : false));
        if (hits.length) {
          cands = hits;
          break;
        }
      }
      // Stadium/club lists often use a sponsor or short name: try a contains match on the main name.
      if (!cands.length && (kind === 'club' || kind === 'stadium')) {
        const n = norm(it.name);
        cands = ents.filter((e) => norm(e.name) === n || e.aliases.some((a) => norm(a) === n)).map((e) => ({ e, primary: false }));
      }
      let pick;
      if (cands.length) {
        const uniq = [...new Map(cands.map((h) => [h.e.id, h])).values()];
        uniq.sort((a, b) => (hint ? Number(b.e.hint === hint) - Number(a.e.hint === hint) : 0) || Number(b.primary) - Number(a.primary) || b.e.sl - a.e.sl);
        pick = uniq[0].e;
      }
      if (pick && used.has(pick.id)) {
        report.push(`  ! ${c.data.id}: "${it.name}" and "${used.get(pick.id)}" both matched ${pick.id} (${pick.name}); "${it.name}" gets its own entry`);
        pick = undefined;
      }
      if (!pick) {
        // Not in Wikidata (or ambiguous): the list entry becomes its own entity so search still finds it.
        const id = `x-${kind}-${it.id}`;
        pick = ents.find((e) => e.id === id);
        if (!pick) {
          // List subtitles are written for that list ("PL debut 1992–93 · 34 seasons"); only keep ones that describe the thing itself.
          const sub = kind === 'player' || kind === 'manager' ? hint : kind === 'club' ? hint || '' : /PL debut/.test(it.sub ?? '') ? '' : (it.sub ?? '');
          pick = { id, name: it.name, sub, aliases: [], sl: 0, hint };
          ents.push(pick);
          report.push(`  + ${c.data.id}: "${it.name}" not found in Wikidata, added from the list`);
        }
      }
      used.set(pick.id, it.name);
      it.wd = pick.id;
      // The list's spelling and aliases become searchable on the entity (and its curated name wins for display).
      if (!pick.curated) {
        if (norm(pick.name) !== norm(it.name)) pick.aliases.unshift(pick.name);
        pick.name = it.name;
        pick.curated = true;
        if ((kind === 'stadium' || kind === 'club') && it.sub && !/^PL debut/.test(it.sub) && !pick.sub.includes(' · ') && it.sub.includes(' · ')) pick.sub = it.sub;
      }
      for (const a of it.aliases ?? []) if (!pick.aliases.some((x) => norm(x) === norm(a)) && norm(a) !== norm(pick.name)) pick.aliases.push(a);
      if (!pick.sl) pick.sl = 10;
    }
  }
}

// ---------- 5. Write ----------

mkdirSync(outDir, { recursive: true });
for (const [kind, ents] of Object.entries(entities)) {
  if (!ents.length) continue;
  ents.sort((a, b) => b.sl - a.sl || a.name.localeCompare(b.name));
  const rows = ents.map((e) => {
    const aliases = [...new Set(e.aliases.filter((a) => a && norm(a) !== norm(e.name)))].slice(0, 8);
    return aliases.length ? [e.id, e.name, e.sub, aliases] : [e.id, e.name, e.sub];
  });
  const file = join(outDir, `${kind}s.json`);
  writeFileSync(file, '[\n' + rows.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n');
  console.log(`${kind}s: ${rows.length} → ${file.replace(root + '/', '')} (${(readFileSync(file).length / 1024).toFixed(0)} KB)`);
}
for (const c of cats) {
  const out = JSON.stringify(c.data, null, 2) + '\n';
  if (out !== readFileSync(c.file, 'utf8')) writeFileSync(c.file, out);
}
console.log(report.length ? `Linking notes:\n${report.join('\n')}` : 'Every list entry linked.');
