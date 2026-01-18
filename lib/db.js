const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../pisowifi.sqlite');
const db = new sqlite3.Database(dbPath);

// Promised-based wrappers
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

// Initialize Schema
db.serialize(() => {
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

  // Default hardware config
  // Physical Pin 3 = BCM 2
  db.run(`INSERT OR IGNORE INTO config (key, value) VALUES ('boardType', 'raspberry_pi')`);
  db.run(`INSERT OR IGNORE INTO config (key, value) VALUES ('coinPin', '2')`);
});

module.exports = { run, all, get };