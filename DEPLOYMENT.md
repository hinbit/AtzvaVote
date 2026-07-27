# Deployment notes — AtzvaVote (הצבעת אצווה)

This file documents the **non-obvious prerequisites** a deploy must satisfy.
A fresh agent/session deploying this site should read this first.

Converted from Mondial-2026 — designed to run **alongside** Mondial on the same VPS:

| System    | Server port | Client dev port | DB name      | pm2 process |
|-----------|-------------|-----------------|--------------|-------------|
| Mondial   | 5222        | 5225            | `mondial2026`| `Mondial-2026` |
| AtzvaVote | **5232**    | **5235**        | `atzvavote`  | `AtzvaVote` |

Public host: **atzvavote.canabolabs.com** — nginx forwards to the local server port:

```nginx
server {
    server_name atzvavote.canabolabs.com;
    location / {
        proxy_pass http://127.0.0.1:5232;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    # + certbot TLS as usual
}
```

Repo remote: `shaykid/AtzvaVote` (branch `main`).

## Standard deploy

```bash
ssh <host> 'cd <project-path> \
  && sudo git pull --ff-only \
  && sudo npm --prefix server install \
  && sudo npm run client:build \
  && sudo npm --prefix server run db:init \
  && sudo pm2 restart AtzvaVote --update-env'
```

- `db:init` — creates any **new tables** (idempotent `CREATE TABLE IF NOT EXISTS`; safe to
  re-run, never drops data). Required whenever `server/schema.js` gained a table.
- First-time setup: `npm run db:create && npm run db:init && npm run db:seed`
  (seed = demo batches, prize shop, schedule, translations, admin user from `.env`).
- `client:build` — rebuilds the SPA; the app auto-reloads clients on a new build id.

## Secrets / env (`server/.env`, git-ignored — set per host)

- `PORT=5232`, `DB_NAME=atzvavote`, `JWT_SECRET` (unique per host!)
- `SEACH_API_KEY` — required for the product-catalog sync (level 2 / קטלוג המוצרים).
  Without it the products page works off the last synced local cache only.
  Get a **scoped read-only partner token** from the seach-data-api owner — do not reuse
  the demo/sandbox key in production.
- `OPENAI_API_KEY` — required for voice-review transcription (see below).

## Feature: Batch Voice Reviews ("ריביו קולי") — inherited from Mondial

Users record a spoken tasting note per batch, auto-transcribed via **`@hinbit/transcriber`**
(OpenAI `gpt-4o-transcribe`). Degrades gracefully — without the prerequisites the audio
still uploads and users type text manually.

1. npm package `@hinbit/transcriber` — installed by `npm --prefix server install`; if the
   `@hinbit` scope is private, configure an npm auth token on the host.
2. System binary `ffmpeg` (+ `ffprobe`): `sudo apt-get install -y ffmpeg`.
3. `OPENAI_API_KEY` in `server/.env`; restart pm2 with `--update-env` after editing.

Recordings live under `data/batch_reviews/` (served from `/data`); ensure `data/` is
writable by the pm2 user. DB table `batch_reviews` is created by `db:init`.

## Feature: Coin betting "שיחים"

P2P even-money wagers on batch success (success = outcome 4-5 / fail = 1-3). 10,000-coin
wallet per user on first access. No system deps — just `db:init` + build + restart.
Settlement is automatic from `recalcForBatch` (triggered by admin outcome entry / recalc).

## Per-host checklist

- [ ] nginx server block for atzvavote.canabolabs.com → 127.0.0.1:5232 + TLS
- [ ] `server/.env` complete (PORT, DB, JWT_SECRET, SEACH_API_KEY, OPENAI_API_KEY)
- [ ] `ffmpeg` installed
- [ ] `db:create` + `db:init` + `db:seed` run once; `db:init` after every schema change
- [ ] pm2 process named `AtzvaVote`
