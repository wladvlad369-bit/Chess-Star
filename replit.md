# Chess Star

Joc 2D de șah cu mai multe moduri (Last Piece Standing, Classic, Queens On Color, Grind The Safe). Tot codul aplicației este într-un singur folder simplu.

## Structură (forma simplificată pentru Railway)

```
chess-star/
├── package.json     # express + scriptul "start"
├── server.js        # Express - servește jocul + /api/*
├── Procfile         # fallback pentru hosts Heroku-style
├── .gitignore
├── README.md
└── public/
    ├── index.html   # jocul complet (~5400 linii inline) — v0.06
    └── opengraph.jpg
```

Pornire locală:

```bash
cd chess-star
npm install
npm start    # http://localhost:8080
```

## Pe Replit

Workflow-ul `artifacts/chess-star: web` rulează `node /home/runner/workspace/chess-star/server.js` pe portul 25566, expus de proxy la `/`. Folderul `artifacts/chess-star/` conține doar `.replit-artifact/artifact.toml` (configurația de preview Replit) — restul codului e în `chess-star/` la rădăcină.

`artifacts/api-server` și fișierele Vite din artifacts/chess-star/ au fost eliminate; nu mai sunt necesare. Un singur server Express acoperă atât HTML-ul cât și API-ul.

## Persistență

Serverul detectează la pornire dacă există variabila `DATABASE_URL`:
- **Setată** → PostgreSQL (`pg`). Tabelul `chess_accounts` e creat automat. Conturile, prietenii și replay-urile rezistă la restart.
- **Lipsă** → memorie (`Map`). Datele se șterg la restart. Util pentru dev local.

Pe Railway: `+ New → Database → Add PostgreSQL` și serverul preia singur. Pe Replit (acest workspace) baza e deja provizionată automat.

## API

Toate sunt JSON pe același domeniu cu jocul:

- `GET  /api/healthz` — health check
- `GET  /api/version` — `{latest, required}` pentru gate-ul de versiune
- `POST /api/account/create` — creează cont nou (in-memory)
- `POST /api/account/upsert` — creează sau actualizează după cod
- `POST /api/account/login` — login cu cod 13 caractere
- `GET  /api/account/me?code=...`
- `GET  /api/account/search?q=...`
- `GET  /api/account/friends?code=...`
- `POST /api/account/friend-request` / `friend-respond` / `friend-remove`
- `POST /api/account/replay`

> Persistența este în-memorie. Pentru date durabile adaugă PostgreSQL.

## Persistență client (localStorage)

`chessstar_profile`, `chessstar_icon`, `chessstar_lang`, `chessstar_skins`, `chessstar_theme`, `chessstar_wins`, `chessstar_trophies`, `chessstar_streak`, `chessstar_recent`, `chessstar_replays`, `claimed_wins`, `claimed_trophies`, `chessstar_acct_code`, `chessstar_acct_name`.

Codul de save are 13 caractere: `#NNNNNNNNCHH_` (8 nume, 1 culoare, 2 hex skin bitmask, padding).

## Deploy pe Railway prin GitHub

Vezi `GITHUB.md` — pașii sunt în română, cu varianta recomandată (push doar al folderului `chess-star/` ca repo separat) și varianta cu monorepo + Root Directory.

## Versiune

`v0.06` (April 2026)

### Schimbări v0.06 (față de v0.05)

- **Bug fix critic**: în single-player vs AI (CC + GTS), player-ul nu mai poate da click și muta piesele AI-ului în timpul turei AI. Click-ul pe board e blocat când `ccTurn !== classicPlayerColor` (respectiv `gtsTurn !== gtsPlayerColor`).
- **Restricție piese 2v2/4v4** (Classic Chess + Grind The Safe + Queens On Color):
  - CC/GTS: după pre-pick (2 tipuri în 2v2, 1 tip în 4v4) player-ul deține DOAR tipurile alese + pionii de pe fișierele acelor piese (ex: alegi N → ai cailor + pionii de pe coloanele 1 și 6). Restul pieselor de aceeași culoare sunt jucate automat de AI-ul de coleg de echipă.
  - CC: regele și regina sunt cuplate — alegând una, cealaltă vine automat (fără cost suplimentar de slot).
  - QOC: nu există picker (toate piesele sunt de același tip "checker") — partiție automată pe coloane: 2v2 = jumătate stânga vs jumătate dreapta; 4v4 = sferturi de coloane. Player-ul controlează slotul 0 (cel mai din stânga).
- **AI coleg de echipă**: când player-ul nu are nicio mutare legală cu piesele lui (toate blocate), AI-ul preia tura curentă și mută o piesă neowned a aceleași culori. Mesaj inline: "🤝 Teammate AI thinking...".
- **i18n extins** (en/ro/ru):
  - `INFO_CONTENT` complet tradus pentru toate cele 5 evenimente + 6 tipuri de piese, cu mențiuni despre regulile 2v2/4v4 și cuplajul K+Q.
  - `showToast()` are wrapper care traduce automat ~25 de mesaje frecvente (network, queue, invitations, anti-camper, walks).
  - Mesaje "AI thinking..." și "Teammate AI thinking..." traduse.
  - Subtitlu pre-pick + counter "X / Y selected" localizate.
- **Helper-i nou expuși pe `window`**: `ccPlayerOwns`, `gtsPlayerOwns`, `qocPlayerOwns`, `derivePawnFiles`, `PIECE_TO_FILES`, `currentLang`, `tr()`, `translateMsg()`, `TOAST_I18N`.
- State per-meci pe `window`: `ccPickedTypes`/`ccPickedFiles`, `gtsPickedTypes`/`gtsPickedFiles`, `qocSlotsActive`/`qocSlotCount`. Resetat la fiecare apel `startSelectedEvent`.
