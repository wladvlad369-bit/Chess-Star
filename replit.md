# Chess Star

Self-contained 2D chess-themed mobile-style web app. The entire game lives in a single HTML file with inline CSS + JS. Backed by a small Express API for accounts, version, and friend search.

## Structure

- `artifacts/chess-star/index.html` — the whole client app (UI, engine, AI, persistence, sockets, i18n)
- `artifacts/chess-star/vite.config.ts` — Vite dev server config (proxies `/api` to the API server)
- `artifacts/api-server/src/routes/` — Express routes
  - `health.ts` — `/api/healthz`
  - `version.ts` — `/api/version` (gates the client; returns the current build)
  - `account.ts` — `/api/account/*` (create, login, me, search, friends, friend-request, friend-respond, friend-remove, replay)
- `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`, `lib/db` — shared monorepo libs (kept from the workspace template; not used directly by the chess client)
- `attached_assets/` — original handoff backups of the HTML

## Running locally on Replit

Two workflows must be running:

- `artifacts/api-server: API Server` — Express on `:8080`, exposed at `/api`
- `artifacts/chess-star: web` — Vite dev server, exposed at `/`

The platform's path-based proxy routes `/api/*` to the API server and everything else to the game.

## Persistence (localStorage keys)

`chessstar_profile`, `chessstar_icon`, `chessstar_lang`, `chessstar_skins`, `chessstar_theme`, `chessstar_wins`, `chessstar_trophies`, `chessstar_streak`, `chessstar_recent`, `chessstar_replays`, `claimed_wins`, `claimed_trophies`, `chessstar_acct_code`, `chessstar_acct_name`.

13-char save code format: `#NNNNNNNNCHH_` (8-char name, 1 color index, 2 hex skin bitmask, pad).

## Events

- `lps`     — Last Piece Standing (6 or 4 players, poison ring)
- `classic` — Classic Chess (1v1, full rules) — with AI opponent
- `qoc`     — Queens On Color (checkers/dame with bishop promotion + 2 wheels of fortune)
- `gts`     — Grind The Safe (drain enemy safe HP) — with AI opponent

## Game modes

`1v1` / `2v2` / `4v4` selectable on every event. `2v2` and `4v4` trigger the pre-game piece picker.

## Version

Current: **v0.05** (April 2026)

## Pushing this project to your GitHub

See `GITHUB.md` for the step-by-step transfer guide.
