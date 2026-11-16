# Football Golf ⛳

A football quiz played like golf. Each hole gives you a target, like *"the 42nd most Champions League match wins"*. Name the club, player, stadium or nation you think sits closest to that rank. Every place you're off is a stroke, and the fewest strokes wins.

**Play:** https://pengy77.github.io/FootballGolf/

## Playing with a friend

- **Challenge a friend:** play your round, then send the link. They play the same holes with your card sealed, watch the head-to-head reveal, and send a result link back to you. No accounts and no server: the whole game travels inside the link.
- **Pass & play:** 2–4 players on one phone, picking in secret and then revealing together.

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
node scripts/make-images.mjs                              # regenerate icons + link preview image
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

### Data

Every ranked list lives in `data/categories/<id>.json` (schema enforced by `scripts/validate-data.mjs`). Lists come from Wikipedia (CC BY-SA 4.0), and each file records its source page and the date it was correct as of. To add a list, drop in a new JSON file and run `npm run validate`.
