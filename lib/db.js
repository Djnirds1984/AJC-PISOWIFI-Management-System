const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../pisowifi.sqlite');
const db = new sqlite3.Database(dbPath);

const run = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const all = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const get = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

async function factoryResetDB() {
  console.log('[DB] Executing factory reset...');
  const tables = ['rates', 'sessions', 'hotspots', 'wireless_settings', 'config'];
  for (const table of tables) {
    await run(`DELETE FROM ${table}`);
  }
  // Restore defaults
  await run(`INSERT INTO config (key, value) VALUES ('boardType', 'raspberry_pi')`);
  await run(`INSERT INTO config (key, value) VALUES ('coinPin', '2')`);
  console.log('[DB] Database wiped and defaults restored.');
}

db.serialize(() => {
  // 1. Create tables if they don't exist
  db.run(`CREATE TABLE IF NOT EXISTS rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pesos INTEGER,
    minutes INTEGER
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    mac TEXT PRIMARY KEY,
    ip TEXT,
    remaining_seconds INTEGER,
    total_paid INTEGER,
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hotspots (
    interface TEXT PRIMARY KEY,
    ip_address TEXT,
    dhcp_range TEXT,
    bandwidth_limit INTEGER,
    enabled INTEGER DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS wireless_settings (
    interface TEXT PRIMARY KEY,
    ssid TEXT,
    password TEXT,
    channel INTEGER DEFAULT 1,
    hw_mode TEXT DEFAULT 'g'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS wifi_devices (
    id TEXT PRIMARY KEY,
    mac TEXT NOT NULL,
    ip TEXT NOT NULL,
    hostname TEXT,
    interface TEXT NOT NULL,
    ssid TEXT,
    signal INTEGER DEFAULT 0,
    connected_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    session_time INTEGER,
    is_active INTEGER DEFAULT 0,
    custom_name TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS device_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    duration INTEGER DEFAULT 0,
    data_used INTEGER DEFAULT 0,
    FOREIGN KEY (device_id) REFERENCES wifi_devices(id)
  )`);
  
  // Network State Tables
  db.run(`CREATE TABLE IF NOT EXISTS vlans (
    name TEXT PRIMARY KEY,
    parent TEXT NOT NULL,
    id INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS bridges (
    name TEXT PRIMARY KEY,
    members TEXT NOT NULL, -- JSON array of interface names
    stp INTEGER DEFAULT 0
  )`);

  // 2. Migration: Ensure 'bridge' column exists in wireless_settings
  db.all("PRAGMA table_info(wireless_settings)", (err, rows) => {
    if (err) return console.error('[DB] Check error:', err);
    const hasBridge = rows.some(row => row.name === 'bridge');
    if (!hasBridge) {
      console.log('[DB] Migration: Adding missing "bridge" column to wireless_settings...');
      db.run("ALTER TABLE wireless_settings ADD COLUMN bridge TEXT", (err) => {
        if (err) console.error('[DB] Migration failed:', err);
        else console.log('[DB] Migration successful.');
      });
    }
  });

  // 3. Initialize default config
  db.run(`INSERT OR IGNORE INTO config (key, value) VALUES ('boardType', 'raspberry_pi')`);
  db.run(`INSERT OR IGNORE INTO config (key, value) VALUES ('coinPin', '2')`);
});

module.exports = { run, all, get, factoryResetDB };