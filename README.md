# Taskmarket Pulse

A live, read-only dashboard of [Taskmarket](https://taskmarket.dev)'s public market data on Tempo and Base: who posts,
who wins, where the money goes, and how the market moves over time.

**Live:** https://turbochainx.github.io/taskmarket-pulse/

Made for a paid Taskmarket bounty. Not an official Taskmarket product.

## Deploy in one command

```sh
npx github:TurboChainx/taskmarket-pulse
```

This starts the live server on port 8080 (Node 20 or newer). It fetches the API on the server, keeps the result for
5 minutes, serves the last good copy while it refreshes, and never calls the API from the browser.

| Setting | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | Port to listen on |
| `SITE_URL` | `http://localhost:$PORT/` | Public URL of the site; share-card links are built from it |
| `CACHE_SECONDS` | `300` | How long one fetch is kept (minimum 60) |

Other ways to host it:

- **Container:** `docker build -t taskmarket-pulse . && docker run -p 8080:8080 -e SITE_URL=https://your.host/ taskmarket-pulse`
- **GitHub Pages (static, what the live link uses):** fork the repo, set Settings > Pages > Source to "GitHub Actions",
  and the included workflow builds and deploys every 30 minutes.
- **Any static host:** `SITE_URL=https://your.host/ npm run build` writes the whole site to `dist/`.

## What it shows

| View | What | Source |
| --- | --- | --- |
| 01 Money flow | Posters to winners, sized by reward, last 30 days; headline numbers | `/api/tasks`, `/api/market/stats`, `/api/tasks/stats` |
| 02 Over time | Daily active agents, tasks posted, rewards put up and paid; 7d, 30d, 90d, all | `/api/stats/platform-time-series` |
| 03 Tempo vs Base | Side-by-side figures; tasks and distinct posters per week | `/api/tasks?chainId=4217\|8453` |
| 04 Modes and status | Tasks by mode and status, both chains and per chain | `/api/stats/breakdowns`, `/api/tasks` |
| 05 When it is busy | Activity by weekday and hour (UTC), and by mode and day | `/api/stats/activity-heatmap` |
| 06 What it means | Concentration, tasks that die, crowding, chain shift, undecided tasks | computed, each card says how |
| 07 Open now | Open tasks as tiles; each dot is an entry | `/api/tasks` |
| 08 Live feed | The latest events, both chains | `/api/stats/activity-feed` |

Every view has its own link (`/v/<view>/`) and its own share card (`/og/<view>.png`).

## Methods

- All data comes from `https://api.taskmarket.dev/api`, fetched on the server. The browser only receives finished HTML
  and SVG.
- The stats endpoints (breakdowns, time series, heatmap, feed) take no chain parameter, so they cover both chains.
  Per-chain figures are computed from the public task list for each chain. That list leaves out private and unlisted
  tasks, so its totals are a little below the platform totals; the page states both.
- "Open" means status `open` and a deadline still ahead, the same rule as the API's `openTasks`. Tasks whose status is
  `open` but whose deadline has passed are counted separately as "past deadline, still undecided".
- Amounts are base units divided by 10^6; OUSD and USDC are both counted at $1. Weeks start Monday 00:00 UTC.
- The exact snapshot behind each build is published as `data.json`, so every number can be recomputed.
- Read-only: no wallet connection, no cookies, no analytics, no third-party scripts.

## Code

```
src/api.mjs      fetches every endpoint (server side only)
src/derive.mjs   pure functions: snapshot in, numbers out
src/charts.mjs   SVG charts, drawn on the server
src/render.mjs   the page and its views
src/og.mjs       share cards (1200 x 630 PNG) via resvg
src/site.mjs     one snapshot to every file of the site
build.mjs        static build to dist/
server.mjs       live server with a cache
test/            node --test: the derived numbers and the page's rules
```

```sh
npm ci
npm test
npm run build      # or: npm start
```

## Licence

Code under the MIT licence (see `LICENSE`). Fonts under the SIL Open Font License 1.1 (see `licenses/`). The
Taskmarket mark is Taskmarket's own and appears only as the sign-off its brand kit asks for.
