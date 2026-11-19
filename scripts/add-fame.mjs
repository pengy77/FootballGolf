#!/usr/bin/env node
// Writes each entry's "fame" into every list that sets "minFame": how many Wikimedia sites (mostly Wikipedia
// languages) have a page on the entry's Wikidata entity ("wd"). Holes on those lists only target entries with
// at least minFame, so the answer is a name players know. Entries with no Wikidata entity get 0.
//
// Usage: node scripts/add-fame.mjs [list-id ...]   (default: every list with minFame)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data', 'categories');
const UA = 'FootballGolfDataBuilder/1.0 (open-source football quiz; data build script)';
const only = new Set(process.argv.slice(2));

const lists = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: join(dir, f), data: JSON.parse(readFileSync(join(dir, f), 'utf8')) }))
  .filter(({ data }) => (only.size ? only.has(data.id) : data.minFame !== undefined));
if (!lists.length) {
  console.log(only.size ? `No list called ${[...only].join(', ')}.` : 'No list sets minFame.');
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sitelink counts for up to 50 Wikidata ids at a time. */
async function sitelinks(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url = `https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetentities', ids: batch.join('|'), props: 'sitelinks', format: 'json' })}`;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) {
        const json = await res.json();
        for (const [id, e] of Object.entries(json.entities ?? {})) out.set(id, Object.keys(e.sitelinks ?? {}).length);
        break;
      }
      if (attempt >= 4 || (res.status !== 429 && res.status < 500)) throw new Error(`Wikidata answered ${res.status} for ${batch[0]}…`);
      await sleep(2000 * 2 ** attempt);
    }
    await sleep(300);
  }
  return out;
}

const ids = [...new Set(lists.flatMap(({ data }) => data.items.map((it) => it.wd).filter((wd) => /^Q\d+$/.test(wd ?? ''))))];
const fame = await sitelinks(ids);
for (const { file, data } of lists) {
  for (const it of data.items) it.fame = fame.get(it.wd) ?? 0;
  const out = JSON.stringify(data, null, 2) + '\n';
  if (out !== readFileSync(file, 'utf8')) writeFileSync(file, out);
  const floor = data.minFame;
  const famous = floor === undefined ? '' : `, ${data.items.filter((it) => it.fame >= floor).length} at ${floor}+`;
  console.log(`${data.id}: ${data.items.length} entries${famous}`);
}
