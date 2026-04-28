# Cum muți Chess Star pe GitHub

Proiectul este gata. Mai jos ai trei variante — alege ce ți se potrivește. Toate funcționează identic — diferă doar prin câte clickuri faci.

---

## Varianta 1 — Cea mai simplă: butonul „Connect to GitHub" din Replit

1. În Replit, deschide bara din stânga sus a workspace-ului și caută icoana **Git** (ramura).
2. Apasă **Connect to GitHub** (sau **Create a Git repo** dacă nu ai una).
3. Autorizează Replit să scrie în contul tău GitHub (o singură dată).
4. Alege un nume pentru repo (ex. `chess-star`) și dacă vrei să fie public sau privat.
5. Apasă **Create repository**. Replit împinge tot codul pe GitHub.
6. Gata — repo-ul este la `https://github.com/<utilizatorul-tău>/chess-star`.

După asta, orice modificare faci în Replit o poți trimite mai departe cu butonul **Commit & push** din același panou.

---

## Varianta 2 — Manual din terminal (dacă vrei control total)

Deschide tab-ul **Shell** din Replit și rulează, în ordine:

```bash
# 1. Inițializează git (dacă nu există deja)
git init -b main

# 2. Pune toate fișierele în primul commit
git add .
git commit -m "Chess Star v0.05 — initial commit"

# 3. Creează repo-ul gol pe GitHub întâi (de pe github.com → New repository)
#    NU bifa „Add a README" sau „.gitignore" — îl avem deja.

# 4. Leagă repo-ul local de cel de pe GitHub (înlocuiește URL-ul)
git remote add origin https://github.com/<utilizatorul-tău>/chess-star.git

# 5. Trimite codul
git push -u origin main
```

Ți se va cere user + parolă. **Important**: GitHub nu mai acceptă parola contului — folosește un **Personal Access Token**:

- Pe GitHub: **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token**.
- Bifează scope-ul `repo`, generează tokenul, copiază-l.
- La promptul de parolă din terminal, lipește tokenul în loc de parolă.

---

## Varianta 3 — Descarcă local și împinge de pe calculator

1. În Replit: **meniul cu trei puncte → Download as zip** (sau dă-mi mie comanda de download din shell).
2. Dezarhivează pe calculatorul tău.
3. Deschide un terminal în acel folder și rulează exact pașii 1–5 din **Varianta 2**.

---

## Ce e deja inclus și nu trebuie atins

- `.gitignore` — exclude `node_modules`, `dist`, cache-uri, secrete locale.
- `package.json` + `pnpm-workspace.yaml` + `pnpm-lock.yaml` — definesc tot ce trebuie instalat.
- `lib/` și `scripts/` — bibliotecile partajate ale monorepo-ului (utile pentru viitor, chiar dacă jocul de bază merge fără ele).
- `artifacts/api-server/` — backend-ul Express care acoperă `/api/version`, `/api/healthz` și `/api/account/*` (acestea sunt cele care altfel afișau mesajul „UPDATE REQUIRED" sau blocau ecranul de cont).

## Cum rulezi proiectul după clonare (pe alt cont sau local)

```bash
# instalezi dependențele (folosește pnpm — nu npm sau yarn)
npm install -g pnpm
pnpm install

# pornești backendul (Express, port 8080)
pnpm --filter @workspace/api-server run dev

# într-un alt terminal, pornești frontend-ul (Vite, port 5173 dacă local)
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/chess-star run dev
```

Pe Replit cele două sunt deja configurate ca workflow-uri și pornesc automat când deschizi proiectul.

## Bug-urile reparate în această sesiune

- **„UPDATE REQUIRED" persistent** — cauza era endpoint-ul `/api/version` lipsă. Acum serverul răspunde corect cu versiunea curentă.
- **Modal de cont blocat fără răspuns** — endpoint-urile `/api/account/create`, `/login`, `/me`, `/search`, `/friends`, `/friend-request`, `/friend-respond`, `/friend-remove`, `/replay` lipseau. Toate sunt acum implementate (storage in-memory; trece la PostgreSQL când vrei persistență permanentă).
- **Scaffolding React inutil** în `artifacts/chess-star/src/` — eliminat. Vite servește direct HTML-ul.
- **Typecheck** — rulează curat pe tot monorepo-ul (`pnpm run typecheck`).
