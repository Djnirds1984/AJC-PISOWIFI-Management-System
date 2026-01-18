const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const db = require('./lib/db');
const { initGPIO, updateGPIO } = require('./lib/gpio');
const network = require('./lib/network');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// 1. Static file serving (Dist contains bundle.js)
const distPath = path.join(__dirname, 'dist');
if (!fs.existsSync(distPath)) fs.mkdirSync(distPath, { recursive: true });
app.use('/dist', express.static(distPath));
app.use(express.static(__dirname));

// 2. Enhanced Captive Portal Detection Middleware
app.use((req, res, next) => {
  const host = req.headers.host || '';
  const url = req.url.toLowerCase();
  
  // Detection probes for Android, iOS, Windows, and macOS
  const portalProbes = [
    '/generate_204',               // Android / Chrome
    '/hotspot-detect.html',        // iOS / macOS
    '/ncsi.txt',                   // Windows
    '/connecttest.txt',            // Windows
    '/success.txt',                // Firefox
    '/kindle-wifi/wifiredirect.html' // Kindle
  ];

  const isProbe = portalProbes.some(p => url.includes(p));
  
  // If it's a probe OR a non-static/non-api request to a foreign domain
  if (isProbe || (host && !host.includes('localhost') && !host.match(/^\d+\.\d+\.\d+\.\d+$/) && !url.startsWith('/api') && !url.startsWith('/dist'))) {
    // Redirect to the root of the server
    // We use a 302 redirect which is the standard for triggering captive portals
    return res.redirect(302, `http://${req.headers.host}/`);
  }
  next();
});

// SESSIONS API
app.get('/api/sessions', async (req, res) => {
  try {
    const rows = await db.all('SELECT mac, ip, remaining_seconds as remainingSeconds, total_paid as totalPaid, connected_at as connectedAt FROM sessions');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions/start', async (req, res) => {
  const { mac, ip, minutes, pesos } = req.body;
  if (!mac) return res.status(400).json({ error: 'MAC address required' });
  
  try {
    const seconds = minutes * 60;
    // Insert or update session
    await db.run(
      'INSERT INTO sessions (mac, ip, remaining_seconds, total_paid) VALUES (?, ?, ?, ?) ON CONFLICT(mac) DO UPDATE SET remaining_seconds = remaining_seconds + ?, total_paid = total_paid + ?',
      [mac, ip, seconds, pesos, seconds, pesos]
    );
    
    // Apply network whitelist
    await network.whitelistMAC(mac);
    
    res.json({ success: true, message: 'Session started and whitelisted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SYSTEM API
app.post('/api/system/reset', async (req, res) => {
  try {
    await network.cleanupAllNetworkSettings();
    await db.factoryResetDB();
    res.json({ success: true, message: 'System restored to factory defaults.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WIRELESS API
app.get('/api/network/wireless', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM wireless_settings');
    res.json(Array.isArray(rows) ? rows : []);
  } catch (err) { res.json([]); }
});

app.post('/api/network/wireless', async (req, res) => {
  try {
    const config = req.body;
    await db.run(
      'INSERT OR REPLACE INTO wireless_settings (interface, ssid, password, channel, hw_mode, bridge) VALUES (?, ?, ?, ?, ?, ?)',
      [config.interface, config.ssid, config.password, config.channel || 1, config.hw_mode || 'g', config.bridge]
    );
    await network.configureWifiAP(config);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// HOTSPOT API
app.get('/api/hotspots', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM hotspots');
    res.json(Array.isArray(rows) ? rows : []);
  } catch (err) { res.json([]); }
});

app.post('/api/hotspots', async (req, res) => {
  try {
    const config = req.body;
    await db.run(
      'INSERT OR REPLACE INTO hotspots (interface, ip_address, dhcp_range, bandwidth_limit, enabled) VALUES (?, ?, ?, ?, ?)',
      [config.interface, config.ip_address, config.dhcp_range, config.bandwidth_limit || 0, 1]
    );
    await network.setupHotspot(config);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/hotspots/:interface', async (req, res) => {
  try {
    await network.removeHotspot(req.params.interface);
    await db.run('DELETE FROM hotspots WHERE interface = ?', [req.params.interface]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// RATES API
app.get('/api/rates', async (req, res) => {
  try { 
    const rates = await db.all('SELECT * FROM rates'); 
    res.json(Array.isArray(rates) ? rates : []); 
  } catch (err) { res.json([]); }
});

app.post('/api/rates', async (req, res) => {
  try { await db.run('INSERT INTO rates (pesos, minutes) VALUES (?, ?)', [req.body.pesos, req.body.minutes]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/rates/:id', async (req, res) => {
  try { await db.run('DELETE FROM rates WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// CONFIG API
app.get('/api/config', async (req, res) => {
  try {
    const boardType = await db.get('SELECT value FROM config WHERE key = ?', ['boardType']);
    const coinPin = await db.get('SELECT value FROM config WHERE key = ?', ['coinPin']);
    res.json({ boardType: boardType?.value || 'none', coinPin: parseInt(coinPin?.value || '2') });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/config', async (req, res) => {
  try {
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['boardType', req.body.boardType]);
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['coinPin', req.body.coinPin]);
    updateGPIO(req.body.boardType, req.body.coinPin);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/interfaces', async (req, res) => {
  try { res.json(await network.getInterfaces()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/network/vlan', async (req, res) => {
  try { await network.createVlan(req.body.parent, req.body.id, req.body.name); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/network/bridge', async (req, res) => {
  try { 
    const output = await network.createBridge(req.body.name, req.body.members, req.body.stp);
    res.json({ success: true, output }); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/dist')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => console.log('Client connected:', socket.id));

// Background Session Manager
setInterval(async () => {
  try {
    const active = await db.all('SELECT mac FROM sessions WHERE remaining_seconds > 0');
    if (active.length > 0) {
      await db.run('UPDATE sessions SET remaining_seconds = remaining_seconds - 1 WHERE remaining_seconds > 0');
      // Find sessions that just expired
      const expired = await db.all('SELECT mac FROM sessions WHERE remaining_seconds <= 0');
      for (const s of expired) {
        await network.blockMAC(s.mac);
        await db.run('DELETE FROM sessions WHERE mac = ?', [s.mac]);
      }
    }
  } catch (e) {
    console.error('[AJC] Session Timer Error:', e.message);
  }
}, 1000);

// REBOOT PERSISTENCE: Restore all saved settings from DB
async function bootupRestore() {
  console.log('[AJC] RESTORATION ENGINE: Starting Persistence Recovery...');
  try {
    // 1. Restore GPIO
    const board = await db.get('SELECT value FROM config WHERE key = ?', ['boardType']);
    const pin = await db.get('SELECT value FROM config WHERE key = ?', ['coinPin']);
    initGPIO((pesos) => io.emit('coin-pulse', { pesos }), board?.value || 'none', parseInt(pin?.value || '2'));

    // 2. Restore Wireless APs
    const wireless = await db.all('SELECT * FROM wireless_settings');
    for (const ap of wireless) {
      console.log(`[AJC] Auto-Restoring Wireless AP: ${ap.ssid} on ${ap.interface}`);
      await network.configureWifiAP(ap).catch(e => console.error(`[AJC] AP Restore Failed:`, e.message));
    }

    // 3. Restore Hotspot/Captive Portal Segments
    const hotspots = await db.all('SELECT * FROM hotspots');
    for (const hs of hotspots) {
      console.log(`[AJC] Auto-Restoring Portal Segment: ${hs.interface} @ ${hs.ip_address}`);
      await network.setupHotspot(hs).catch(e => console.error(`[AJC] Hotspot Restore Failed:`, e.message));
    }

    // 4. Restore Active Sessions Whitelisting
    const sessions = await db.all('SELECT mac FROM sessions WHERE remaining_seconds > 0');
    for (const s of sessions) {
      console.log(`[AJC] Auto-Restoring Whitelist for: ${s.mac}`);
      await network.whitelistMAC(s.mac);
    }
    
    console.log('[AJC] RESTORATION ENGINE: Complete.');
  } catch (e) {
    console.error('[AJC] FATAL: Restoration Engine Crashed:', e.message);
  }
}

// STARTUP WRAPPER FOR PORT 80
const startServer = (port) => {
  server.listen(port, '0.0.0.0')
    .on('listening', async () => {
      console.log(`[AJC] SUCCESS: Portal running on http://0.0.0.0:${port}`);
      await bootupRestore();
    })
    .on('error', (err) => {
      if (err.code === 'EACCES') {
        console.error(`[AJC] ERROR: Permission denied for Port ${port}.`);
        console.error(`[AJC] FIX: Run with 'sudo' or use: sudo setcap 'cap_net_bind_service=+ep' $(which node)`);
        process.exit(1);
      } else if (err.code === 'EADDRINUSE') {
        console.error(`[AJC] ERROR: Port ${port} is already in use by another service.`);
        console.error(`[AJC] FIX: Run 'sudo systemctl stop apache2 nginx lighttpd' and try again.`);
        process.exit(1);
      } else {
        console.error(`[AJC] FATAL ERROR:`, err);
        process.exit(1);
      }
    });
};

startServer(80);