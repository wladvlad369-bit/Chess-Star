# Cum trimiți Chess Star pe GitHub și Railway

Tot codul aplicației este acum într-un **singur folder**: `chess-star/`. Are un singur `npm start` și nu are nevoie de pnpm, monorepo, build pași sau alte complicații. Asta e exact ce vrea Railway.

```
chess-star/
├── package.json     ← express + scriptul "start"
├── server.js        ← serverul (API + servește jocul)
├── Procfile         ← fallback pentru Heroku-style hosts
├── .gitignore
├── README.md
└── public/
    ├── index.html   ← jocul (5244 linii, totul inline)
    └── opengraph.jpg
```

---

## Recomandare: pune DOAR folderul `chess-star/` ca repo separat

Cel mai simplu și cel mai curat pentru Railway. Restul fișierelor din proiect (lib/, scripts/, pnpm-workspace.yaml, etc.) sunt pentru mediul Replit și nu sunt folosite de Railway.

### Pași

**1. Creează un repo nou pe GitHub** (gol, fără README, fără .gitignore — le avem deja).

   Pe github.com → **New repository** → nume `chess-star` → public sau privat → **Create**.

**2. Din shell-ul Replit:**

```bash
cd chess-star
git init -b main
git add .
git commit -m "Chess Star v0.05"
git remote add origin https://github.com/<utilizatorul-tău>/chess-star.git
git push -u origin main
```

La primul push, GitHub îți cere user + parolă. **Folosește un Personal Access Token** în loc de parolă:
- GitHub: **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token**
- Bifează scope-ul `repo`, generează, copiază token-ul, lipește-l la promptul de parolă.

**3. Pe Railway** (railway.app):

- **New Project → Deploy from GitHub repo** → alege repo-ul `chess-star`.
- Railway detectează singur `package.json`, rulează `npm install` și apoi `npm start`. Gata.
- În câteva secunde primești un domeniu `*.up.railway.app` — acela e link-ul jocului.

**4. (RECOMANDAT) Adaugă PostgreSQL ca să reziste conturile la restart**:

Fără pas ăsta, conturile și prietenii se șterg de fiecare dată când Railway redeploy-ește (la fiecare `git push`). Cu pas ăsta, rămân pentru totdeauna.

- În proiectul Railway: butonul **+ New → Database → Add PostgreSQL**.
- Railway creează baza și injectează automat variabila `DATABASE_URL` în serviciul tău.
- Apasă **Redeploy** la serviciul `chess-star` (sau așteaptă următorul `git push`).
- În log-urile serviciului ar trebui să vezi:
  ```
  [storage] PostgreSQL (data persists across restarts)
  [storage] schema ready
  Chess Star v0.05 listening on http://0.0.0.0:... (storage: postgres)
  ```

Serverul detectează singur `DATABASE_URL` și creează tabelul `chess_accounts` automat la prima pornire. Nu trebuie să rulezi nimic manual.

Dacă **NU** adaugi PostgreSQL, jocul tot merge — dar conturile sunt în memorie și se pierd la fiecare restart. Vei vedea în log-uri:
```
[storage] in-memory (data NOT persisted across restarts)
```

**5. Pentru webintoapp.com**:

- Lipește URL-ul `*.up.railway.app` în webintoapp.com → primești APK-ul.

---

## Alternativă: pune tot proiectul Replit pe GitHub

Dacă vrei să păstrezi tot proiectul împreună (inclusiv configurațiile Replit) urcă întreg folderul rădăcină. Pentru Railway:

- pe Railway, în **Settings → Service → Root Directory** scrie `chess-star`.
- Railway va intra în acel subfolder, va vedea `package.json` și `npm start`, și va porni jocul exact la fel.

În rest, pașii git sunt aceiași — doar că rulezi `git init` în rădăcină în loc de `chess-star/`.

---

## Cum se actualizează automat după primul deploy

Odată conectat repo-ul, Railway urmărește branch-ul `main`. De fiecare dată când dai `git push`, Railway:
1. Trage codul nou,
2. Rulează `npm install`,
3. Rulează `npm start`,
4. Înlocuiește versiunea live fără downtime.

URL-ul rămâne același. Asta înseamnă că aplicația ta din webintoapp continuă să meargă la noua versiune fără să faci nimic.

---

## Test local înainte de deploy

```bash
cd chess-star
npm install
npm start
# deschide http://localhost:8080
```

---

## Ce NU trebuie să fie pe GitHub

`.gitignore` din `chess-star/` exclude deja:
- `node_modules/` (Railway îl reinstalează singur)
- `*.log`, `.DS_Store`
- `.env`, `.env.local` (secrete locale)
- `package-lock.json` (opțional)

---

## Probleme deja rezolvate

- **Mesajul „UPDATE REQUIRED"** care bloca jocul — endpoint-ul `/api/version` lipsea.
- **Modalul de cont blocat** — toate endpoint-urile `/api/account/*` lipseau.
- **Structura monorepo prea complicată** pentru Railway — totul mutat într-un singur folder cu `npm start`.
