import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

type Account = {
  code: string;
  name: string;
  color: string;
  wins: number;
  online: boolean;
  lastSeen: number;
  friends: Set<string>;
  requests: Set<string>;
  replays: unknown[];
};

const accounts = new Map<string, Account>();
const nameToCode = new Map<string, string>();

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function genCode(): string {
  let out = "";
  for (let i = 0; i < 13; i += 1) {
    out += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  if (accounts.has(out)) return genCode();
  return out;
}

function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 20);
}

function publicView(a: Account) {
  return {
    code: a.code,
    name: a.name,
    color: a.color,
    wins: a.wins,
    online: a.online,
  };
}

function touch(a: Account) {
  a.online = true;
  a.lastSeen = Date.now();
}

setInterval(() => {
  const cutoff = Date.now() - 90_000;
  for (const a of accounts.values()) {
    if (a.lastSeen < cutoff) a.online = false;
  }
}, 30_000);

router.post("/account/create", (req: Request, res: Response) => {
  const name = sanitizeName(req.body?.name);
  const color =
    typeof req.body?.color === "string" ? req.body.color : "#3498db";
  if (!name) {
    res.status(400).json({ error: "Name required" });
    return;
  }
  const code = genCode();
  const acct: Account = {
    code,
    name,
    color,
    wins: 0,
    online: true,
    lastSeen: Date.now(),
    friends: new Set(),
    requests: new Set(),
    replays: [],
  };
  accounts.set(code, acct);
  nameToCode.set(name.toLowerCase(), code);
  res.json({ code, name, color });
});

router.post("/account/upsert", (req: Request, res: Response) => {
  const name = sanitizeName(req.body?.name);
  const color =
    typeof req.body?.color === "string" ? req.body.color : "#3498db";
  const incoming =
    typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";

  if (incoming && accounts.has(incoming)) {
    const a = accounts.get(incoming)!;
    if (name) {
      nameToCode.delete(a.name.toLowerCase());
      a.name = name;
      nameToCode.set(name.toLowerCase(), a.code);
    }
    if (color) a.color = color;
    touch(a);
    res.json({ code: a.code, name: a.name, color: a.color });
    return;
  }

  if (!name) {
    res.status(400).json({ error: "Name required" });
    return;
  }
  const code = genCode();
  const acct: Account = {
    code,
    name,
    color,
    wins: 0,
    online: true,
    lastSeen: Date.now(),
    friends: new Set(),
    requests: new Set(),
    replays: [],
  };
  accounts.set(code, acct);
  nameToCode.set(name.toLowerCase(), code);
  res.json({ code, name, color });
});

router.post("/account/login", (req: Request, res: Response) => {
  const code =
    typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
  if (code.length !== 13) {
    res.status(400).json({ error: "Code must be 13 chars" });
    return;
  }
  let a = accounts.get(code);
  if (!a) {
    a = {
      code,
      name: "Player",
      color: "#3498db",
      wins: 0,
      online: true,
      lastSeen: Date.now(),
      friends: new Set(),
      requests: new Set(),
      replays: [],
    };
    accounts.set(code, a);
  }
  touch(a);
  res.json({ code: a.code, name: a.name, color: a.color });
});

router.get("/account/me", (req: Request, res: Response) => {
  const code =
    typeof req.query?.code === "string" ? req.query.code.toUpperCase() : "";
  const a = accounts.get(code);
  if (!a) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  touch(a);
  res.json({ code: a.code, name: a.name, color: a.color, wins: a.wins });
});

router.get("/account/search", (req: Request, res: Response) => {
  const q =
    typeof req.query?.q === "string" ? req.query.q.toLowerCase().trim() : "";
  if (!q) {
    res.json({ players: [] });
    return;
  }
  const out = [];
  for (const a of accounts.values()) {
    if (a.name.toLowerCase().includes(q)) out.push(publicView(a));
    if (out.length >= 25) break;
  }
  res.json({ players: out });
});

router.get("/account/friends", (req: Request, res: Response) => {
  const code =
    typeof req.query?.code === "string" ? req.query.code.toUpperCase() : "";
  const me = accounts.get(code);
  if (!me) {
    res.json({ friends: [], requests: [], online: [] });
    return;
  }
  touch(me);
  const friends = Array.from(me.friends)
    .map((c) => accounts.get(c))
    .filter((x): x is Account => Boolean(x))
    .map(publicView);
  const requests = Array.from(me.requests)
    .map((c) => accounts.get(c))
    .filter((x): x is Account => Boolean(x))
    .map(publicView);
  const online = Array.from(accounts.values())
    .filter((a) => a.online && a.code !== me.code)
    .slice(0, 50)
    .map(publicView);
  res.json({ friends, requests, online });
});

router.post("/account/friend-request", (req: Request, res: Response) => {
  const code =
    typeof req.body?.code === "string" ? req.body.code.toUpperCase() : "";
  const target =
    typeof req.body?.target === "string" ? req.body.target.toUpperCase() : "";
  const me = accounts.get(code);
  const them = accounts.get(target);
  if (!me || !them || me.code === them.code) {
    res.status(400).json({ error: "Invalid" });
    return;
  }
  them.requests.add(me.code);
  res.json({ ok: true });
});

router.post("/account/friend-respond", (req: Request, res: Response) => {
  const code =
    typeof req.body?.code === "string" ? req.body.code.toUpperCase() : "";
  const from =
    typeof req.body?.from === "string" ? req.body.from.toUpperCase() : "";
  const accept = Boolean(req.body?.accept);
  const me = accounts.get(code);
  const them = accounts.get(from);
  if (!me || !them) {
    res.status(400).json({ error: "Invalid" });
    return;
  }
  me.requests.delete(them.code);
  if (accept) {
    me.friends.add(them.code);
    them.friends.add(me.code);
  }
  res.json({ ok: true });
});

router.post("/account/friend-remove", (req: Request, res: Response) => {
  const code =
    typeof req.body?.code === "string" ? req.body.code.toUpperCase() : "";
  const target =
    typeof req.body?.target === "string" ? req.body.target.toUpperCase() : "";
  const me = accounts.get(code);
  const them = accounts.get(target);
  if (!me || !them) {
    res.status(400).json({ error: "Invalid" });
    return;
  }
  me.friends.delete(them.code);
  them.friends.delete(me.code);
  res.json({ ok: true });
});

router.post("/account/replay", (req: Request, res: Response) => {
  const code =
    typeof req.body?.code === "string" ? req.body.code.toUpperCase() : "";
  const me = accounts.get(code);
  if (!me) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (req.body?.replay) {
    me.replays.unshift(req.body.replay);
    if (me.replays.length > 20) me.replays.length = 20;
  }
  res.json({ ok: true });
});

export default router;
