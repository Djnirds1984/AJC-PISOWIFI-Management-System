const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { hashPassword } = require('./auth');

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
  const tables = ['rates', 'sessions', 'config', 'hotspots', 'wireless_settings', 'wifi_devices', 'device_sessions', 'vlans', 'bridges', 'admin_sessions'];
  for (const table of tables) {
    await run(`DROP TABLE IF EXISTS ${table}`);
  }
  await init();
}

async function init() {
  console.log('[DB] Initializing database...');
  
  // 1. Create tables
  await run(`CREATE TABLE IF NOT EXISTS rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pesos INTEGER,
    minutes INTEGER,
    download_limit INTEGER DEFAULT 0,
    upload_limit INTEGER DEFAULT 0
  )`);
  
  await run(`CREATE TABLE IF NOT EXISTS sessions (
    mac TEXT PRIMARY KEY,
    ip TEXT,
    remaining_seconds INTEGER,
    total_paid INTEGER,
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    download_limit INTEGER DEFAULT 0,
    upload_limit INTEGER DEFAULT 0,
    token TEXT
  )`);

  // Migration: Add token column if it doesn't exist
  try {
    await run("ALTER TABLE sessions ADD COLUMN token TEXT");
  } catch (e) {
    // Column likely exists
  }
  
  await run(`CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
  
  await run(`CREATE TABLE IF NOT EXISTS hotspots (
    interface TEXT PRIMARY KEY,
    ip_address TEXT,
    dhcp_range TEXT,
    bandwidth_limit INTEGER,
    enabled INTEGER DEFAULT 0
  )`);
  
  await run(`CREATE TABLE IF NOT EXISTS wireless_settings (
    interface TEXT PRIMARY KEY,
    ssid TEXT,
    password TEXT,
    channel INTEGER DEFAULT 1,
    hw_mode TEXT DEFAULT 'g',
    bridge TEXT
  )`);
  
  await run(`CREATE TABLE IF NOT EXISTS wifi_devices (
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
    custom_name TEXT,
    download_limit INTEGER DEFAULT 0,
    upload_limit INTEGER DEFAULT 0
  )`);
  
  await run(`CREATE TABLE IF NOT EXISTS device_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    duration INTEGER DEFAULT 0,
    data_used INTEGER DEFAULT 0,
    FOREIGN KEY (device_id) REFERENCES wifi_devices(id)
  )`);
  
  await run(`CREATE TABLE IF NOT EXISTS vlans (
    name TEXT PRIMARY KEY,
    parent TEXT NOT NULL,
    id INTEGER NOT NULL
  )`);
  
  await run(`CREATE TABLE IF NOT EXISTS bridges (
    name TEXT PRIMARY KEY,
    members TEXT NOT NULL, -- JSON array of interface names
    stp INTEGER DEFAULT 0
  )`);

  await run(`CREATE TABLE IF NOT EXISTS admin (
    username TEXT PRIMARY KEY,
    password_hash TEXT,
    salt TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    username TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
  )`);
  
  // Create Admin if not exists
  const { salt, hash } = hashPassword('admin');
  await run(`INSERT OR IGNORE INTO admin (username, password_hash, salt) VALUES (?, ?, ?)`, ['admin', hash, salt]);

  // 2. Migrations
  try {
    // Check wireless_settings for bridge
    const wirelessCols = await all("PRAGMA table_info(wireless_settings)");
    if (!wirelessCols.some(row => row.name === 'bridge')) {
      console.log('[DB] Migration: Adding bridge column to wireless_settings');
      await run("ALTER TABLE wireless_settings ADD COLUMN bridge TEXT");
    }

    // Check rates for limits
    const rateCols = await all("PRAGMA table_info(rates)");
    if (!rateCols.some(row => row.name === 'download_limit')) {
      console.log('[DB] Migration: Adding limits to rates');
      await run("ALTER TABLE rates ADD COLUMN download_limit INTEGER DEFAULT 0");
      await run("ALTER TABLE rates ADD COLUMN upload_limit INTEGER DEFAULT 0");
    }

    // Check sessions for limits
    const sessionCols = await all("PRAGMA table_info(sessions)");
    if (!sessionCols.some(row => row.name === 'download_limit')) {
      console.log('[DB] Migration: Adding limits to sessions');
      await run("ALTER TABLE sessions ADD COLUMN download_limit INTEGER DEFAULT 0");
      await run("ALTER TABLE sessions ADD COLUMN upload_limit INTEGER DEFAULT 0");
    }

    // Check wifi_devices for limits
    const deviceCols = await all("PRAGMA table_info(wifi_devices)");
    if (!deviceCols.some(row => row.name === 'download_limit')) {
      console.log('[DB] Migration: Adding limits to wifi_devices');
      await run("ALTER TABLE wifi_devices ADD COLUMN download_limit INTEGER DEFAULT 0");
      await run("ALTER TABLE wifi_devices ADD COLUMN upload_limit INTEGER DEFAULT 0");
    }
  } catch (e) {
    console.error('[DB] Migration error:', e.message);
  }

  // 3. Initialize default config
  await run(`INSERT OR IGNORE INTO config (key, value) VALUES ('boardType', 'raspberry_pi')`);
  await run(`INSERT OR IGNORE INTO config (key, value) VALUES ('coinPin', '2')`);
  await run(`INSERT OR IGNORE INTO config (key, value) VALUES ('qos_discipline', 'cake')`);
  
  console.log('[DB] Initialization complete.');
}

module.exports = { run, all, get, factoryResetDB, init };