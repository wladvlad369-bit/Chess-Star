# Chess Star v0.08

Self-contained chess-themed mobile-style web game. The entire client lives in a single HTML file (`chess-star/public/index.html`) served by a small Express server (`chess-star/server.js`).

## Structure

- `chess-star/public/index.html` — the whole client app (UI, engine, AI, persistence, sockets, i18n) ~7828 lines
- `chess-star/server.js` — Express server (accounts, version, search, friends, replays, icon sync)
- `chess-star/package.json` — Node deps (express, pg)
- `artifacts/mockup-sandbox/` — canvas mockup sandbox (design prototyping only)

## Running the App

Workflow: **Start application** — `cd chess-star && PORT=5000 node server.js` on port 5000.

## v0.08 Features (latest)

- **Streak fire always visible** — gray/desaturated when streak = 0, full color when active
- **Friend profile modal (SEE-ACC)** — full profile card with wins, trophies, best streak, online status
- **Code security** — 13-char codes hidden from friend list and search results (wins + status shown instead)
- **Confirm dialog for remove friend** — generic confirm dialog used for destructive actions
- **Better invite toasts** — shows if friend is in match; "Your invite was rejected" / "Friend joined" notifications
- **Per-account claimed rewards** — milestone claims keyed per account code (no cross-account bleed)
- **Account switching** — reloads icon, wins, rewards, and syncs to server on switch
- **Delete account from device** — with confirm, blocked if only 1 account on device
- **LPS piece picker** — appears BEFORE matchmaking for all LPS modes; piece is sent to server
- **LPS poison level 0 fix** — warning ring shown at stage 0 before any squares become lethal; stage advances from round 4+
- **LPS auto-move bug fix** — inactivity timer now calls `lpsGetMoves(x,y)` correctly (was passing piece object)
- **LPS poison speed** — pawn mode: advances every 3 rounds; standard: every 2 rounds (both start at round 4)
- **Notification badges** — red circles on Wins bar, Trophies bar, Friends button, Leaderboard button
- **Progressive Wins/Trophies** — milestone modals renamed from "Wins/Trophies" to "Progressive Wins/Trophies"
- **Email info modal** — explains the trade-offs of adding email-based saving vs current anonymous code system
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
