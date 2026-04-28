const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;
const APP_VERSION = "v0.05";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

// ---------- health & version ----------
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/version", (_req, res) => {
  res.json({ latest: APP_VERSION, required: APP_VERSION });
});

// ---------- in-memory accounts ----------
/** @type {Map<string, any>} */
const accounts = new Map();
/** @type {Map<string, string>} */
const nameToCode = new Map();

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function genCode() {
  let out = "";
  for (let i = 0; i < 13; i += 1) {
    out += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return accounts.has(out) ? genCode() : out;
}

function sanitizeName(raw) {
  return typeof raw === "string" ? raw.trim().slice(0, 20) : "";
}

function publicView(a) {
  return { code: a.code, name: a.name, color: a.color, wins: a.wins, online: a.online };
}

function touch(a) {
  a.online = true;
  a.lastSeen = Date.now();
}

setInterval(() => {
  const cutoff = Date.now() - 90_000;
  for (const a of accounts.values()) {
    if (a.lastSeen < cutoff) a.online = false;
  }
}, 30_000);

function newAccount(code, name, color) {
  return {
    code,
    name,
    color: color || "#3498db",
    wins: 0,
    online: true,
    lastSeen: Date.now(),
    friends: new Set(),
    requests: new Set(),
    replays: [],
  };
}

app.post("/api/account/create", (req, res) => {
  const name = sanitizeName(req.body && req.body.name);
  const color = (req.body && typeof req.body.color === "string") ? req.body.color : "#3498db";
  if (!name) return res.status(400).json({ error: "Name required" });
  const code = genCode();
  const acct = newAccount(code, name, color);
  accounts.set(code, acct);
  nameToCode.set(name.toLowerCase(), code);
  res.json({ code, name, color });
});

app.post("/api/account/upsert", (req, res) => {
  const name = sanitizeName(req.body && req.body.name);
  const color = (req.body && typeof req.body.color === "string") ? req.body.color : "#3498db";
  const incoming = (req.body && typeof req.body.code === "string") ? req.body.code.trim().toUpperCase() : "";

  if (incoming && accounts.has(incoming)) {
    const a = accounts.get(incoming);
    if (name) {
      nameToCode.delete(a.name.toLowerCase());
      a.name = name;
      nameToCode.set(name.toLowerCase(), a.code);
    }
    if (color) a.color = color;
    touch(a);
    return res.json({ code: a.code, name: a.name, color: a.color });
  }

  if (!name) return res.status(400).json({ error: "Name required" });
  const code = genCode();
  const acct = newAccount(code, name, color);
  accounts.set(code, acct);
  nameToCode.set(name.toLowerCase(), code);
  res.json({ code, name, color });
});

app.post("/api/account/login", (req, res) => {
  const code = (req.body && typeof req.body.code === "string") ? req.body.code.trim().toUpperCase() : "";
  if (code.length !== 13) return res.status(400).json({ error: "Code must be 13 chars" });
  let a = accounts.get(code);
  if (!a) {
    a = newAccount(code, "Player", "#3498db");
    accounts.set(code, a);
  }
  touch(a);
  res.json({ code: a.code, name: a.name, color: a.color });
});

app.get("/api/account/me", (req, res) => {
  const code = (typeof req.query.code === "string") ? req.query.code.toUpperCase() : "";
  const a = accounts.get(code);
  if (!a) return res.status(404).json({ error: "Not found" });
  touch(a);
  res.json({ code: a.code, name: a.name, color: a.color, wins: a.wins });
});

app.get("/api/account/search", (req, res) => {
  const q = (typeof req.query.q === "string") ? req.query.q.toLowerCase().trim() : "";
  if (!q) return res.json({ players: [] });
  const out = [];
  for (const a of accounts.values()) {
    if (a.name.toLowerCase().includes(q)) out.push(publicView(a));
    if (out.length >= 25) break;
  }
  res.json({ players: out });
});

app.get("/api/account/friends", (req, res) => {
  const code = (typeof req.query.code === "string") ? req.query.code.toUpperCase() : "";
  const me = accounts.get(code);
  if (!me) return res.json({ friends: [], requests: [], online: [] });
  touch(me);
  const friends = Array.from(me.friends).map(c => accounts.get(c)).filter(Boolean).map(publicView);
  const requests = Array.from(me.requests).map(c => accounts.get(c)).filter(Boolean).map(publicView);
  const online = Array.from(accounts.values())
    .filter(a => a.online && a.code !== me.code)
    .slice(0, 50)
    .map(publicView);
  res.json({ friends, requests, online });
});

app.post("/api/account/friend-request", (req, res) => {
  const code = (req.body && typeof req.body.code === "string") ? req.body.code.toUpperCase() : "";
  const target = (req.body && typeof req.body.target === "string") ? req.body.target.toUpperCase() : "";
  const me = accounts.get(code);
  const them = accounts.get(target);
  if (!me || !them || me.code === them.code) return res.status(400).json({ error: "Invalid" });
  them.requests.add(me.code);
  res.json({ ok: true });
});

app.post("/api/account/friend-respond", (req, res) => {
  const code = (req.body && typeof req.body.code === "string") ? req.body.code.toUpperCase() : "";
  const from = (req.body && typeof req.body.from === "string") ? req.body.from.toUpperCase() : "";
  const accept = Boolean(req.body && req.body.accept);
  const me = accounts.get(code);
  const them = accounts.get(from);
  if (!me || !them) return res.status(400).json({ error: "Invalid" });
  me.requests.delete(them.code);
  if (accept) {
    me.friends.add(them.code);
    them.friends.add(me.code);
  }
  res.json({ ok: true });
});

app.post("/api/account/friend-remove", (req, res) => {
  const code = (req.body && typeof req.body.code === "string") ? req.body.code.toUpperCase() : "";
  const target = (req.body && typeof req.body.target === "string") ? req.body.target.toUpperCase() : "";
  const me = accounts.get(code);
  const them = accounts.get(target);
  if (!me || !them) return res.status(400).json({ error: "Invalid" });
  me.friends.delete(them.code);
  them.friends.delete(me.code);
  res.json({ ok: true });
});

app.post("/api/account/replay", (req, res) => {
  const code = (req.body && typeof req.body.code === "string") ? req.body.code.toUpperCase() : "";
  const me = accounts.get(code);
  if (!me) return res.status(404).json({ error: "Not found" });
  if (req.body && req.body.replay) {
    me.replays.unshift(req.body.replay);
    if (me.replays.length > 20) me.replays.length = 20;
  }
  res.json({ ok: true });
});

// ---------- SPA fallback (any non-/api route -> index.html) ----------
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Chess Star ${APP_VERSION} listening on http://0.0.0.0:${PORT}`);
});
