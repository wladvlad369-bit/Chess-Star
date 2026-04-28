const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;
const APP_VERSION = "v0.06";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

// ---------- health & version ----------
app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));
app.get("/api/version", (_req, res) =>
  res.json({ latest: APP_VERSION, required: APP_VERSION }),
);

// ============================================================================
// Storage layer — PostgreSQL when DATABASE_URL is set, else in-memory.
// On Railway: add the PostgreSQL plugin and DATABASE_URL is injected automatically.
// ============================================================================

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode() {
  let out = "";
  for (let i = 0; i < 13; i += 1) {
    out += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return out;
}

function newAccount(code, name, color) {
  return {
    code,
    name,
    color: color || "#3498db",
    wins: 0,
    lastSeen: Date.now(),
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
    wins: a.wins,
    online: a.lastSeen >= Date.now() - 90_000,
  };
}

// ---------- in-memory storage (default) ----------
function createMemStorage() {
  const accounts = new Map();
  console.log("[storage] in-memory (data NOT persisted across restarts)");
  console.log("[storage] To persist, set DATABASE_URL (PostgreSQL).");
  return {
    name: "memory",
    async init() {},
    async get(code) {
      return accounts.get(code) || null;
    },
    async exists(code) {
      return accounts.has(code);
    },
    async save(a) {
      accounts.set(a.code, a);
    },
    async search(q, limit) {
      const out = [];
      const needle = q.toLowerCase();
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
    async getMany(codes) {
      return codes.map((c) => accounts.get(c)).filter(Boolean);
    },
  };
}

// ---------- PostgreSQL storage ----------
function createPgStorage(databaseUrl) {
  const { Pool } = require("pg");
  // Railway/Heroku/Neon usually need SSL; allow self-signed certs.
  const ssl = /sslmode=disable/i.test(databaseUrl)
    ? false
    : { rejectUnauthorized: false };
  const pool = new Pool({ connectionString: databaseUrl, ssl });
  console.log("[storage] PostgreSQL (data persists across restarts)");

  function rowToAccount(r) {
    if (!r) return null;
    return {
      code: r.code,
      name: r.name,
      color: r.color,
      wins: r.wins,
      lastSeen: Number(r.last_seen),
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
          code      TEXT PRIMARY KEY,
          name      TEXT NOT NULL,
          color     TEXT NOT NULL DEFAULT '#3498db',
          wins      INTEGER NOT NULL DEFAULT 0,
          last_seen BIGINT NOT NULL,
          friends   TEXT[] NOT NULL DEFAULT '{}',
          requests  TEXT[] NOT NULL DEFAULT '{}',
          replays   JSONB NOT NULL DEFAULT '[]'::jsonb
        );
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS chess_accounts_name_lower_idx ON chess_accounts (LOWER(name));`,
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS chess_accounts_last_seen_idx ON chess_accounts (last_seen DESC);`,
      );
      console.log("[storage] schema ready");
    },
    async get(code) {
      const r = await pool.query(
        "SELECT * FROM chess_accounts WHERE code = $1",
        [code],
      );
      return rowToAccount(r.rows[0]);
    },
    async exists(code) {
      const r = await pool.query(
        "SELECT 1 FROM chess_accounts WHERE code = $1",
        [code],
      );
      return r.rowCount > 0;
    },
    async save(a) {
      await pool.query(
        `INSERT INTO chess_accounts (code, name, color, wins, last_seen, friends, requests, replays)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           color = EXCLUDED.color,
           wins = EXCLUDED.wins,
           last_seen = EXCLUDED.last_seen,
           friends = EXCLUDED.friends,
           requests = EXCLUDED.requests,
           replays = EXCLUDED.replays`,
        [
          a.code,
          a.name,
          a.color,
          a.wins,
          a.lastSeen,
          Array.from(a.friends),
          Array.from(a.requests),
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
        `SELECT * FROM chess_accounts
         WHERE code <> $1 AND last_seen >= $2
         ORDER BY last_seen DESC LIMIT $3`,
        [excludeCode, cutoff, limit],
      );
      return r.rows.map(rowToAccount);
    },
    async getMany(codes) {
      if (!codes.length) return [];
      const r = await pool.query(
        "SELECT * FROM chess_accounts WHERE code = ANY($1)",
        [codes],
      );
      return r.rows.map(rowToAccount);
    },
  };
}

const storage = process.env.DATABASE_URL
  ? createPgStorage(process.env.DATABASE_URL)
  : createMemStorage();

// ============================================================================
// Helpers
// ============================================================================

function sanitizeName(raw) {
  return typeof raw === "string" ? raw.trim().slice(0, 20) : "";
}

async function genUniqueCode() {
  for (let i = 0; i < 10; i += 1) {
    const c = randomCode();
    if (!(await storage.exists(c))) return c;
  }
  // extremely unlikely (32^13 keyspace); add timestamp suffix as last resort
  return randomCode();
}

async function touch(a) {
  a.lastSeen = Date.now();
  await storage.save(a);
}

// ============================================================================
// Routes
// ============================================================================

app.post("/api/account/create", async (req, res, next) => {
  try {
    const name = sanitizeName(req.body && req.body.name);
    const color =
      req.body && typeof req.body.color === "string"
        ? req.body.color
        : "#3498db";
    if (!name) return res.status(400).json({ error: "Name required" });
    const code = await genUniqueCode();
    const acct = newAccount(code, name, color);
    await storage.save(acct);
    res.json({ code, name, color });
  } catch (e) {
    next(e);
  }
});

app.post("/api/account/upsert", async (req, res, next) => {
  try {
    const name = sanitizeName(req.body && req.body.name);
    const color =
      req.body && typeof req.body.color === "string"
        ? req.body.color
        : "#3498db";
    const incoming =
      req.body && typeof req.body.code === "string"
        ? req.body.code.trim().toUpperCase()
        : "";

    if (incoming) {
      const existing = await storage.get(incoming);
      if (existing) {
        if (name) existing.name = name;
        if (color) existing.color = color;
        await touch(existing);
        return res.json({
          code: existing.code,
          name: existing.name,
          color: existing.color,
        });
      }
    }

    if (!name) return res.status(400).json({ error: "Name required" });
    const code = incoming && incoming.length === 13 ? incoming : await genUniqueCode();
    const acct = newAccount(code, name, color);
    await storage.save(acct);
    res.json({ code, name, color });
  } catch (e) {
    next(e);
  }
});

app.post("/api/account/login", async (req, res, next) => {
  try {
    const code =
      req.body && typeof req.body.code === "string"
        ? req.body.code.trim().toUpperCase()
        : "";
    if (code.length !== 13) {
      return res.status(400).json({ error: "Code must be 13 chars" });
    }
    let a = await storage.get(code);
    if (!a) {
      // First time we see this code (e.g. user has it saved locally from a
      // previous deployment) — create a placeholder so login still succeeds
      // even after a fresh database reset.
      a = newAccount(code, "Player", "#3498db");
    }
    await touch(a);
    res.json({ code: a.code, name: a.name, color: a.color });
  } catch (e) {
    next(e);
  }
});

app.get("/api/account/me", async (req, res, next) => {
  try {
    const code =
      typeof req.query.code === "string" ? req.query.code.toUpperCase() : "";
    const a = await storage.get(code);
    if (!a) return res.status(404).json({ error: "Not found" });
    await touch(a);
    res.json({ code: a.code, name: a.name, color: a.color, wins: a.wins });
  } catch (e) {
    next(e);
  }
});

app.get("/api/account/search", async (req, res, next) => {
  try {
    const q =
      typeof req.query.q === "string" ? req.query.q.toLowerCase().trim() : "";
    if (!q) return res.json({ players: [] });
    const out = await storage.search(q, 25);
    res.json({ players: out.map(publicView) });
  } catch (e) {
    next(e);
  }
});

app.get("/api/account/friends", async (req, res, next) => {
  try {
    const code =
      typeof req.query.code === "string" ? req.query.code.toUpperCase() : "";
    const me = await storage.get(code);
    if (!me) return res.json({ friends: [], requests: [], online: [] });
    await touch(me);
    const friends = (await storage.getMany(Array.from(me.friends))).map(publicView);
    const requests = (await storage.getMany(Array.from(me.requests))).map(publicView);
    const online = (await storage.listOnline(me.code, Date.now() - 90_000, 50)).map(publicView);
    res.json({ friends, requests, online });
  } catch (e) {
    next(e);
  }
});

app.post("/api/account/friend-request", async (req, res, next) => {
  try {
    const code =
      req.body && typeof req.body.code === "string"
        ? req.body.code.toUpperCase()
        : "";
    const target =
      req.body && typeof req.body.target === "string"
        ? req.body.target.toUpperCase()
        : "";
    const me = await storage.get(code);
    const them = await storage.get(target);
    if (!me || !them || me.code === them.code) {
      return res.status(400).json({ error: "Invalid" });
    }
    them.requests.add(me.code);
    await storage.save(them);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.post("/api/account/friend-respond", async (req, res, next) => {
  try {
    const code =
      req.body && typeof req.body.code === "string"
        ? req.body.code.toUpperCase()
        : "";
    const from =
      req.body && typeof req.body.from === "string"
        ? req.body.from.toUpperCase()
        : "";
    const accept = Boolean(req.body && req.body.accept);
    const me = await storage.get(code);
    const them = await storage.get(from);
    if (!me || !them) return res.status(400).json({ error: "Invalid" });
    me.requests.delete(them.code);
    if (accept) {
      me.friends.add(them.code);
      them.friends.add(me.code);
      await storage.save(them);
    }
    await storage.save(me);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.post("/api/account/friend-remove", async (req, res, next) => {
  try {
    const code =
      req.body && typeof req.body.code === "string"
        ? req.body.code.toUpperCase()
        : "";
    const target =
      req.body && typeof req.body.target === "string"
        ? req.body.target.toUpperCase()
        : "";
    const me = await storage.get(code);
    const them = await storage.get(target);
    if (!me || !them) return res.status(400).json({ error: "Invalid" });
    me.friends.delete(them.code);
    them.friends.delete(me.code);
    await storage.save(me);
    await storage.save(them);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.post("/api/account/replay", async (req, res, next) => {
  try {
    const code =
      req.body && typeof req.body.code === "string"
        ? req.body.code.toUpperCase()
        : "";
    const me = await storage.get(code);
    if (!me) return res.status(404).json({ error: "Not found" });
    if (req.body && req.body.replay) {
      me.replays.unshift(req.body.replay);
      if (me.replays.length > 20) me.replays.length = 20;
      await storage.save(me);
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// SPA fallback
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Error handler — log and return JSON
app.use((err, _req, res, _next) => {
  console.error("[error]", err && err.message ? err.message : err);
  res.status(500).json({ error: "Internal error" });
});

(async () => {
  try {
    await storage.init();
  } catch (e) {
    console.error("[storage] init failed:", e.message);
    console.error("[storage] continuing anyway — some routes may fail");
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Chess Star ${APP_VERSION} listening on http://0.0.0.0:${PORT} (storage: ${storage.name})`,
    );
  });
})();
