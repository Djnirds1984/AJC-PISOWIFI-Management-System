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

// Helper: Get MAC from IP using ARP table
async function getMacFromIp(ip) {
  if (ip === '::1' || ip === '127.0.0.1') return 'LOCAL_ADMIN';
  try {
    const arpData = fs.readFileSync('/proc/net/arp', 'utf8');
    const lines = arpData.split('\n');
    for (const line of lines) {
      if (line.includes(ip)) {
        const parts = line.split(/\s+/);
        return parts[3].toUpperCase(); // MAC address column
      }
    }
  } catch (e) {
    console.error('[ARP] Error reading table:', e.message);
  }
  return null;
}

app.use('/dist', express.static(path.join(__dirname, 'dist')));
app.use(express.static(__dirname));

// AUTHENTICATION-AWARE REDIRECTION MIDDLEWARE
app.use(async (req, res, next) => {
  const host = req.headers.host || '';
  const url = req.url.toLowerCase();
  const clientIp = req.ip.replace('::ffff:', '');

  // Skip for internal assets/APIs
  if (url.startsWith('/api') || url.startsWith('/dist') || host.includes('localhost')) {
    return next();
  }

  // Identify Client MAC
  const mac = await getMacFromIp(clientIp);
  
  // Check if user is already authenticated in DB
  let isAuth = false;
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
    if (session) isAuth = true;
  }

  // If already authenticated, allow them to pass through (don't redirect probes)
  if (isAuth) return next();

  // Redirection probes for Captive Portal Detection
  const portalProbes = [
    '/generate_204', '/hotspot-detect.html', '/ncsi.txt', 
    '/connecttest.txt', '/success.txt', '/kindle-wifi'
  ];

  const isProbe = portalProbes.some(p => url.includes(p));
  
  // If user is NOT authenticated and hits a probe or foreign domain, redirect to portal
  if (isProbe || (!host.match(/^\d+\.\d+\.\d+\.\d+$/) && !url.startsWith('/api'))) {
    return res.redirect(302, `http://${req.headers.host}/`);
  }
  
  next();
});

// SESSIONS API
app.get('/api/sessions', async (req, res) => {
  try {
    const rows = await db.all('SELECT mac, ip, remaining_seconds as remainingSeconds, total_paid as totalPaid, connected_at as connectedAt FROM sessions');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sessions/start', async (req, res) => {
  const { mac, ip, minutes, pesos } = req.body;
  if (!mac) return res.status(400).json({ error: 'MAC address required' });
  try {
    const seconds = minutes * 60;
    await db.run(
      'INSERT INTO sessions (mac, ip, remaining_seconds, total_paid) VALUES (?, ?, ?, ?) ON CONFLICT(mac) DO UPDATE SET remaining_seconds = remaining_seconds + ?, total_paid = total_paid + ?',
      [mac, ip, seconds, pesos, seconds, pesos]
    );
    await network.whitelistMAC(mac);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// RATES API
app.get('/api/rates', async (req, res) => {
  try { res.json(await db.all('SELECT * FROM rates')); } catch (err) { res.json([]); }
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
    const board = await db.get('SELECT value FROM config WHERE key = ?', ['boardType']);
    const pin = await db.get('SELECT value FROM config WHERE key = ?', ['coinPin']);
    res.json({ boardType: board?.value || 'none', coinPin: parseInt(pin?.value || '2') });
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
  try { res.json(await network.getInterfaces()); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/hotspots', async (req, res) => {
  try {
    await db.run('INSERT OR REPLACE INTO hotspots (interface, ip_address, dhcp_range, enabled) VALUES (?, ?, ?, 1)', [req.body.interface, req.body.ip_address, req.body.dhcp_range]);
    await network.setupHotspot(req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/dist')) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Background Timer
setInterval(async () => {
  try {
    const expired = await db.all('SELECT mac FROM sessions WHERE remaining_seconds <= 0');
    for (const s of expired) {
      await network.blockMAC(s.mac);
      await db.run('DELETE FROM sessions WHERE mac = ?', [s.mac]);
    }
    await db.run('UPDATE sessions SET remaining_seconds = remaining_seconds - 1 WHERE remaining_seconds > 0');
  } catch (e) { console.error(e); }
}, 1000);

async function bootupRestore() {
  await network.initFirewall();
  const board = await db.get('SELECT value FROM config WHERE key = ?', ['boardType']);
  const pin = await db.get('SELECT value FROM config WHERE key = ?', ['coinPin']);
  initGPIO((pesos) => io.emit('coin-pulse', { pesos }), board?.value || 'none', parseInt(pin?.value || '2'));
  const sessions = await db.all('SELECT mac FROM sessions WHERE remaining_seconds > 0');
  for (const s of sessions) await network.whitelistMAC(s.mac);
}

server.listen(80, '0.0.0.0', async () => {
  console.log('[AJC] System Engine Online @ Port 80');
  await bootupRestore();
});