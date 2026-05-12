const path = require("path");
const express = require("express");
const http  = require("http");
const { Server: IOServer } = require("socket.io");

const app = express();
const httpServer = http.createServer(app);
const io = new IOServer(httpServer, {
  path: "/api/socket",
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});
const PORT = process.env.PORT || 8080;

// ── In-memory real-time state ────────────────────────────────────────────────
const onlineSockets = new Map();   // code → socketId
const socketToCode  = new Map();   // socketId → code
const lobbies       = new Map();   // lobbyId → { players, event, mode, ready, hostCode }
const APP_VERSION = "v0.09";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));
app.get("/api/version", (_req, res) =>
  res.json({ latest: APP_VERSION, required: APP_VERSION }),
);

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode() {
  let out = "";
  for (let i = 0; i < 13; i += 1) out += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  return out;
}

function newAccount(code, name, color) {
  return {
    code,
    name,
    color: color || "#3498db",
    icon: "",
    wins: 0,
    streak: 0,
    best_streak: 0,
    trophies: 0,
    lastSeen: Date.now(),
    wins_updated_at: 0,
    streak_updated_at: 0,
    friends: new Set(),
    requests: new Set(),
    replays: [],
  };
}

function publicView(a) {
  return {
    code: a.code,
    name: a.name,
    color: a.color,
    icon: a.icon || "",
    wins: a.wins,
    streak: a.streak || 0,
    best_streak: a.best_streak || 0,
    trophies: a.trophies || 0,
    online: a.lastSeen >= Date.now() - 90_000,
  };
}

// ---------- in-memory storage ----------
function createMemStorage() {
  const accounts = new Map();
  console.log("[storage] in-memory (data NOT persisted across restarts)");
  return {
    name: "memory",
    async init() {},
    async get(code) { return accounts.get(code) || null; },
    async exists(code) { return accounts.has(code); },
    async save(a) { accounts.set(a.code, a); },
    async search(q, limit) {
      const out = [], needle = q.toLowerCase();
      for (const a of accounts.values()) {
        if (a.name.toLowerCase().includes(needle)) out.push(a);
        if (out.length >= limit) break;
      }
      return out;
    },
    async listOnline(excludeCode, cutoff, limit) {
      const out = [];
      for (const a of accounts.values()) {
        if (a.code !== excludeCode && a.lastSeen >= cutoff) {
          out.push(a);
          if (out.length >= limit) break;
        }
      }
      return out;
    },
    async getMany(codes) { return codes.map((c) => accounts.get(c)).filter(Boolean); },
    async leaderboard(limit, type) {
      const arr = [...accounts.values()];
      if (type === 'streaks') {
        arr.sort((a, b) => (b.best_streak||0) - (a.best_streak||0) || (a.streak_updated_at||0) - (b.streak_updated_at||0));
      } else if (type === 'trophies') {
        arr.sort((a, b) => (b.trophies||0) - (a.trophies||0) || (a.wins_updated_at||0) - (b.wins_updated_at||0));
      } else {
        arr.sort((a, b) => (b.wins||0) - (a.wins||0) || (a.wins_updated_at||0) - (b.wins_updated_at||0));
      }
      return arr.slice(0, limit);
    },
  };
}

// ---------- PostgreSQL storage ----------
function createPgStorage(databaseUrl) {
  const { Pool } = require("pg");
  const ssl = /sslmode=disable/i.test(databaseUrl) ? false : { rejectUnauthorized: false };
  const pool = new Pool({ connectionString: databaseUrl, ssl });
  console.log("[storage] PostgreSQL (data persists across restarts)");

  function rowToAccount(r) {
    if (!r) return null;
    return {
      code: r.code,
      name: r.name,
      color: r.color,
      icon: r.icon || "",
      wins: r.wins,
      streak: r.streak || 0,
      best_streak: r.best_streak || 0,
      trophies: r.trophies || 0,
      lastSeen: Number(r.last_seen),
      wins_updated_at: Number(r.wins_updated_at || 0),
      streak_updated_at: Number(r.streak_updated_at || 0),
      friends: new Set(r.friends || []),
      requests: new Set(r.requests || []),
      replays: Array.isArray(r.replays) ? r.replays : [],
    };
  }

  return {
    name: "postgres",
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS chess_accounts (
          code              TEXT PRIMARY KEY,
          name              TEXT NOT NULL,
          color             TEXT NOT NULL DEFAULT '#3498db',
          icon              TEXT NOT NULL DEFAULT '',
          wins              INTEGER NOT NULL DEFAULT 0,
          streak            INTEGER NOT NULL DEFAULT 0,
          best_streak       INTEGER NOT NULL DEFAULT 0,
          trophies          INTEGER NOT NULL DEFAULT 0,
          last_seen         BIGINT NOT NULL,
          wins_updated_at   BIGINT NOT NULL DEFAULT 0,
          streak_updated_at BIGINT NOT NULL DEFAULT 0,
          friends           TEXT[] NOT NULL DEFAULT '{}',
          requests          TEXT[] NOT NULL DEFAULT '{}',
          replays           JSONB NOT NULL DEFAULT '[]'::jsonb
        );
      `);
      // Add missing columns to existing tables (idempotent migrations)
      for (const col of [
        "ALTER TABLE chess_accounts ADD COLUMN IF NOT EXISTS streak INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE chess_accounts ADD COLUMN IF NOT EXISTS best_streak INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE chess_accounts ADD COLUMN IF NOT EXISTS trophies INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE chess_accounts ADD COLUMN IF NOT EXISTS wins_updated_at BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE chess_accounts ADD COLUMN IF NOT EXISTS streak_updated_at BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE chess_accounts ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT ''",
      ]) {
        try { await pool.query(col); } catch(e) { /* already exists */ }
      }
      await pool.query(`CREATE INDEX IF NOT EXISTS chess_accounts_name_lower_idx ON chess_accounts (LOWER(name));`);
      await pool.query(`CREATE INDEX IF NOT EXISTS chess_accounts_last_seen_idx ON chess_accounts (last_seen DESC);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS chess_accounts_wins_idx ON chess_accounts (wins DESC, wins_updated_at ASC);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS chess_accounts_streak_idx ON chess_accounts (best_streak DESC, streak_updated_at ASC);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS chess_accounts_trophies_idx ON chess_accounts (trophies DESC, wins_updated_at ASC);`);
      // One-time migration: strip '#' prefix from any legacy codes
      try {
        const dirty = await pool.query(`SELECT code FROM chess_accounts WHERE code LIKE '#%'`);
        for (const row of dirty.rows) {
          const clean = row.code.replace(/^#+/, '');
          const exists = await pool.query(`SELECT 1 FROM chess_accounts WHERE code=$1`, [clean]);
          if (exists.rowCount === 0) {
            await pool.query(`UPDATE chess_accounts SET code=$1 WHERE code=$2`, [clean, row.code]);
          } else {
            await pool.query(`UPDATE chess_accounts SET wins = wins + (SELECT wins FROM chess_accounts WHERE code=$1) WHERE code=$2`, [row.code, clean]);
            await pool.query(`DELETE FROM chess_accounts WHERE code=$1`, [row.code]);
          }
        }
      } catch(migErr) { console.warn('[migration] skipped:', migErr.message); }
      console.log("[storage] schema ready (v0.08)");
    },
    async get(code) {
      const r = await pool.query("SELECT * FROM chess_accounts WHERE code = $1", [code]);
      return rowToAccount(r.rows[0]);
    },
    async exists(code) {
      const r = await pool.query("SELECT 1 FROM chess_accounts WHERE code = $1", [code]);
      return r.rowCount > 0;
    },
    async save(a) {
      await pool.query(
        `INSERT INTO chess_accounts
           (code, name, color, icon, wins, streak, best_streak, trophies, last_seen, wins_updated_at, streak_updated_at, friends, requests, replays)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name, color=EXCLUDED.color, icon=EXCLUDED.icon,
           wins=EXCLUDED.wins, streak=EXCLUDED.streak,
           best_streak=EXCLUDED.best_streak, trophies=EXCLUDED.trophies,
           last_seen=EXCLUDED.last_seen,
           wins_updated_at=EXCLUDED.wins_updated_at,
           streak_updated_at=EXCLUDED.streak_updated_at,
           friends=EXCLUDED.friends, requests=EXCLUDED.requests,
           replays=EXCLUDED.replays`,
        [
          a.code, a.name, a.color, a.icon||"",
          a.wins, a.streak||0, a.best_streak||0, a.trophies||0,
          a.lastSeen, a.wins_updated_at||0, a.streak_updated_at||0,
          Array.from(a.friends), Array.from(a.requests),
          JSON.stringify(a.replays),
        ],
      );
    },
    async search(q, limit) {
      const r = await pool.query(
        "SELECT * FROM chess_accounts WHERE LOWER(name) LIKE $1 LIMIT $2",
        [`%${q.toLowerCase()}%`, limit],
      );
      return r.rows.map(rowToAccount);
    },
    async listOnline(excludeCode, cutoff, limit) {
      const r = await pool.query(
        `SELECT * FROM chess_accounts WHERE code <> $1 AND last_seen >= $2 ORDER BY last_seen DESC LIMIT $3`,
        [excludeCode, cutoff, limit],
      );
      return r.rows.map(rowToAccount);
    },
    async getMany(codes) {
      if (!codes.length) return [];
      const r = await pool.query("SELECT * FROM chess_accounts WHERE code = ANY($1)", [codes]);
      return r.rows.map(rowToAccount);
    },
    async leaderboard(limit, type) {
      let orderBy;
      if (type === 'streaks') {
        orderBy = 'best_streak DESC, streak_updated_at ASC';
      } else if (type === 'trophies') {
        orderBy = 'trophies DESC, wins_updated_at ASC';
      } else {
        orderBy = 'wins DESC, wins_updated_at ASC';
      }
      const r = await pool.query(
        `SELECT * FROM chess_accounts ORDER BY ${orderBy} LIMIT $1`,
        [limit],
      );
      return r.rows.map(rowToAccount);
    },
  };
}

const storage = process.env.DATABASE_URL ? createPgStorage(process.env.DATABASE_URL) : createMemStorage();

function sanitizeName(raw) {
  return typeof raw === "string" ? raw.trim().slice(0, 20) : "";
}
function normalizeCode(raw) {
  return typeof raw === "string" ? raw.replace(/^#+/, "").trim().toUpperCase() : "";
}
async function genUniqueCode() {
  for (let i = 0; i < 10; i += 1) {
    const c = randomCode();
    if (!(await storage.exists(c))) return c;
  }
  return randomCode();
}
async function touch(a) {
  a.lastSeen = Date.now();
  await storage.save(a);
}

// ── Routes ──────────────────────────────────────────────────────────────────

app.post("/api/account/create", async (req, res, next) => {
  try {
    const name = sanitizeName(req.body && req.body.name);
    const color = req.body && typeof req.body.color === "string" ? req.body.color : "#3498db";
    if (!name) return res.status(400).json({ error: "Name required" });
    const code = await genUniqueCode();
    const acct = newAccount(code, name, color);
    await storage.save(acct);
    res.json({ code, name, color });
  } catch (e) { next(e); }
});

app.post("/api/account/upsert", async (req, res, next) => {
  try {
    const name = sanitizeName(req.body && req.body.name);
    const color = req.body && typeof req.body.color === "string" ? req.body.color : "#3498db";
    const incoming = req.body && typeof req.body.code === "string" ? normalizeCode(req.body.code) : "";
    if (incoming) {
      const existing = await storage.get(incoming);
      if (existing) {
        if (name) existing.name = name;
        if (color) existing.color = color;
        await touch(existing);
        return res.json({ code: existing.code, name: existing.name, color: existing.color, wins: existing.wins });
      }
    }
    if (!name) return res.status(400).json({ error: "Name required" });
    const code = incoming && incoming.length === 13 ? incoming : await genUniqueCode();
    const acct = newAccount(code, name, color);
    await storage.save(acct);
    res.json({ code, name, color });
  } catch (e) { next(e); }
});

app.post("/api/account/login", async (req, res, next) => {
  try {
    const code = req.body && typeof req.body.code === "string" ? normalizeCode(req.body.code) : "";
    if (code.length < 12 || code.length > 13) return res.status(400).json({ error: "Invalid code length" });
    let a = await storage.get(code);
    if (!a) {
      a = newAccount(code, "Player", "#3498db");
      await storage.save(a);
    }
    await touch(a);
    res.json({ code: a.code, name: a.name, color: a.color, icon: a.icon||"", wins: a.wins, streak: a.streak||0, best_streak: a.best_streak||0, trophies: a.trophies||0 });
  } catch (e) { next(e); }
});

app.get("/api/account/me", async (req, res, next) => {
  try {
    const code = typeof req.query.code === "string" ? normalizeCode(req.query.code) : "";
    const a = await storage.get(code);
    if (!a) return res.status(404).json({ error: "Not found" });
    await touch(a);
    res.json({ code: a.code, name: a.name, color: a.color, icon: a.icon||"", wins: a.wins, streak: a.streak||0, best_streak: a.best_streak||0, trophies: a.trophies||0 });
  } catch (e) { next(e); }
});

app.get("/api/account/search", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.toLowerCase().trim() : "";
    if (!q) return res.json({ players: [] });
    const out = await storage.search(q, 25);
    res.json({ players: out.map(publicView) });
  } catch (e) { next(e); }
});

app.get("/api/account/friends", async (req, res, next) => {
  try {
    const code = typeof req.query.code === "string" ? normalizeCode(req.query.code) : "";
    const me = await storage.get(code);
    if (!me) return res.json({ friends: [], requests: [], online: [] });
    await touch(me);
    const friends = (await storage.getMany(Array.from(me.friends))).map(publicView);
    const requests = (await storage.getMany(Array.from(me.requests))).map(publicView);
    const online = (await storage.listOnline(me.code, Date.now() - 90_000, 50)).map(publicView);
    res.json({ friends, requests, online });
  } catch (e) { next(e); }
});

app.post("/api/account/friend-request", async (req, res, next) => {
  try {
    const code   = req.body && typeof req.body.code   === "string" ? normalizeCode(req.body.code)   : "";
    const target = req.body && typeof req.body.target === "string" ? normalizeCode(req.body.target) : "";
    const me = await storage.get(code), them = await storage.get(target);
    if (!me || !them || me.code === them.code) return res.status(400).json({ error: "Invalid" });
    them.requests.add(me.code);
    await storage.save(them);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post("/api/account/friend-respond", async (req, res, next) => {
  try {
    const code   = req.body && typeof req.body.code   === "string" ? normalizeCode(req.body.code)   : "";
    const from   = req.body && typeof req.body.from   === "string" ? normalizeCode(req.body.from)   : "";
    const accept = Boolean(req.body && req.body.accept);
    const me = await storage.get(code), them = await storage.get(from);
    if (!me || !them) return res.status(400).json({ error: "Invalid" });
    me.requests.delete(them.code);
    if (accept) { me.friends.add(them.code); them.friends.add(me.code); await storage.save(them); }
    await storage.save(me);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post("/api/account/friend-remove", async (req, res, next) => {
  try {
    const code   = req.body && typeof req.body.code   === "string" ? normalizeCode(req.body.code)   : "";
    const target = req.body && typeof req.body.target === "string" ? normalizeCode(req.body.target) : "";
    const me = await storage.get(code), them = await storage.get(target);
    if (!me || !them) return res.status(400).json({ error: "Invalid" });
    me.friends.delete(them.code); them.friends.delete(me.code);
    await storage.save(me); await storage.save(them);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post("/api/account/replay", async (req, res, next) => {
  try {
    const code = req.body && typeof req.body.code === "string" ? normalizeCode(req.body.code) : "";
    const me = await storage.get(code);
    if (!me) return res.status(404).json({ error: "Not found" });
    if (req.body && req.body.replay) {
      me.replays.unshift(req.body.replay);
      if (me.replays.length > 20) me.replays.length = 20;
      await storage.save(me);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── POST /api/account/sync-wins ──────────────────────────────────────────────
// Client pushes local win count + streak data. Server keeps best values.
// Also accepts name/color to fix the "resets to Player" bug.
app.post("/api/account/sync-wins", async (req, res, next) => {
  try {
    const code       = req.body && typeof req.body.code  === 'string' ? normalizeCode(req.body.code) : '';
    const localWins  = req.body && typeof req.body.wins  === 'number' ? Math.floor(req.body.wins)    : 0;
    const localBest  = req.body && typeof req.body.best_streak  === 'number' ? Math.floor(req.body.best_streak)  : 0;
    const localTroph = req.body && typeof req.body.trophies === 'number' ? Math.floor(req.body.trophies) : 0;
    const clientName = req.body && typeof req.body.name  === 'string' ? sanitizeName(req.body.name) : '';
    const clientColor= req.body && typeof req.body.color === 'string' ? req.body.color : '';
    const clientIcon = req.body && typeof req.body.icon  === 'string' ? req.body.icon.slice(0,16) : '';
    if (!code) return res.status(400).json({ error: 'Missing code' });
    if (localWins < 0 || localWins > 1000000) return res.status(400).json({ error: 'Invalid wins' });
    const now = Date.now();
    let a = await storage.get(code);
    if (!a) {
      a = newAccount(code, clientName || 'Player', clientColor || '#3498db');
      a.icon = clientIcon;
      a.wins = localWins;
      a.best_streak = localBest;
      a.trophies = localTroph;
      if (localWins > 0) a.wins_updated_at = now;
      if (localBest > 0) a.streak_updated_at = now;
    } else {
      // Update name if client has a real (non-placeholder) name
      if (clientName && clientName !== 'Player' && clientName !== 'Player 1') {
        a.name = clientName;
      }
      if (clientColor) a.color = clientColor;
      if (clientIcon) a.icon = clientIcon;
      if (localWins > a.wins) { a.wins = localWins; a.wins_updated_at = now; }
      if (localBest > (a.best_streak||0)) { a.best_streak = localBest; a.streak_updated_at = now; }
      if (localTroph > (a.trophies||0)) a.trophies = localTroph;
    }
    await touch(a);
    if (localWins > 0) console.log(`[sync-wins] ${a.name} (${code}) wins=${a.wins} best_streak=${a.best_streak}`);
    res.json({ ok: true, wins: a.wins, best_streak: a.best_streak||0, trophies: a.trophies||0, icon: a.icon||'' });
  } catch(e) { next(e); }
});

// ── POST /api/account/win ────────────────────────────────────────────────────
app.post("/api/account/win", async (req, res, next) => {
  try {
    const code = req.body && typeof req.body.code === 'string' ? normalizeCode(req.body.code) : '';
    if (!code) return res.status(400).json({ error: 'Missing code' });
    const a = await storage.get(code);
    if (!a) return res.status(404).json({ error: 'Not found' });
    const now = Date.now();
    const special = req.body && req.body.special === true;
    a.wins = (a.wins || 0) + 1;
    if (special) a.trophies = (a.trophies || 0) + 1;
    a.wins_updated_at = now;
    await touch(a);
    console.log(`[win] ${a.name} (${code}) wins=${a.wins} trophies=${a.trophies} special=${special}`);
    res.json({ ok: true, wins: a.wins, trophies: a.trophies });
  } catch (e) { next(e); }
});

// ── v0.06 — QUEUE TRACKER ────────────────────────────────────────────────────
const _queue = new Map();
function _queueClean(){ const now=Date.now(); for(const [k,v] of _queue) if(now-v.joined>90000) _queue.delete(k); }
app.post("/api/queue/join", (req, res) => {
  const { sessionId, event, mode } = req.body || {};
  if(sessionId) _queue.set(sessionId, { event:event||'', mode:mode||'1v1', joined:Date.now() });
  _queueClean();
  const count = [..._queue.values()].filter(v=>v.event===(event||'')&&v.mode===(mode||'1v1')).length;
  const needed = ({lps:6,'1v1':2,'2v2':4,'4v4':8})[mode||'1v1']||2;
  res.json({ count: Math.max(1, count), needed });
});
app.post("/api/queue/leave", (req, res) => {
  const { sessionId } = req.body || {};
  if(sessionId) _queue.delete(sessionId);
  res.json({ ok: true });
});
app.get("/api/queue/count", (req, res) => {
  _queueClean();
  const event = req.query.event||'', mode = req.query.mode||'1v1';
  const count = [..._queue.values()].filter(v=>v.event===event&&v.mode===mode).length;
  const needed = ({lps:6,'1v1':2,'2v2':4,'4v4':8})[mode]||2;
  res.json({ count: Math.max(1, count), needed });
});

// ── GET /api/leaderboard ─────────────────────────────────────────────────────
// ?type=wins|streaks|trophies  ?limit=N(max 100)
app.get("/api/leaderboard", async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 100);
    const type  = ['wins','streaks','trophies'].includes(req.query.type) ? req.query.type : 'wins';
    const rows  = await storage.leaderboard(limit, type);
    res.json({
      type,
      players: rows.map((a, i) => ({
        rank: i + 1,
        code: a.code,
        name: a.name,
        color: a.color,
        icon: a.icon || "",
        wins: a.wins,
        streak: a.streak || 0,
        best_streak: a.best_streak || 0,
        trophies: a.trophies || 0,
      })),
    });
  } catch (e) { next(e); }
});

// ── Socket.IO ────────────────────────────────────────────────────────────────
io.on("connection", (sock) => {
  let myCode = null;

  sock.on("auth", async ({ code }) => {
    try {
      const c = normalizeCode(code || "");
      const a = await storage.get(c);
      if (!a) { sock.emit("auth_failed"); return; }
      myCode = c;
      socketToCode.set(sock.id, c);
      onlineSockets.set(c, sock.id);
      await touch(a);
      sock.emit("auth_ok", { account: { code: a.code, name: a.name, color: a.color, icon: a.icon || "", wins: a.wins, best_streak: a.best_streak || 0, trophies: a.trophies || 0 } });
      Array.from(a.friends).forEach(fc => {
        const fid = onlineSockets.get(fc); if (fid) io.to(fid).emit("friend_presence");
      });
    } catch(e) {}
  });

  // ── Friend invite ──────────────────────────────────────────────────────────
  sock.on("friend_invite", async ({ target, event, mode }) => {
    if (!myCode) return;
    const a = await storage.get(myCode).catch(() => null);
    const tid = onlineSockets.get(normalizeCode(target || ""));
    if (!tid) { sock.emit("friend_invite_response", { accepted: false }); return; }
    io.to(tid).emit("friend_invite", { fromCode: myCode, fromName: a ? a.name : "Friend", event: event || "classic", mode: mode || "2v2" });
  });

  sock.on("invite_accept", async ({ from }) => {
    if (!myCode) return;
    const a = await storage.get(myCode).catch(() => null);
    const fid = onlineSockets.get(normalizeCode(from || ""));
    if (fid) io.to(fid).emit("friend_invite_response", { accepted: true, fromCode: myCode, fromName: a ? a.name : "Friend" });
  });

  sock.on("invite_decline", async ({ from }) => {
    if (!myCode) return;
    const a = await storage.get(myCode).catch(() => null);
    const fid = onlineSockets.get(normalizeCode(from || ""));
    if (fid) io.to(fid).emit("friend_invite_response", { accepted: false, fromCode: myCode, fromName: a ? a.name : "Friend" });
  });

  // ── Team lobby ─────────────────────────────────────────────────────────────
  function _pubPlayers(lobby) { return lobby.players.map(p => ({ code: p.code, name: p.name, icon: p.icon })); }

  sock.on("team_lobby_create", async ({ event, mode, inviteCode }) => {
    if (!myCode) return;
    const a = await storage.get(myCode).catch(() => null);
    const lid = Math.random().toString(36).substr(2, 8).toUpperCase();
    const me = { code: myCode, name: a ? a.name : "Player", icon: a ? (a.icon || "🎭") : "🎭", sockId: sock.id };
    lobbies.set(lid, { players: [me], event: event || "classic", mode: mode || "2v2", ready: new Set(), hostCode: myCode });
    sock.join("lobby_" + lid);
    sock.emit("team_lobby_created", { lobbyId: lid, players: _pubPlayers(lobbies.get(lid)), event: event || "classic", mode: mode || "2v2" });
    // Also send lobby invite to inviteCode if provided
    if (inviteCode) {
      const tid = onlineSockets.get(normalizeCode(inviteCode));
      if (tid) io.to(tid).emit("team_lobby_invite", { lobbyId: lid, fromCode: myCode, fromName: me.name, event: event || "classic", mode: mode || "2v2" });
    }
  });

  sock.on("team_lobby_join", async ({ lobbyId }) => {
    if (!myCode) return;
    const lobby = lobbies.get(lobbyId);
    if (!lobby) { sock.emit("team_lobby_error", { msg: "Lobby not found" }); return; }
    if (lobby.players.length >= 4) { sock.emit("team_lobby_error", { msg: "Lobby full" }); return; }
    const a = await storage.get(myCode).catch(() => null);
    if (!lobby.players.find(p => p.code === myCode)) {
      lobby.players.push({ code: myCode, name: a ? a.name : "Player", icon: a ? (a.icon || "🎭") : "🎭", sockId: sock.id });
    }
    sock.join("lobby_" + lobbyId);
    io.to("lobby_" + lobbyId).emit("team_lobby_update", { players: _pubPlayers(lobby), event: lobby.event, mode: lobby.mode, hostCode: lobby.hostCode });
  });

  sock.on("team_lobby_set_event", ({ lobbyId, event, mode }) => {
    if (!myCode) return;
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.hostCode !== myCode) return;
    lobby.event = event || "classic";
    lobby.mode  = mode  || "2v2";
    lobby.ready = new Set();
    io.to("lobby_" + lobbyId).emit("team_lobby_update", { players: _pubPlayers(lobby), event: lobby.event, mode: lobby.mode, hostCode: lobby.hostCode });
  });

  sock.on("team_lobby_ready", ({ lobbyId }) => {
    if (!myCode) return;
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    lobby.ready.add(myCode);
    if (lobby.ready.size >= lobby.players.length && lobby.players.length >= 2) {
      io.to("lobby_" + lobbyId).emit("team_lobby_start", { event: lobby.event, mode: lobby.mode, lobbyId, players: _pubPlayers(lobby) });
      lobbies.delete(lobbyId);
    } else {
      io.to("lobby_" + lobbyId).emit("team_lobby_ready_update", { readyCount: lobby.ready.size, total: lobby.players.length });
    }
  });

  sock.on("team_lobby_leave", ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      lobby.players = lobby.players.filter(p => p.code !== myCode);
      lobby.ready.delete(myCode);
      sock.leave("lobby_" + lobbyId);
      if (!lobby.players.length) lobbies.delete(lobbyId);
      else io.to("lobby_" + lobbyId).emit("team_lobby_update", { players: _pubPlayers(lobby), event: lobby.event, mode: lobby.mode, hostCode: lobby.hostCode });
    }
  });

  // ── Team move relay ────────────────────────────────────────────────────────
  sock.on("team_move", ({ lobbyId, move }) => {
    if (!myCode) return;
    sock.to("lobby_" + lobbyId).emit("team_move", { move, fromCode: myCode });
  });

  // ── Suggest-walk relay ─────────────────────────────────────────────────────
  sock.on("suggest_walk", (data) => {
    if (!myCode) return;
    Array.from(sock.rooms).filter(r => r.startsWith("lobby_")).forEach(room => {
      sock.to(room).emit("suggest_walk", { ...data, fromCode: myCode });
    });
  });

  sock.on("suggest_walk_response", (data) => {
    if (!myCode) return;
    Array.from(sock.rooms).filter(r => r.startsWith("lobby_")).forEach(room => {
      sock.to(room).emit("suggest_walk_response", { ...data, fromCode: myCode });
    });
  });

  // ── Disconnect cleanup ─────────────────────────────────────────────────────
  sock.on("disconnect", () => {
    if (!myCode) return;
    onlineSockets.delete(myCode);
    socketToCode.delete(sock.id);
    for (const [lid, lobby] of lobbies) {
      if (!lobby.players.find(p => p.code === myCode)) continue;
      lobby.players = lobby.players.filter(p => p.code !== myCode);
      lobby.ready.delete(myCode);
      if (!lobby.players.length) { lobbies.delete(lid); continue; }
      io.to("lobby_" + lid).emit("team_lobby_update", { players: _pubPlayers(lobby), event: lobby.event, mode: lobby.mode, hostCode: lobby.hostCode });
    }
  });
});

// SPA fallback
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error("[error]", err && err.message ? err.message : err);
  res.status(500).json({ error: "Internal error" });
});

(async () => {
  try { await storage.init(); } catch (e) {
    console.error("[storage] init failed:", e.message);
    console.error("[storage] continuing anyway — some routes may fail");
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Chess Star ${APP_VERSION} listening on http://0.0.0.0:${PORT} (storage: ${storage.name})`);
  });
})();
