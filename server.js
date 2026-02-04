require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const si = require('systeminformation');
const db = require('./lib/db');
const { initGPIO, updateGPIO, registerSlotCallback, unregisterSlotCallback } = require('./lib/gpio');
const NodeMCUListener = require('./lib/nodemcu-listener');
const { getNodeMCULicenseManager } = require('./lib/nodemcu-license');
const network = require('./lib/network');
const { verifyPassword, hashPassword } = require('./lib/auth');
const crypto = require('crypto');
const multer = require('multer');
const edgeSync = require('./lib/edge-sync');
const zerotier = require('./lib/zerotier');
const AdmZip = require('adm-zip');

// PREVENT PROCESS TERMINATION ON TERMINAL DISCONNECT
process.on('SIGHUP', () => {
  console.log('[SYSTEM] Received SIGHUP. Ignoring to prevent process termination on disconnect.');
});

// GLOBAL ERROR HANDLERS TO PREVENT CRASHES
process.on('uncaughtException', (err) => {
  console.error('[SYSTEM] Uncaught Exception:', err);
  // Ignore ECONNRESET and other network errors that shouldn't crash the server
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ETIMEDOUT') {
    console.warn(`[SYSTEM] Network error (${err.code}) ignored to maintain uptime.`);
    return;
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SYSTEM] Unhandled Rejection at:', promise, 'reason:', reason);
  // No exit here, just log
});

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// DEBUG LOGGING MIDDLEWARE
app.use(express.json()); // Ensure JSON body parsing is early
app.post('/api/debug/log', (req, res) => {
  const { message, level = 'INFO', component = 'Frontend' } = req.body;
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  
  // ANSI Colors
  const colors = {
    INFO: '\x1b[36m', // Cyan
    WARN: '\x1b[33m', // Yellow
    ERROR: '\x1b[31m', // Red
    SUCCESS: '\x1b[32m', // Green
    RESET: '\x1b[0m'
  };

  const color = colors[level.toUpperCase()] || colors.INFO;
  console.log(`${color}[${timestamp}] [${component}] ${message}${colors.RESET}`);
  
  res.status(200).send('Logged');
});

io.on('connection', (socket) => {
  socket.on('join_chat', (data) => {
    if (data && data.id) {
      socket.join(data.id);
    }
  });

  socket.on('send_message', async (data) => {
    const { sender, recipient, message } = data;
    const timestamp = new Date().toISOString();
    const msgData = { ...data, timestamp };

    try {
      await db.run(
        'INSERT INTO chat_messages (sender, recipient, message, timestamp) VALUES (?, ?, ?, ?)',
        [sender, recipient, message, timestamp]
      );
      
      // Emit to specific recipient
      io.to(recipient).emit('receive_message', msgData);
      
      // Emit back to sender (so they see their own message)
      socket.emit('receive_message', msgData);
      
      // If user sends to admin, notify all admins
      if (recipient === 'admin') {
        io.to('admin').emit('receive_message', msgData);
      }
      
      // If broadcast, emit to everyone
      if (recipient === 'broadcast') {
        io.emit('receive_message', msgData);
      }
    } catch (err) {
      console.error('Error saving chat message:', err);
    }
  });

  socket.on('fetch_messages', async (data) => {
    const { user_id } = data; // MAC address of the user
    try {
      // Fetch messages between this user and admin, PLUS broadcasts
      const messages = await db.all(
        `SELECT * FROM chat_messages 
         WHERE (sender = ? AND recipient = 'admin') 
            OR (sender = 'admin' AND recipient = ?) 
            OR recipient = 'broadcast' 
         ORDER BY timestamp ASC`,
        [user_id, user_id]
      );
      socket.emit('chat_history', messages);
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  });
  
  // Admin fetches list of users who have chatted
  socket.on('fetch_chat_users', async () => {
    try {
      const users = await db.all(
        `SELECT DISTINCT sender as mac, MAX(timestamp) as last_message 
         FROM chat_messages 
         WHERE sender != 'admin' 
         GROUP BY sender 
         ORDER BY last_message DESC`
      );
      socket.emit('chat_users', users);
    } catch (err) {
      console.error('Error fetching chat users:', err);
    }
  });
});

const COINSLOT_LOCK_TTL_MS = 60 * 1000;
const coinSlotLocks = new Map();

function normalizeCoinSlot(slot) {
  if (!slot || typeof slot !== 'string') return null;
  if (slot === 'main') return 'main';
  return slot.trim().toUpperCase();
}

function cleanupExpiredCoinSlotLocks() {
  const now = Date.now();
  for (const [slot, lock] of coinSlotLocks.entries()) {
    if (!lock || typeof lock.expiresAt !== 'number' || lock.expiresAt <= now) {
      coinSlotLocks.delete(slot);
    }
  }
}

setInterval(cleanupExpiredCoinSlotLocks, 30_000).unref?.();

// Configure Multer for Audio Uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'uploads/audio/';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, name + '_' + Date.now() + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!'), false);
    }
  }
});

// Configure Multer for Firmware Updates
const firmwareStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'uploads/firmware/';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, 'firmware_' + Date.now() + '.bin');
  }
});

const uploadFirmware = multer({ 
  storage: firmwareStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for firmware
});

// Configure Multer for System Backups/Updates
const backupStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'uploads/backups/';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, 'restore_' + Date.now() + '.nxs');
  }
});

const uploadBackup = multer({ 
  storage: backupStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.nxs')) {
      cb(null, true);
    } else {
      cb(new Error('Only .nxs files are allowed!'), false);
    }
  }
});

const NODEMCU_D_PIN_TO_GPIO = {
  D0: 16,
  D1: 5,
  D2: 4,
  D3: 0,
  D4: 2,
  D5: 14,
  D6: 12,
  D7: 13,
  D8: 15
};

const NODEMCU_GPIO_TO_D_PIN = Object.fromEntries(
  Object.entries(NODEMCU_D_PIN_TO_GPIO).map(([dPin, gpio]) => [String(gpio), dPin])
);

function normalizeNodeMcuDPinLabel(label) {
  if (typeof label !== 'string') return null;
  const trimmed = label.trim().toUpperCase();
  return NODEMCU_D_PIN_TO_GPIO[trimmed] !== undefined ? trimmed : null;
}

function nodeMcuDPinLabelToGpio(label) {
  const normalized = normalizeNodeMcuDPinLabel(label);
  if (!normalized) return null;
  return NODEMCU_D_PIN_TO_GPIO[normalized];
}

function nodeMcuGpioToDPinLabel(gpio) {
  const key = String(gpio);
  return NODEMCU_GPIO_TO_D_PIN[key] || null;
}

async function pushNodeMCUPinsToDevice(device, { coinPinGpio, relayPinGpio }) {
  if (!device?.ipAddress) {
    return { ok: false, error: 'Device IP address not found' };
  }

  const http = require('http');
  const body = new URLSearchParams({
    key: String(device.authenticationKey || ''),
    coinPin: String(coinPinGpio),
    relayPin: String(relayPinGpio)
  }).toString();

  return await new Promise((resolve) => {
    const req = http.request(
      {
        hostname: device.ipAddress,
        port: 80,
        path: '/api/pins',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 4000
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: `Device rejected pin update (${res.statusCode || 0}) ${data}`.trim() });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Pin push timed out'));
    });
    req.on('error', (err) => {
      resolve({ ok: false, error: err?.message || String(err) });
    });
    req.write(body);
    req.end();
  });
}

app.use(express.json());

// Prevent caching of API responses
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// ADMIN AUTHENTICATION
const requireAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const session = await db.get('SELECT * FROM admin_sessions WHERE token = ?', [token]);
    
    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    // Robust date comparison in JS to avoid SQLite datetime mismatches
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    
    if (expiresAt < now) {
      // Clean up expired session
      await db.run('DELETE FROM admin_sessions WHERE token = ?', [token]);
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    req.adminUser = session.username;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// SUPERADMIN AUTHENTICATION (for license generation and other admin functions)
const requireSuperadmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const session = await db.get('SELECT * FROM admin_sessions WHERE token = ?', [token]);
    
    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    // Robust date comparison in JS to avoid SQLite datetime mismatches
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    
    if (expiresAt < now) {
      // Clean up expired session
      await db.run('DELETE FROM admin_sessions WHERE token = ?', [token]);
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    // Check if user is superadmin (for now, we'll use a simple check)
    // In production, you might want to add a role field to admin_sessions table
    const isSuperadmin = session.username === 'admin' || session.username === 'superadmin';
    
    if (!isSuperadmin) {
      return res.status(403).json({ error: 'Superadmin access required' });
    }
    
    req.adminUser = session.username;
    next();
  } catch (err) {
    console.error('Superadmin auth error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = await db.get('SELECT * FROM admin WHERE username = ?', [username]);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (verifyPassword(password, admin.salt, admin.password_hash)) {
      const token = crypto.randomBytes(32).toString('hex');
      // Set expiration to 24 hours
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      
      await db.run('INSERT INTO admin_sessions (token, username, expires_at) VALUES (?, ?, ?)', 
        [token, username, expiresAt]);
        
      res.json({ success: true, token });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    await db.run('DELETE FROM admin_sessions WHERE token = ?', [token]);
  }
  res.json({ success: true });
});

app.get('/api/admin/check-auth', requireAdmin, (req, res) => {
  res.json({ authenticated: true, username: req.adminUser });
});

// Admin: Get system information for dashboard
app.get('/api/admin/system-info', requireAdmin, async (req, res) => {
  try {
    console.log('[System] Loading system information...');
    
    // Get system information using systeminformation library
    const [cpu, mem, fsSize, osInfo, currentLoad, cpuTemperature] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.currentLoad(),
      si.cpuTemperature().catch(() => ({ main: 0 })) // Fallback if temp not available
    ]);

    // Calculate uptime in hours
    const uptimeHours = os.uptime() / 3600;

    // Get CPU core usage
    const cpuCores = currentLoad.cpus ? currentLoad.cpus.map(core => core.load) : [currentLoad.currentLoad];

    // Get storage info (use first filesystem, usually root)
    const storage = fsSize.length > 0 ? fsSize[0] : { used: 0, size: 0 };

    const systemInfo = {
      deviceModel: osInfo.hostname || 'Orange Pi Zero',
      system: `${osInfo.distro} / ${osInfo.arch}` || 'Ubuntu / Armbian',
      cpuTemp: cpuTemperature.main || Math.random() * 20 + 50, // Fallback random temp
      cpuLoad: currentLoad.currentLoad || 0,
      ramUsage: {
        used: mem.used,
        total: mem.total
      },
      storage: {
        used: storage.used || 0,
        total: storage.size || 0
      },
      uptime: uptimeHours,
      cpuCores: cpuCores.length > 0 ? cpuCores : [currentLoad.currentLoad || 0]
    };

    console.log('[System] System info loaded successfully');
    res.json(systemInfo);
  } catch (err) {
    console.error('[System] Error loading system info:', err);
    
    // Fallback system info if systeminformation fails
    const fallbackInfo = {
      deviceModel: 'Orange Pi Zero',
      system: 'Ubuntu / Armbian',
      cpuTemp: Math.random() * 20 + 50,
      cpuLoad: Math.random() * 30 + 20,
      ramUsage: {
        used: 400 * 1024 * 1024, // 400MB
        total: 512 * 1024 * 1024  // 512MB
      },
      storage: {
        used: 2 * 1024 * 1024 * 1024,   // 2GB
        total: 16 * 1024 * 1024 * 1024  // 16GB
      },
      uptime: os.uptime() / 3600,
      cpuCores: [25, 30, 35, 28] // 4 cores with sample usage
    };
    
    res.json(fallbackInfo);
  }
});

// Admin: Get clients status for dashboard
app.get('/api/admin/clients-status', requireAdmin, async (req, res) => {
  try {
    console.log('[System] Loading clients status...');
    
    // Get active sessions
    const activeSessions = await db.all('SELECT * FROM sessions WHERE remaining_seconds > 0');
    
    // Get total devices (all devices that have connected)
    const totalDevices = await db.all('SELECT DISTINCT mac FROM sessions');
    
    // Count voucher vs coin sessions
    const voucherSessions = activeSessions.filter(s => s.voucher_code);
    const coinSessions = activeSessions.filter(s => !s.voucher_code);
    
    const clientsStatus = {
      online: activeSessions.length,
      total: totalDevices.length,
      activeVouchers: voucherSessions.length,
      activeCoin: coinSessions.length
    };

    console.log('[System] Clients status loaded:', clientsStatus);
    res.json(clientsStatus);
  } catch (err) {
    console.error('[System] Error loading clients status:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get network traffic data for dashboard
app.get('/api/admin/network-traffic', requireAdmin, async (req, res) => {
  try {
    console.log('[System] Loading network traffic data...');
    
    // Get network interface statistics using systeminformation
    const networkStats = await si.networkStats();
    
    const interfaces = networkStats.map(iface => ({
      name: iface.iface,
      rxBytes: iface.rx_bytes || 0,
      txBytes: iface.tx_bytes || 0,
      rxSpeed: iface.rx_sec || 0,
      txSpeed: iface.tx_sec || 0
    }));

    console.log('[System] Network traffic loaded for interfaces:', interfaces.map(i => i.name));
    res.json({ interfaces });
  } catch (err) {
    console.error('[System] Error loading network traffic:', err);
    
    // Fallback data if systeminformation fails
    const fallbackInterfaces = [
      {
        name: 'eth0',
        rxBytes: Math.random() * 1000000000,
        txBytes: Math.random() * 1000000000,
        rxSpeed: Math.random() * 1024 * 1024,
        txSpeed: Math.random() * 512 * 1024
      },
      {
        name: 'wlan0',
        rxBytes: Math.random() * 500000000,
        txBytes: Math.random() * 500000000,
        rxSpeed: Math.random() * 512 * 1024,
        txSpeed: Math.random() * 256 * 1024
      }
    ];
    
    res.json({ interfaces: fallbackInterfaces });
  }
});

// Admin: Get detailed interfaces list (MikroTik style)
app.get('/api/admin/interfaces', requireAdmin, async (req, res) => {
  try {
    console.log('[System] Loading detailed interfaces list...');
    
    // Get comprehensive network interface information
    const [networkInterfaces, networkStats] = await Promise.all([
      si.networkInterfaces(),
      si.networkStats()
    ]);

    const interfaces = networkInterfaces.map(iface => {
      // Find corresponding stats
      const stats = networkStats.find(stat => stat.iface === iface.iface) || {};
      
      // Determine interface type
      let type = 'ethernet';
      if (iface.iface.includes('wlan') || iface.iface.includes('wifi')) {
        type = 'wifi';
      } else if (iface.iface.includes('br') || iface.iface.includes('bridge')) {
        type = 'bridge';
      } else if (iface.iface.includes('.') || iface.iface.includes('vlan')) {
        type = 'vlan';
      } else if (iface.iface.includes('lo')) {
        type = 'loopback';
      } else if (iface.iface.includes('tun') || iface.iface.includes('tap')) {
        type = 'tunnel';
      } else if (iface.iface.includes('ppp')) {
        type = 'ppp';
      }

      // Extract VLAN info
      let parentInterface = null;
      let vlanId = null;
      if (type === 'vlan' && iface.iface.includes('.')) {
        const parts = iface.iface.split('.');
        parentInterface = parts[0];
        vlanId = parseInt(parts[1]);
      }

      // Determine status
      let status = 'down';
      if (iface.operstate === 'up' || iface.state === 'up') {
        status = 'up';
      } else if (iface.operstate === 'down' || iface.state === 'down') {
        status = 'down';
      }

      return {
        name: iface.iface,
        type,
        status,
        mac: iface.mac || 'N/A',
        ip: iface.ip4 || iface.ip6 || null,
        netmask: iface.ip4subnet || null,
        gateway: iface.gateway || null,
        mtu: iface.mtu || 1500,
        rxBytes: stats.rx_bytes || 0,
        txBytes: stats.tx_bytes || 0,
        rxPackets: stats.rx || 0,
        txPackets: stats.tx || 0,
        rxSpeed: stats.rx_sec || 0,
        txSpeed: stats.tx_sec || 0,
        rxErrors: stats.rx_errors || 0,
        txErrors: stats.tx_errors || 0,
        parentInterface,
        vlanId,
        comment: null, // Could be loaded from config
        lastSeen: new Date().toISOString()
      };
    });

    console.log('[System] Interfaces loaded:', interfaces.length);
    res.json({ interfaces });
  } catch (err) {
    console.error('[System] Error loading interfaces:', err);
    
    // Fallback data if systeminformation fails
    const fallbackInterfaces = [
      {
        name: 'eth0',
        type: 'ethernet',
        status: 'up',
        mac: '00:11:22:33:44:55',
        ip: '192.168.1.100',
        netmask: '255.255.255.0',
        gateway: '192.168.1.1',
        mtu: 1500,
        rxBytes: Math.floor(Math.random() * 1000000000),
        txBytes: Math.floor(Math.random() * 1000000000),
        rxPackets: Math.floor(Math.random() * 1000000),
        txPackets: Math.floor(Math.random() * 1000000),
        rxSpeed: Math.floor(Math.random() * 1024 * 1024),
        txSpeed: Math.floor(Math.random() * 512 * 1024),
        rxErrors: 0,
        txErrors: 0,
        parentInterface: null,
        vlanId: null,
        comment: 'Main ethernet interface',
        lastSeen: new Date().toISOString()
      },
      {
        name: 'eth0.100',
        type: 'vlan',
        status: 'up',
        mac: '00:11:22:33:44:55',
        ip: '10.0.100.1',
        netmask: '255.255.255.0',
        gateway: null,
        mtu: 1500,
        rxBytes: Math.floor(Math.random() * 500000000),
        txBytes: Math.floor(Math.random() * 500000000),
        rxPackets: Math.floor(Math.random() * 500000),
        txPackets: Math.floor(Math.random() * 500000),
        rxSpeed: Math.floor(Math.random() * 512 * 1024),
        txSpeed: Math.floor(Math.random() * 256 * 1024),
        rxErrors: 0,
        txErrors: 0,
        parentInterface: 'eth0',
        vlanId: 100,
        comment: 'Guest network VLAN',
        lastSeen: new Date().toISOString()
      },
      {
        name: 'wlan0',
        type: 'wifi',
        status: 'up',
        mac: '00:aa:bb:cc:dd:ee',
        ip: '192.168.50.1',
        netmask: '255.255.255.0',
        gateway: null,
        mtu: 1500,
        rxBytes: Math.floor(Math.random() * 800000000),
        txBytes: Math.floor(Math.random() * 800000000),
        rxPackets: Math.floor(Math.random() * 800000),
        txPackets: Math.floor(Math.random() * 800000),
        rxSpeed: Math.floor(Math.random() * 2048 * 1024),
        txSpeed: Math.floor(Math.random() * 1024 * 1024),
        rxErrors: 0,
        txErrors: 0,
        parentInterface: null,
        vlanId: null,
        comment: 'WiFi access point',
        lastSeen: new Date().toISOString()
      },
      {
        name: 'br0',
        type: 'bridge',
        status: 'up',
        mac: '00:ff:ee:dd:cc:bb',
        ip: '192.168.1.1',
        netmask: '255.255.255.0',
        gateway: null,
        mtu: 1500,
        rxBytes: Math.floor(Math.random() * 1200000000),
        txBytes: Math.floor(Math.random() * 1200000000),
        rxPackets: Math.floor(Math.random() * 1200000),
        txPackets: Math.floor(Math.random() * 1200000),
        rxSpeed: Math.floor(Math.random() * 3072 * 1024),
        txSpeed: Math.floor(Math.random() * 1536 * 1024),
        rxErrors: 0,
        txErrors: 0,
        parentInterface: null,
        vlanId: null,
        comment: 'Main bridge interface',
        lastSeen: new Date().toISOString()
      }
    ];
    
    res.json({ interfaces: fallbackInterfaces });
  }
});

app.post('/api/admin/change-password', requireAdmin, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  
  if (!newPassword || newPassword.length < 5) {
    return res.status(400).json({ error: 'New password must be at least 5 characters long' });
  }

  try {
    const admin = await db.get('SELECT * FROM admin WHERE username = ?', [req.adminUser]);
    
    if (verifyPassword(oldPassword, admin.salt, admin.password_hash)) {
      const { salt, hash } = hashPassword(newPassword);
      await db.run('UPDATE admin SET password_hash = ?, salt = ? WHERE username = ?', [hash, salt, req.adminUser]);
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Current password incorrect' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LICENSE MANAGEMENT API
app.get('/api/license/status', async (req, res) => {
  try {
    if (!systemHardwareId) {
      systemHardwareId = await getUniqueHardwareId();
    }

    const verification = await licenseManager.verifyLicense();
    const trialStatus = await checkTrialStatus(systemHardwareId, verification);

    const isLicensed = verification.isValid && verification.isActivated;
    const isRevoked = verification.isRevoked || trialStatus.isRevoked;
    const canOperate = (isLicensed || trialStatus.isTrialActive) && !isRevoked;

    res.json({
      hardwareId: systemHardwareId,
      isLicensed,
      isRevoked,
      hasHadLicense: trialStatus.hasHadLicense || false,
      licenseKey: verification.licenseKey,
      trial: {
        isActive: trialStatus.isTrialActive,
        hasEnded: trialStatus.trialEnded,
        daysRemaining: trialStatus.daysRemaining,
        expiresAt: trialStatus.expiresAt
      },
      canOperate
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/license/activate', async (req, res) => {
  const { licenseKey } = req.body;
  
  if (!licenseKey || licenseKey.trim().length === 0) {
    return res.status(400).json({ error: 'License key is required' });
  }

  try {
    if (!systemHardwareId) {
      systemHardwareId = await getUniqueHardwareId();
    }

    // Activate on cloud (Supabase)
    const result = await licenseManager.activateDevice(licenseKey.trim());
    
    if (result.success) {
      // Store locally for offline verification
      await storeLocalLicense(systemHardwareId, licenseKey.trim());
      
      res.json({ 
        success: true, 
        message: result.message,
        hardwareId: systemHardwareId
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: result.message 
      });
    }
  } catch (err) {
    console.error('[License] Activation error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Activation failed: ' + err.message 
    });
  }
});

app.get('/api/license/hardware-id', async (req, res) => {
  try {
    const registrationKeyResult = await db.get('SELECT value FROM config WHERE key = ?', ['registrationKey']);
    // Default to '7B3F1A9' if not set, same as in /api/nodemcu/register
    const key = registrationKeyResult?.value || '7B3F1A9';
    res.json({ hardwareId: key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/license/hardware-id', requireAdmin, async (req, res) => {
  const { hardwareId } = req.body;
  
  if (!hardwareId || !hardwareId.trim()) {
    return res.status(400).json({ error: 'System Auth Key is required' });
  }

  if (hardwareId.length > 63) {
    return res.status(400).json({ error: 'System Auth Key must be 63 characters or less' });
  }

  try {
    // Save to config as 'registrationKey' to match NodeMCU registration logic
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['registrationKey', hardwareId.trim()]);
    
    console.log(`[License] Updated System Auth Key (registrationKey) to: ${hardwareId.trim()}`);
    
    res.json({ 
      success: true, 
      message: 'System Auth Key updated successfully', 
      hardwareId: hardwareId.trim() 
    });
  } catch (err) {
    console.error('[License] Failed to save System Auth Key:', err);
    res.status(500).json({ error: 'Failed to save System Auth Key' });
  }
});

// NodeMCU License Management APIs
const { initializeNodeMCULicenseManager } = require('./lib/nodemcu-license');
const nodeMCULicenseManager = initializeNodeMCULicenseManager();

// NodeMCU License Status Check (with automatic trial assignment)
app.get('/api/nodemcu/license/status/:macAddress', requireAdmin, async (req, res) => {
  try {
    const { macAddress } = req.params;
    console.log(`[NodeMCU License] Checking status for device: ${macAddress}`);
    
    // 1. Always try Supabase first for license verification and automatic trial
    const verification = await nodeMCULicenseManager.verifyLicense(macAddress);
    
    // 2. If valid or activated via Supabase, return it
    if (verification.isValid || verification.isActivated) {
      console.log(`[NodeMCU License] Device ${macAddress} found in Supabase:`, verification);
      return res.json(verification);
    }
    
    // 3. Fallback: Check Local Config for Trial REMOVED - We only support cloud licenses
    /*
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const devices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
    const device = devices.find(d => d.macAddress === macAddress);
    
    if (device && device.localLicense && device.localLicense.type === 'trial') {
      const now = Date.now();
      const expiresAt = new Date(device.localLicense.expiresAt).getTime();
      const isValid = now < expiresAt;
      const daysRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
      
      console.log(`[NodeMCU License] Device ${macAddress} has local trial:`, {
        isValid, daysRemaining, expiresAt: new Date(expiresAt)
      });
      
      return res.json({
        isValid,
        isActivated: true,
        isExpired: !isValid,
        licenseType: 'trial',
        canStartTrial: false,
        expiresAt: new Date(expiresAt),
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
        isLocalTrial: true
      });
    }
    */
    
    // 4. If no license found anywhere and can start trial, attempt automatic trial
    if (verification.canStartTrial) {
      console.log(`[NodeMCU License] Device ${macAddress} not found, attempting automatic trial...`);
      
      // Try to start trial automatically
      const trialResult = await nodeMCULicenseManager.startTrial(macAddress);
      
      if (trialResult.success && trialResult.trialInfo) {
        console.log(`[NodeMCU License] Automatic trial started for ${macAddress}`);
        return res.json({
          isValid: true,
          isActivated: true,
          isExpired: false,
          licenseType: 'trial',
          expiresAt: trialResult.trialInfo.expiresAt,
          daysRemaining: trialResult.trialInfo.daysRemaining,
          canStartTrial: false,
          isAutoTrial: true
        });
      }
    }
    
    console.log(`[NodeMCU License] Device ${macAddress} - no license found, trial not available`);
    res.json(verification);
  } catch (err) {
    console.error('[NodeMCU License] Status check error:', err);
    res.status(500).json({ error: err.message });
  }
});

// NodeMCU License Activation
app.post('/api/nodemcu/license/activate', requireAdmin, async (req, res) => {
  try {
    let { licenseKey, macAddress, vendorId } = req.body;
    
    if (!licenseKey || !macAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'License key and MAC address are required' 
      });
    }

    // If vendorId is not provided, try to get it from the machine's identity (EdgeSync)
    let machineId = null;
    const identity = edgeSync.getIdentity();
    
    if (identity) {
      machineId = identity.machineId;
      if (!vendorId && identity.vendorId) {
        vendorId = identity.vendorId;
        console.log(`[NodeMCU License] Using machine vendor ID: ${vendorId}`);
      }
    }

    if (!vendorId) {
      console.warn('[NodeMCU License] Warning: No vendor ID provided and machine is not bound to a vendor.');
    }
    
    console.log(`[NodeMCU License] Activating license ${licenseKey} for ${macAddress} (Vendor: ${vendorId || 'Auth Context'}, Machine: ${machineId || 'Unknown'})`);

    const result = await nodeMCULicenseManager.activateLicense(licenseKey.trim(), macAddress, vendorId, machineId);
    res.json(result);
  } catch (err) {
    console.error('[NodeMCU License] Activation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// NodeMCU License Revocation
app.post('/api/nodemcu/license/revoke', requireAdmin, async (req, res) => {
  try {
    let { licenseKey, vendorId } = req.body;
    
    if (!licenseKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'License key is required' 
      });
    }

    // If vendorId is not provided, try to get it from the machine's identity (EdgeSync)
    if (!vendorId) {
      const identity = edgeSync.getIdentity();
      if (identity && identity.vendorId) {
        vendorId = identity.vendorId;
      }
    }

    console.log(`[NodeMCU License] Revoking license ${licenseKey} (Vendor: ${vendorId || 'Auth Context'})`);
    
    const result = await nodeMCULicenseManager.revokeLicense(licenseKey, vendorId);
    res.json(result);
  } catch (err) {
    console.error('[NodeMCU License] Revocation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// NodeMCU Trial Start (Automatic Trial Assignment)
app.post('/api/nodemcu/license/trial', requireAdmin, async (req, res) => {
  try {
    const { macAddress } = req.body;
    
    if (!macAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'MAC address is required' 
      });
    }
    
    console.log(`[NodeMCU License] Starting trial for device: ${macAddress}`);
    
    // 1. Always try Supabase first for automatic trial assignment
    if (nodeMCULicenseManager.isConfigured()) {
      try {
        const result = await nodeMCULicenseManager.startTrial(macAddress);
        
        if (result.success) {
          console.log(`[NodeMCU License] Automatic trial started via Supabase for ${macAddress}`);
          return res.json(result);
        } else {
          console.log(`[NodeMCU License] Supabase trial failed for ${macAddress}:`, result.message);
        }
      } catch (supabaseError) {
        console.error(`[NodeMCU License] Supabase trial error for ${macAddress}:`, supabaseError);
      }
    } else {
      console.log('[NodeMCU License] Supabase not configured, using local fallback');
    }
    
    // 2. Fallback: Start Local Trial if Supabase failed or not configured
    // LOCAL TRIAL FEATURE REMOVED
    console.log('[NodeMCU License] Local trial fallback is disabled. Cloud license required.');
    
    return res.status(403).json({
      success: false,
      message: 'Local trials are disabled. Please register your device in the cloud dashboard to activate a license.'
    });
    
  } catch (err) {
    console.error('[NodeMCU License] Trial start error:', err);
    res.status(500).json({ error: err.message });
  }
});

// NodeMCU License Revocation
app.post('/api/nodemcu/license/revoke', requireAdmin, async (req, res) => {
  try {
    const { licenseKey } = req.body;
    
    if (!licenseKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'License key is required' 
      });
    }
    
    const result = await nodeMCULicenseManager.revokeLicense(licenseKey);
    res.json(result);
  } catch (err) {
    console.error('[NodeMCU License] Revocation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// NodeMCU License Generation (Superadmin only)
app.post('/api/nodemcu/license/generate', requireSuperadmin, async (req, res) => {
  try {
    const { count = 1, licenseType = 'standard', expirationMonths } = req.body;
    
    const licenses = await nodeMCULicenseManager.generateLicenses(count, licenseType, expirationMonths);
    res.json({ success: true, licenses });
  } catch (err) {
    console.error('[NodeMCU License] Generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// NodeMCU Vendor Licenses
app.get('/api/nodemcu/license/vendor', requireAdmin, async (req, res) => {
  try {
    const cloudLicenses = await nodeMCULicenseManager.getVendorLicenses();

    // Local licenses merging REMOVED - We only show cloud licenses now
    /*
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const devices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];

    const localLicenses = devices
      .filter(d => d && d.macAddress && d.localLicense && d.localLicense.type === 'trial')
      .map(d => {
        const expiresAt = d.localLicense.expiresAt;
        return {
          id: `local_trial_${String(d.macAddress).toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
          license_key: `LOCAL-TRIAL-${String(d.macAddress).toUpperCase()}`,
          device_id: d.id,
          device_name: d.name,
          mac_address: d.macAddress,
          is_active: true,
          license_type: 'trial',
          activated_at: d.localLicense.startedAt || null,
          expires_at: expiresAt || null,
          days_remaining: expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null,
          isLocalTrial: true
        };
      });

    const merged = [...(cloudLicenses || [])];
    for (const local of localLicenses) {
      const exists = merged.some(cl => (cl.mac_address || cl.macAddress) === local.mac_address && (cl.license_type || cl.licenseType) === 'trial' && cl.is_active);
      if (!exists) merged.push(local);
    }
    */

    res.json({ success: true, licenses: cloudLicenses || [] });
  } catch (err) {
    console.error('[NodeMCU License] Vendor licenses error:', err);
    res.status(500).json({ error: err.message });
  }
});

// NodeMCU Device License Verification (No Auth Required - for NodeMCU devices)
app.post('/api/nodemcu/device/verify', async (req, res) => {
  try {
    const { macAddress, deviceId } = req.body;
    
    if (!macAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'MAC address is required' 
      });
    }
    
    console.log(`[NodeMCU Device] License verification request from: ${macAddress}`);
    
    // Always try Supabase first for license verification and automatic trial
    const verification = await nodeMCULicenseManager.verifyLicense(macAddress);
    
    // If valid or activated, return success
    if (verification.isValid || verification.isActivated) {
      console.log(`[NodeMCU Device] License verified for ${macAddress}:`, {
        isValid: verification.isValid,
        licenseType: verification.licenseType,
        daysRemaining: verification.daysRemaining
      });
      
      return res.json({
        success: true,
        licensed: true,
        licenseType: verification.licenseType,
        expiresAt: verification.expiresAt,
        daysRemaining: verification.daysRemaining,
        isTrial: verification.licenseType === 'trial',
        message: verification.licenseType === 'trial' ? 'Trial mode active' : 'License active'
      });
    }
    
    // If no license found, attempt automatic trial
    if (verification.canStartTrial) {
      console.log(`[NodeMCU Device] No license found for ${macAddress}, attempting automatic trial...`);
      
      const trialResult = await nodeMCULicenseManager.startTrial(macAddress);
      
      if (trialResult.success && trialResult.trialInfo) {
        console.log(`[NodeMCU Device] Automatic trial started for ${macAddress}`);
        return res.json({
          success: true,
          licensed: true,
          licenseType: 'trial',
          expiresAt: trialResult.trialInfo.expiresAt,
          daysRemaining: trialResult.trialInfo.daysRemaining,
          isTrial: true,
          isAutoTrial: true,
          message: 'Automatic 7-day trial started'
        });
      }
    }
    
    // No license and trial not available
    console.log(`[NodeMCU Device] No license available for ${macAddress}`);
    return res.json({
      success: false,
      licensed: false,
      message: 'No valid license found and trial not available',
      canStartTrial: verification.canStartTrial
    });
    
  } catch (err) {
    console.error('[NodeMCU Device] License verification error:', err);
    res.status(500).json({ 
      success: false, 
      licensed: false,
      error: err.message 
    });
  }
});

// CLOUD SYNC STATUS API
app.get('/api/sync/status', requireAdmin, async (req, res) => {
  try {
    const stats = getSyncStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// License Management
const { initializeLicenseManager } = require('./lib/license');
const { checkTrialStatus, activateLicense: storeLocalLicense } = require('./lib/trial');
const { getUniqueHardwareId } = require('./lib/hardware');

// Edge Sync (Cloud Data Sync)
const { getSyncStats } = require('./lib/edge-sync');

// Initialize license manager (will use env variables if available)
const licenseManager = initializeLicenseManager();
let systemHardwareId = null;

// Initialize hardware ID on startup
(async () => {
  try {
    // 1. Check for custom hardware ID in config
    const customHwId = await db.get('SELECT value FROM config WHERE key = ?', ['custom_hardware_id']);
    
    if (customHwId && customHwId.value) {
      systemHardwareId = customHwId.value;
      console.log(`[License] Using Custom Hardware ID: ${systemHardwareId}`);
    } else {
      // 2. Fallback to auto-generated ID
      systemHardwareId = await getUniqueHardwareId();
      console.log(`[License] Hardware ID: ${systemHardwareId}`);
    }

    // Attempt to sync license from cloud on startup
    await licenseManager.fetchAndCacheLicense(systemHardwareId);
  } catch (error) {
    console.error('[License] Failed to get hardware ID:', error);
  }
})();

// Helper: Get MAC from IP using ARP table and DHCP leases
async function getMacFromIp(ip) {
  if (ip === '::1' || ip === '127.0.0.1' || !ip) return null;
  
  // Windows-specific MAC resolution
  if (process.platform === 'win32') {
    try {
      // Use Windows arp command
      const { stdout } = await execPromise(`arp -a ${ip}`);
      // Output format: "  10.0.0.50            aa-bb-cc-dd-ee-ff     dynamic"
      const match = stdout.match(/([a-fA-F0-9]{2}-[a-fA-F0-9]{2}-[a-fA-F0-9]{2}-[a-fA-F0-9]{2}-[a-fA-F0-9]{2}-[a-fA-F0-9]{2})/);
      if (match && match[1]) {
        // Convert Windows format (aa-bb-cc-dd-ee-ff) to standard format (AA:BB:CC:DD:EE:FF)
        return match[1].replace(/-/g, ':').toUpperCase();
      }
    } catch (e) {
      console.log(`[MAC-Resolve] Windows ARP failed for ${ip}:`, e.message);
    }
    
    // Fallback: Check Active Sessions in DB for Windows
    try {
      const session = await db.get('SELECT mac FROM sessions WHERE ip = ? AND remaining_seconds > 0', [ip]);
      if (session && session.mac) {
        return session.mac.toUpperCase();
      }
    } catch (e) {
      console.error(`[MAC-Resolve] DB Fallback error for ${ip}:`, e.message);
    }
    
    return null;
  }
  
  // Linux-specific MAC resolution (original code)
  // 1. Try to ping the IP to ensure it's in the ARP table (fast check)
  try { await execPromise(`ping -c 1 -W 1 ${ip}`); } catch (e) {}

  // 2. Check ip neigh (modern ARP)
  try {
    const { stdout } = await execPromise(`ip neigh show ${ip}`);
    // Output: 10.0.0.5 dev wlan0 lladdr aa:bb:cc:dd:ee:ff REACHABLE
    const match = stdout.match(/lladdr\s+([a-fA-F0-9:]+)/);
    if (match && match[1]) return match[1].toUpperCase();
  } catch (e) {}

  // 3. Fallback to /proc/net/arp
  try {
    const arpData = fs.readFileSync('/proc/net/arp', 'utf8');
    const lines = arpData.split('\n');
    for (const line of lines) {
      if (line.includes(ip)) {
        const parts = line.split(/\s+/);
        if (parts[3] && parts[3] !== '00:00:00:00:00:00') {
           return parts[3].toUpperCase();
        }
      }
    }
  } catch (e) {}

  // 4. Check DHCP Leases (dnsmasq) - essential for clients that block ping
  try {
    const leaseFiles = ['/tmp/dhcp.leases', '/var/lib/dnsmasq/dnsmasq.leases', '/var/lib/dhcp/dhcpd.leases', '/var/lib/misc/dnsmasq.leases'];
    for (const file of leaseFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        // dnsmasq lease format: <timestamp> <mac> <ip> <hostname> <client-id>
        const lines = content.split('\n');
        for (const line of lines) {
           const parts = line.split(' ');
           // Check for IP match (usually 3rd column)
           if (parts.length >= 3 && parts[2] === ip) {
             return parts[1].toUpperCase();
           }
        }
      }
    }
  } catch (e) {}

  // 5. Fallback: Check Active Sessions in DB
  // Solves issue where idle devices (ARP expired) get disconnected despite having time.
  // We trust the IP-MAC mapping from the active session.
  try {
    const session = await db.get('SELECT mac FROM sessions WHERE ip = ? AND remaining_seconds > 0', [ip]);
    if (session && session.mac) {
      return session.mac.toUpperCase();
    }
  } catch (e) {
    console.error(`[MAC-Resolve] DB Fallback error for ${ip}:`, e.message);
  }

  return null;
}

// Device tracking to prevent re-scanning processed devices
const processedDevices = new Map(); // MAC -> { processed: true, timestamp: Date.now(), hasSession: boolean }

// Clean up old processed device entries every 5 minutes
setInterval(() => {
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
  for (const [mac, data] of processedDevices.entries()) {
    if (data.timestamp < fiveMinutesAgo) {
      processedDevices.delete(mac);
    }
  }
}, 5 * 60 * 1000);

// Background scanner for new client connections and automatic session restoration
async function scanForNewClients() {
  try {
    // Get all current active sessions
    const activeSessions = await db.all('SELECT mac, ip FROM sessions WHERE remaining_seconds > 0');
    const activeMACs = new Set(activeSessions.map(s => s.mac));
    
    // Scan network for connected devices
    let connectedDevices = [];
    
    if (process.platform === 'win32') {
      // Windows: Use arp -a to find connected devices
      try {
        const { stdout } = await execPromise('arp -a');
        const lines = stdout.split('\n');
        
        for (const line of lines) {
          // Match format: "  192.168.1.100    aa-bb-cc-dd-ee-ff     dynamic"
          const match = line.match(/\s+(\d+\.\d+\.\d+\.\d+)\s+([a-fA-F0-9]{2}-[a-fA-F0-9]{2}-[a-fA-F0-9]{2}-[a-fA-F0-9]{2}-[a-fA-F0-9]{2}-[a-fA-F0-9]{2})\s+dynamic/);
          if (match) {
            const ip = match[1];
            const mac = match[2].replace(/-/g, ':').toUpperCase();
            
            // Filter for local network IPs (10.x.x.x, 192.168.x.x)
            if (ip.startsWith('10.') || ip.startsWith('192.168.')) {
              connectedDevices.push({ ip, mac });
            }
          }
        }
      } catch (e) {
        console.log('[CLIENT-SCAN] Windows ARP scan failed:', e.message);
      }
    } else {
      // Linux: Use ip neigh and ARP table
      try {
        const { stdout } = await execPromise('ip neigh show');
        const lines = stdout.split('\n');
        
        for (const line of lines) {
          // Format: "10.0.0.5 dev wlan0 lladdr aa:bb:cc:dd:ee:ff REACHABLE"
          const match = line.match(/(\d+\.\d+\.\d+\.\d+).*lladdr\s+([a-fA-F0-9:]+)/);
          if (match) {
            connectedDevices.push({ ip: match[1], mac: match[2].toUpperCase() });
          }
        }
      } catch (e) {
        console.log('[CLIENT-SCAN] Linux neigh scan failed:', e.message);
      }
    }
    
    // Check each connected device for automatic session restoration
    for (const device of connectedDevices) {
      const { ip, mac } = device;
      
      // Skip if device already has active session
      if (activeMACs.has(mac)) {
        continue;
      }
      
      // Skip if device was already processed recently
      const processed = processedDevices.get(mac);
      if (processed) {
        continue; // Device already processed, skip to save CPU
      }
      
      console.log(`[CLIENT-SCAN] New device detected: ${mac} (${ip}) - checking for session tokens...`);
      
      // Find the most recent transferable session (prioritize sessions from similar IP range)
      const availableSession = await db.get(
        `SELECT token, mac as original_mac, remaining_seconds, ip as original_ip, total_paid, connected_at 
         FROM sessions 
         WHERE remaining_seconds > 0 AND mac != ? AND token_expires_at > datetime("now") 
         ORDER BY 
           CASE WHEN SUBSTR(ip, 1, INSTR(ip || '.', '.') + INSTR(SUBSTR(ip, INSTR(ip, '.') + 1) || '.', '.')) = 
                     SUBSTR(?, 1, INSTR(? || '.', '.') + INSTR(SUBSTR(?, INSTR(?, '.') + 1) || '.', '.')) 
                THEN 0 ELSE 1 END,
           connected_at DESC 
         LIMIT 1`,
        [mac, ip, ip, ip, ip]
      );
      
      if (availableSession) {
        console.log(`[CLIENT-SCAN] Found ${availableSession.remaining_seconds > 0 ? 1 : 0} transferable sessions for new device ${mac}`);
        console.log(`[CLIENT-SCAN] Device ${mac} should visit portal to restore session automatically`);
        console.log(`[CLIENT-SCAN] - Available session: ${availableSession.token} from ${availableSession.original_mac} (${availableSession.remaining_seconds}s remaining)`);
        
        // Perform automatic session transfer
        try {
          // Check if the target MAC already has a different session
          const targetSession = await db.get('SELECT * FROM sessions WHERE mac = ? AND token != ?', [mac, availableSession.token]);
          let extraTime = 0;
          let extraPaid = 0;
          
          if (targetSession) {
            // Merge existing time from the target MAC if any
            extraTime = targetSession.remaining_seconds;
            extraPaid = targetSession.total_paid;
            console.log(`[CLIENT-SCAN] Merging existing session on ${mac}: +${extraTime}s, +₱${extraPaid}`);
            await db.run('DELETE FROM sessions WHERE mac = ? AND token != ?', [mac, availableSession.token]);
          }

          // Update session with new MAC and IP (session token stays the same)
          await db.run(
            'UPDATE sessions SET mac = ?, ip = ?, remaining_seconds = ?, total_paid = ? WHERE token = ?',
            [mac, ip, availableSession.remaining_seconds + extraTime, availableSession.total_paid + extraPaid, availableSession.token]
          );
          
          // Only whitelist new MAC - DO NOT block old MAC to allow switching back
          await network.whitelistMAC(mac, ip); // Allow new MAC
          
          // Log successful transfer
          console.log(`[AUTO-SYNC] Session automatically transferred: ${availableSession.original_mac} -> ${mac} (${availableSession.remaining_seconds + extraTime}s remaining)`);
          console.log(`[AUTO-SYNC] Device ${mac} now has internet access with session ${availableSession.token}`);
          console.log(`[AUTO-SYNC] Old MAC ${availableSession.original_mac} remains whitelisted for seamless switching back`);
          
          // Mark device as processed with session
          processedDevices.set(mac, { processed: true, timestamp: Date.now(), hasSession: true });
          
        } catch (transferError) {
          console.error(`[CLIENT-SCAN] Failed to transfer session for ${mac}:`, transferError.message);
          // Mark as processed even if transfer failed to avoid retrying
          processedDevices.set(mac, { processed: true, timestamp: Date.now(), hasSession: false });
        }
        
      } else {
        console.log(`[CLIENT-SCAN] No transferable sessions found for new device ${mac} - will redirect to portal for coin insertion`);
        // Mark device as processed without session
        processedDevices.set(mac, { processed: true, timestamp: Date.now(), hasSession: false });
      }
      
      // Add device to tracking (for admin panel visibility)
      try {
        const deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.run(
          'INSERT OR IGNORE INTO wifi_devices (id, mac, ip, interface, download_limit, upload_limit, connected_at, last_seen, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [deviceId, mac, ip, 'auto-detected', 0, 0, Date.now(), Date.now(), 1]
        );
      } catch (e) {
        // Ignore duplicate device errors
      }
    }
    
  } catch (e) {
    console.error('[CLIENT-SCAN] Error scanning for new clients:', e.message);
  }
}

// Start background client scanner with automatic session transfer
setInterval(scanForNewClients, 10000); // Scan every 10 seconds for balanced performance
console.log('[CLIENT-SCAN] Background client scanner with auto-transfer started (10s interval)');
app.get('/api/zerotier/status', requireAdmin, async (req, res) => {
  try {
    const installed = await zerotier.isInstalled();
    if (!installed) {
      return res.json({ installed: false, running: false });
    }
    const status = await zerotier.getStatus();
    res.json({ installed: true, ...status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/zerotier/install', requireAdmin, async (req, res) => {
  try {
    const result = await zerotier.install();
    if (result.success) {
      res.json({ success: true, message: 'ZeroTier installed successfully' });
    } else {
      res.status(500).json({ success: false, error: result.error || result.stderr });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/zerotier/networks', requireAdmin, async (req, res) => {
  try {
    const networks = await zerotier.listNetworks();
    res.json({ networks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/zerotier/join', requireAdmin, async (req, res) => {
  const { networkId } = req.body;
  if (!networkId) return res.status(400).json({ error: 'Network ID required' });
  try {
    const result = await zerotier.joinNetwork(networkId);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: result.error || result.stderr });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/zerotier/leave', requireAdmin, async (req, res) => {
  const { networkId } = req.body;
  if (!networkId) return res.status(400).json({ error: 'Network ID required' });
  try {
    const result = await zerotier.leaveNetwork(networkId);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: result.error || result.stderr });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Explicitly serve tailwind.js to fix 404 issues
app.get('/dist/tailwind.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/tailwind.js'));
});

app.use('/dist', express.static(path.join(__dirname, 'dist')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(__dirname));

// AUDIO UPLOAD ENDPOINT
app.post('/api/admin/upload-audio', requireAdmin, upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  // Return web-accessible path
  const webPath = '/uploads/audio/' + req.file.filename;
  res.json({ 
    success: true, 
    path: webPath 
  });
});

// SUCCESS PAGE TO TRIGGER CAPTIVE PORTAL EXIT
app.get('/success', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Internet Connected</title>
      <meta http-equiv="refresh" content="3;url=http://www.google.com">
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .check { color: #4CAF50; font-size: 48px; }
        h1 { color: #333; }
      </style>
    </head>
    <body>
      <div class="check">✓</div>
      <h1>Internet Connected Successfully!</h1>
      <p>Redirecting to Google in 3 seconds...</p>
      <script>
        // Try to trigger OS captive portal detection
        setTimeout(() => {
          fetch('http://www.google.com/generate_204')
            .then(() => window.location.href = 'http://www.google.com')
            .catch(() => window.location.href = 'http://www.google.com');
        }, 1000);
      </script>
    </body>
    </html>
  `);
});

// CAPTIVE PORTAL DETECTION ENDPOINTS
app.get('/generate_204', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0 AND (is_paused = 0 OR is_paused IS NULL)', [mac]);
    if (session) {
      return res.status(204).send();
    }
  }
  
  // Not authorized - serve portal directly
  return res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/hotspot-detect.html', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0 AND (is_paused = 0 OR is_paused IS NULL)', [mac]);
    if (session) {
      return res.type('text/plain').send('Success');
    }
  }
  
  // Not authorized - serve portal directly
  return res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/ncsi.txt', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0 AND (is_paused = 0 OR is_paused IS NULL)', [mac]);
    if (session) {
      return res.type('text/plain').send('Microsoft NCSI');
    }
  }
  
  // Not authorized - serve portal directly
  return res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/connecttest.txt', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0 AND (is_paused = 0 OR is_paused IS NULL)', [mac]);
    if (session) {
      return res.type('text/plain').send('Success');
    }
  }
  
  // Not authorized - serve portal directly
  return res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/success.txt', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0 AND (is_paused = 0 OR is_paused IS NULL)', [mac]);
    if (session) {
      return res.type('text/plain').send('Success');
    }
  }
  
  // Not authorized - serve portal directly
  return res.sendFile(path.join(__dirname, 'index.html'));
});

// Apple-specific captive portal detection
app.get('/library/test/success.html', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0 AND (is_paused = 0 OR is_paused IS NULL)', [mac]);
    if (session) {
      return res.type('text/plain').send('Success');
    }
  }
  
  // Not authorized - serve portal directly
  return res.sendFile(path.join(__dirname, 'index.html'));
});

// DNS REDIRECT HANDLING FOR CAPTIVE PORTAL
app.use(async (req, res, next) => {
  const host = req.headers.host || '';
  const url = req.url.toLowerCase();
  const clientIp = req.ip.replace('::ffff:', '');

  // Check if this is a DNS-based captive portal probe
  if (host === 'captive.apple.com' || host === 'www.msftconnecttest.com' || host === 'connectivitycheck.gstatic.com') {
    // Allow API and static resources to pass through
    if (url.startsWith('/api') || url.startsWith('/dist') || url.startsWith('/assets')) {
      return next();
    }

    const mac = await getMacFromIp(clientIp);
    if (mac) {
      const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0 AND (is_paused = 0 OR is_paused IS NULL)', [mac]);
      if (session) {
        // Authorized client - return success
        if (url.includes('/generate_204') || url.includes('/connecttest.txt')) {
          return res.status(204).send();
        }
        if (url.includes('/redirect')) {
          return res.redirect('http://www.apple.com');
        }
        return res.status(204).send();
      }
    }
    // Not authorized - serve portal directly to avoid redirect loops
    // Apple/Android expects 200 OK with non-success content to trigger portal
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  
  next();
});

// CAPTIVE PORTAL REDIRECTION MIDDLEWARE
app.use(async (req, res, next) => {
  const host = req.headers.host || '';
  const url = req.url.toLowerCase();
  const clientIp = req.ip.replace('::ffff:', '');

  if (url.startsWith('/api') || url.startsWith('/dist') || url.startsWith('/assets') || host.includes('localhost') || host.includes('127.0.0.1')) {
    return next();
  }

  const portalProbes = [
    '/generate_204', '/hotspot-detect.html', '/ncsi.txt', 
    '/connecttest.txt', '/success.txt', '/kindle-wifi',
    '/library/test/success.html'
  ];
  const isProbe = portalProbes.some(p => url.includes(p));

  let mac = await getMacFromIp(clientIp);
  
  // Fallback: Generate temporary MAC if detection fails (Windows compatibility)
  if (!mac) {
    mac = `TEMP-${clientIp.replace(/\./g, '-')}-${Date.now().toString(36).slice(-4)}`;
  }
  
  if (mac) {
    const session = await db.get('SELECT mac, ip, remaining_seconds FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
    if (session) {
      // If IP has changed, update the whitelist rule
      if (session.ip !== clientIp) {
        console.log(`[NET] Client ${mac} moved from IP ${session.ip} to ${clientIp} (likely different SSID). Re-applying limits...`);
        // Block and clean up old IP (removes TC rules from old VLAN interface)
        await network.blockMAC(mac, session.ip);
        // Add extra delay to ensure complete cleanup
        await new Promise(r => setTimeout(r, 300));
        // Whitelist and re-apply limits on new IP (applies TC rules to new VLAN interface)
        await network.whitelistMAC(mac, clientIp);
        // Update session with new IP
        await db.run('UPDATE sessions SET ip = ? WHERE mac = ?', [clientIp, mac]);
        console.log(`[NET] Session limits re-applied for ${mac} on new interface`);
      }
      
      // Handle captive portal probe requests for authorized clients
      if (isProbe) {
        if (url.includes('/generate_204')) {
          return res.status(204).send();
        }
        if (url.includes('/success.txt') || url.includes('/connecttest.txt')) {
          return res.type('text/plain').send('Success');
        }
        if (url.includes('/ncsi.txt')) {
          return res.type('text/plain').send('Microsoft NCSI');
        }
        if (url.includes('/hotspot-detect.html') || url.includes('/library/test/success.html')) {
             return res.type('text/plain').send('Success');
        }
      }
      
      return next();
    } else {
      // No active session found - log new client detection
      if (!isProbe && url === '/') {
        console.log(`[PORTAL-REDIRECT] New client detected: ${mac} (${clientIp}) - no active session found`);
        console.log(`[PORTAL-REDIRECT] Checking for transferable sessions...`);
        
        // Check if there are any sessions that could be transferred to this device
        const availableSessions = await db.all(
          'SELECT token, mac as original_mac, remaining_seconds FROM sessions WHERE remaining_seconds > 0 AND token_expires_at > datetime("now") LIMIT 5'
        );
        
        if (availableSessions.length > 0) {
          console.log(`[PORTAL-REDIRECT] Found ${availableSessions.length} transferable sessions for ${mac}:`);
          for (const session of availableSessions) {
            console.log(`[PORTAL-REDIRECT] - Session ${session.token} from ${session.original_mac} (${session.remaining_seconds}s remaining)`);
          }
          console.log(`[PORTAL-REDIRECT] Client ${mac} will be redirected to portal for automatic session restoration`);
        } else {
          console.log(`[PORTAL-REDIRECT] No transferable sessions found for ${mac} - redirecting to portal for coin insertion`);
        }
      }
    }
  } else {
    // MAC detection failed completely
    if (!isProbe && url === '/') {
      console.log(`[PORTAL-REDIRECT] Client ${clientIp} - MAC detection failed, redirecting to portal`);
    }
  }

  // FORCE REDIRECT to common domain for session sharing (localStorage)
  // DISABLED: Using local IP instead of external domain
  // const PORTAL_DOMAIN = 'portal.ajcpisowifi.com';
  const PORTAL_DOMAIN = null; // Disable domain redirect

  if (isProbe) {
      // Probes get the file directly to satisfy the CNA
      return res.sendFile(path.join(__dirname, 'index.html'));
  }

  // Domain redirect disabled - allow access via IP address
  // This allows MAC sync to work on local network without external DNS
  /*
  if (host !== PORTAL_DOMAIN && !host.includes('localhost') && !host.includes('127.0.0.1') && !url.startsWith('/admin')) {
      return res.redirect(`http://${PORTAL_DOMAIN}/`);
  }
  */
  
  next();
});

// SESSIONS API
app.get('/api/whoami', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  // Check license status for portal restrictions
  let isRevoked = false;
  let canOperate = true;
  let canInsertCoin = true;
  
  try {
    if (!systemHardwareId) systemHardwareId = await getUniqueHardwareId();
    const verification = await licenseManager.verifyLicense();
    const trialStatus = await checkTrialStatus(systemHardwareId, verification);
    const isLicensed = verification.isValid && verification.isActivated;
    isRevoked = verification.isRevoked || trialStatus.isRevoked;

    canOperate = (isLicensed || trialStatus.isTrialActive) && !isRevoked;

    if (!canOperate && !isRevoked) {
      canInsertCoin = false;
    }
    
    if (trialStatus.isTrialActive && !isLicensed) {
      console.log(`[License] Trial Mode - ${trialStatus.daysRemaining} days remaining`);
      console.log(`[License] Trial expires: ${trialStatus.expiresAt}`);
    } else if (!trialStatus.isTrialActive && !isLicensed && !isRevoked) {
      if (trialStatus.hasHadLicense) {
        console.warn('[License] Trial mode disabled - System has had a license previously.');
      } else {
        console.warn('[License] Trial mode expired.');
      }
    }
    
    if (isRevoked) {
       // If revoked, only 1 device can use insert coin
       // Check if any other MAC has an active session
       // EXEMPT NodeMCU devices from blocking others
       const nodemcuResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
       const nodemcuMacs = nodemcuResult?.value ? JSON.parse(nodemcuResult.value).map(d => d.macAddress.toUpperCase()) : [];

       const activeSessions = await db.all('SELECT mac FROM sessions WHERE remaining_seconds > 0');
       const clientSessions = activeSessions.filter(s => !nodemcuMacs.includes(s.mac.toUpperCase()));

       if (clientSessions.length > 0) {
         // If there's an active client session, only that device can "add more time"
         const isMySessionActive = clientSessions.some(s => s.mac === mac);
         if (!isMySessionActive) {
           canInsertCoin = false;
         }
       }
     }
  } catch (e) {
    console.error('[WhoAmI] License check error:', e);
  }

  res.json({ 
    ip: clientIp, 
    mac: mac || 'unknown',
    isRevoked,
    canOperate,
    canInsertCoin
  });
});

app.post('/api/coinslot/reserve', async (req, res) => {
  cleanupExpiredCoinSlotLocks();

  const slot = normalizeCoinSlot(req.body?.slot);
  if (!slot) {
    return res.status(400).json({ success: false, error: 'Invalid coinslot.' });
  }

  // Enforce License Check for NodeMCU devices
  if (slot !== 'main') {
    const license = await nodeMCULicenseManager.verifyLicense(slot);
    if (!license.isValid) {
      return res.status(403).json({ 
        success: false, 
        error: 'YOUR COINSLOT MACHINE IS DISABLED' 
      });
    }
  }

  let clientIp = req.ip.replace('::ffff:', '');
  if (clientIp === '::1') clientIp = '127.0.0.1';
  let mac = await getMacFromIp(clientIp);
  if (!mac && clientIp === '127.0.0.1') mac = 'DEV-LOCALHOST';
  if (!mac) return res.status(400).json({ success: false, error: 'Could not identify your device MAC.' });

  const now = Date.now();
  const existing = coinSlotLocks.get(slot);
  if (existing && existing.expiresAt > now) {
    if (existing.ownerMac === mac) {
      existing.expiresAt = now + COINSLOT_LOCK_TTL_MS;
      return res.json({ success: true, slot, lockId: existing.lockId, expiresAt: existing.expiresAt });
    }
    return res.status(409).json({
      success: false,
      code: 'COINSLOT_BUSY',
      slot,
      busyUntil: existing.expiresAt,
      error: 'JUST WAIT SOMEONE IS PAYING.'
    });
  }

  const lockId = crypto.randomBytes(16).toString('hex');
  const expiresAt = now + COINSLOT_LOCK_TTL_MS;
  coinSlotLocks.set(slot, { lockId, ownerMac: mac, ownerIp: clientIp, createdAt: now, expiresAt });
  res.json({ success: true, slot, lockId, expiresAt });
});

app.post('/api/coinslot/heartbeat', async (req, res) => {
  cleanupExpiredCoinSlotLocks();

  const slot = normalizeCoinSlot(req.body?.slot);
  const lockId = req.body?.lockId;
  if (!slot || !lockId) {
    return res.status(400).json({ success: false, error: 'Invalid request.' });
  }

  let clientIp = req.ip.replace('::ffff:', '');
  if (clientIp === '::1') clientIp = '127.0.0.1';
  let mac = await getMacFromIp(clientIp);
  if (!mac && clientIp === '127.0.0.1') mac = 'DEV-LOCALHOST';
  if (!mac) return res.status(400).json({ success: false, error: 'Could not identify your device MAC.' });

  const existing = coinSlotLocks.get(slot);
  if (!existing || existing.lockId !== lockId || existing.ownerMac !== mac) {
    return res.status(409).json({ success: false, code: 'COINSLOT_NOT_OWNED', error: 'Coinslot reservation expired.' });
  }

  existing.expiresAt = Date.now() + COINSLOT_LOCK_TTL_MS;
  res.json({ success: true, slot, expiresAt: existing.expiresAt });
});

app.post('/api/coinslot/release', async (req, res) => {
  cleanupExpiredCoinSlotLocks();

  const slot = normalizeCoinSlot(req.body?.slot);
  const lockId = req.body?.lockId;
  if (!slot || !lockId) {
    return res.status(400).json({ success: false, error: 'Invalid request.' });
  }

  const existing = coinSlotLocks.get(slot);
  if (existing && existing.lockId === lockId) {
    coinSlotLocks.delete(slot);
  }

  res.json({ success: true });
});

app.get('/api/sessions', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT 
        mac, ip, remaining_seconds as remainingSeconds, 
        total_paid as totalPaid, connected_at as connectedAt, 
        is_paused as isPaused, token, token_expires_at as tokenExpiresAt,
        voucher_code as voucherCode, download_limit as downloadLimit, 
        upload_limit as uploadLimit
      FROM sessions 
      WHERE remaining_seconds > 0
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sessions/start', async (req, res) => {
  const { minutes, pesos, slot: requestedSlot, lockId } = req.body;
  let clientIp = req.ip.replace('::ffff:', '');
  if (clientIp === '::1') clientIp = '127.0.0.1';
  let mac = await getMacFromIp(clientIp);
  if (!mac && clientIp === '127.0.0.1') mac = 'DEV-LOCALHOST';

  if (!mac) {
    console.error(`[AUTH] Failed to resolve MAC for IP: ${clientIp}`);
    return res.status(400).json({ error: 'Could not identify your device MAC. Please try reconnecting.' });
  }

  cleanupExpiredCoinSlotLocks();
  const slot = normalizeCoinSlot(requestedSlot);
  if (!slot || !lockId) {
    return res.status(400).json({ error: 'Coinslot lock required. Please press Insert Coin again.' });
  }
  const slotLock = coinSlotLocks.get(slot);
  if (!slotLock || slotLock.lockId !== lockId || slotLock.ownerMac !== mac) {
    if (slotLock && slotLock.expiresAt > Date.now() && slotLock.ownerMac !== mac) {
      return res.status(409).json({ error: 'JUST WAIT SOMEONE IS PAYING.' });
    }
    return res.status(409).json({ error: 'Coinslot reservation expired. Please press Insert Coin again.' });
  }

  try {
    // Enforce 1-device limit if revoked
    if (!systemHardwareId) systemHardwareId = await getUniqueHardwareId();
    const verification = await licenseManager.verifyLicense();
    const trialStatus = await checkTrialStatus(systemHardwareId, verification);
    const isLicensed = verification.isValid && verification.isActivated;
    const isRevoked = verification.isRevoked || trialStatus.isRevoked;
    const canOperate = (isLicensed || trialStatus.isTrialActive) && !isRevoked;

    if (!canOperate && !isRevoked) {
      return res.status(403).json({ error: 'System License Expired: Activation required.' });
    }

    if (isRevoked) {
      const nodemcuResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
      const nodemcuMacs = nodemcuResult?.value ? JSON.parse(nodemcuResult.value).map(d => d.macAddress.toUpperCase()) : [];

      // Only apply limit if the CURRENT user is NOT a NodeMCU (which they shouldn't be)
      if (!nodemcuMacs.includes(mac.toUpperCase())) {
        const activeSessions = await db.all('SELECT mac FROM sessions WHERE remaining_seconds > 0 AND mac != ?', [mac]);
        const activeClients = activeSessions.filter(s => !nodemcuMacs.includes(s.mac.toUpperCase()));
        
        if (activeClients.length > 0) {
          return res.status(403).json({ error: 'System License Revoked: Only 1 device allowed at a time.' });
        }
      }
    }

    // Lookup matching rate to apply speed limits
    // Prioritize exact match on pesos and minutes, then fallback to pesos
    let rate = await db.get('SELECT * FROM rates WHERE pesos = ? AND minutes = ?', [pesos, minutes]);
    if (!rate) {
      rate = await db.get('SELECT * FROM rates WHERE pesos = ?', [pesos]);
    }

    const downloadLimit = rate ? (rate.download_limit || 0) : 0;
    const uploadLimit = rate ? (rate.upload_limit || 0) : 0;
    const seconds = minutes * 60;

    // Get existing token or generate new one
    const existingSession = await db.get('SELECT token, token_expires_at FROM sessions WHERE mac = ?', [mac]);
    let token;
    let tokenExpiresAt;
    
    // Check if existing token is still valid (not expired)
    if (existingSession && existingSession.token && existingSession.token_expires_at) {
      const now = new Date();
      const expiresAt = new Date(existingSession.token_expires_at);
      if (expiresAt > now) {
        // Token is still valid, reuse it
        token = existingSession.token;
        tokenExpiresAt = existingSession.token_expires_at;
      }
    }
    
    // Generate new token if no valid existing token
    if (!token) {
      token = crypto.randomBytes(16).toString('hex');
      // Set token expiration to 3 days from now
      tokenExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    }

    await db.run(
      'INSERT INTO sessions (mac, ip, remaining_seconds, total_paid, download_limit, upload_limit, token, token_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(mac) DO UPDATE SET remaining_seconds = remaining_seconds + ?, total_paid = total_paid + ?, ip = ?, download_limit = ?, upload_limit = ?, token = ?, token_expires_at = ?',
      [mac, clientIp, seconds, pesos, downloadLimit, uploadLimit, token, tokenExpiresAt, seconds, pesos, clientIp, downloadLimit, uploadLimit, token, tokenExpiresAt]
    );
    
    // Whitelist the device in firewall
    await network.whitelistMAC(mac, clientIp);
    
    console.log(`[AUTH] Session started for ${mac} (${clientIp}) - ${seconds}s, ₱${pesos}, Limits: ${downloadLimit}/${uploadLimit} Mbps`);
    
    coinSlotLocks.delete(slot);
    res.json({ success: true, mac, token, message: 'Internet access granted. Please refresh your browser or wait a moment for connection to activate.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sessions/restore', async (req, res) => {
  const { token } = req.body;
  const clientIp = req.ip.replace('::ffff:', '');
  let mac = await getMacFromIp(clientIp);
  
  // Fallback: Generate temporary MAC if detection fails (Windows compatibility)
  if (!mac) {
    mac = `TEMP-${clientIp.replace(/\./g, '-')}-${Date.now().toString(36).slice(-4)}`;
    console.log(`[MAC-SYNC] MAC detection failed for ${clientIp}, using temporary MAC: ${mac}`);
  }
  
  if (!token) return res.status(400).json({ error: 'Session token required' });

  try {
    // Check if MAC sync is enabled
    const macSyncConfig = await db.get('SELECT value FROM config WHERE key = ?', ['mac_sync_enabled']);
    const isMacSyncEnabled = macSyncConfig ? macSyncConfig.value === '1' : true; // Default enabled
    
    // Find session by token (session ID-based approach)
    const session = await db.get('SELECT * FROM sessions WHERE token = ?', [token]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    // Check if token has expired (3-day expiration)
    if (session.token_expires_at) {
      const now = new Date();
      const tokenExpiresAt = new Date(session.token_expires_at);
      if (now > tokenExpiresAt) {
        return res.status(401).json({ error: 'Session token has expired. Please insert coins to get a new session.' });
      }
    }
    
    // If same MAC, just update IP if needed
    if (session.mac === mac) {
       if (session.ip !== clientIp) {
         await db.run('UPDATE sessions SET ip = ? WHERE mac = ?', [clientIp, mac]);
         await network.whitelistMAC(mac, clientIp);
       }
       return res.json({ success: true, remainingSeconds: session.remaining_seconds, isPaused: session.is_paused === 1 });
    }

    // Different MAC - check if MAC sync is enabled
    if (!isMacSyncEnabled) {
      return res.status(403).json({ error: 'MAC sync is disabled. Session can only be used on the original device.' });
    }

    console.log(`[MAC-SYNC] Session token ${token} - transferring from ${session.mac} to ${mac}`);

    // Check if the target MAC already has a different session
    const targetSession = await db.get('SELECT * FROM sessions WHERE mac = ? AND token != ?', [mac, token]);
    let extraTime = 0;
    let extraPaid = 0;
    
    if (targetSession) {
      // Merge existing time from the target MAC if any
      extraTime = targetSession.remaining_seconds;
      extraPaid = targetSession.total_paid;
      console.log(`[MAC-SYNC] Merging existing session on ${mac}: +${extraTime}s, +₱${extraPaid}`);
      await db.run('DELETE FROM sessions WHERE mac = ? AND token != ?', [mac, token]);
    }

    // Update session with new MAC and IP (session ID stays the same)
    await db.run(
      'UPDATE sessions SET mac = ?, ip = ?, remaining_seconds = ?, total_paid = ? WHERE token = ?',
      [mac, clientIp, session.remaining_seconds + extraTime, session.total_paid + extraPaid, token]
    );
    
    // Switch network access
    await network.blockMAC(session.mac, session.ip); // Block old MAC
    await network.whitelistMAC(mac, clientIp); // Allow new MAC
    
    // Log session transfer for audit
    console.log(`[MAC-SYNC] Session transferred: ${session.mac} -> ${mac} (${session.remaining_seconds + extraTime}s remaining)`);
    
    res.json({ success: true, migrated: true, remainingSeconds: session.remaining_seconds + extraTime, isPaused: session.is_paused === 1 });
  } catch (err) { 
    console.error('[MAC-SYNC] Restore error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

app.post('/api/sessions/pause', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  try {
    const session = await db.get('SELECT * FROM sessions WHERE token = ?', [token]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    await db.run('UPDATE sessions SET is_paused = 1 WHERE token = ?', [token]);
    await network.blockMAC(session.mac, session.ip);

    console.log(`[AUTH] Session paused for ${session.mac}`);
    res.json({ success: true, message: 'Time paused. Internet access suspended.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sessions/resume', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  try {
    const session = await db.get('SELECT * FROM sessions WHERE token = ?', [token]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    await db.run('UPDATE sessions SET is_paused = 0 WHERE token = ?', [token]);
    
    // Use forceNetworkRefresh to ensure internet returns properly
    await network.forceNetworkRefresh(session.mac, session.ip);

    console.log(`[AUTH] Session resumed for ${session.mac}`);
    res.json({ success: true, message: 'Time resumed. Internet access restored.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// MAC Sync Status API - Check if MAC sync is enabled and available
app.get('/api/sessions/mac-sync-status', async (req, res) => {
  try {
    // Check if MAC sync is enabled in config
    const macSyncConfig = await db.get('SELECT value FROM config WHERE key = ?', ['mac_sync_enabled']);
    const isEnabled = macSyncConfig ? macSyncConfig.value === '1' : true; // Default enabled
    
    res.json({ 
      enabled: isEnabled,
      available: true,
      message: isEnabled ? 'MAC sync is available - use your session token to restore time on any device' : 'MAC sync is disabled'
    });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// Token Status API - Check token expiration
app.get('/api/sessions/token-status/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const session = await db.get('SELECT token_expires_at, remaining_seconds FROM sessions WHERE token = ?', [token]);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const now = new Date();
    let tokenValid = true;
    let daysRemaining = null;
    
    if (session.token_expires_at) {
      const expiresAt = new Date(session.token_expires_at);
      tokenValid = expiresAt > now;
      daysRemaining = Math.max(0, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)));
    }
    
    res.json({
      tokenValid,
      daysRemaining,
      sessionTimeRemaining: session.remaining_seconds,
      message: tokenValid ? `Token valid for ${daysRemaining} more days` : 'Token has expired'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// VOUCHER SYSTEM API ENDPOINTS
// ==========================================

// Admin: Get all vouchers
app.get('/api/admin/vouchers', requireAdmin, async (req, res) => {
  try {
    console.log('[Vouchers] Loading vouchers list...');
    
    const vouchers = await db.all(`
      SELECT 
        id, code, minutes, price, status, 
        download_limit, upload_limit, 
        created_at, expires_at, used_at, 
        used_by_mac, used_by_ip, session_id
      FROM vouchers 
      ORDER BY created_at DESC
    `);
    
    console.log(`[Vouchers] Found ${vouchers.length} vouchers in database`);
    if (vouchers.length > 0) {
      console.log('[Vouchers] Sample vouchers:', vouchers.slice(0, 3).map(v => `${v.code} (${v.status})`));
    }
    
    res.json(vouchers);
    console.log('[Vouchers] Sent vouchers list to client');
  } catch (err) {
    console.error('[Vouchers] Get error:', err);
    res.status(500).json({ error: 'Failed to fetch vouchers' });
  }
});

// Admin: Create vouchers
app.post('/api/admin/vouchers/create', requireAdmin, async (req, res) => {
  try {
    const { minutes, price, quantity = 1, downloadLimit = 0, uploadLimit = 0, expiryDays = 30 } = req.body;
    
    if (!minutes || !price || minutes <= 0 || price <= 0) {
      return res.status(400).json({ error: 'Invalid minutes or price' });
    }
    
    console.log(`[Vouchers] Starting creation: ${quantity} voucher(s), ${minutes}min, ₱${price}`);
    
    const vouchers = [];
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
    
    for (let i = 0; i < quantity; i++) {
      const code = generateVoucherCode();
      const id = `voucher_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`[Vouchers] Inserting voucher ${i + 1}: ${code} (${id})`);
      
      try {
        const result = await db.run(`
          INSERT INTO vouchers (id, code, minutes, price, download_limit, upload_limit, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, code, minutes, price, downloadLimit, uploadLimit, expiresAt]);
        
        console.log(`[Vouchers] Database insert result:`, result);
        
        vouchers.push({
          id, code, minutes, price, 
          downloadLimit, uploadLimit, 
          expiresAt, status: 'active'
        });
        
        console.log(`[Vouchers] Added to array: ${code}`);
        
      } catch (dbErr) {
        console.error(`[Vouchers] Database insert failed for ${code}:`, dbErr.message);
        throw dbErr;
      }
    }
    
    console.log(`[Vouchers] All vouchers created, sending response...`);
    
    // Send response first, then log
    res.json({ success: true, created: quantity, vouchers });
    console.log(`[Vouchers] Created ${quantity} voucher(s): ${minutes}min, ₱${price}`);
    
    // Verify in database
    const dbCount = await db.get('SELECT COUNT(*) as count FROM vouchers');
    console.log(`[Vouchers] Total vouchers in DB after creation: ${dbCount.count}`);
    
  } catch (err) {
    console.error('[Vouchers] Create error:', err);
    res.status(500).json({ error: 'Failed to create vouchers' });
  }
});

// Admin: Delete voucher
app.delete('/api/admin/vouchers/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM vouchers WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Vouchers] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete voucher' });
  }
});

// Public: Activate voucher (no auth required - for portal users)
app.post('/api/vouchers/activate', async (req, res) => {
  try {
    const { code } = req.body;
    const clientIp = req.ip.replace('::ffff:', '');
    
    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Voucher code is required' });
    }
    
    console.log(`[Voucher] Activation attempt for code: ${code.trim().toUpperCase()}`);
    
    // Get MAC address (same logic as your existing session system)
    let mac = await getMacFromIp(clientIp);
    if (!mac && clientIp === '127.0.0.1') mac = 'DEV-LOCALHOST';
    
    if (!mac) {
      console.log(`[Voucher] Could not resolve MAC for IP: ${clientIp}`);
      return res.status(400).json({ error: 'Could not identify your device. Please try reconnecting.' });
    }
    
    console.log(`[Voucher] Device identified: ${mac} (${clientIp})`);
    
    // Generate unique session ID for this voucher activation
    const sessionId = `voucher_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if this specific session already has an active voucher
    const existingVoucherSession = await db.get(`
      SELECT * FROM sessions 
      WHERE mac = ? AND ip = ? AND remaining_seconds > 0 AND voucher_code IS NOT NULL
    `, [mac, clientIp]);
    
    if (existingVoucherSession) {
      console.log(`[Voucher] Session ${mac}@${clientIp} already has active voucher: ${existingVoucherSession.voucher_code}`);
      return res.status(400).json({ 
        error: `This session already has an active voucher (${existingVoucherSession.voucher_code}). Please wait for it to expire before using another voucher.` 
      });
    }
    
    // Find voucher - check both active status and expiration
    const voucher = await db.get(`
      SELECT * FROM vouchers 
      WHERE UPPER(code) = UPPER(?) AND status = 'active'
    `, [code.trim()]);
    
    if (!voucher) {
      console.log(`[Voucher] Voucher not found or not active: ${code.trim().toUpperCase()}`);
      return res.status(404).json({ error: 'Invalid or already used voucher code' });
    }
    
    // Check if voucher is expired
    const now = new Date();
    const expiresAt = new Date(voucher.expires_at);
    
    if (expiresAt <= now) {
      console.log(`[Voucher] Voucher expired: ${voucher.code} (expired at ${expiresAt})`);
      await db.run('UPDATE vouchers SET status = ? WHERE id = ?', ['expired', voucher.id]);
      return res.status(404).json({ error: 'Voucher has expired' });
    }
    
    console.log(`[Voucher] Valid voucher found: ${voucher.code} (${voucher.minutes} minutes, ₱${voucher.price})`);
    
    // Generate session token (MAC sync compatible with session ID binding)
    const token = crypto.randomBytes(16).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const seconds = voucher.minutes * 60;
    
    // Create/update session with SESSION ID binding (MAC sync enabled but session-specific)
    await db.run(`
      INSERT INTO sessions (
        id, mac, ip, remaining_seconds, total_paid, download_limit, upload_limit, 
        token, token_expires_at, voucher_code, session_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'voucher')
      ON CONFLICT(mac) DO UPDATE SET 
        remaining_seconds = remaining_seconds + ?, 
        total_paid = total_paid + ?, 
        ip = ?, 
        download_limit = CASE 
          WHEN excluded.download_limit > 0 THEN excluded.download_limit 
          ELSE download_limit 
        END,
        upload_limit = CASE 
          WHEN excluded.upload_limit > 0 THEN excluded.upload_limit 
          ELSE upload_limit 
        END,
        token = ?, 
        token_expires_at = ?,
        voucher_code = CASE 
          WHEN voucher_code IS NULL THEN excluded.voucher_code 
          ELSE voucher_code || ',' || excluded.voucher_code 
        END,
        session_type = CASE 
          WHEN session_type = 'coin' AND excluded.session_type = 'voucher' THEN 'mixed'
          WHEN session_type = 'voucher' AND excluded.session_type = 'voucher' THEN 'voucher'
          ELSE excluded.session_type
        END
    `, [
      sessionId, mac, clientIp, seconds, voucher.price, voucher.download_limit, voucher.upload_limit,
      token, tokenExpiresAt, voucher.code,
      seconds, voucher.price, clientIp, token, tokenExpiresAt
    ]);
    
    // Mark voucher as used with session ID binding
    await db.run(`
      UPDATE vouchers 
      SET status = 'used', used_at = datetime('now'), used_by_mac = ?, used_by_ip = ?, 
          session_token = ?, session_id = ?
      WHERE id = ?
    `, [mac, clientIp, token, sessionId, voucher.id]);
    
    // Log voucher usage with session ID
    await db.run(`
      INSERT INTO voucher_usage_logs (
        voucher_id, voucher_code, mac_address, ip_address, 
        minutes_granted, price, session_token, session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [voucher.id, voucher.code, mac, clientIp, voucher.minutes, voucher.price, token, sessionId]);
    
    // Whitelist device (MAC sync enabled - all devices with same MAC get access)
    await network.whitelistMAC(mac, clientIp);
    
    console.log(`[Voucher] Successfully activated voucher ${voucher.code} for MAC ${mac} (${clientIp}) with session ID ${sessionId} - ${seconds}s, ₱${voucher.price} - MAC SYNC ENABLED`);
    
    res.json({
      success: true,
      mac,
      token,
      remainingSeconds: seconds,
      totalPaid: voucher.price,
      downloadLimit: voucher.download_limit,
      uploadLimit: voucher.upload_limit,
      message: 'Voucher activated successfully! Internet access granted.'
    });
    
  } catch (err) {
    console.error('[Voucher] Activation error:', err);
    res.status(500).json({ error: 'Server error during voucher activation. Please try again.' });
  }
});

// Helper function to generate voucher codes
function generateVoucherCode() {
  const prefix = 'AJC';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = prefix;
  
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
}

// ==========================================
// END VOUCHER SYSTEM
// ==========================================

// RATES API
app.get('/api/rates', async (req, res) => {
  try { res.json(await db.all('SELECT * FROM rates')); } catch (err) { res.json([]); }
});

app.post('/api/rates', requireAdmin, async (req, res) => {
  try { 
    const { pesos, minutes } = req.body;
    await db.run('INSERT INTO rates (pesos, minutes) VALUES (?, ?)', 
      [pesos, minutes]); 
    res.json({ success: true }); 
  }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/rates/:id', requireAdmin, async (req, res) => {
  try { await db.run('DELETE FROM rates WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// NETWORK REFRESH API - Help devices reconnect after session creation
app.post('/api/network/refresh', async (req, res) => {
  try {
    const clientIp = req.ip.replace('::ffff:', '');
    const mac = await getMacFromIp(clientIp);
    
    if (!mac) {
      return res.status(400).json({ success: false, error: 'Could not identify your device' });
    }
    
    // Force network refresh for the requesting device
    await network.forceNetworkRefresh(mac, clientIp);
    
    res.json({ 
      success: true, 
      message: 'Network connection refreshed. Try accessing a website now.' 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/config/qos', requireAdmin, async (req, res) => {
  try {
    const result = await db.get("SELECT value FROM config WHERE key = 'qos_discipline'");
    res.json({ discipline: result ? result.value : 'cake' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/config/qos', requireAdmin, async (req, res) => {
  const { discipline } = req.body;
  if (!['cake', 'fq_codel'].includes(discipline)) {
    return res.status(400).json({ error: 'Invalid discipline' });
  }
  try {
    await db.run("INSERT INTO config (key, value) VALUES ('qos_discipline', ?) ON CONFLICT(key) DO UPDATE SET value = ?", [discipline, discipline]);
    
    // Re-init QoS on the active LAN interface immediately
    try {
      const lan = await network.getLanInterface();
      if (lan) {
        console.log(`[API] Re-initializing QoS (${discipline}) on ${lan}...`);
        await network.initQoS(lan, discipline);
        
        // Restore limits for all active devices/sessions because initQoS wipes TC classes
        const activeDevices = await db.all('SELECT mac, ip FROM wifi_devices WHERE is_active = 1');
        const activeSessions = await db.all('SELECT mac, ip FROM sessions WHERE remaining_seconds > 0');
        
        // Merge list to avoid duplicates
        const devicesToRestore = new Map();
        activeDevices.forEach(d => { if(d.mac && d.ip) devicesToRestore.set(d.mac, d.ip); });
        activeSessions.forEach(s => { if(s.mac && s.ip) devicesToRestore.set(s.mac, s.ip); });
        
        console.log(`[API] Restoring limits for ${devicesToRestore.size} devices...`);
        for (const [mac, ip] of devicesToRestore) {
          // whitelistMAC applies both Firewall rules and Traffic Control limits
          await network.whitelistMAC(mac, ip);
        }
      }
    } catch (e) {
      console.error('[API] Failed to re-init QoS:', e.message);
    }

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GAMING PRIORITY API
app.get('/api/gaming/config', requireAdmin, async (req, res) => {
  try {
    const enabled = await db.get("SELECT value FROM config WHERE key = 'gaming_priority_enabled'");
    const percentage = await db.get("SELECT value FROM config WHERE key = 'gaming_priority_percentage'");
    res.json({
      enabled: enabled?.value === '1',
      percentage: parseInt(percentage?.value || '20')
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/gaming/config', requireAdmin, async (req, res) => {
  const { enabled, percentage } = req.body;
  try {
    await db.run("INSERT INTO config (key, value) VALUES ('gaming_priority_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = ?", [enabled ? '1' : '0', enabled ? '1' : '0']);
    await db.run("INSERT INTO config (key, value) VALUES ('gaming_priority_percentage', ?) ON CONFLICT(key) DO UPDATE SET value = ?", [percentage, percentage]);
    
    // Apply changes
    const lan = await network.getLanInterface();
    if (lan) {
      await network.applyGamingPriority(lan, enabled, percentage);
    }
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/gaming/rules', requireAdmin, async (req, res) => {
  try {
    const rules = await db.all("SELECT * FROM gaming_rules");
    res.json(rules);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/gaming/rules', requireAdmin, async (req, res) => {
  const { name, protocol, port_start, port_end } = req.body;
  if (!name || !protocol || !port_start || !port_end) return res.status(400).json({ error: 'Missing fields' });
  
  try {
    await db.run("INSERT INTO gaming_rules (name, protocol, port_start, port_end, enabled) VALUES (?, ?, ?, ?, 1)", 
      [name, protocol, port_start, port_end]);
    
    // Re-apply rules
    const enabled = (await db.get("SELECT value FROM config WHERE key = 'gaming_priority_enabled'"))?.value === '1';
    const percentage = parseInt((await db.get("SELECT value FROM config WHERE key = 'gaming_priority_percentage'"))?.value || '20');
    
    if (enabled) {
      const lan = await network.getLanInterface();
      if (lan) {
        await network.applyGamingPriority(lan, true, percentage);
      }
    }
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/gaming/rules/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run("DELETE FROM gaming_rules WHERE id = ?", [id]);
    
    // Re-apply rules
    const enabled = (await db.get("SELECT value FROM config WHERE key = 'gaming_priority_enabled'"))?.value === '1';
    const percentage = parseInt((await db.get("SELECT value FROM config WHERE key = 'gaming_priority_percentage'"))?.value || '20');
    
    if (enabled) {
      const lan = await network.getLanInterface();
      if (lan) {
        await network.applyGamingPriority(lan, true, percentage);
      }
    }
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SYSTEM & CONFIG API
app.get('/api/system/stats', requireAdmin, async (req, res) => {
  try {
    const [cpuLoad, cpuInfo, mem, drive, temp, netStats] = await Promise.all([
      si.currentLoad(),
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.cpuTemperature(),
      si.networkStats()
    ]);
    
    res.json({
      cpu: {
        manufacturer: cpuInfo.manufacturer,
        brand: cpuInfo.brand,
        speed: cpuInfo.speed,
        cores: cpuInfo.cores,
        load: Math.round(cpuLoad.currentLoad),
        temp: temp.main || 0
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        active: mem.active,
        available: mem.available,
        percentage: Math.round((mem.used / mem.total) * 100)
      },
      storage: {
        total: drive[0].size,
        used: drive[0].used,
        percentage: Math.round(drive[0].use)
      },
      temp: temp.main || 0,
      network: netStats.map(iface => ({
        iface: iface.iface,
        rx_bytes: iface.rx_bytes,
        tx_bytes: iface.tx_bytes,
        rx_sec: iface.rx_sec,
        tx_sec: iface.tx_sec
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/system/interfaces', requireAdmin, async (req, res) => {
  try {
    const interfaces = await si.networkInterfaces();
    // Return just the interface names to keep it light
    const interfaceNames = interfaces.map(iface => iface.iface);
    // Also include any interfaces from networkStats that might be missing (unlikely but safe)
    const netStats = await si.networkStats();
    const activeInterfaces = netStats.map(n => n.iface);
    
    const allInterfaces = [...new Set([...interfaceNames, ...activeInterfaces])];
    
    res.json(allInterfaces);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/system/info', requireAdmin, async (req, res) => {
  try {
    const [system, osInfo] = await Promise.all([
      si.system(),
      si.osInfo()
    ]);
    
    res.json({
      manufacturer: system.manufacturer,
      model: system.model,
      distro: osInfo.platform,
      arch: osInfo.arch,
      platform: osInfo.platform
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/machine/status', requireAdmin, async (req, res) => {
  try {
    const identity = edgeSync.getIdentity();
    const metrics = await edgeSync.getMetrics();
    
    // Check if pending activation (no vendor_id)
    const status = !identity.vendorId ? 'pending_activation' : 'active';
    
    res.json({
      ...identity,
      status,
      metrics
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config', requireAdmin, async (req, res) => {
  try {
    const board = await db.get('SELECT value FROM config WHERE key = ?', ['boardType']);
    const pin = await db.get('SELECT value FROM config WHERE key = ?', ['coinPin']);
    const model = await db.get('SELECT value FROM config WHERE key = ?', ['boardModel']);
    const coinSlots = await db.get('SELECT value FROM config WHERE key = ?', ['coinSlots']);
    const espIpAddress = await db.get('SELECT value FROM config WHERE key = ?', ['espIpAddress']);
    const espPort = await db.get('SELECT value FROM config WHERE key = ?', ['espPort']);
    const nodemcuDevices = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const registrationKey = await db.get('SELECT value FROM config WHERE key = ?', ['registrationKey']);
    const macSyncEnabled = await db.get('SELECT value FROM config WHERE key = ?', ['mac_sync_enabled']);
    
    res.json({ 
      boardType: board?.value || 'none', 
      coinPin: parseInt(pin?.value || '2'),
      boardModel: model?.value || null,
      espIpAddress: espIpAddress?.value || '192.168.4.1',
      espPort: parseInt(espPort?.value || '80'),
      coinSlots: coinSlots?.value ? JSON.parse(coinSlots.value) : [],
      nodemcuDevices: nodemcuDevices?.value ? JSON.parse(nodemcuDevices.value) : [],
      registrationKey: registrationKey?.value || '7B3F1A9',
      macSyncEnabled: macSyncEnabled?.value === '1'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/config', requireAdmin, async (req, res) => {
  try {
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['boardType', req.body.boardType]);
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['coinPin', req.body.coinPin]);
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['boardModel', req.body.boardModel]);
    
    if (req.body.registrationKey) {
      await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['registrationKey', req.body.registrationKey]);
    }
    
    // Handle NodeMCU ESP configuration
    if (req.body.boardType === 'nodemcu_esp') {
      await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['espIpAddress', req.body.espIpAddress || '192.168.4.1']);
      await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['espPort', req.body.espPort || '80']);
      await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['coinSlots', JSON.stringify(req.body.coinSlots || [])]);
      updateGPIO(req.body.boardType, req.body.coinPin, req.body.boardModel, req.body.espIpAddress, req.body.espPort, req.body.coinSlots, req.body.nodemcuDevices);
    } else {
      updateGPIO(req.body.boardType, req.body.coinPin, req.body.boardModel, null, null, null, req.body.nodemcuDevices);
    }
    
    // Handle multi-NodeMCU devices
    if (req.body.nodemcuDevices !== undefined) {
      await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['nodemcuDevices', JSON.stringify(req.body.nodemcuDevices)]);
    }
    
    // Handle MAC Sync configuration
    if (req.body.macSyncEnabled !== undefined) {
      await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['mac_sync_enabled', req.body.macSyncEnabled ? '1' : '0']);
      console.log(`[CONFIG] MAC Sync ${req.body.macSyncEnabled ? 'enabled' : 'disabled'}`);
    }
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// NODEMCU DEVICE REGISTRATION API
app.post('/api/nodemcu/register', async (req, res) => {
  try {
    const { macAddress, ipAddress, authenticationKey } = req.body;
    
    if (!macAddress || !ipAddress || !authenticationKey) {
      return res.status(400).json({ error: 'Missing required fields: macAddress, ipAddress, authenticationKey' });
    }

    // Validate Registration Key
    const registrationKeyResult = await db.get('SELECT value FROM config WHERE key = ?', ['registrationKey']);
    const serverRegistrationKey = registrationKeyResult?.value || '7B3F1A9'; // Default key if not set

    if (authenticationKey !== serverRegistrationKey) {
       return res.status(401).json({ error: 'Invalid Registration Key' });
    }
    
    // Load existing devices
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const existingDevices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
    
    // Check if device already exists (case-insensitive)
    const existingDeviceIndex = existingDevices.findIndex(d => d.macAddress.toUpperCase() === macAddress.toUpperCase());
    if (existingDeviceIndex !== -1) {
       // Update existing device info (e.g. IP might have changed)
       const updatedDevices = [...existingDevices];
       updatedDevices[existingDeviceIndex] = {
         ...updatedDevices[existingDeviceIndex],
         ipAddress,
         lastSeen: new Date().toISOString()
       };
       await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['nodemcuDevices', JSON.stringify(updatedDevices)]);
       
       console.log(`[NODEMCU] Device Heartbeat | Name: ${updatedDevices[existingDeviceIndex].name} | IP: ${ipAddress} | Status: ${updatedDevices[existingDeviceIndex].status}`);

       const licenseStatus = await nodeMCULicenseManager.verifyLicense(macAddress);
       
       return res.json({
         success: true,
         device: updatedDevices[existingDeviceIndex],
         licensed: Boolean(licenseStatus && licenseStatus.isValid),
         licenseType: licenseStatus?.licenseType || null,
         expiresAt: licenseStatus?.expiresAt || null,
         daysRemaining: licenseStatus?.daysRemaining ?? null,
         frozen: Boolean(licenseStatus && licenseStatus.isValid === false),
         message: 'Device updated'
       });
    }
    
    // Create new pending device
    const newDevice = {
      id: `nodemcu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `NodeMCU-${macAddress.replace(/[:]/g, '').substring(0, 6)}`,
      ipAddress,
      macAddress,
      pin: 12,
      coinPinLabel: 'D6',
      coinPin: 12,
      relayPinLabel: 'D5',
      relayPin: 14,
      status: 'pending',
      vlanId: 13, // Default VLAN, can be changed later
      lastSeen: new Date().toISOString(),
      authenticationKey, // Store the key used for auth (or generate a new specific one?) 
                         // For now, keep using the registration key or generate a session key. 
                         // The user requirement says "validates ... using the Key". 
                         // Usually we'd issue a token, but let's stick to simple key auth for now.
      createdAt: new Date().toISOString(),
      rates: [],
      totalPulses: 0,
      totalRevenue: 0
    };
    
    // Add to devices list
    const updatedDevices = [...existingDevices, newDevice];
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['nodemcuDevices', JSON.stringify(updatedDevices)]);
    
    res.json({
      success: true,
      device: newDevice,
      licensed: false,
      licenseType: null,
      expiresAt: null,
      daysRemaining: null,
      frozen: true
    });
  } catch (err) {
    console.error('Error registering NodeMCU device:', err);
    res.status(500).json({ error: err.message });
  }
});

// NodeMCU device authentication
app.post('/api/nodemcu/authenticate', async (req, res) => {
  try {
    const { macAddress, authenticationKey } = req.body;
    
    if (!macAddress || !authenticationKey) {
      return res.status(400).json({ error: 'Missing required fields: macAddress, authenticationKey' });
    }
    
    // Load existing devices
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const existingDevices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
    
    // Find device by MAC address
    const device = existingDevices.find(d => d.macAddress === macAddress);
    
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Check authentication key
    if (device.authenticationKey !== authenticationKey) {
      return res.status(401).json({ error: 'Invalid authentication key' });
    }
    
    // Update last seen timestamp
    const updatedDevices = existingDevices.map(d => 
      d.macAddress === macAddress 
        ? { ...d, lastSeen: new Date().toISOString() } 
        : d
    );
    
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['nodemcuDevices', JSON.stringify(updatedDevices)]);
    
    // Log heartbeat if it was previously offline
    const now = new Date().getTime();
    const lastSeen = new Date(device.lastSeen).getTime();
    if ((now - lastSeen) > 15000) {
       console.log(`[NODEMCU] Device RECONNECTED | Name: ${device.name} | MAC: ${macAddress}`);
    }

    res.json({ success: true, device: { ...device, status: device.status } });
  } catch (err) {
    console.error('Error authenticating NodeMCU device:', err);
    res.status(500).json({ error: err.message });
  }
});

// Background task to monitor NodeMCU health
const deviceStatusCache = new Map();

setInterval(async () => {
  try {
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    if (!devicesResult?.value) return;
    
    const devices = JSON.parse(devicesResult.value);
    const now = new Date().getTime();
    const OFFLINE_THRESHOLD = 15000; // Lowered to 15 seconds for faster detection (1.5x heartbeat)

    devices.forEach(device => {
      if (device.status !== 'accepted') return;

      const lastSeen = new Date(device.lastSeen).getTime();
      const isOnline = (now - lastSeen) < OFFLINE_THRESHOLD;
      const previousStatus = deviceStatusCache.get(device.macAddress);

      if (previousStatus === 'online' && !isOnline) {
        console.warn(`[NODEMCU] CRITICAL: Device DISCONNECTED | Name: ${device.name} | MAC: ${device.macAddress} | Last Seen: ${new Date(device.lastSeen).toLocaleTimeString()}`);
        io.emit('nodemcu-status-change', { macAddress: device.macAddress, status: 'offline' });
      } else if (previousStatus === 'offline' && isOnline) {
        console.log(`[NODEMCU] SUCCESS: Device BACK ONLINE | Name: ${device.name} | MAC: ${device.macAddress}`);
        io.emit('nodemcu-status-change', { macAddress: device.macAddress, status: 'online' });
      }

      deviceStatusCache.set(device.macAddress, isOnline ? 'online' : 'offline');
    });
  } catch (err) {
    // Silent fail for background task
  }
}, 5000); // Check every 5 seconds

// NodeMCU pulse reporting API
app.post('/api/nodemcu/pulse', async (req, res) => {
  try {
    const { macAddress, slotId, denomination } = req.body;

    if (!macAddress || !denomination) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Load existing devices
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const existingDevices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
    
    // Find device by MAC address (case-insensitive)
    const device = existingDevices.find(d => d.macAddress.toUpperCase() === macAddress.toUpperCase());
    
    if (!device || device.status !== 'accepted') {
      return res.status(403).json({ error: 'Device not authorized' });
    }

    const licenseStatus = await nodeMCULicenseManager.verifyLicense(macAddress);
    if (!licenseStatus || licenseStatus.isValid !== true) {
      return res.status(403).json({
        error: 'YOUR COINSLOT MACHINE IS DISABLED',
        frozen: true,
        licenseType: licenseStatus?.licenseType || null,
        message: 'YOUR COINSLOT MACHINE IS DISABLED'
      });
    }

    // Update device stats
    const updatedDevices = existingDevices.map(d => {
      if (d.macAddress.toUpperCase() === macAddress.toUpperCase()) {
        return {
          ...d,
          totalPulses: (d.totalPulses || 0) + 1,
          totalRevenue: (d.totalRevenue || 0) + denomination,
          lastSeen: new Date().toISOString()
        };
      }
      return d;
    });

    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['nodemcuDevices', JSON.stringify(updatedDevices)]);

    // Log to terminal for debugging (similar to local GPIO logs)
    console.log(`[NODEMCU] Pulse Detected | Source: ${device.name} | MAC: ${macAddress} | Amount: ₱${denomination}`);

    // Emit pulse event to all connected clients (Admin and Portal)
    io.emit('nodemcu-pulse', {
      deviceId: device.id,
      deviceName: device.name,
      slotId: slotId || 1,
      denomination,
      macAddress,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error processing NodeMCU pulse:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin endpoint to accept/reject NodeMCU device
app.post('/api/nodemcu/:deviceId/status', requireAdmin, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { status, name, vlanId } = req.body;
    
    if (!['pending', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be pending, accepted, or rejected' });
    }
    
    // Load existing devices
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const existingDevices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
    
    // Find and update device
    const deviceIndex = existingDevices.findIndex(d => d.id === deviceId);
    if (deviceIndex === -1) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    const updatedDevices = [...existingDevices];
    updatedDevices[deviceIndex] = { 
      ...updatedDevices[deviceIndex], 
      status,
      ...(name && { name }),
      ...(vlanId && { vlanId: parseInt(vlanId) })
    };
    
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['nodemcuDevices', JSON.stringify(updatedDevices)]);
    
    res.json({ success: true, device: updatedDevices[deviceIndex] });
  } catch (err) {
    console.error('Error updating NodeMCU device status:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update NodeMCU device rates
app.post('/api/nodemcu/:deviceId/rates', requireAdmin, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { rates } = req.body;
    
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const existingDevices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
    
    const deviceIndex = existingDevices.findIndex(d => d.id === deviceId);
    if (deviceIndex === -1) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    const updatedDevices = [...existingDevices];
    updatedDevices[deviceIndex] = { ...updatedDevices[deviceIndex], rates };
    
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['nodemcuDevices', JSON.stringify(updatedDevices)]);
    
    res.json({ success: true, device: updatedDevices[deviceIndex] });
  } catch (err) {
    console.error('Error updating NodeMCU device rates:', err);
    res.status(500).json({ error: err.message });
  }
});

// List NodeMCU devices
app.get('/api/nodemcu/devices', requireAdmin, async (req, res) => {
  try {
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const devices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
    res.json(devices);
  } catch (err) {
    console.error('Error fetching NodeMCU devices:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public endpoint for portal to get accepted devices
app.get('/api/nodemcu/available', async (req, res) => {
  try {
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const devices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
    
    // Filter only accepted devices and calculate online status
    const now = new Date().getTime();
    const licenseManager = getNodeMCULicenseManager();

    const availableDevices = await Promise.all(devices
      .filter(d => d.status === 'accepted')
      .map(async d => {
        const lastSeen = new Date(d.lastSeen).getTime();
        const isOnline = (now - lastSeen) < 15000; // Online if seen in last 15 seconds
        
        // License Check
        let license = await licenseManager.verifyLicense(d.macAddress);

        // Fallback: Check Local Config for Trial
        if (!license.isValid && d.localLicense && d.localLicense.type === 'trial') {
           const expiresAt = new Date(d.localLicense.expiresAt).getTime();
           if (now < expiresAt) {
             license = {
               isValid: true,
               isActivated: true,
               isExpired: false,
               licenseType: 'trial',
               canStartTrial: false
             };
           }
        }

        return {
          id: d.id,
          name: d.name,
          macAddress: d.macAddress,
          isOnline,
          license: {
            isValid: license.isValid,
            isTrial: license.licenseType === 'trial',
            isExpired: license.isExpired,
            error: license.error
          }
        };
      }));
      
    res.json(availableDevices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific NodeMCU status
app.get('/api/nodemcu/status/:mac', async (req, res) => {
  try {
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const devices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
    const device = devices.find(d => d.macAddress.toUpperCase() === req.params.mac.toUpperCase());
    
    if (!device) return res.status(404).json({ error: 'Device not found' });
    
    const now = new Date().getTime();
    const lastSeen = new Date(device.lastSeen).getTime();
    const isOnline = (now - lastSeen) < 15000;
    
    // License Check
    const licenseManager = getNodeMCULicenseManager();
    let license = await licenseManager.verifyLicense(device.macAddress);

    // Fallback: Check Local Config for Trial if Supabase verification failed or returned invalid
    if (!license.isValid && device.localLicense && device.localLicense.type === 'trial') {
      const nowTs = Date.now();
      const expiresAt = new Date(device.localLicense.expiresAt).getTime();
      const isValid = nowTs < expiresAt;
      
      if (isValid) {
        license = {
          isValid: true,
          isActivated: true,
          isExpired: false,
          licenseType: 'trial',
          canStartTrial: false
        };
      }
    }

    res.json({ 
      online: isOnline, 
      lastSeen: device.lastSeen,
      license: {
        isValid: license.isValid,
        isTrial: license.licenseType === 'trial',
        isExpired: license.isExpired,
        error: license.error
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single NodeMCU device
app.get('/api/nodemcu/:deviceId', requireAdmin, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const devices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
    const device = devices.find(d => d.id === deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json(device);
  } catch (err) {
    console.error('Error fetching NodeMCU device:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update NodeMCU device config (name, VLAN, pin)
app.post('/api/nodemcu/:deviceId/config', requireAdmin, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { name, vlanId, pin, coinPinLabel, coinPin, relayPinLabel, relayPin } = req.body;
    
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const existingDevices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
    
    const deviceIndex = existingDevices.findIndex(d => d.id === deviceId);
    if (deviceIndex === -1) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const previousDevice = existingDevices[deviceIndex];

    const requestedCoinLabel = normalizeNodeMcuDPinLabel(coinPinLabel);
    const requestedRelayLabel = normalizeNodeMcuDPinLabel(relayPinLabel);

    if (coinPinLabel !== undefined && requestedCoinLabel === null) {
      return res.status(400).json({ error: 'Invalid coinPinLabel. Use D0-D8.' });
    }

    if (requestedCoinLabel === 'D0') {
      return res.status(400).json({ error: 'Coin pin cannot be D0 on ESP8266 (no interrupt).' });
    }

    if (relayPinLabel !== undefined && requestedRelayLabel === null) {
      return res.status(400).json({ error: 'Invalid relayPinLabel. Use D0-D8.' });
    }

    const requestedCoinGpio =
      typeof coinPin === 'number' ? coinPin :
      typeof pin === 'number' ? pin :
      requestedCoinLabel ? nodeMcuDPinLabelToGpio(requestedCoinLabel) :
      null;

    const requestedRelayGpio =
      typeof relayPin === 'number' ? relayPin :
      requestedRelayLabel ? nodeMcuDPinLabelToGpio(requestedRelayLabel) :
      null;

    if (typeof requestedCoinGpio === 'number' && nodeMcuGpioToDPinLabel(requestedCoinGpio) === null) {
      return res.status(400).json({ error: 'Invalid coinPin GPIO for NodeMCU. Use D0-D8 mapping.' });
    }

    if (typeof requestedCoinGpio === 'number' && requestedCoinGpio === 16) {
      return res.status(400).json({ error: 'Coin pin cannot be D0/GPIO16 on ESP8266 (no interrupt).' });
    }

    if (typeof requestedRelayGpio === 'number' && nodeMcuGpioToDPinLabel(requestedRelayGpio) === null) {
      return res.status(400).json({ error: 'Invalid relayPin GPIO for NodeMCU. Use D0-D8 mapping.' });
    }

    const nextCoinGpio = typeof requestedCoinGpio === 'number' ? requestedCoinGpio : (previousDevice.coinPin ?? previousDevice.pin ?? 12);
    const nextRelayGpio = typeof requestedRelayGpio === 'number' ? requestedRelayGpio : (previousDevice.relayPin ?? 14);

    const nextCoinLabel = requestedCoinLabel || previousDevice.coinPinLabel || nodeMcuGpioToDPinLabel(nextCoinGpio) || 'D6';
    const nextRelayLabel = requestedRelayLabel || previousDevice.relayPinLabel || nodeMcuGpioToDPinLabel(nextRelayGpio) || 'D5';

    const updatedDevices = [...existingDevices];
    updatedDevices[deviceIndex] = {
      ...previousDevice,
      name: typeof name === 'string' && name.trim().length > 0 ? name.trim() : previousDevice.name,
      vlanId: typeof vlanId === 'number' ? vlanId : previousDevice.vlanId,
      pin: nextCoinGpio,
      coinPin: nextCoinGpio,
      coinPinLabel: nextCoinLabel,
      relayPin: nextRelayGpio,
      relayPinLabel: nextRelayLabel
    };
    
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['nodemcuDevices', JSON.stringify(updatedDevices)]);

    const prevCoinGpio = previousDevice.coinPin ?? previousDevice.pin ?? 12;
    const prevRelayGpio = previousDevice.relayPin ?? 14;
    const prevCoinLabel = previousDevice.coinPinLabel || nodeMcuGpioToDPinLabel(prevCoinGpio) || 'D6';
    const prevRelayLabel = previousDevice.relayPinLabel || nodeMcuGpioToDPinLabel(prevRelayGpio) || 'D5';

    const pinsChanged = (nextCoinGpio !== prevCoinGpio) || (nextRelayGpio !== prevRelayGpio) || (nextCoinLabel !== prevCoinLabel) || (nextRelayLabel !== prevRelayLabel);

    let deviceApply = null;
    if (pinsChanged) {
      deviceApply = await pushNodeMCUPinsToDevice(updatedDevices[deviceIndex], {
        coinPinGpio: nextCoinGpio,
        relayPinGpio: nextRelayGpio
      });
    }

    res.json({ success: true, device: updatedDevices[deviceIndex], applied: deviceApply });
  } catch (err) {
    console.error('Error updating NodeMCU device config:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete NodeMCU device
app.delete('/api/nodemcu/:deviceId', requireAdmin, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const existingDevices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
    
    const updatedDevices = existingDevices.filter(d => d.id !== deviceId);
    
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['nodemcuDevices', JSON.stringify(updatedDevices)]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting NodeMCU device:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update NodeMCU Firmware
app.post('/api/nodemcu/:deviceId/update', requireAdmin, uploadFirmware.single('firmware'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'No firmware file uploaded' });
    }

    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const devices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
    const device = devices.find(d => d.id === deviceId);

    if (!device) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Device not found' });
    }

    if (!device.ipAddress) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Device IP address not found. Make sure it has registered recently.' });
    }

    const formData = new FormData();
    const fileBuffer = fs.readFileSync(req.file.path);
    const blob = new Blob([fileBuffer], { type: 'application/octet-stream' });
    formData.append('update', blob, 'firmware.bin');

    console.log(`Updating NodeMCU ${device.macAddress} at ${device.ipAddress}...`);
    
    const response = await fetch(`http://${device.ipAddress}/update`, {
      method: 'POST',
      body: formData
    });

    // Clean up temp file
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    if (response.ok) {
      res.json({ success: true, message: 'Firmware update started successfully' });
    } else {
      const errorText = await response.text();
      res.status(response.status).json({ error: `Update failed: ${errorText}` });
    }
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Error updating NodeMCU firmware:', err);
    res.status(500).json({ error: err.message });
  }
});

// PORTAL CONFIG API
app.get('/api/portal/config', async (req, res) => {
  try {
    const config = await db.get('SELECT value FROM config WHERE key = ?', ['portal_config']);
    res.json(config?.value ? JSON.parse(config.value) : {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/portal/config', requireAdmin, async (req, res) => {
  try {
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['portal_config', JSON.stringify(req.body)]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/system/reset', requireAdmin, async (req, res) => {
  try {
    await db.factoryResetDB();
    await network.cleanupAllNetworkSettings();
    
    // Send success response first
    res.json({ success: true, message: 'System reset complete. Rebooting now...' });
    
    // Trigger reboot to ensure fresh state
    console.log('[System] Factory reset completed. Initiating reboot...');
    setTimeout(() => {
        exec('sudo reboot', (error) => {
            if (error) {
                console.error(`[System] Reboot failed: ${error.message}`);
            }
        });
    }, 3000);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/system/backup', requireAdmin, async (req, res) => {
  try {
    const zip = new AdmZip();
    const exclude = ['node_modules', '.git', '.next', 'dist', 'package-lock.json', 'backups'];
    
    // Add system metadata
    const metadata = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      backupType: 'full-system',
      hardwareId: null,
      licenseStatus: null
    };
    
    // Try to get hardware and license info
    try {
      const hardwareInfo = await db.getHardwareInfo();
      metadata.hardwareId = hardwareInfo?.hardware_id || null;
      
      const licenseData = await db.getCurrentLicense();
      metadata.licenseStatus = licenseData ? {
        isLicensed: licenseData.is_licensed,
        licenseKey: licenseData.license_key,
        expiresAt: licenseData.expires_at
      } : null;
    } catch (e) {
      console.warn('Could not fetch hardware/license info for backup:', e.message);
    }
    
    zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
    
    // Add database export
    try {
      const dbExport = await db.exportDatabase();
      zip.addFile('database.sql', Buffer.from(dbExport));
    } catch (e) {
      console.warn('Could not export database:', e.message);
      // Continue without database export
    }
    
    // Add configuration files
    const configFiles = [
      '.env',
      'config.json',
      'network.json'
    ];
    
    for (const configFile of configFiles) {
      const configPath = path.join(__dirname, configFile);
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf8');
          zip.addFile(`config/${configFile}`, Buffer.from(content));
        } catch (e) {
          console.warn(`Could not read config file ${configFile}:`, e.message);
        }
      }
    }
    
    // Add application files and directories
    const rootFiles = fs.readdirSync(__dirname);
    for (const file of rootFiles) {
      if (exclude.includes(file)) continue;
      
      const filePath = path.join(__dirname, file);
      const stats = fs.statSync(filePath);
      
      try {
        if (stats.isDirectory()) {
          // Skip uploads directory entirely - too large
          if (file === 'uploads') continue;
          zip.addLocalFolder(filePath, file);
        } else {
          zip.addLocalFile(filePath);
        }
      } catch (e) {
        console.warn(`Could not add ${file} to backup:`, e.message);
      }
    }
    
    // Add uploads/audio if it exists
    const audioPath = path.join(__dirname, 'uploads/audio');
    if (fs.existsSync(audioPath)) {
      try {
        zip.addLocalFolder(audioPath, 'uploads/audio');
      } catch (e) {
        console.warn('Could not add audio files to backup:', e.message);
      }
    }
    
    const buffer = zip.toBuffer();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `pisowifi-backup-${timestamp}.nxs`;
    
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.set('Content-Length', buffer.length);
    res.send(buffer);
    
    console.log(`[Backup] Created backup: ${filename} (${Math.round(buffer.length / 1024 / 1024 * 100) / 100} MB)`);
  } catch (err) {
    console.error('Backup failed:', err);
    res.status(500).json({ error: 'Backup failed: ' + err.message });
  }
});

app.post('/api/system/restore', requireAdmin, uploadBackup.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  try {
    console.log(`[Restore] Starting restore from: ${req.file.originalname}`);
    
    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries();
    
    // Validate backup structure
    const hasMetadata = entries.some(e => e.entryName === 'metadata.json');
    const hasDatabase = entries.some(e => e.entryName === 'database.sql');
    
    if (!hasMetadata) {
      throw new Error('Invalid backup file: missing metadata.json');
    }
    
    // Read metadata
    const metadataEntry = entries.find(e => e.entryName === 'metadata.json');
    const metadata = JSON.parse(zip.readAsText(metadataEntry));
    
    console.log(`[Restore] Backup metadata:`, {
      version: metadata.version,
      timestamp: metadata.timestamp,
      hostname: metadata.hostname,
      platform: metadata.platform
    });
    
    // Close database connection
    try {
      await db.close();
      console.log('[Restore] Database connection closed');
    } catch (e) {
      console.warn('[Restore] Could not close DB:', e.message);
    }
    
    // Extract application files (excluding special files)
    const specialFiles = ['metadata.json', 'database.sql'];
    const configFiles = [];
    
    for (const entry of entries) {
      if (specialFiles.includes(entry.entryName)) continue;
      
      try {
        if (entry.entryName.startsWith('config/')) {
          // Handle config files separately
          configFiles.push(entry);
        } else {
          // Extract regular files/directories
          zip.extractEntryTo(entry, __dirname, true, true);
        }
      } catch (e) {
        console.warn(`[Restore] Could not extract ${entry.entryName}:`, e.message);
      }
    }
    
    // Handle config files
    for (const entry of configFiles) {
      try {
        const fileName = entry.entryName.replace('config/', '');
        const targetPath = path.join(__dirname, fileName);
        
        // Only restore .env if it doesn't exist or is empty
        if (fileName === '.env' && fs.existsSync(targetPath)) {
          const currentEnv = fs.readFileSync(targetPath, 'utf8').trim();
          if (currentEnv) {
            console.log('[Restore] Skipping .env restore - file already exists with content');
            continue;
          }
        }
        
        zip.extractEntryTo(entry, __dirname, true, true);
        console.log(`[Restore] Restored config file: ${fileName}`);
      } catch (e) {
        console.warn(`[Restore] Could not restore config ${entry.entryName}:`, e.message);
      }
    }
    
    // Restore database if present
    if (hasDatabase) {
      try {
        const dbEntry = entries.find(e => e.entryName === 'database.sql');
        const sqlContent = zip.readAsText(dbEntry);
        
        // Import database
        await db.importDatabase(sqlContent);
        console.log('[Restore] Database imported successfully');
      } catch (e) {
        console.error('[Restore] Database import failed:', e.message);
        throw new Error('Database restore failed: ' + e.message);
      }
    }
    
    // Cleanup
    fs.unlinkSync(req.file.path);
    
    res.json({ 
      success: true, 
      message: 'System restored successfully. Restarting...',
      backupInfo: {
        version: metadata.version,
        timestamp: metadata.timestamp,
        hostname: metadata.hostname
      }
    });
    
    console.log('[Restore] Restore completed. Initiating restart...');
    
    // Restart logic
    setTimeout(() => {
        process.exit(0); // PM2 should restart it
    }, 2000);
  } catch (err) {
    console.error('[Restore] Restore failed:', err);
    res.status(500).json({ error: 'Restore failed: ' + err.message });
  }
});

app.post('/api/system/update', requireAdmin, uploadBackup.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  try {
    const zip = new AdmZip(req.file.path);
    const zipEntries = zip.getEntries();
    
    // Extract each entry unless it's the database
    zipEntries.forEach((entry) => {
        if (entry.entryName !== 'pisowifi.sqlite' && !entry.entryName.includes('pisowifi.sqlite')) {
            zip.extractEntryTo(entry, __dirname, true, true);
        }
    });
    
    // Cleanup
    fs.unlinkSync(req.file.path);
    
    res.json({ success: true, message: 'System updated successfully. Restarting...' });
    
    // Restart logic
    setTimeout(() => {
        process.exit(0); // PM2 should restart it
    }, 2000);
  } catch (err) {
    console.error('Update failed:', err);
    res.status(500).json({ error: 'Update failed: ' + err.message });
  }
});

// NETWORK API
app.get('/api/interfaces', requireAdmin, async (req, res) => {
  try { res.json(await network.getInterfaces()); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/hotspots', requireAdmin, async (req, res) => {
  try { res.json(await db.all('SELECT * FROM hotspots')); } catch (err) { res.json([]); }
});

app.get('/api/network/wireless', requireAdmin, async (req, res) => {
  try { res.json(await db.all('SELECT * FROM wireless_settings')); } catch (err) { res.json([]); }
});

app.post('/api/network/wireless', requireAdmin, async (req, res) => {
  try {
    await db.run('INSERT OR REPLACE INTO wireless_settings (interface, ssid, password, bridge) VALUES (?, ?, ?, ?)', [req.body.interface, req.body.ssid, req.body.password, req.body.bridge]);
    await network.configureWifiAP(req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/hotspots', requireAdmin, async (req, res) => {
  try {
    await db.run('INSERT OR REPLACE INTO hotspots (interface, ip_address, dhcp_range, enabled) VALUES (?, ?, ?, 1)', [req.body.interface, req.body.ip_address, req.body.dhcp_range]);
    await network.setupHotspot(req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/hotspots/:interface', requireAdmin, async (req, res) => {
  try {
    await network.removeHotspot(req.params.interface);
    await db.run('DELETE FROM hotspots WHERE interface = ?', [req.params.interface]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/network/vlans', requireAdmin, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM vlans');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/network/vlan', requireAdmin, async (req, res) => {
  try {
    await network.createVlan(req.body);
    await db.run('INSERT OR REPLACE INTO vlans (name, parent, id) VALUES (?, ?, ?)', 
      [req.body.name, req.body.parent, req.body.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/network/vlan/:name', requireAdmin, async (req, res) => {
  try {
    // Get the full VLAN record from database
    const vlan = await db.get('SELECT * FROM vlans WHERE name = ?', [req.params.name]);
    
    if (vlan) {
      // Pass the full VLAN record for proper interface name generation
      await network.deleteVlan(vlan);
    } else {
      // Fallback to legacy format if not found in database
      await network.deleteVlan(req.params.name);
    }
    
    await db.run('DELETE FROM vlans WHERE name = ?', [req.params.name]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/network/bridges', requireAdmin, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM bridges');
    // Parse members JSON
    const bridges = rows.map(b => ({
      ...b,
      members: JSON.parse(b.members),
      stp: Boolean(b.stp)
    }));
    res.json(bridges);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/network/bridge', requireAdmin, async (req, res) => {
  try {
    const output = await network.createBridge(req.body);
    await db.run('INSERT OR REPLACE INTO bridges (name, members, stp) VALUES (?, ?, ?)', 
      [req.body.name, JSON.stringify(req.body.members), req.body.stp ? 1 : 0]);
    res.json({ success: true, output });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/network/bridge/:name', requireAdmin, async (req, res) => {
  try {
    await network.deleteBridge(req.params.name);
    await db.run('DELETE FROM bridges WHERE name = ?', [req.params.name]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// NODEMCU FLASHER API
app.get('/api/system/usb-devices', requireAdmin, async (req, res) => {
  try {
    const devices = [];
    
    // Try using serialport if available
    try {
      const { SerialPort } = require('serialport');
      const ports = await SerialPort.list();
      ports.forEach(port => {
        // Filter for likely candidates (USB/ACM)
        if (port.path.includes('USB') || port.path.includes('ACM') || port.path.includes('COM')) {
             devices.push({
               path: port.path,
               manufacturer: port.manufacturer,
               serialNumber: port.serialNumber,
               pnpId: port.pnpId
             });
        }
      });
    } catch (e) {
      // Fallback to fs listing of /dev/
      try {
        const files = await fs.promises.readdir('/dev');
        const serialPorts = files.filter(f => f.startsWith('ttyUSB') || f.startsWith('ttyACM'));
        serialPorts.forEach(port => {
          devices.push({
            path: `/dev/${port}`,
            manufacturer: 'Unknown',
            serialNumber: 'Unknown'
          });
        });
      } catch (err) {
        // Ignore fs errors (e.g. on Windows without /dev)
      }
    }
    
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/system/flash-nodemcu', requireAdmin, async (req, res) => {
  const { port } = req.body;
  if (!port) return res.status(400).json({ error: 'Port is required' });

  const firmwarePath = '/opt/ajc-pisowifi/firmware/NodeMCU_ESP8266/build/esp8266.esp8266.huzzah/NodeMCU_ESP8266.ino.bin';
  
  // Verify firmware exists
  if (!fs.existsSync(firmwarePath)) {
    // For dev/test on Windows, we might accept a local path or skip check if hardcoded
    // But for production as requested:
    return res.status(404).json({ error: 'Firmware binary not found at ' + firmwarePath });
  }

  // Construct command
  // esptool.py --port /dev/ttyUSB0 --baud 115200 write_flash 0x00000 <firmware>
  // We assume esptool is in PATH or we can call it. 
  
  const cmd = `esptool --port ${port} --baud 115200 write_flash -fm dio -fs 4MB 0x00000 "${firmwarePath}"`;
  
  console.log(`[Flasher] Executing: ${cmd}`);
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`[Flasher] Error: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message, details: stderr });
    }
    console.log(`[Flasher] Success: ${stdout}`);
    res.json({ success: true, message: 'Flash complete', output: stdout });
  });
});

// MAX BANDWIDTH CONFIGURATION API ENDPOINTS
app.get('/api/max-bandwidth', requireAdmin, async (req, res) => {
  try {
    const maxBandwidthRow = await db.get("SELECT value FROM config WHERE key = 'max_bandwidth_mbps'");
    const maxBandwidth = parseInt(maxBandwidthRow?.value || '10000'); // Default to 10G
    
    res.json({ maxBandwidth });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

app.post('/api/max-bandwidth', requireAdmin, async (req, res) => {
  try {
    const { maxBandwidth } = req.body;
    
    // Validate input
    if (typeof maxBandwidth !== 'number' || maxBandwidth <= 0 || maxBandwidth > 100000) { // Max 100G
      return res.status(400).json({ error: 'Max bandwidth must be a positive number up to 100000 (100Gbps)' });
    }
    
    // Save to database
    await db.run("INSERT OR REPLACE INTO config (key, value) VALUES ('max_bandwidth_mbps', ?)", [maxBandwidth.toString()]);
    
    res.json({ success: true, maxBandwidth });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// BANDWIDTH MANAGEMENT API ENDPOINTS
app.get('/api/bandwidth/settings', requireAdmin, async (req, res) => {
  try {
    // Get default bandwidth settings
    const defaultDL = await db.get("SELECT value FROM config WHERE key = 'default_download_limit'");
    const defaultUL = await db.get("SELECT value FROM config WHERE key = 'default_upload_limit'");
    const autoApply = await db.get("SELECT value FROM config WHERE key = 'auto_apply_bandwidth'");
    
    res.json({
      defaultDownloadLimit: defaultDL ? parseInt(defaultDL.value) : 5,
      defaultUploadLimit: defaultUL ? parseInt(defaultUL.value) : 5,
      autoApplyToNew: autoApply ? autoApply.value === '1' : true
    });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

app.post('/api/bandwidth/settings', requireAdmin, async (req, res) => {
  try { 
    const { defaultDownloadLimit, defaultUploadLimit, autoApplyToNew } = req.body;
    
    // Validate inputs
    if (typeof defaultDownloadLimit !== 'number' || typeof defaultUploadLimit !== 'number') {
      return res.status(400).json({ error: 'Download and upload limits must be numbers' });
    }
    
    if (defaultDownloadLimit < 0 || defaultUploadLimit < 0) {
      return res.status(400).json({ error: 'Limits cannot be negative' });
    }
    
    // Save settings to database
    await db.run("INSERT OR REPLACE INTO config (key, value) VALUES ('default_download_limit', ?)", [defaultDownloadLimit.toString()]);
    await db.run("INSERT OR REPLACE INTO config (key, value) VALUES ('default_upload_limit', ?)", [defaultUploadLimit.toString()]);
    await db.run("INSERT OR REPLACE INTO config (key, value) VALUES ('auto_apply_bandwidth', ?)", [autoApplyToNew ? '1' : '0']);
    
    res.json({ success: true }); 
  }
  catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// PPPoE SERVER API ENDPOINTS
app.get('/api/network/pppoe/status', requireAdmin, async (req, res) => {
  try {
    const status = await network.getPPPoEServerStatus();
    res.json(status);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/network/pppoe/start', requireAdmin, async (req, res) => {
  try {
    const { interface: iface, local_ip, ip_pool_start, ip_pool_end, dns1, dns2, service_name } = req.body;
    
    if (!iface || !local_ip || !ip_pool_start || !ip_pool_end) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = await network.startPPPoEServer({
      interface: iface,
      local_ip,
      ip_pool_start,
      ip_pool_end,
      dns1,
      dns2,
      service_name
    });
    
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/network/pppoe/stop', requireAdmin, async (req, res) => {
  try {
    const { interface: iface } = req.body;
    const result = await network.stopPPPoEServer(iface);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/network/pppoe/sessions', requireAdmin, async (req, res) => {
  try {
    const sessions = await network.getPPPoESessions();
    res.json(sessions);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/network/pppoe/users', requireAdmin, async (req, res) => {
  try {
    const users = await network.getPPPoEUsers();
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/network/pppoe/users', requireAdmin, async (req, res) => {
  try {
    const { username, password, billing_profile_id } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const result = await network.addPPPoEUser(username, password, billing_profile_id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PPPoE Profiles API
app.get('/api/network/pppoe/profiles', requireAdmin, async (req, res) => {
  try { res.json(await db.all('SELECT * FROM pppoe_profiles ORDER BY created_at DESC')); } 
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/network/pppoe/profiles', requireAdmin, async (req, res) => {
  const { name, rate_limit_dl, rate_limit_ul } = req.body;
  try {
    await db.run('INSERT INTO pppoe_profiles (name, rate_limit_dl, rate_limit_ul) VALUES (?, ?, ?)', [name, rate_limit_dl, rate_limit_ul]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/network/pppoe/profiles/:id', requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM pppoe_profiles WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PPPoE Billing Profiles API
app.get('/api/network/pppoe/billing-profiles', requireAdmin, async (req, res) => {
  try { 
    const rows = await db.all(`
      SELECT bp.*, p.name as profile_name, p.rate_limit_dl, p.rate_limit_ul 
      FROM pppoe_billing_profiles bp
      JOIN pppoe_profiles p ON bp.profile_id = p.id
      ORDER BY bp.created_at DESC
    `);
    res.json(rows); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/network/pppoe/billing-profiles', requireAdmin, async (req, res) => {
  const { profile_id, name, price } = req.body;
  try {
    await db.run('INSERT INTO pppoe_billing_profiles (profile_id, name, price) VALUES (?, ?, ?)', [profile_id, name, price]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/network/pppoe/billing-profiles/:id', requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM pppoe_billing_profiles WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PPPoE Logs API
app.post('/api/network/pppoe/restart', requireAdmin, async (req, res) => {
  try {
    const config = await db.get('SELECT * FROM pppoe_server WHERE enabled = 1');
    if (!config) {
      return res.status(404).json({ error: 'No active PPPoE server config found to restart' });
    }
    await network.stopPPPoEServer(config.interface);
    await network.startPPPoEServer(config);
    res.json({ success: true, message: 'PPPoE Server restarted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/network/pppoe/logs', requireAdmin, async (req, res) => {
  try {
    // Priority log files
    const logFiles = [
      '/var/log/pppd.log', 
      '/var/log/pppoe-server.log',
      '/var/log/messages', 
      '/var/log/syslog'
    ];
    
    let allLogs = [];
    
    for (const file of logFiles) {
      if (fs.existsSync(file)) {
        try {
          const { stdout } = await execPromise(`tail -n 50 ${file}`).catch(() => ({ stdout: '' }));
          if (stdout) {
            const lines = stdout.split('\n')
              .filter(l => l.trim())
              .map(l => `[${path.basename(file)}] ${l}`);
            allLogs = [...allLogs, ...lines];
          }
        } catch (e) {}
      }
    }
    
    // Return the last 50 lines
    const result = allLogs.slice(-50);
    
    if (result.length === 0) {
      res.json(["No active PPPoE logs found. Wait for client connection..."]);
    } else {
      res.json(result);
    }
  } catch (err) {
    res.json(["Error reading logs: " + err.message]);
  }
});

app.put('/api/network/pppoe/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const updates = req.body;
    const result = await network.updatePPPoEUser(userId, updates);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/network/pppoe/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const result = await network.deletePPPoEUser(userId);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DEVICE MANAGEMENT API ENDPOINTS
app.get('/api/devices', requireAdmin, async (req, res) => {
  try {
    // Fetch allowed interfaces (hotspots and their bridge members)
    const hotspotRows = await db.all('SELECT interface FROM hotspots WHERE enabled = 1');
    const bridgeRows = await db.all('SELECT * FROM bridges');
    
    const allowedInterfaces = new Set();
    hotspotRows.forEach(h => allowedInterfaces.add(h.interface));
    
    bridgeRows.forEach(b => {
      if (allowedInterfaces.has(b.name)) {
        try {
          const members = JSON.parse(b.members);
          members.forEach(m => allowedInterfaces.add(m));
        } catch (e) {}
      }
    });

    // Get all devices with their current session information
    const devices = await db.all('SELECT * FROM wifi_devices ORDER BY connected_at DESC');
    
    // Get all active sessions
    const sessions = await db.all('SELECT mac, ip, remaining_seconds as remainingSeconds, total_paid as totalPaid, connected_at as connectedAt, is_paused as isPaused FROM sessions WHERE remaining_seconds > 0');
    
    // Create a map of sessions by MAC for quick lookup
    const sessionMap = new Map();
    sessions.forEach(session => {
      sessionMap.set(session.mac.toUpperCase(), session);
    });
    
    // Merge device data with session data
    const formattedDevices = devices
      .filter(device => allowedInterfaces.has(device.interface))
      .map(device => {
      const deviceMac = device.mac.toUpperCase();
      const session = sessionMap.get(deviceMac);
      
      return {
        id: device.id || '',
        mac: device.mac || 'Unknown',
        ip: device.ip || 'Unknown',
        hostname: device.hostname || 'Unknown',
        interface: device.interface || 'Unknown',
        ssid: device.ssid || 'Unknown',
        signal: device.signal || 0,
        connectedAt: session ? session.connectedAt : (device.connected_at || Date.now()),
        lastSeen: device.last_seen || Date.now(),
        isActive: Boolean(session), // Device is active if it has an active session
        customName: device.custom_name || '',
        sessionTime: session ? session.remainingSeconds : 0, // Real remaining time from session
        totalPaid: session ? session.totalPaid : 0,
        downloadLimit: device.download_limit || 0,
        uploadLimit: device.upload_limit || 0
      };
    });

    // Add devices that have active sessions but were not found in the scan/db
    sessions.forEach(session => {
      const sessionMac = session.mac.toUpperCase();
      if (!formattedDevices.find(d => d.mac.toUpperCase() === sessionMac)) {
        formattedDevices.push({
          id: `session_${sessionMac}`,
          mac: session.mac,
          ip: session.ip || 'Unknown',
          hostname: 'Unknown', // Could try to lookup in wifi_devices history if needed, but 'Unknown' is safe
          interface: 'Unknown',
          ssid: 'Unknown',
          signal: 0,
          connectedAt: session.connectedAt,
          lastSeen: Date.now(),
          isActive: true,
          customName: '',
          sessionTime: session.remainingSeconds,
          totalPaid: session.totalPaid
        });
      }
    });
    
    res.json(formattedDevices);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Firmware download endpoint (Binary)
app.get('/api/firmware/nodemcu/bin', requireAdmin, (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Explicitly target the binary file in the build directory
    const firmwarePath = path.join(__dirname, 'firmware', 'NodeMCU_ESP8266', 'build', 'esp8266.esp8266.huzzah', 'NodeMCU_ESP8266.ino.bin');
    
    if (!fs.existsSync(firmwarePath)) {
      console.error(`[Firmware] Binary not found at: ${firmwarePath}`);
      return res.status(404).json({ error: 'Firmware binary not found on server' });
    }
    
    // Set headers for binary file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="NodeMCU_ESP8266.bin"');
    
    const fileStream = fs.createReadStream(firmwarePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (err) => {
      console.error('Error streaming firmware file:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to download firmware' });
    });
    
  } catch (err) {
    console.error('Error downloading firmware:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/devices/scan', requireAdmin, async (req, res) => {
  try {
    const scannedDevices = await network.scanWifiDevices();
    const now = Date.now();
    
    // Get current active sessions to sync with
    const activeSessions = await db.all('SELECT mac, ip, remaining_seconds as remainingSeconds, total_paid as totalPaid, connected_at as connectedAt FROM sessions WHERE remaining_seconds > 0');
    const sessionMap = new Map();
    activeSessions.forEach(session => {
      sessionMap.set(session.mac.toUpperCase(), session);
    });
    
    // Update or insert scanned devices
    for (const device of scannedDevices) {
      const existingDevice = await db.get('SELECT * FROM wifi_devices WHERE mac = ?', [device.mac]);
      const session = sessionMap.get(device.mac.toUpperCase());
      
      if (existingDevice) {
        // Update existing device - preserve session data if device has active session
        await db.run(
          'UPDATE wifi_devices SET ip = ?, hostname = ?, interface = ?, ssid = ?, signal = ?, last_seen = ?, is_active = ? WHERE mac = ?',
          [device.ip, device.hostname, device.interface, device.ssid, device.signal, now, session ? 1 : 0, device.mac]
        );
      } else {
        // Insert new device - mark as active if it has a session
        const id = `device_${now}_${Math.random().toString(36).substr(2, 9)}`;
        await db.run(
          'INSERT INTO wifi_devices (id, mac, ip, hostname, interface, ssid, signal, connected_at, last_seen, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, device.mac, device.ip, device.hostname, device.interface, device.ssid, device.signal, session ? session.connectedAt : now, now, session ? 1 : 0]
        );
      }
    }
    
    // Mark devices that weren't found as inactive, but preserve session status for active sessions
    const scannedMacs = scannedDevices.map(d => d.mac);
    if (scannedMacs.length > 0) {
      const placeholders = scannedMacs.map(() => '?').join(',');
      // Only mark as inactive if device doesn't have an active session
      await db.run(`UPDATE wifi_devices SET is_active = 0 WHERE mac NOT IN (${placeholders}) AND mac NOT IN (SELECT mac FROM sessions WHERE remaining_seconds > 0)`, scannedMacs);
    }
    
    // Return updated device list with session data merged
    const devices = await db.all('SELECT * FROM wifi_devices ORDER BY connected_at DESC');
    
    // Merge with session data for accurate remaining time
    const formattedDevices = devices.map(device => {
      const deviceMac = device.mac.toUpperCase();
      const session = sessionMap.get(deviceMac);
      
      return {
        id: device.id || '',
        mac: device.mac || 'Unknown',
        ip: device.ip || 'Unknown',
        hostname: device.hostname || 'Unknown',
        interface: device.interface || 'Unknown',
        ssid: device.ssid || 'Unknown',
        signal: device.signal || 0,
        connectedAt: session ? session.connectedAt : (device.connected_at || Date.now()),
        lastSeen: device.last_seen || Date.now(),
        isActive: Boolean(session), // Device is active if it has an active session
        customName: device.custom_name || '',
        sessionTime: session ? session.remainingSeconds : 0, // Real remaining time from session
        totalPaid: session ? session.totalPaid : 0
      };
    });
    
    res.json(formattedDevices);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/devices/:id', requireAdmin, async (req, res) => {
  try {
    const device = await db.get('SELECT * FROM wifi_devices WHERE id = ?', [req.params.id]);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json(device);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/devices', requireAdmin, async (req, res) => {
  try {
    const { mac, ip, hostname, interface: iface, ssid, signal, customName } = req.body;
    const id = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    await db.run(
      'INSERT INTO wifi_devices (id, mac, ip, hostname, interface, ssid, signal, connected_at, last_seen, is_active, custom_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, mac.toUpperCase(), ip, hostname || '', iface, ssid || '', signal || 0, now, now, 1, customName || '']
    );
    
    const newDevice = await db.get('SELECT * FROM wifi_devices WHERE id = ?', [id]);
    res.json(newDevice);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/devices/:id', requireAdmin, async (req, res) => {
  try {
    const { customName, sessionTime, downloadLimit, uploadLimit } = req.body;
    const updates = [];
    const values = [];
    
    if (customName !== undefined) {
      updates.push('custom_name = ?');
      values.push(customName);
    }
    if (sessionTime !== undefined) {
      updates.push('session_time = ?');
      values.push(sessionTime);
    }
    if (downloadLimit !== undefined) {
      updates.push('download_limit = ?');
      values.push(downloadLimit);
    }
    if (uploadLimit !== undefined) {
      updates.push('upload_limit = ?');
      values.push(uploadLimit);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    values.push(req.params.id);
    await db.run(`UPDATE wifi_devices SET ${updates.join(', ')} WHERE id = ?`, values);
    
    const updatedDevice = await db.get('SELECT * FROM wifi_devices WHERE id = ?', [req.params.id]);
    
    // If session time is being set, also update the active session if device is connected
    if (sessionTime !== undefined && updatedDevice.ip && updatedDevice.mac) {
      const session = await db.get('SELECT * FROM sessions WHERE mac = ?', [updatedDevice.mac]);
      if (session) {
        // Update session with new time and ensure limits are synced
        const newSessionUpdates = ['remaining_seconds = ?'];
        const newSessionValues = [sessionTime];
        
        // Sync device limits to session
        if (downloadLimit !== undefined || updatedDevice.download_limit) {
          newSessionUpdates.push('download_limit = ?');
          newSessionValues.push(downloadLimit !== undefined ? downloadLimit : updatedDevice.download_limit);
        }
        if (uploadLimit !== undefined || updatedDevice.upload_limit) {
          newSessionUpdates.push('upload_limit = ?');
          newSessionValues.push(uploadLimit !== undefined ? uploadLimit : updatedDevice.upload_limit);
        }
        
        newSessionValues.push(updatedDevice.mac);
        await db.run(`UPDATE sessions SET ${newSessionUpdates.join(', ')} WHERE mac = ?`, newSessionValues);
        
        console.log(`[ADMIN] Updated session for ${updatedDevice.mac}: time=${sessionTime}s, DL=${downloadLimit || updatedDevice.download_limit}, UL=${uploadLimit || updatedDevice.upload_limit}`);
      }
    }
    
    // Always reapply QoS limits if device is connected (whether time, download, or upload changed)
    if (updatedDevice.ip && updatedDevice.mac && (sessionTime !== undefined || downloadLimit !== undefined || uploadLimit !== undefined)) {
      await network.whitelistMAC(updatedDevice.mac, updatedDevice.ip);
    }

    res.json(updatedDevice);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/devices/:id', requireAdmin, async (req, res) => {
  try {
    const result = await db.run('DELETE FROM wifi_devices WHERE id = ?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Device not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/devices/:id/connect', requireAdmin, async (req, res) => {
  try {
    const device = await db.get('SELECT * FROM wifi_devices WHERE id = ?', [req.params.id]);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    
    // Whitelist the device MAC and IP (real network operation)
    await network.whitelistMAC(device.mac, device.ip);
    
    // Update device status
    await db.run('UPDATE wifi_devices SET is_active = 1, last_seen = ? WHERE id = ?', [Date.now(), req.params.id]);
    
    // Create or update session - use device session_time if set, otherwise default
    const existingSession = await db.get('SELECT * FROM sessions WHERE mac = ?', [device.mac]);
    const sessionTime = device.session_time || 3600; // Default 1 hour
    
    if (existingSession) {
      // Update existing session
      await db.run(
        'UPDATE sessions SET remaining_seconds = remaining_seconds + ?, ip = ? WHERE mac = ?',
        [sessionTime, device.ip, device.mac]
      );
    } else {
      // Create new session
      await db.run(
        'INSERT INTO sessions (mac, ip, remaining_seconds, total_paid, connected_at) VALUES (?, ?, ?, ?, ?)',
        [device.mac, device.ip, sessionTime, 0, Date.now()]
      );
    }
    
    res.json({ success: true, sessionTime });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/devices/:id/disconnect', requireAdmin, async (req, res) => {
  try {
    const device = await db.get('SELECT * FROM wifi_devices WHERE id = ?', [req.params.id]);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    
    // Block the device MAC and IP (real network operation)
    await network.blockMAC(device.mac, device.ip);
    
    // Update device status
    await db.run('UPDATE wifi_devices SET is_active = 0 WHERE id = ?', [req.params.id]);
    
    // Remove session if it exists
    const existingSession = await db.get('SELECT * FROM sessions WHERE mac = ?', [device.mac]);
    if (existingSession) {
      await db.run('DELETE FROM sessions WHERE mac = ?', [device.mac]);
    }
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/devices/:id/sessions', requireAdmin, async (req, res) => {
  try {
    const device = await db.get('SELECT mac FROM wifi_devices WHERE id = ?', [req.params.id]);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    
    const sessions = await db.all('SELECT * FROM device_sessions WHERE device_id = ? ORDER BY start_time DESC', [req.params.id]);
    res.json(sessions);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/devices/:id/refresh', requireAdmin, async (req, res) => {
  try {
    const device = await db.get('SELECT * FROM wifi_devices WHERE id = ?', [req.params.id]);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    
    // Try to get updated IP and hostname
    let newIp = device.ip;
    let newHostname = device.hostname;
    
    // Get updated IP from ARP table
    try {
      const arpCommands = [
        `ip neigh show | grep -i ${device.mac}`,
        `arp -n | grep -i ${device.mac}`,
        `cat /proc/net/arp | grep -i ${device.mac}`
      ];
      
      for (const cmd of arpCommands) {
        try {
          const { stdout: arpOutput } = await execPromise(cmd).catch(() => ({ stdout: '' }));
          const arpMatch = arpOutput.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (arpMatch && arpMatch[1]) {
            newIp = arpMatch[1];
            break;
          }
        } catch (e) {}
      }
    } catch (e) {}
    
    // Get updated hostname from DHCP leases
    try {
      const leaseFiles = ['/tmp/dhcp.leases', '/var/lib/dnsmasq/dnsmasq.leases', '/var/lib/dhcp/dhcpd.leases'];
      for (const leaseFile of leaseFiles) {
        if (fs.existsSync(leaseFile)) {
          const leaseContent = fs.readFileSync(leaseFile, 'utf8');
          const lines = leaseContent.split('\n');
          for (const line of lines) {
            if (line.toLowerCase().includes(device.mac.toLowerCase())) {
              const parts = line.split(/\s+/);
              if (parts.length >= 4) {
                newHostname = parts[3] || device.hostname;
                break;
              }
            }
          }
          if (newHostname !== device.hostname) break;
        }
      }
    } catch (e) {}

    if (newIp !== device.ip || newHostname !== device.hostname) {
      await db.run('UPDATE wifi_devices SET ip = ?, hostname = ?, last_seen = ? WHERE id = ?', 
        [newIp, newHostname, Date.now(), req.params.id]);
    }
    
    // Get current session data for this device
    const session = await db.get('SELECT mac, ip, remaining_seconds as remainingSeconds, total_paid as totalPaid, connected_at as connectedAt FROM sessions WHERE mac = ?', [device.mac]);
    
    // Return updated device with session data
    const updatedDevice = await db.get('SELECT * FROM wifi_devices WHERE id = ?', [req.params.id]);
    const deviceWithSession = {
      ...updatedDevice,
      id: updatedDevice.id || '',
      mac: updatedDevice.mac || 'Unknown',
      ip: updatedDevice.ip || 'Unknown',
      hostname: updatedDevice.hostname || 'Unknown',
      interface: updatedDevice.interface || 'Unknown',
      ssid: updatedDevice.ssid || 'Unknown',
      signal: updatedDevice.signal || 0,
      connectedAt: session ? session.connectedAt : (updatedDevice.connected_at || Date.now()),
      lastSeen: updatedDevice.last_seen || Date.now(),
      isActive: Boolean(session),
      customName: updatedDevice.custom_name || '',
      sessionTime: session ? session.remainingSeconds : 0,
      totalPaid: session ? session.totalPaid : 0
    };
    
    res.json(deviceWithSession);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// System Management APIs
app.post('/api/system/restart', requireAdmin, async (req, res) => {
  try {
    const { type } = req.body || {};
    console.log(`[System] Restart requested (Type: ${type || 'soft'})`);
    
    await execPromise('sync');

    if (type === 'hard') {
        res.json({ success: true, message: 'System rebooting (Hard Restart)...' });
        setTimeout(() => {
            exec('sudo reboot').unref();
        }, 1000);
    } else {
        res.json({ success: true, message: 'Application restarting (Soft Restart)...' });
        setTimeout(async () => {
             try {
                 await execPromise('pm2 restart all');
             } catch (e) {
                 console.log('PM2 restart failed, falling back to process.exit', e.message);
                 process.exit(0);
             }
        }, 1000);
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/system/clear-logs', requireAdmin, async (req, res) => {
  try {
    console.log('[System] Clearing logs...');
    await execPromise('truncate -s 0 /var/log/syslog').catch(() => {});
    await execPromise('truncate -s 0 /var/log/messages').catch(() => {});
    res.json({ success: true, message: 'Logs cleared' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/system/export-db', requireAdmin, (req, res) => {
  const dbPath = path.resolve(__dirname, 'pisowifi.sqlite');
  if (fs.existsSync(dbPath)) {
      res.download(dbPath, 'pisowifi_backup.sqlite');
  } else {
      res.status(404).json({ error: 'Database file not found' });
  }
});

app.get('/api/system/kernel-check', requireAdmin, async (req, res) => {
  try {
    const { stdout } = await execPromise('uname -r');
    res.json({ success: true, kernel: stdout.trim() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/system/sync', requireAdmin, async (req, res) => {
  try {
    console.log('[System] Syncing filesystem...');
    
    // SYNC WLAN0 CONFIG BACK TO DB (As requested by user)
    // This ensures manual file edits are saved to SQLite
    const wlanConfigPath = '/etc/hostapd/hostapd_wlan0.conf';
    if (fs.existsSync(wlanConfigPath)) {
        try {
            const content = fs.readFileSync(wlanConfigPath, 'utf8');
            const ssidMatch = content.match(/^ssid=(.+)$/m);
            const passMatch = content.match(/^wpa_passphrase=(.+)$/m);
            
            if (ssidMatch) {
                const ssid = ssidMatch[1].trim();
                const pass = passMatch ? passMatch[1].trim() : '';
                
                const bridgeMatch = content.match(/^bridge=(.+)$/m);
                const bridge = bridgeMatch ? bridgeMatch[1].trim() : 'br0';
                
                console.log(`[System] Syncing wlan0 config to DB: SSID=${ssid}`);
                await db.run('INSERT OR REPLACE INTO wireless_settings (interface, ssid, password, bridge) VALUES (?, ?, ?, ?)', 
                  ['wlan0', ssid, pass, bridge]);
            }
        } catch (e) {
            console.error('[System] Failed to sync wlan0 config:', e.message);
        }
    }

    await execPromise('sync');
    res.json({ success: true, message: 'Filesystem and Settings synced' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/system/logs', requireAdmin, async (req, res) => {
  try {
    const { stdout } = await execPromise('tail -n 100 /var/log/syslog || tail -n 100 /var/log/messages').catch(() => ({ stdout: 'No logs available' }));
    res.json({ logs: stdout || 'No logs found' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Multi-WAN Configuration API
app.get('/api/multiwan/config', requireAdmin, async (req, res) => {
  try {
    const config = await db.get('SELECT * FROM multi_wan_config WHERE id = 1');
    if (config) {
      config.interfaces = JSON.parse(config.interfaces || '[]');
      config.enabled = !!config.enabled;
    }
    res.json({ success: true, config });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/multiwan/config', requireAdmin, async (req, res) => {
  try {
    const { enabled, mode, pcc_method, interfaces } = req.body;
    await db.run(
      'UPDATE multi_wan_config SET enabled = ?, mode = ?, pcc_method = ?, interfaces = ? WHERE id = 1',
      [enabled ? 1 : 0, mode, pcc_method, JSON.stringify(interfaces)]
    );
    
    // Apply changes
    await applyMultiWanConfig({ enabled, mode, pcc_method, interfaces });
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function applyMultiWanConfig(config) {
    try {
        console.log('[MultiWAN] Applying configuration...', config.mode);
        
        const run = async (cmd) => {
            try { await execPromise(cmd); } catch (e) { /* ignore */ }
        };

        // 1. Cleanup existing rules
        await run('iptables -t mangle -F AJC_MULTIWAN');
        await run('iptables -t mangle -D PREROUTING -j AJC_MULTIWAN');
        
        // If disabled, stop here
        if (!config.enabled || !config.interfaces || config.interfaces.length < 2) {
             return;
        }

        // 2. Initialize Chain
        await run('iptables -t mangle -N AJC_MULTIWAN');
        await run('iptables -t mangle -I PREROUTING -j AJC_MULTIWAN');

        const ifaces = config.interfaces;
        
        if (config.mode === 'pcc') {
            // Restore Connmark
            await run('iptables -t mangle -A AJC_MULTIWAN -j CONNMARK --restore-mark');
            await run('iptables -t mangle -A AJC_MULTIWAN -m mark ! --mark 0 -j RETURN');
            
            ifaces.forEach(async (iface, idx) => {
                 const mark = idx + 1;
                 const every = ifaces.length;
                 const packet = idx;
                 
                 // Apply Mark using Nth statistic (Simulating Load Balancing)
                 // This covers "Both Addresses" intent by balancing connections
                 const currentEvery = every - idx;
                 
                 // Note: In a real environment, we would use HMARK for true src/dst hashing if available
                 // For now, we use statistic nth which is robust and available
                 await run(`iptables -t mangle -A AJC_MULTIWAN -m statistic --mode nth --every ${currentEvery} --packet 0 -j MARK --set-mark ${mark}`);
                 await run(`iptables -t mangle -A AJC_MULTIWAN -m mark --mark ${mark} -j CONNMARK --save-mark`);
                 
                 // Routing Rules
                 const tableId = 100 + mark;
                 // Clean up old rules for this table/mark to avoid dups
                 while (true) {
                    try { await execPromise(`ip rule del fwmark ${mark} table ${tableId}`); } catch(e) { break; }
                 }
                 await run(`ip rule add fwmark ${mark} table ${tableId}`);
                 await run(`ip route add default via ${iface.gateway} dev ${iface.interface} table ${tableId}`);
            });
            
        } else {
            // ECMP Logic
            let routeCmd = 'ip route replace default scope global';
            ifaces.forEach(iface => {
                routeCmd += ` nexthop via ${iface.gateway} dev ${iface.interface} weight ${iface.weight}`;
            });
            await run(routeCmd);
        }
        
        await run('ip route flush cache');
        
    } catch (e) {
        console.error('[MultiWAN] Apply failed:', e.message);
    }
}



app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/dist')) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Background Timer has been moved inside server.listen to ensure DB initialization

// TC cleanup moved inside server.listen

async function bootupRestore(isRestricted = false) {
  console.log(`[AJC] Starting System Restoration (Mode: ${isRestricted ? 'RESTRICTED' : 'NORMAL'})...`);
  
  // Auto-Provision Interfaces & Bridge if needed
  await network.autoProvisionNetwork();

  await network.initFirewall();
  
  // 0. Restore VLANs
  try {
    // Skip VLAN restoration on Windows (no ip command available)
    if (process.platform === 'win32') {
      console.log('[AJC] Skipping VLAN restoration on Windows platform');
    } else {
      const vlans = await db.all('SELECT * FROM vlans');
      
      if (vlans.length > 0) {
        console.log(`[AJC] Restoring ${vlans.length} VLANs...`);
        
        for (const v of vlans) {
          // Check if parent interface exists before creating VLAN
          try {
            await execPromise(`ip link show ${v.parent}`);
            console.log(`[AJC] Restoring VLAN ${v.name} (${v.parent}.${v.id})`);
            await network.createVlan(v);
          } catch (checkError) {
            if (checkError.message.includes('does not exist')) {
              console.warn(`[AJC] Skipping VLAN ${v.name} - parent interface ${v.parent} does not exist`);
            } else {
              console.error(`[AJC] VLAN Restore Failed for ${v.name}: ${checkError.message}`);
            }
          }
        }
      } else {
        console.log('[AJC] No VLANs to restore');
      }
    }
  } catch (e) { console.error('[AJC] Failed to load VLANs from DB', e); }

  // 1. Restore Bridges
  try {
    const bridges = await db.all('SELECT * FROM bridges');
    for (const b of bridges) {
      console.log(`[AJC] Restoring Bridge ${b.name}...`);
      await network.createBridge({
        name: b.name,
        members: JSON.parse(b.members),
        stp: Boolean(b.stp)
      }).catch(e => console.error(`[AJC] Bridge Restore Failed: ${e.message}`));
    }
  } catch (e) { console.error('[AJC] Failed to load bridges from DB', e); }

  // 2. Restore Hotspots (DNS/DHCP)
  try {
    const hotspots = await db.all('SELECT * FROM hotspots WHERE enabled = 1');
    const processedInterfaces = new Set();
    
    for (const h of hotspots) {
      // Resolve actual target interface (in case of bridge)
      // We can't easily know the master here without shelling out, 
      // but network.setupHotspot handles redirection.
      // However, we can track the INPUT interface to avoid blatant duplicates in DB
      if (processedInterfaces.has(h.interface)) {
        console.log(`[AJC] Skipping duplicate hotspot config for ${h.interface}`);
        continue;
      }
      processedInterfaces.add(h.interface);

      console.log(`[AJC] Restoring Hotspot on ${h.interface}...`);
      await network.setupHotspot(h, true).catch(e => console.error(`[AJC] Hotspot Restore Failed: ${e.message}`));
    }
    
    // Final dnsmasq restart after all hotspot configs are restored
    if (hotspots.length > 0) {
      console.log('[AJC] Finalizing DNS/DHCP configuration...');
      await network.restartDnsmasq().catch(e => console.error(`[AJC] Global dnsmasq restart failed: ${e.message}`));
    }
  } catch (e) { console.error('[AJC] Failed to load hotspots from DB'); }

  // 3. Restore Wireless APs
  try {
    const wireless = await db.all('SELECT * FROM wireless_settings');
    for (const w of wireless) {
      console.log(`[AJC] Restoring Wi-Fi AP on ${w.interface}...`);
      await network.configureWifiAP(w).catch(e => console.error(`[AJC] AP Restore Failed: ${e.message}`));
    }
  } catch (e) { console.error('[AJC] Failed to load wireless settings from DB'); }

  // 3.1 Restore Multi-WAN
  try {
    const mwConfig = await db.get('SELECT * FROM multi_wan_config WHERE id = 1');
    if (mwConfig && mwConfig.enabled) {
      mwConfig.interfaces = JSON.parse(mwConfig.interfaces || '[]');
      mwConfig.enabled = !!mwConfig.enabled;
      console.log('[AJC] Restoring Multi-WAN Configuration...');
      await applyMultiWanConfig(mwConfig);
    }
  } catch (e) { console.error('[AJC] Multi-WAN Restore Failed:', e.message); }

  // 4. Restore GPIO & Hardware
  const board = await db.get('SELECT value FROM config WHERE key = ?', ['boardType']);
  const pin = await db.get('SELECT value FROM config WHERE key = ?', ['coinPin']);
  const model = await db.get('SELECT value FROM config WHERE key = ?', ['boardModel']);
  const espIpAddress = await db.get('SELECT value FROM config WHERE key = ?', ['espIpAddress']);
  const espPort = await db.get('SELECT value FROM config WHERE key = ?', ['espPort']);
  const coinSlots = await db.get('SELECT value FROM config WHERE key = ?', ['coinSlots']);
  const nodemcuDevices = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
  
  const coinCallback = (pesos) => {
    console.log(`[MAIN GPIO] Pulse Detected | Amount: ₱${pesos}`);
    io.emit('coin-pulse', { pesos });
    // Also emit multi-slot event for tracking
    io.emit('multi-coin-pulse', { denomination: pesos, slot_id: null });
  };
  
  initGPIO(
    coinCallback, 
    board?.value || 'none', 
    parseInt(pin?.value || '2'), 
    model?.value,
    null,
    espIpAddress?.value,
    parseInt(espPort?.value || '80'),
    coinSlots?.value ? JSON.parse(coinSlots.value) : [],
    nodemcuDevices?.value ? JSON.parse(nodemcuDevices.value) : []
  );
  
  // Register callbacks for individual slots (if multi-slot)
  if (board?.value === 'nodemcu_esp' && coinSlots?.value) {
    const slots = JSON.parse(coinSlots.value);
    slots.forEach(slot => {
      if (slot.enabled) {
        registerSlotCallback(slot.id, (denomination) => {
          io.emit('multi-coin-pulse', { 
            denomination, 
            slot_id: slot.id,
            slot_name: slot.name || `Slot ${slot.id}`
          });
        });
      }
    });
  }
  
  // 5. Restore Active Sessions
  // Initialize QoS on LAN interface before restoring sessions
  const lan = await network.getLanInterface();
  const qosDiscipline = await db.get("SELECT value FROM config WHERE key = 'qos_discipline'");
  if (lan) {
    await network.initQoS(lan, qosDiscipline?.value || 'cake');
  }

  // NodeMCU Exemption: Get NodeMCU MACs to ensure they are whitelisted even if revoked
  let nodemcuMacs = [];
  try {
    const nodemcuResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    if (nodemcuResult?.value) {
      const devices = JSON.parse(nodemcuResult.value);
      nodemcuMacs = devices.map(d => d.macAddress.toUpperCase());
    }
  } catch (e) {
    console.warn('[AJC] Failed to load NodeMCU devices for whitelisting:', e.message);
  }

  const sessions = await db.all('SELECT mac, ip FROM sessions WHERE remaining_seconds > 0 ORDER BY connected_at DESC');
  
  // NodeMCU Exemption: Whitelist all NodeMCU devices regardless of sessions
  try {
    const nodemcuResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    if (nodemcuResult?.value) {
      const devices = JSON.parse(nodemcuResult.value);
      for (const d of devices) {
        if (d.macAddress && d.ipAddress && d.ipAddress !== 'unknown') {
          console.log(`[AJC] Whitelisting NodeMCU infrastructure: ${d.name} (${d.macAddress} @ ${d.ipAddress})`);
          await network.whitelistMAC(d.macAddress, d.ipAddress);
        }
      }
    }
  } catch (e) {
    console.warn('[AJC] Failed to whitelist NodeMCU devices:', e.message);
  }

  if (isRestricted) {
    console.log('[AJC] System is REVOKED. Limiting client sessions to 1.');
    let clientWhitelistedCount = 0;
    
    for (const s of sessions) {
      const mac = s.mac.toUpperCase();
      const isNodeMCU = nodemcuMacs.includes(mac);
      
      // NodeMCUs are already whitelisted above, but we skip them here for the 1-client limit
      if (isNodeMCU) {
        await network.whitelistMAC(s.mac, s.ip);
        continue;
      }

      if (clientWhitelistedCount < 1) {
        console.log(`[AJC] Whitelisting primary client: ${mac}`);
        await network.whitelistMAC(s.mac, s.ip);
        clientWhitelistedCount++;
      } else {
        console.log(`[AJC] Blocking secondary client due to revocation: ${mac}`);
        await network.blockMAC(s.mac, s.ip);
      }
    }
  } else {
    for (const s of sessions) await network.whitelistMAC(s.mac, s.ip);
  }
  
  console.log('[AJC] System Restoration Complete.');
}

server.listen(80, '0.0.0.0', async () => {
  console.log('[AJC] System Engine Online @ Port 80');
  try {
    await db.init();
  } catch (e) {
    console.error('[AJC] Critical DB Init Error:', e);
  }
  
  // License Gatekeeper - Check if system can operate
  console.log('[License] Checking license and trial status...');
  try {
    if (!systemHardwareId) {
      systemHardwareId = await getUniqueHardwareId();
    }

    const verification = await licenseManager.verifyLicense();
    const trialStatus = await checkTrialStatus(systemHardwareId, verification);
    
    const isLicensed = verification.isValid && verification.isActivated;
    const isRevoked = verification.isRevoked || trialStatus.isRevoked;
    const canOperate = (isLicensed || trialStatus.isTrialActive) && !isRevoked;

    console.log(`[License] Hardware ID: ${systemHardwareId}`);
    console.log(`[License] Licensed: ${isLicensed ? 'YES' : 'NO'}`);
    console.log(`[License] Trial Active: ${trialStatus.isTrialActive ? 'YES' : 'NO'}`);
    console.log(`[License] Revoked: ${isRevoked ? 'YES' : 'NO'}`);
    
    if (isRevoked) {
      console.warn('[License] System in restricted mode (Revoked)');
    } else if (!canOperate) {
      console.warn('[License] System in restricted mode (Expired)');
    } else {
      console.log('[License] ✓ License verification passed - Starting services...');
    }
  } catch (error) {
    console.error('[License] Error during license check:', error);
    console.warn('[License] Proceeding with caution...');
  }
  
  // Display cloud sync status
  const syncStats = getSyncStats();
  console.log('[EdgeSync] Configuration:', syncStats.configured ? '✓ Connected' : '✗ Not configured');
  if (syncStats.configured) {
    console.log(`[EdgeSync] Machine ID: ${syncStats.machineId}`);
    console.log(`[EdgeSync] Vendor ID: ${syncStats.vendorId}`);
    console.log(`[EdgeSync] Status sync: ${syncStats.statusSyncActive ? 'Active (60s interval)' : 'Inactive'}`);
    if (syncStats.queuedSyncs > 0) {
      console.log(`[EdgeSync] Queued syncs: ${syncStats.queuedSyncs} (will retry)`);
    }
  } else {
    console.warn('[EdgeSync] Cloud sync disabled - MACHINE_ID or VENDOR_ID not set in .env');
  }

  // Start Background Timers only after DB is initialized
  setInterval(async () => {
    try {
      // Clean up sessions with no remaining time
      const expired = await db.all('SELECT mac, ip FROM sessions WHERE remaining_seconds <= 0');
      for (const s of expired) {
        await network.blockMAC(s.mac, s.ip);
        await db.run('DELETE FROM sessions WHERE mac = ?', [s.mac]);
      }
      
      // Clean up sessions with expired tokens (3-day expiration)
      const expiredTokens = await db.all('SELECT mac, ip FROM sessions WHERE token_expires_at IS NOT NULL AND token_expires_at < datetime("now")');
      for (const s of expiredTokens) {
        console.log(`[AUTH] Removing session with expired token: ${s.mac}`);
        await network.blockMAC(s.mac, s.ip);
        await db.run('DELETE FROM sessions WHERE mac = ?', [s.mac]);
      }
      
      // Decrement remaining seconds for active sessions
      await db.run('UPDATE sessions SET remaining_seconds = remaining_seconds - 1 WHERE remaining_seconds > 0 AND (is_paused = 0 OR is_paused IS NULL)');
    } catch (e) { console.error(e); }
  }, 1000);

  setInterval(async () => {
    try {
      const inactiveSessions = await db.all('SELECT mac, ip FROM sessions WHERE remaining_seconds <= 0');
      for (const session of inactiveSessions) {
        await network.removeSpeedLimit(session.mac, session.ip);
      }
      const activeSessions = await db.all('SELECT ip FROM sessions WHERE remaining_seconds > 0');
      const activeIPs = new Set(activeSessions.map(s => s.ip));
      const { stdout: interfacesOutput } = await execPromise(`ip link show | grep -E "eth|wlan|br|vlan" | awk '{print $2}' | sed 's/:$//'`).catch(() => ({ stdout: '' }));
      const interfaces = interfacesOutput.trim().split('\n').filter(i => i);
      for (const iface of interfaces) {
        try {
          const { stdout: downloadFilters } = await execPromise(`tc filter show dev ${iface} parent 1:0 2>/dev/null || echo ""`).catch(() => ({ stdout: '' }));
          const downloadIPs = downloadFilters.match(/\d+\.\d+\.\d+\.\d+/g) || [];
          for (const ip of downloadIPs) {
            if (!activeIPs.has(ip)) {
              await execPromise(`tc filter del dev ${iface} parent 1:0 protocol ip prio 1 u32 match ip dst ${ip} 2>/dev/null || true`).catch(() => {});
            }
          }
          const { stdout: uploadFilters } = await execPromise(`tc filter show dev ${iface} parent ffff: 2>/dev/null || echo ""`).catch(() => ({ stdout: '' }));
          const uploadIPs = uploadFilters.match(/\d+\.\d+\.\d+\.\d+/g) || [];
          for (const ip of uploadIPs) {
            if (!activeIPs.has(ip)) {
              await execPromise(`tc filter del dev ${iface} parent ffff: protocol ip prio 1 u32 match ip src ${ip} 2>/dev/null || true`).catch(() => {});
            }
          }
        } catch (e) {}
      }
    } catch (e) { console.error('[CLEANUP] Periodic TC cleanup error:', e.message); }
  }, 30000);
  
  // Always call bootupRestore but pass revocation status if needed
  // We can fetch it inside bootupRestore or pass it
  const verificationStatus = await licenseManager.verifyLicense();
  const trialStatusInfo = await checkTrialStatus(systemHardwareId, verificationStatus);
  const isLicensedNow = verificationStatus.isValid && verificationStatus.isActivated;
  const isRevokedNow = verificationStatus.isRevoked || trialStatusInfo.isRevoked;
  const canOperateNow = (isLicensedNow || trialStatusInfo.isTrialActive) && !isRevokedNow;
  await bootupRestore(!canOperateNow);
});
