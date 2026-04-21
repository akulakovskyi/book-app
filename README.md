# booking-app

Personal trip planner. Enter destination / dates / group size — gets live listings from Booking and Airbnb, enumerates how to split the group (1×8, 2×4, 4×2, 3+5, …), picks the best listing per unit, ranks by price per person, and builds a print-ready HTML report.

## Stack

- Angular 21 SSR (Express-based `server.ts`)
- Playwright + `playwright-extra` stealth plugin for scraping
- SQLite (`better-sqlite3`) for scrape cache (TTL) + comparison history
- Tailwind CSS v4
- Docker image runs on any Node host

## Local dev

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm start           # http://localhost:4200
```

Dev server serves both Angular UI and API routes (`/api/search`, `/api/report/:id`, etc.).

Production-like run:

```bash
npm run build
node dist/booking-app/server/server.mjs
```

## Deploy to Render (free tier)

1. Push this repo to GitHub.
2. On Render: **New → Blueprint** and point it at the repo.
3. Render reads [`render.yaml`](./render.yaml) and provisions a free Web Service running the Dockerfile.
4. First build takes ~5 min (Playwright chromium image). Free tier spins down after 15 min idle → first request after sleep takes ~30s to cold-start.

**Free tier caveat:** no persistent disk, so SQLite cache is ephemeral — that's fine for scrape cache (3h TTL anyway), but comparison history resets on redeploy. Add Render's $1/mo disk if you want persistence.

## Config (`.env`)

| Var | Default | Meaning |
|---|---|---|
| `CURRENCY` | `EUR` | Currency to request from Booking/Airbnb |
| `LANGUAGE` | `en-us` | Booking locale |
| `HEADLESS` | `1` | Set `0` to watch browser when debugging selectors |
| `CACHE_TTL_MINUTES` | `180` | Scrape cache TTL |
| `DATA_DIR` | `data` | Where SQLite + reports live |
| `REQUEST_TIMEOUT_MS` | `60000` | Per-page timeout |

## Layout

```
src/
  app/                     # Angular UI
    pages/search           # form
    pages/results          # split comparison view
    services/booking-api   # HttpClient wrapper
  server/
    scrapers/              # Playwright + stealth, Booking, Airbnb
    logic/                 # group-split math, compare orchestrator
    cache/                 # SQLite
    report/template.ts     # print-ready HTML
    api.ts                 # Express router
    config.ts
  shared/types.ts          # Listing / SplitOption / ComparisonResult
  server.ts                # Angular SSR entry + mounts /api
data/
  cache.sqlite             # gitignored
  reports/                 # HTML exports (gitignored)
```

## Caveats

- Booking and Airbnb change DOM regularly. If listings come back empty, run locally with `HEADLESS=0` and update selectors in `src/server/scrapers/{booking,airbnb}.ts`.
- Per-unit capacity on search cards is unreliable — verify on the site before booking.
- This is a personal tool. Respect each platform's ToS and rate-limit yourself (the cache helps).
