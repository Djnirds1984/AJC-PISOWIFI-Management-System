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

const close = () => {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// Export database as SQL dump
const exportDatabase = () => {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    const { spawn } = require('child_process');
    
    // Get list of tables
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) return reject(err);
      
      let dump = '';
      let processed = 0;
      const totalTables = tables.length;
      
      // Add header
      dump += `-- PisoWifi Database Export\n`;
      dump += `-- Generated: ${new Date().toISOString()}\n`;
      dump += `-- Tables: ${tables.map(t => t.name).join(', ')}\n\n`;
      
      // Process each table
      tables.forEach(table => {
        const tableName = table.name;
        
        // Skip sqlite internal tables
        if (tableName.startsWith('sqlite_')) {
          processed++;
          if (processed === totalTables) resolve(dump);
          return;
        }
        
        // Add table schema
        db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, [tableName], (err, schema) => {
          if (err) {
            console.warn(`Could not get schema for ${tableName}:`, err.message);
            processed++;
            if (processed === totalTables) resolve(dump);
            return;
          }
          
          dump += `-- Table: ${tableName}\n`;
          dump += `${schema.sql};\n\n`;
          
          // Add data
          db.all(`SELECT * FROM ${tableName}`, [], (err, rows) => {
            if (err) {
              console.warn(`Could not export data for ${tableName}:`, err.message);
              processed++;
              if (processed === totalTables) resolve(dump);
              return;
            }
            
            if (rows.length > 0) {
              dump += `-- Data for ${tableName}\n`;
              
              // Generate INSERT statements
              rows.forEach(row => {
                const columns = Object.keys(row);
                const values = columns.map(col => {
                  const val = row[col];
                  if (val === null) return 'NULL';
                  if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                  return val;
                });
                
                dump += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
              });
              
              dump += '\n';
            }
            
            processed++;
            if (processed === totalTables) resolve(dump);
          });
        });
      });
    });
  });
};

// Import database from SQL dump
// Get hardware information
const getHardwareInfo = async () => {
  try {
    const result = await get('SELECT value FROM config WHERE key = ?', ['hardwareId']);
    return result ? { hardware_id: result.value } : null;
  } catch (err) {
    console.warn('Could not get hardware info:', err.message);
    return null;
  }
};

// Get current license information
const getCurrentLicense = async () => {
  try {
    const result = await get('SELECT * FROM licenses WHERE is_licensed = 1 ORDER BY created_at DESC LIMIT 1');
    return result;
  } catch (err) {
    console.warn('Could not get license info:', err.message);
    return null;
  }
};

const importDatabase = (sqlDump) => {
  return new Promise((resolve, reject) => {
    const statements = sqlDump.split(';').filter(stmt => stmt.trim());
    let completed = 0;
    
    if (statements.length === 0) return resolve();
    
    const executeStatement = (index) => {
      if (index >= statements.length) return resolve();
      
      const statement = statements[index].trim();
      if (!statement) return executeStatement(index + 1);
      
      // Skip comments and empty statements
      if (statement.startsWith('--') || statement.startsWith('/*')) {
        return executeStatement(index + 1);
      }
      
      db.run(statement, [], (err) => {
        if (err) {
          // Skip errors for CREATE TABLE IF NOT EXISTS statements that fail due to existing tables
          if (err.message.includes('already exists') && statement.toLowerCase().includes('create table')) {
            console.log(`[Import] Skipping existing table: ${statement.substring(0, 50)}...`);
          } else {
            console.warn(`[Import] Statement failed: ${statement.substring(0, 100)}... Error: ${err.message}`);
          }
        }
        
        completed++;
        if (completed >= statements.length) resolve();
        else executeStatement(index + 1);
      });
    };
    
    executeStatement(0);
  });
};

async function factoryResetDB() {
  const tables = ['rates', 'sessions', 'config', 'hotspots', 'wireless_settings', 'wifi_devices', 'device_sessions', 'vlans', 'bridges', 'pppoe_server', 'pppoe_users'];
  
  // Truncate admin_sessions instead of dropping to prevent race conditions with middleware
  try {
    await run('DELETE FROM admin_sessions');
  } catch (e) {
    // Ignore if table doesn't exist
  }

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
    token TEXT UNIQUE, -- Enforce unique tokens
    is_paused INTEGER DEFAULT 0,
    token_expires_at DATETIME,
    session_type TEXT DEFAULT 'coin' CHECK (session_type IN ('coin', 'voucher', 'mixed')),
    voucher_code TEXT
  )`);

  // Migration: Add token column if it doesn't exist
  try {
    await run("ALTER TABLE sessions ADD COLUMN token TEXT");
  } catch (e) {
    // Column likely exists
  }
  
  // Migration: Add token_expires_at column if it doesn't exist
  try {
    await run("ALTER TABLE sessions ADD COLUMN token_expires_at DATETIME");
  } catch (e) {
    // Column likely exists
  }
  
  // Migration: Add session_type column if it doesn't exist
  try {
    await run("ALTER TABLE sessions ADD COLUMN session_type TEXT DEFAULT 'coin' CHECK (session_type IN ('coin', 'voucher', 'mixed'))");
  } catch (e) {
    // Column likely exists
  }
  
  // Migration: Add voucher_code column if it doesn't exist
  try {
    await run("ALTER TABLE sessions ADD COLUMN voucher_code TEXT");
  } catch (e) {
    // Column likely exists
  }
  
  // Migration: Add device_uuid column for device identification
  try {
    await run("ALTER TABLE sessions ADD COLUMN device_uuid TEXT");
    console.log('[DB] Added device_uuid column to sessions table');
  } catch (e) {
    // Column likely exists
  }
  
  // Migration: Add device_fingerprint column for session hijacking prevention
  try {
    await run("ALTER TABLE sessions ADD COLUMN device_fingerprint TEXT");
    console.log('[DB] Added device_fingerprint column to sessions table');
  } catch (e) {
    // Column likely exists
  }
  
  // Migration: Add index on device_uuid for performance
  try {
    await run("CREATE INDEX IF NOT EXISTS idx_sessions_device_uuid ON sessions(device_uuid)");
    console.log('[DB] Added index on sessions.device_uuid');
  } catch (e) {
    // Index likely exists
  }
  
  // Migration: Add UNIQUE constraint to token column if it doesn't exist
  try {
    await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_unique ON sessions(token)");
    console.log('[DB] Added UNIQUE constraint to sessions.token column');
    
    // Also add a trigger to prevent token updates that would cause conflicts
    await run(`
      CREATE TRIGGER IF NOT EXISTS prevent_token_conflict 
      BEFORE UPDATE ON sessions
      FOR EACH ROW
      WHEN NEW.token != OLD.token
      BEGIN
        SELECT CASE 
          WHEN EXISTS(SELECT 1 FROM sessions WHERE token = NEW.token AND mac != NEW.mac) 
          THEN RAISE(ABORT, 'Token already exists for different device')
        END;
      END;
    `);
    console.log('[DB] Added token conflict prevention trigger');
  } catch (e) {
    // Constraint likely exists or failed
    console.log('[DB] Token UNIQUE constraint check completed');
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
    upload_limit INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0
  )`);

  await run(`CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT,
    recipient TEXT,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_read INTEGER DEFAULT 0
  )`);

  await run(`CREATE TABLE IF NOT EXISTS gaming_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    protocol TEXT NOT NULL, -- 'tcp', 'udp', 'both'
    port_start INTEGER NOT NULL,
    port_end INTEGER NOT NULL,
    enabled INTEGER DEFAULT 1
  )`);

  // Seed default gaming rules if empty
  const ruleCount = await get("SELECT COUNT(*) as count FROM gaming_rules");
  if (ruleCount.count === 0) {
    console.log('[DB] Seeding default gaming rules...');
    const defaultRules = [
      { name: 'Mobile Legends', protocol: 'both', port_start: 30000, port_end: 30300 },
      { name: 'Mobile Legends (Voice)', protocol: 'udp', port_start: 5000, port_end: 5200 },
      { name: 'Call of Duty Mobile', protocol: 'udp', port_start: 7000, port_end: 9000 },
      { name: 'PUBG Mobile', protocol: 'udp', port_start: 10000, port_end: 20000 },
      { name: 'League of Legends: Wild Rift', protocol: 'both', port_start: 10001, port_end: 10010 },
      { name: 'Roblox', protocol: 'udp', port_start: 49152, port_end: 65535 }
    ];

    for (const rule of defaultRules) {
      await run("INSERT INTO gaming_rules (name, protocol, port_start, port_end, enabled) VALUES (?, ?, ?, ?, ?)", 
        [rule.name, rule.protocol, rule.port_start, rule.port_end, 1]);
    }
  }
  
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
  
  await run(`CREATE TABLE IF NOT EXISTS ip_pools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    network TEXT NOT NULL,
    gateway TEXT NOT NULL,
    start_ip TEXT NOT NULL,
    end_ip TEXT NOT NULL,
    subnet_mask TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'reserved', 'disabled')),
    assigned_to TEXT, -- References to hotspot interface or pppoe interface
    assigned_type TEXT CHECK (assigned_type IN ('hotspot', 'pppoe', 'static')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS pppoe_server (
    interface TEXT PRIMARY KEY,
    local_ip TEXT NOT NULL,
    ip_pool_start TEXT NOT NULL,
    ip_pool_end TEXT NOT NULL,
    dns1 TEXT DEFAULT '8.8.8.8',
    dns2 TEXT DEFAULT '8.8.4.4',
    service_name TEXT DEFAULT '',
    enabled INTEGER DEFAULT 0
  )`);

  await run(`CREATE TABLE IF NOT EXISTS pppoe_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    ip_address TEXT,
    billing_profile_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS pppoe_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rate_limit_dl INTEGER DEFAULT 0,
    rate_limit_ul INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS pppoe_billing_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES pppoe_profiles(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS multi_wan_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER DEFAULT 0,
    mode TEXT DEFAULT 'pcc', -- 'pcc' or 'ecmp'
    pcc_method TEXT DEFAULT 'both_addresses', -- 'both_addresses', 'both_addresses_ports'
    interfaces TEXT DEFAULT '[]' -- JSON array of interfaces
  )`);
  
  // Seed default Multi-WAN config if missing
  try {
    await run("INSERT OR IGNORE INTO multi_wan_config (id, enabled, mode, pcc_method, interfaces) VALUES (1, 0, 'pcc', 'both_addresses', '[]')");
  } catch (e) {}

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

  // License and Trial Management Tables
  await run(`CREATE TABLE IF NOT EXISTS license_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hardware_id TEXT UNIQUE NOT NULL,
    license_key TEXT,
    is_active INTEGER DEFAULT 0,
    is_revoked INTEGER DEFAULT 0,
    activated_at DATETIME,
    expires_at DATETIME,
    trial_started_at DATETIME,
    trial_expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migration: Add is_revoked column if it doesn't exist
  try {
    const licenseCols = await all("PRAGMA table_info(license_info)");
    if (!licenseCols.some(row => row.name === 'is_revoked')) {
      console.log('[DB] Migration: Adding is_revoked to license_info');
      await run("ALTER TABLE license_info ADD COLUMN is_revoked INTEGER DEFAULT 0");
    }
    
    // Check sessions for is_paused
    const sessionCols = await all("PRAGMA table_info(sessions)");
    if (!sessionCols.some(row => row.name === 'is_paused')) {
      console.log('[DB] Migration: Adding is_paused to sessions');
      await run("ALTER TABLE sessions ADD COLUMN is_paused INTEGER DEFAULT 0");
    }
  } catch (e) {
    // Column likely exists
  }
  
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

    // Check sessions for is_paused
    if (!sessionCols.some(row => row.name === 'is_paused')) {
      console.log('[DB] Migration: Adding is_paused to sessions');
      await run("ALTER TABLE sessions ADD COLUMN is_paused INTEGER DEFAULT 0");
    }

    // Check wifi_devices for limits
    const deviceCols = await all("PRAGMA table_info(wifi_devices)");
    if (!deviceCols.some(row => row.name === 'download_limit')) {
      console.log('[DB] Migration: Adding limits to wifi_devices');
      await run("ALTER TABLE wifi_devices ADD COLUMN download_limit INTEGER DEFAULT 0");
      await run("ALTER TABLE wifi_devices ADD COLUMN upload_limit INTEGER DEFAULT 0");
    }

    // Check wifi_devices for is_deleted flag
    if (!deviceCols.some(row => row.name === 'is_deleted')) {
      console.log('[DB] Migration: Adding is_deleted to wifi_devices');
      await run("ALTER TABLE wifi_devices ADD COLUMN is_deleted INTEGER DEFAULT 0");
    }

    // Check license_info for expires_at
    const licenseCols = await all("PRAGMA table_info(license_info)");
    if (!licenseCols.some(row => row.name === 'expires_at')) {
      console.log('[DB] Migration: Adding expires_at to license_info');
      await run("ALTER TABLE license_info ADD COLUMN expires_at DATETIME");
    }

    // Check pppoe_users for billing_profile_id
    const pppoeUserCols = await all("PRAGMA table_info(pppoe_users)");
    if (!pppoeUserCols.some(row => row.name === 'billing_profile_id')) {
      console.log('[DB] Migration: Adding billing_profile_id to pppoe_users');
      await run("ALTER TABLE pppoe_users ADD COLUMN billing_profile_id INTEGER");
    }

    // Check if vouchers table exists, create if not
    const voucherTableExists = await get("SELECT name FROM sqlite_master WHERE type='table' AND name='vouchers'");
    if (!voucherTableExists) {
      console.log('[DB] Migration: Creating vouchers table');
      await run(`
        CREATE TABLE vouchers (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          code TEXT UNIQUE NOT NULL,
          minutes INTEGER NOT NULL,
          price REAL NOT NULL,
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
          download_limit INTEGER DEFAULT 0,
          upload_limit INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME NOT NULL,
          used_at DATETIME,
          used_by_mac TEXT,
          used_by_ip TEXT,
          session_id TEXT
        )
      `);
      
      // Create indexes for faster lookups
      await run("CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code)");
      await run("CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status)");
      await run("CREATE INDEX IF NOT EXISTS idx_vouchers_session_id ON vouchers(session_id)");
      
      console.log('[DB] Vouchers table created successfully');
    } else {
      // Check if session_id column exists in existing table
      const voucherCols = await all("PRAGMA table_info(vouchers)");
      if (!voucherCols.some(row => row.name === 'session_id')) {
        console.log('[DB] Migration: Adding session_id to vouchers');
        await run("ALTER TABLE vouchers ADD COLUMN session_id TEXT");
      }
          
      // Check if used_by_device_uuid column exists
      if (!voucherCols.some(row => row.name === 'used_by_device_uuid')) {
        console.log('[DB] Migration: Adding used_by_device_uuid to vouchers');
        await run("ALTER TABLE vouchers ADD COLUMN used_by_device_uuid TEXT");
        await run("CREATE INDEX IF NOT EXISTS idx_vouchers_device_uuid ON vouchers(used_by_device_uuid)");
      }
    }
  } catch (e) {
    console.error('[DB] Migration error:', e.message);
  }

  // 3. Initialize default config
  await run(`INSERT OR IGNORE INTO config (key, value) VALUES ('boardType', 'raspberry_pi')`);
  await run(`INSERT OR IGNORE INTO config (key, value) VALUES ('coinPin', '2')`);
  await run(`INSERT OR IGNORE INTO config (key, value) VALUES ('qos_discipline', 'cake')`);
  
  // 4. Multi-coin slot support config
  await run(`INSERT OR IGNORE INTO config (key, value) VALUES ('serialPort', '/dev/ttyUSB0')`);
  await run(`INSERT OR IGNORE INTO config (key, value) VALUES ('espIpAddress', '192.168.4.1')`);
  await run(`INSERT OR IGNORE INTO config (key, value) VALUES ('espPort', '80')`);
  await run(`INSERT OR IGNORE INTO config (key, value) VALUES ('coinSlots', '[]')`);
  await run(`INSERT OR IGNORE INTO config (key, value) VALUES ('nodemcuDevices', '[]')`);
  
  // 5. MAC Sync configuration (enhanced session restoration)
  await run(`INSERT OR IGNORE INTO config (key, value) VALUES ('mac_sync_enabled', '1')`);
  
  console.log('[DB] Initialization complete.');
}

module.exports = { run, all, get, factoryResetDB, init, close, exportDatabase, importDatabase, getHardwareInfo, getCurrentLicense };