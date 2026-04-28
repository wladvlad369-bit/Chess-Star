# Chess Star v0.05

Joc 2D de șah cu mai multe moduri (Last Piece Standing, Classic, Queens On Color, Grind The Safe), profil cu cod de 13 caractere, prieteni, replay-uri.

Tot codul este în acest folder. Un singur server Node + Express care servește atât jocul (HTML static) cât și API-ul.

---

## Pornire locală

```bash
npm install
npm start
```

Apoi deschide `http://localhost:8080` în browser.

Variabile opționale:
- `PORT` — port de ascultare (default `8080`)

---

## Deploy pe Railway

1. Urcă tot folderul ăsta într-un repo GitHub (vezi `../GITHUB.md` pentru pași).
2. Pe railway.app: **New Project → Deploy from GitHub repo** și alege repo-ul.
3. Dacă repo-ul are mai multe foldere (cum e cazul aici), intră în **Settings → Service** și setează:
   - **Root Directory**: `chess-star`
   - **Start Command**: `npm start` (de obicei detectat singur)
4. Railway îți dă automat un domeniu `*.up.railway.app`. Acela este link-ul jocului.

Railway:
- detectează `package.json` și rulează `npm install` automat,
- detectează scriptul `start` și rulează `npm start`,
- injectează `PORT` automat — serverul îl folosește deja.

---

## Structură

```
chess-star/
├── package.json       # express + scriptul start
├── server.js          # serverul Express (API + servire fișiere statice)
├── Procfile           # fallback pentru platforme tip Heroku
├── .gitignore
├── README.md
└── public/
    ├── index.html     # tot jocul (UI + engine + AI + i18n)
    └── opengraph.jpg  # preview pentru share-uri
```

## API

Toate sunt JSON pe același domeniu cu jocul (CORS nu e necesar).

| Metodă | Cale                          | Descriere                                  |
|--------|-------------------------------|--------------------------------------------|
| GET    | `/api/healthz`                | health check                               |
| GET    | `/api/version`                | versiunea curentă (`{latest, required}`)   |
| POST   | `/api/account/create`         | creează un cont nou (`{name, color}`)      |
| POST   | `/api/account/upsert`         | creează sau actualizează după cod          |
| POST   | `/api/account/login`          | login cu cod de 13 caractere               |
| GET    | `/api/account/me?code=...`    | datele contului                            |
| GET    | `/api/account/search?q=...`   | căutare jucători după nume                 |
| GET    | `/api/account/friends?code=...` | listă prieteni / cereri / online        |
| POST   | `/api/account/friend-request` | trimite cerere de prietenie                |
| POST   | `/api/account/friend-respond` | accept / refuz cerere                      |
| POST   | `/api/account/friend-remove`  | șterge prieten                             |
| POST   | `/api/account/replay`         | salvează un replay                         |

> Datele sunt stocate în memorie (`Map`) — se șterg la restart. Pentru persistență adaugă PostgreSQL sau Redis.

## Versiune

`v0.05` (April 2026).
