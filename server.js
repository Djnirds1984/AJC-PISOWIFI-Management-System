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

// 2. Captive Portal Detection Middleware
app.use((req, res, next) => {
  const host = req.headers.host || '';
  const userAgent = req.headers['user-agent'] || '';
  
  const portalProbes = [
    '/generate_204',               // Android / Chrome
    '/hotspot-detect.html',        // iOS / macOS
    '/ncsi.txt',                   // Windows
    '/connecttest.txt'             // Windows
  ];

  if (portalProbes.some(path => req.url.includes(path))) {
    console.log(`[PORTAL] Detection probe from ${userAgent} on ${req.url}`);
    // Redirect probe to the actual portal home page (Port 80)
    return res.redirect(`http://${host}/`);
  }
  next();
});

// SYSTEM API
app.post('/api/system/reset', async (req, res) => {
  try {
    console.log('[SYSTEM] Factory Reset Request Received');
    await network.cleanupAllNetworkSettings();
    await db.factoryResetDB();
    res.json({ success: true, message: 'System restored to factory defaults.' });
  } catch (err) {
    console.error('[SYSTEM] Reset Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// WIRELESS API
app.get('/api/network/wireless', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM wireless_settings');
    res.json(Array.isArray(rows) ? rows : []);
  } catch (err) { 
    console.error('[API] Wireless Fetch Error:', err);
    res.json([]); 
  }
});

app.post('/api/network/wireless', async (req, res) => {
  try {
    const config = req.body;
    if (!config.interface || !config.ssid) {
      return res.status(400).json({ error: 'Interface and SSID are required' });
    }
    await db.run(
      'INSERT OR REPLACE INTO wireless_settings (interface, ssid, password, channel, hw_mode, bridge) VALUES (?, ?, ?, ?, ?, ?)',
      [config.interface, config.ssid, config.password, config.channel || 1, config.hw_mode || 'g', config.bridge]
    );
    await network.configureWifiAP(config);
    res.json({ success: true });
  } catch (err) { 
    console.error('[API] Wireless POST Error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

// HOTSPOT API
app.get('/api/hotspots', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM hotspots');
    res.json(Array.isArray(rows) ? rows : []);
  } catch (err) { res.json([]); }
});

app.post('/api/hotspots', async (req, res) => {
  const config = req.body;
  try {
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
  }
  catch (err) { res.json([]); }
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
  }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/dist')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => console.log('Client connected:', socket.id));

(async () => {
  try {
    const board = await db.get('SELECT value FROM config WHERE key = ?', ['boardType']);
    const pin = await db.get('SELECT value FROM config WHERE key = ?', ['coinPin']);
    initGPIO((pesos) => io.emit('coin-pulse', { pesos }), board?.value || 'none', parseInt(pin?.value || '2'));
  } catch (e) { console.error('[AJC] Startup Error:', e.message); }
})();

// Running on Port 80 for production captive portal efficiency
server.listen(80, '0.0.0.0', () => console.log(`AJC PISOWIFI Server running on http://0.0.0.0 (Port 80)`));