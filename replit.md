# Chess Star v0.09

Self-contained chess-themed mobile-style web game. The entire client lives in a single HTML file (`chess-star/public/index.html`) served by a small Express server (`chess-star/server.js`).

## Structure

- `chess-star/public/index.html` — the whole client app (UI, engine, AI, persistence, sockets, i18n) ~8270 lines
- `chess-star/public/icons/` — button icons (shop, items, pieces, crafts, ranks, team, friends, duels, diamond, diamond-glow)
- `chess-star/server.js` — Express server (accounts, version, search, friends, replays, icon sync)
- `chess-star/package.json` — Node deps (express, pg)
- `artifacts/mockup-sandbox/` — canvas mockup sandbox (design prototyping only)

## Running the App

Workflow: **Start application** — `cd chess-star && PORT=5000 node server.js` on port 5000.

## v0.09 Features (latest)

- **Trophy ⓘ button** — info button shown in Progressive Trophies modal only; updated text explains trophies as a better, harder win variant earned in ChampionShip events
- **Classic skin — real piece images** — 6 user-provided JPGs (Pawn/Rook/Knight/Bishop/Queen/King) used for classic skin; each JPG has black piece (top half) + white piece (bottom half); BFS flood-fill removes white backgrounds for clean transparent rendering on any board/bg color; glyph fallback if images not yet loaded
- **Piece images used everywhere** — all boards (Classic, LPS, GTS, QoC), Pieces menu thumbnails, piece detail, skin cards
- **Season/Events/Streak aligned** — all three bottom bar sections use `justify-content:flex-start; padding-top:10px` so their content starts at the same height
- **Bars 25% thinner** — sideBtn 62→47px, sideBtnFrame 40→30px, sideBtnImg 30→22px
- **Star Path / Challenges chained** — gold chain links (3 `rChainLink` elements) between colBtns and menuRectBtn; rectBtn is now 118px wide (+40% of 84px bars), fully bordered and rounded (no longer "glued")
- **Dual-color piece thumbnails** — Pieces menu card shows white (left) + black (right) pieces side-by-side in 88px canvas
- **Chess-piece profile icons** — All 6 chess pieces (♟♛♜♝♞♚) free from start; other emoji icons gated by wins
- **Icon sync on picker** — Selecting an icon immediately syncs to server via sync-wins
- **New Pieces/Leaderboard button images** — background-removed PNGs (3 golden pawns, podium+star)
- **Fire sparks at 10+ streak only** — sfSpark hidden by default; visible only with `.sf10plus`
- **Bigger Season/Events text + wrapping** — seasonName 16px bold, evName 14px bold; white-space:normal
- **SEE-ACC left of score in leaderboard** — button before score column; player icons in podium + rank banner

## v0.08 Features

- **Streak fire always visible** — gray/desaturated when streak = 0, full color when active
- **Friend profile modal (SEE-ACC)** — full profile card with wins, trophies, best streak, online status
- **Code security** — 13-char codes hidden from friend list and search results
- **Per-account claimed rewards** — milestone claims keyed per account code
- **Account switching** — reloads icon, wins, rewards, syncs to server on switch
- **LPS piece picker** — appears BEFORE matchmaking for all LPS modes
- **Notification badges** — red circles on Wins bar, Trophies bar, Friends button, Leaderboard button
- **Server icon sync** — player icon saved to PostgreSQL, returned on login/me/friends calls

## Persistence (localStorage keys)

- `chessstar_profile` — `{name, color}`
- `chessstar_profile_icon` — selected emoji icon
- `chessstar_lang` — `'en' | 'ro' | 'ru'`
- `chessstar_skins` — per-piece skin id map
- `chessstar_theme` — `'dark' | 'light'`
- `chessstar_wins`, `chessstar_trophies`, `chessstar_streak`, `chessstar_recent`, `chessstar_replays`
- `chessstar_claimed_wins_CODE` / `chessstar_claimed_trophies_CODE` — per-account milestone claim state
- `chessstar_acct_code` — login identity
- `chessstar_saved_accts` — JSON array of all accounts on this device
- `cs_lb_last_check` / `cs_wins_changed_at` — leaderboard badge tracking

## Skins

- `classic` — flat 2D web style (unicode chess silhouettes, default)
- `wood` — realistic 3D ivory shapes in wood tones

## Events / Game Modes

- `lps` — Last Piece Standing (6 players, poison ring, piece picker before queue)
- `classic` — Classic Chess (1v1, full rules) — with AI opponent
- `qoc` — Queens On Color (checkers/dame with bishop promotion + 2 wheels of fortune)
- `gts` — Grind The Safe (drain enemy safe HP) — with AI opponent

## Game modes

- `1v1` / `2v2` / `4v4` — selectable on every event
- LPS always shows piece picker before matchmaking

## Piece progression

- Only Pawn unlocked at start
- Rook 5W, Knight 10W, Bishop 15W, Queen 25W, King 50W

## Profile icons

- 20 emoji icons; first 3 unlocked, rest gated by win counts
- Icon saved to server (PostgreSQL `icon` column) and returned in publicView

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
- `POST /api/account/login`           — login by code → returns `{code,name,color,icon,wins,streak,best_streak,trophies}`
- `GET  /api/account/me`              — get own profile → returns icon field
- `GET  /api/account/search?q=`       — fuzzy name search → returns icon in publicView
- `GET  /api/account/friends`         — friends + requests + online list → returns icon per player
- `POST /api/account/friend-request`  — send friend request
- `POST /api/account/friend-respond`  — accept/decline friend request
- `POST /api/account/friend-remove`   — remove friend
- `POST /api/account/replay`          — save replay
- `POST /api/account/sync-wins`       — sync wins/streak/trophies/icon → accepts `icon` field
- `POST /api/account/win`             — record a win
- `POST /api/queue/join`              — join matchmaking queue
- `POST /api/queue/leave`             — leave queue
- `GET  /api/queue/count`             — queue count for event+mode
- `GET  /api/leaderboard`             — top players by wins/streaks/trophies

## Storage

PostgreSQL when `DATABASE_URL` env var is set (with `icon TEXT NOT NULL DEFAULT ''` column), otherwise in-memory (no persistence across restarts). Schema auto-migrates on startup.

## Version

Current: **v0.08** (May 2026)
