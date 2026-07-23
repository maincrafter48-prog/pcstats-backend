// ============================================================
//  PC Stats backend — добровольный (opt-in) лидерборд игроков
//  для Arizona RP. Игрок сам включает "поделиться статистикой"
//  в настройках скрипта — только тогда его данные сюда попадают.
// ============================================================
const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
// Секрет, который скрипт присылает в заголовке X-Report-Key при отправке отчёта.
// Не даёт кому попало заваливать API поддельными данными.
// Смени на свой длинный случайный ключ и впиши тот же в скрипт (REPORT_SECRET).
const REPORT_SECRET = process.env.REPORT_SECRET || "change-me-to-a-long-random-string";

const db = new Database(process.env.DB_PATH || "pcstats.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  owner_key   TEXT PRIMARY KEY,   -- случайный id, генерируется скриптом один раз при первом опт-ине
  nick        TEXT NOT NULL,
  server      TEXT NOT NULL,
  level       TEXT,
  job         TEXT,
  org         TEXT,
  position    TEXT,
  status      TEXT,
  cash_sas    TEXT,
  cash_vcs    TEXT,
  bank        TEXT,
  euro        TEXT,
  btc         TEXT,
  az_coins    TEXT,
  wanted      TEXT,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_server ON players(server);
CREATE INDEX IF NOT EXISTS idx_players_nick   ON players(nick);
`);

const app = express();
app.use(cors());
app.use(express.json({ limit: "20kb" }));

// ── простая защита от спама: ограничиваем частоту запросов на отчёт по owner_key ──
const lastReport = new Map();
const MIN_INTERVAL_MS = 20_000; // не чаще раза в 20 сек с одного ключа

function requireSecret(req, res, next) {
  const key = req.get("X-Report-Key");
  if (key !== REPORT_SECRET) {
    return res.status(401).json({ error: "invalid report key" });
  }
  next();
}

// ── игрок (через скрипт) отправляет свою статистику ──
// Требует заголовок X-Report-Key (общий секрет скрипта, не путать с owner_key игрока).
app.post("/api/report", requireSecret, (req, res) => {
  const b = req.body || {};
  const ownerKey = String(b.ownerKey || "").trim();
  const nick = String(b.nick || "").trim();
  const server = String(b.server || "").trim();

  if (!ownerKey || ownerKey.length < 8) return res.status(400).json({ error: "missing/short ownerKey" });
  if (!nick) return res.status(400).json({ error: "missing nick" });
  if (!server) return res.status(400).json({ error: "missing server" });

  const now = Date.now();
  const last = lastReport.get(ownerKey) || 0;
  if (now - last < MIN_INTERVAL_MS) {
    return res.status(429).json({ error: "too many requests, slow down" });
  }
  lastReport.set(ownerKey, now);

  const stmt = db.prepare(`
    INSERT INTO players (owner_key, nick, server, level, job, org, position, status,
                          cash_sas, cash_vcs, bank, euro, btc, az_coins, wanted, updated_at)
    VALUES (@ownerKey, @nick, @server, @level, @job, @org, @position, @status,
            @cashSas, @cashVcs, @bank, @euro, @btc, @azCoins, @wanted, @updatedAt)
    ON CONFLICT(owner_key) DO UPDATE SET
      nick=excluded.nick, server=excluded.server, level=excluded.level,
      job=excluded.job, org=excluded.org, position=excluded.position, status=excluded.status,
      cash_sas=excluded.cash_sas, cash_vcs=excluded.cash_vcs, bank=excluded.bank,
      euro=excluded.euro, btc=excluded.btc, az_coins=excluded.az_coins,
      wanted=excluded.wanted, updated_at=excluded.updated_at
  `);
  stmt.run({
    ownerKey, nick, server,
    level: b.level || "", job: b.job || "", org: b.org || "",
    position: b.position || "", status: b.status || "",
    cashSas: b.cashSas || "", cashVcs: b.cashVcs || "", bank: b.bank || "",
    euro: b.euro || "", btc: b.btc || "", azCoins: b.azCoins || "",
    wanted: b.wanted || "", updatedAt: now,
  });

  res.json({ ok: true });
});

// ── игрок передумал и хочет удалить свои данные (выключил опцию в скрипте) ──
app.delete("/api/report", requireSecret, (req, res) => {
  const ownerKey = String(req.body?.ownerKey || "").trim();
  if (!ownerKey) return res.status(400).json({ error: "missing ownerKey" });
  db.prepare("DELETE FROM players WHERE owner_key = ?").run(ownerKey);
  res.json({ ok: true });
});

// ── публичное API для сайта ──
app.get("/api/players", (req, res) => {
  const server = (req.query.server || "").trim();
  const q = (req.query.q || "").trim().toLowerCase();
  let rows;
  if (server) {
    rows = db.prepare("SELECT * FROM players WHERE server = ? ORDER BY updated_at DESC").all(server);
  } else {
    rows = db.prepare("SELECT * FROM players ORDER BY updated_at DESC").all();
  }
  if (q) rows = rows.filter(r => r.nick.toLowerCase().includes(q));
  res.json(rows.map(toPublic));
});

app.get("/api/players/:server/:nick", (req, res) => {
  const row = db.prepare("SELECT * FROM players WHERE server = ? AND nick = ?")
    .get(req.params.server, req.params.nick);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(toPublic(row));
});

app.get("/api/stats/overview", (req, res) => {
  const total = db.prepare("SELECT COUNT(*) c FROM players").get().c;
  const perServer = db.prepare("SELECT server, COUNT(*) c FROM players GROUP BY server ORDER BY c DESC").all();
  res.json({ total, perServer });
});

function toPublic(r) {
  return {
    nick: r.nick, server: r.server, level: r.level, job: r.job, org: r.org,
    position: r.position, status: r.status, cashSas: r.cash_sas, cashVcs: r.cash_vcs,
    bank: r.bank, euro: r.euro, btc: r.btc, azCoins: r.az_coins, wanted: r.wanted,
    updatedAt: r.updated_at,
  };
}

app.listen(PORT, () => console.log(`PC Stats backend listening on :${PORT}`));
