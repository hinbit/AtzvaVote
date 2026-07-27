# AtzvaVote · הצבעת אצווה — Design

Converted from Mondial-2026 (World-Cup prediction game) to a **batch quality voting game** for the Seach cannabis company. Same infrastructure: React 18 + Vite client (Hebrew RTL, he/en/ar), Node/Express + MySQL 8 server, JWT auth, runtime brand themes, coins ("שיחים") economy, leaderboard + badges, email reports, admin console.

## Level 1 — company batch rating (the game)

Every employee rates the batch (אצווה) currently at their station, 1–5:

| stage key | Hebrew | department |
|---|---|---|
| growing | גידול | גידול |
| processing | עיבוד | עיבוד |
| curing | יישון | יישון |
| factory | מפעל | מפעל / אריזה |
| marketing | שיווק | שיווק |
| sales | מכירות | מכירות |

- A user's department (existing `users.department`) maps to a stage; they rate a batch once (their guess of its final quality).
- When the batch's sales results are in, admin enters the **outcome level 1–5** (success vs. pre-set sales targets, e.g. sold ≥ target ⇒ level 4).
- Scoring (settings-driven): exact guess ⇒ `scoring_exact` (5 pts), off-by-one ⇒ `scoring_close` (2 pts), else 0.
- Quarterly game: each batch carries `quarter` (e.g. `2026-Q3`); the leaderboard can be filtered per quarter — at quarter end all resolved batches have distributed points.

## Level 2 — external product rating

- `products` table = local cache of the Seach catalog, synced server-side from `https://seach-api.hinbit.com/` (`GET /products`, Bearer `SEACH_API_KEY` env). No CORS on that API ⇒ always proxied by our server.
- Users rate products per criterion (1–5): effect (השפעה), uniformity (אחידות), cost_effective, flower_shape (צורת פרחים), smell (ריח), taste (טעם). Criterion rows, not fixed columns — future themes add criteria freely.
- Aggregated averages = the "audience rating", usable as part of a product-approval function.

## Competition level — head-to-head battles

- `battles`: subject A vs subject B (e.g. תכלת מול וודינג קייק) over a set of criteria; users vote A/B per criterion; **majority decides** the winner per criterion and overall. Subjects are labels + optional product ids, so a future elections theme ("who becomes a minister") reuses the same tables.

## Points shop (פרסים בעד נקודות)

- `prizes` + `redemptions` tables. Seeded: כובע 318 · חולצה 500 · תקליט 900.
- Spendable points = total scoring points − guess-group entry fees − redeemed points. Admin approves/delivers redemptions.

## Kept from Mondial (renamed where needed)

- Auth (JWT, guest flow, phone-as-first-password), users, departments, settings KV, i18n (he/en/ar), brand themes (`THEME=seach` default), Shabbat gate, footer docs + contact, schedule/prize timeline, coins wallet + ledger, coin bets (now: will the batch succeed? yes/no on outcome ≥ 4), guess-groups (panels guess batch outcome level), voice reviews (tasting notes per batch), leaderboard + badges, email campaigns/reports, admin console, SQL backup.

## Removed

Football domain: teams/matches/players tables & seeds, ESPN scraper, AI match predictions & team reviews, sports news ticker, group standings, simulation bots service (table `sim_users` kept for schema compat, service removed).

## THEMES roadmap (phase 2)

Brand themes already exist (`resources/themes/*`). Content themes (cannabis now → elections later: parties, leaders, "who gets in / who becomes minister" bets) map onto the generic `battles` + coin-bet markets; documented, not yet a switchable engine.
