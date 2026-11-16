#!/usr/bin/env node
// Validates every category JSON in data/categories against the Football Golf schema.
// Usage: node scripts/validate-data.mjs [file ...]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data', 'categories');
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KINDS = ['player', 'manager', 'club', 'stadium', 'nation'];
/** Every live list needs at least this many clean pins (untied ranks) in its target range. */
const MIN_PINS = 12;
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Must match targetRange() in src/lib/game.ts.
const targetRange = (size) => {
  const lo = Math.max(2, Math.ceil(size * 0.08));
  return [lo, Math.max(lo, Math.min(Math.floor(size * 0.85), 100))];
};

// Entity ids per kind, so list items can be checked against the search database.
const entityIds = {};
for (const kind of KINDS) {
  const f = join(root, 'data', 'entities', `${kind}s.json`);
  if (existsSync(f)) entityIds[kind] = new Set(JSON.parse(readFileSync(f, 'utf8')).map((e) => e[0]));
}

/** -1/0/1: does a rank above b? (value first, then tiebreaks, all in the list's order) */
function cmp(order, a, b) {
  const va = [a.value, ...(a.tb ?? [])];
  const vb = [b.value, ...(b.tb ?? [])];
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const x = va[i] ?? 0;
    const y = vb[i] ?? 0;
    if (x !== y) return (order === 'desc' ? x > y : x < y) ? -1 : 1;
  }
  return 0;
}

let failed = 0;
for (const file of files) {
  const errs = [];
  const warn = [];
  let c;
  try {
    c = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`✗ ${basename(file)}: invalid JSON (${e.message})`);
    failed++;
    continue;
  }
  const req = (k, t) => {
    if (typeof c[k] !== t || (t === 'string' && !c[k].trim())) errs.push(`missing/invalid "${k}" (${t})`);
  };
  req('id', 'string');
  req('title', 'string');
  req('prompt', 'string');
  req('noun', 'string');
  req('nounPlural', 'string');
  req('metric', 'string');
  req('description', 'string');
  if (!KINDS.includes(c.kind)) errs.push(`kind must be one of ${KINDS.join('|')} (what the answer is, for search)`);
  if (c.retired !== undefined && typeof c.retired !== 'boolean') errs.push('retired must be a boolean');
  if (c.tiebreak !== undefined && (typeof c.tiebreak !== 'string' || !c.tiebreak.trim())) errs.push('tiebreak must be a sentence, e.g. "goal difference, then goals scored"');
  if (c.id && !SLUG.test(c.id)) errs.push(`id "${c.id}" is not a kebab slug`);
  if (c.id && basename(file, '.json') !== c.id) errs.push(`file name must equal id (${c.id}.json)`);
  if (c.prompt && /^\d|^the /i.test(c.prompt)) errs.push('prompt must read naturally after an ordinal, e.g. "most Premier League goals"');
  if (!c.source || typeof c.source.url !== 'string' || !/^https:\/\//.test(c.source.url) || !c.source.name || !c.source.asOf)
    errs.push('source must be {name, url (https), asOf}');
  if (c.source?.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(c.source.asOf)) errs.push('source.asOf must be YYYY-MM-DD');
  if (!['desc', 'asc'].includes(c.order)) errs.push('order must be "desc" (bigger value = better rank) or "asc"');
  if (!Array.isArray(c.tags) || !c.tags.length) errs.push('tags must be a non-empty array');
  let pins = 0;
  if (!Array.isArray(c.items)) errs.push('items must be an array');
  else {
    if (c.items.length < 20) errs.push(`only ${c.items.length} items (need >= 20)`);
    if (c.items.length > 250) errs.push(`${c.items.length} items (max 250)`);
    const ids = new Set();
    const names = new Map();
    const wds = new Map();
    c.items.forEach((it, i) => {
      const at = `items[${i}]`;
      if (!it || typeof it !== 'object') return errs.push(`${at} not an object`);
      if (typeof it.id !== 'string' || !SLUG.test(it.id)) errs.push(`${at}.id invalid (${it.id})`);
      if (ids.has(it.id)) errs.push(`${at}.id duplicate (${it.id})`);
      ids.add(it.id);
      if (typeof it.name !== 'string' || !it.name.trim()) errs.push(`${at}.name missing`);
      if (typeof it.value !== 'number' || !Number.isFinite(it.value)) errs.push(`${at}.value must be a finite number`);
      if (it.tb !== undefined) {
        if (!c.tiebreak) errs.push(`${at}.tb given but the list has no "tiebreak" explanation`);
        if (!Array.isArray(it.tb) || it.tb.some((x) => typeof x !== 'number' || !Number.isFinite(x))) errs.push(`${at}.tb must be number[]`);
      }
      if (it.sub !== undefined && typeof it.sub !== 'string') errs.push(`${at}.sub must be a string`);
      if (it.display !== undefined && typeof it.display !== 'string') errs.push(`${at}.display must be a string`);
      if (it.aliases !== undefined && (!Array.isArray(it.aliases) || it.aliases.some((a) => typeof a !== 'string')))
        errs.push(`${at}.aliases must be string[]`);
      if (it.wd !== undefined) {
        if (typeof it.wd !== 'string') errs.push(`${at}.wd must be an entity id`);
        else if (entityIds[c.kind] && !entityIds[c.kind].has(it.wd)) errs.push(`${at}.wd ${it.wd} is not in data/entities/${c.kind}s.json`);
        if (wds.has(it.wd)) errs.push(`${at}.wd ${it.wd} also used by items[${wds.get(it.wd)}]: one entry per ${c.kind}, or search can't tell them apart`);
        wds.set(it.wd, i);
      } else if (entityIds[c.kind]) errs.push(`${at} (${it.name}) has no "wd" link to the search database — run node scripts/build-entities.mjs`);
      const n = norm(it.name || '');
      if (names.has(n)) warn.push(`duplicate display name "${it.name}" at ${names.get(n)} and ${i} — make "sub" distinguish them`);
      names.set(n, i);
      if (i > 0 && typeof it.value === 'number' && cmp(c.order, c.items[i - 1], it) > 0)
        errs.push(`${at} (${it.name}) ranks above the entry before it but comes after it (order is ${c.order}${c.tiebreak ? ', then tiebreaks' : ''})`);
    });
    // A pin is a rank only one entry holds (no tie), with a real value: one clear answer per hole.
    const n = c.items.length;
    const same = (a, b) => a && b && cmp(c.order, a, b) === 0;
    const [lo, hi] = targetRange(n);
    for (let r = lo; r <= hi; r++) {
      const it = c.items[r - 1];
      if (it && it.value !== 0 && !same(it, c.items[r - 2]) && !same(it, c.items[r])) pins++;
    }
    if (!c.retired && pins < MIN_PINS) errs.push(`only ${pins} clean pins (untied ranks ${lo}–${hi}); need ${MIN_PINS}. Trim the tied tail, add a real tiebreak, or set "retired": true`);
  }
  if (errs.length) {
    failed++;
    console.log(`✗ ${basename(file)}\n  - ${errs.slice(0, 25).join('\n  - ')}`);
  } else {
    console.log(`✓ ${basename(file)} (${c.items.length} items, ${c.retired ? 'retired' : `${pins} pins`})${warn.length ? '\n  ! ' + warn.join('\n  ! ') : ''}`);
  }
}
process.exit(failed ? 1 : 0);
