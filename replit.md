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
    ├── index.html   # jocul complet (5244 linii inline)
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

`v0.05` (April 2026)
