# Chess Star v0.06 (latest batch: all bugs fixed)

Self-contained chess-themed mobile-style web game. The entire client lives in a single HTML file (`chess-star/public/index.html`) served by a small Express server (`chess-star/server.js`).

## Structure

- `chess-star/public/index.html` — the whole client app (UI, engine, AI, persistence, sockets, i18n)
- `chess-star/server.js` — Express server (accounts, version, search, friends, replays)
- `chess-star/package.json` — Node deps (express, pg)
- `artifacts/mockup-sandbox/` — canvas mockup sandbox (design prototyping only)

## Running the App

Workflow: **Start application** — `cd chess-star && node server.js` on port 8080.

## Persistence (localStorage keys)

- `chessstar_profile` — `{name, color}`
- `chessstar_icon`    — selected emoji (1 of 20, gated by total wins)
- `chessstar_lang`    — `'en' | 'ro' | 'ru'`
- `chessstar_skins`   — per-piece skin id map
- `chessstar_theme`   — `'dark' | 'light'`
- `chessstar_wins`, `chessstar_trophies`, `chessstar_streak`, `chessstar_recent`, `chessstar_replays`
- `claimed_wins`, `claimed_trophies` — milestone claim state
- `acct_code`, `acct_name` — login identity
- 13-char save code: `#NNNNNNNNCHH_` (8-char name, 1 color index, 2 hex skin bitmask, pad)

## Skins

- `classic` — flat 2D web style (unicode chess silhouettes, default)
- `wood` — realistic 3D ivory shapes in wood tones

## Events / Game Modes

- `lps`     — Last Piece Standing (6 or 4 players, poison ring)
- `classic` — Classic Chess (1v1, full rules) — with AI opponent
- `qoc`     — Queens On Color (checkers/dame with bishop promotion + 2 wheels of fortune)
- `gts`     — Grind The Safe (drain enemy safe HP) — with AI opponent

## Game modes

- `1v1` / `2v2` / `4v4` — selectable on every event
- 2v2 / 4v4 trigger the pre-game piece picker (2v2 = pick 2 pieces, 4v4 = pick 1)

## Piece progression

- Only Pawn unlocked at start
- Rook 5W, Knight 10W, Bishop 15W, Queen 25W, King 50W

## Profile icons

- 20 emoji icons; first 3 unlocked, rest gated by win counts

## AI

- Classic + GTS have an AI opponent (~3s think time)
- Material + center-control + mobility scoring

## i18n

- English / Romanian / Russian — switch in Settings → Language

## Backend API

- `GET  /api/healthz`                 — health check
- `GET  /api/version`                 — `{latest, required}`
- `POST /api/account/create`          — register new player
- `POST /api/account/upsert`          — register/update player
- `POST /api/account/login`           — login by code
- `GET  /api/account/me`              — get own profile
- `GET  /api/account/search?q=`       — fuzzy name search
- `GET  /api/account/friends`         — friends + requests + online list
- `POST /api/account/friend-request`  — send friend request
- `POST /api/account/friend-respond`  — accept/decline friend request
- `POST /api/account/friend-remove`   — remove friend
- `POST /api/account/replay`          — save replay

## Storage

PostgreSQL when `DATABASE_URL` env var is set, otherwise in-memory (no persistence across restarts).

## Version

Current: **v0.06** (May 2026)
- Restored from Chess-Star-v.0.06 zip after Bolt.new made breaking changes
