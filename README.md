# Football Golf ⛳

A football quiz played like golf. Each hole gives you a target, like *"the 42nd most Champions League match wins"*. Name the club, player, stadium or nation you think sits closest to that rank. Every place you're off is a stroke, and the fewest strokes wins.

**Play:** https://pengy77.github.io/FootballGolf/

## Ways to play

- **Daily challenge:** five fixed holes a day, the same for everyone (seeded from the date, rolling over at local midnight). Play it once, then send your card: your friend plays the same holes with your card sealed, watches the head-to-head reveal, and sends a result link back. The whole game travels inside the link.
- **Challenge mode (live):** open a room and send the invite link. You can only tee off once at least 2 players are in the room and online. Everyone plays the same hole at the same time against a shot clock (30, 60 or 90 seconds). Miss it and that hole counts as out of bounds. If a player's phone drops out, the clock pauses until they're back (with 3+ players it keeps running). Reveals are shared, and the next hole starts when everyone has tapped ready.
- **Pass & play:** 2–4 players on one phone, picking in secret and then revealing together.

### How live rooms work

GitHub Pages can't relay messages between phones, so live rooms use a free public MQTT broker (`broker.emqx.io`, over secure WebSockets). Every message is end-to-end encrypted (AES-GCM) with a key that only exists in the invite link after the `#`, which is never sent to any server. The host's phone runs the clock and the rules. Retained messages expire from the broker after 24 hours. The broker is free and best-effort, with no uptime guarantee. For the app version, swap `src/live/transport.ts` for a hosted realtime service (e.g. Supabase Realtime or Firebase); the rest of `src/live/` doesn't care which transport it runs on.

## Rules

- Strokes = how many places your answer is from the target. Bang on is a hole in one.
- Tied entries share a place, so landing anywhere in a tie that covers the target scores 0.
- An answer that isn't on the list is **out of bounds**: 1 stroke worse than the worst answer that is on the list.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (scoring, ties, search, links)
npm run validate   # check every data file
npm run build      # validate + typecheck + build to dist/
node scripts/e2e.mjs http://localhost:5173/ screenshots   # drive every flow in mobile Chrome, save screenshots
node scripts/e2e-live.mjs http://localhost:5173/ screenshots/live   # two phones in a live room via the real relay
node scripts/make-images.mjs                              # regenerate icons + link preview image
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

### Data

Every ranked list lives in `data/categories/<id>.json` (schema enforced by `scripts/validate-data.mjs`). Lists come from Wikipedia (CC BY-SA 4.0), and each file records its source page and the date it was correct as of.

- **One clear answer per hole.** A target ("pin") only ever lands on a place exactly one entry holds, never inside a tie and never on a 0. Every live list needs at least 12 such places in its target range. Where an official tiebreak exists (league tables: goal difference, then goals scored), put it in `tiebreak` and each item's `tb`.
- **`kind`** (`player`, `manager`, `club`, `stadium` or `nation`) says what an answer is. The pick box searches every known entity of that kind, not just the list, so a suggestion never gives away whether a name is on the list.
- **Ask for what players know.** A list of club grounds ranked by capacity is a `club` list: the club is the answer and the ground goes in `sub` (`"name": "Tranmere Rovers", "sub": "Prenton Park"`), so nobody needs the stadium's name. Clubs that share a ground share a place. `english-league-stadiums` keeps the stadium-slug item ids it had before it asked for clubs, so old links still score. Only lists with grounds no club calls home (`world-stadiums`) ask for the stadium.
- **`retired: true`** takes a list out of new courses but keeps old links scoring.
- **Season tables** (`standings: true`, `series`, `season`) are one league's final table for one season, e.g. `serie-a-2015-16.json` in series `serie-a-table`. Items are in official finishing order, so every club holds its own place even when level on points; `tiebreak` says how level clubs were split. A course or daily draws a series once (like a single list), then one season from it, so a round never has two seasons of the same table.

Season tables for the top five leagues from 2010–11 to the last finished season are generated from each season's Wikipedia article:

```bash
node scripts/build-season-tables.mjs           # fetch (cached in .cache/wikipedia/) and write the tables
node scripts/build-entities.mjs                # link the clubs
node scripts/build-season-tables.mjs --check   # confirm each club linked to the club its Wikipedia table links to
```

The search database lives in `data/entities/` and comes from Wikidata (CC0): about 35k players, plus managers, clubs, grounds and nations. Each list entry links to its entity through `wd`. To add a list, drop in a new JSON file, then run:

```bash
node scripts/build-entities.mjs   # link the new entries (Wikidata answers are cached in .cache/)
npm run validate
```
