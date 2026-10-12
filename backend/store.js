// Super-simple JSON file "database".
// Good enough for a few hundred customers. No native modules, so it deploys
// on any free host without a build step. For big scale, swap this for Postgres.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "users.json");

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }, null, 2));
}

function readAll() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (e) {
    return { users: [] };
  }
}

function writeAll(db) {
  ensure();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function findByEmail(email) {
  const db = readAll();
  return db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
}

function findByCustomerId(customerId) {
  const db = readAll();
  return db.users.find((u) => u.stripeCustomerId === customerId);
}

function upsertUser(user) {
  const db = readAll();
  const idx = db.users.findIndex((u) => u.email.toLowerCase() === user.email.toLowerCase());
  if (idx >= 0) {
    db.users[idx] = { ...db.users[idx], ...user };
  } else {
    db.users.push(user);
  }
  writeAll(db);
  return findByEmail(user.email);
}

function setActiveByCustomerId(customerId, active, currentPeriodEnd) {
  const db = readAll();
  const u = db.users.find((x) => x.stripeCustomerId === customerId);
  if (!u) return null;
  u.active = active;
  if (currentPeriodEnd) u.currentPeriodEnd = currentPeriodEnd;
  writeAll(db);
  return u;
}

module.exports = {
  readAll,
  writeAll,
  findByEmail,
  findByCustomerId,
  upsertUser,
  setActiveByCustomerId,
};
