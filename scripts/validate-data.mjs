#!/usr/bin/env node
// Validates every category JSON in data/categories against the Football Golf schema.
// Usage: node scripts/validate-data.mjs [file ...]
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data', 'categories');
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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
  if (c.id && !SLUG.test(c.id)) errs.push(`id "${c.id}" is not a kebab slug`);
  if (c.id && basename(file, '.json') !== c.id) errs.push(`file name must equal id (${c.id}.json)`);
  if (c.prompt && /^\d|^the /i.test(c.prompt)) errs.push('prompt must read naturally after an ordinal, e.g. "most Premier League goals"');
  if (!c.source || typeof c.source.url !== 'string' || !/^https:\/\//.test(c.source.url) || !c.source.name || !c.source.asOf)
    errs.push('source must be {name, url (https), asOf}');
  if (c.source?.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(c.source.asOf)) errs.push('source.asOf must be YYYY-MM-DD');
  if (!['desc', 'asc'].includes(c.order)) errs.push('order must be "desc" (bigger value = better rank) or "asc"');
  if (!Array.isArray(c.tags) || !c.tags.length) errs.push('tags must be a non-empty array');
  if (!Array.isArray(c.items)) errs.push('items must be an array');
  else {
    if (c.items.length < 25) errs.push(`only ${c.items.length} items (need >= 25)`);
    if (c.items.length > 250) errs.push(`${c.items.length} items (max 250)`);
    const ids = new Set();
    const names = new Map();
    c.items.forEach((it, i) => {
      const at = `items[${i}]`;
      if (!it || typeof it !== 'object') return errs.push(`${at} not an object`);
      if (typeof it.id !== 'string' || !SLUG.test(it.id)) errs.push(`${at}.id invalid (${it.id})`);
      if (ids.has(it.id)) errs.push(`${at}.id duplicate (${it.id})`);
      ids.add(it.id);
      if (typeof it.name !== 'string' || !it.name.trim()) errs.push(`${at}.name missing`);
      if (typeof it.value !== 'number' || !Number.isFinite(it.value)) errs.push(`${at}.value must be a finite number`);
      if (it.sub !== undefined && typeof it.sub !== 'string') errs.push(`${at}.sub must be a string`);
      if (it.display !== undefined && typeof it.display !== 'string') errs.push(`${at}.display must be a string`);
      if (it.aliases !== undefined && (!Array.isArray(it.aliases) || it.aliases.some((a) => typeof a !== 'string')))
        errs.push(`${at}.aliases must be string[]`);
      const n = norm(it.name || '');
      if (names.has(n)) warn.push(`duplicate display name "${it.name}" at ${names.get(n)} and ${i} — make "sub" distinguish them`);
      names.set(n, i);
      if (i > 0) {
        const prev = c.items[i - 1].value;
        if (c.order === 'desc' && it.value > prev) errs.push(`${at} value ${it.value} > previous ${prev} but order is desc`);
        if (c.order === 'asc' && it.value < prev) errs.push(`${at} value ${it.value} < previous ${prev} but order is asc`);
      }
    });
    const tied = c.items.filter((it, i, a) => (i > 0 && a[i - 1].value === it.value) || (i < a.length - 1 && a[i + 1].value === it.value)).length;
    if (tied / c.items.length > 0.6) warn.push(`${tied}/${c.items.length} items are in ties — consider a finer metric`);
  }
  if (errs.length) {
    failed++;
    console.log(`✗ ${basename(file)}\n  - ${errs.slice(0, 25).join('\n  - ')}`);
  } else {
    console.log(`✓ ${basename(file)} (${c.items.length} items)${warn.length ? '\n  ! ' + warn.join('\n  ! ') : ''}`);
  }
}
process.exit(failed ? 1 : 0);
