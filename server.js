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

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Helper: Get MAC from IP using ARP table
async function getMacFromIp(ip) {
  if (ip === '::1' || ip === '127.0.0.1' || !ip) return null;
  
  // Try to ping the IP to ensure it's in the ARP table
  try { await execPromise(`ping -c 1 -W 1 ${ip}`); } catch (e) {}

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
  return null;
}

app.use('/dist', express.static(path.join(__dirname, 'dist')));
app.use(express.static(__dirname));

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
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
    if (session) {
      return res.status(204).send();
    }
  }
  
  // Not authorized - redirect to portal
  return res.redirect(302, `http://${req.headers.host}/`);
});

app.get('/hotspot-detect.html', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
    if (session) {
      return res.status(204).send();
    }
  }
  
  // Not authorized - redirect to portal
  return res.redirect(302, `http://${req.headers.host}/`);
});

app.get('/ncsi.txt', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
    if (session) {
      return res.type('text/plain').send('Microsoft NCSI');
    }
  }
  
  // Not authorized - redirect to portal
  return res.redirect(302, `http://${req.headers.host}/`);
});

app.get('/connecttest.txt', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
    if (session) {
      return res.type('text/plain').send('Success');
    }
  }
  
  // Not authorized - redirect to portal
  return res.redirect(302, `http://${req.headers.host}/`);
});

app.get('/success.txt', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
    if (session) {
      return res.type('text/plain').send('Success');
    }
  }
  
  // Not authorized - redirect to portal
  return res.redirect(302, `http://${req.headers.host}/`);
});

// Apple-specific captive portal detection
app.get('/library/test/success.html', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
    if (session) {
      return res.status(204).send();
    }
  }
  
  // Not authorized - redirect to portal
  return res.redirect(302, `http://${req.headers.host}/`);
});

// CAPTIVE PORTAL DETECTION ENDPOINTS
app.get('/generate_204', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
    if (session) {
      return res.status(204).send();
    }
  }
  
  // Not authorized - redirect to portal
  return res.redirect(302, `http://${req.headers.host}/`);
});

app.get('/hotspot-detect.html', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
    if (session) {
      return res.status(204).send();
    }
  }
  
  // Not authorized - redirect to portal
  return res.redirect(302, `http://${req.headers.host}/`);
});

app.get('/ncsi.txt', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
    if (session) {
      return res.type('text/plain').send('Microsoft NCSI');
    }
  }
  
  // Not authorized - redirect to portal
  return res.redirect(302, `http://${req.headers.host}/`);
});

app.get('/connecttest.txt', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
    if (session) {
      return res.type('text/plain').send('Success');
    }
  }
  
  // Not authorized - redirect to portal
  return res.redirect(302, `http://${req.headers.host}/`);
});

app.get('/success.txt', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (mac) {
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
    if (session) {
      return res.type('text/plain').send('Success');
    }
  }
  
  // Not authorized - redirect to portal
  return res.redirect(302, `http://${req.headers.host}/`);
});

// DNS REDIRECT HANDLING FOR CAPTIVE PORTAL
app.use(async (req, res, next) => {
  const host = req.headers.host || '';
  const url = req.url.toLowerCase();
  const clientIp = req.ip.replace('::ffff:', '');

  // Check if this is a DNS-based captive portal probe
  if (host === 'captive.apple.com' || host === 'www.msftconnecttest.com' || host === 'connectivitycheck.gstatic.com') {
    const mac = await getMacFromIp(clientIp);
    if (mac) {
      const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
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
    // Not authorized - redirect to portal
    return res.redirect(302, `http://${req.headers.host}/`);
  }
  
  next();
});

// CAPTIVE PORTAL REDIRECTION MIDDLEWARE
app.use(async (req, res, next) => {
  const host = req.headers.host || '';
  const url = req.url.toLowerCase();
  const clientIp = req.ip.replace('::ffff:', '');

  if (url.startsWith('/api') || url.startsWith('/dist') || host.includes('localhost') || host.includes('127.0.0.1')) {
    return next();
  }

  const portalProbes = [
    '/generate_204', '/hotspot-detect.html', '/ncsi.txt', 
    '/connecttest.txt', '/success.txt', '/kindle-wifi'
  ];
  const isProbe = portalProbes.some(p => url.includes(p));

  const mac = await getMacFromIp(clientIp);
  if (mac) {
    const session = await db.get('SELECT mac, ip, remaining_seconds FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
    if (session) {
      // If IP has changed, update the whitelist rule
      if (session.ip !== clientIp) {
        console.log(`[NET] Client ${mac} changed IP from ${session.ip} to ${clientIp}. Updating whitelist.`);
        await network.blockMAC(mac, session.ip);
        await network.whitelistMAC(mac, clientIp);
        await db.run('UPDATE sessions SET ip = ? WHERE mac = ?', [clientIp, mac]);
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
      }
      
      return next();
    }
  }

  if (isProbe || !host.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    return res.redirect(302, `http://${req.headers.host}/`);
  }
  
  next();
});

// SESSIONS API
app.get('/api/whoami', async (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  res.json({ ip: clientIp, mac: mac || 'unknown' });
});

app.get('/api/sessions', async (req, res) => {
  try {
    const rows = await db.all('SELECT mac, ip, remaining_seconds as remainingSeconds, total_paid as totalPaid, connected_at as connectedAt FROM sessions');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sessions/start', async (req, res) => {
  const { minutes, pesos } = req.body;
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);

  if (!mac) {
    console.error(`[AUTH] Failed to resolve MAC for IP: ${clientIp}`);
    return res.status(400).json({ error: 'Could not identify your device MAC. Please try reconnecting.' });
  }

  try {
    const seconds = minutes * 60;
    await db.run(
      'INSERT INTO sessions (mac, ip, remaining_seconds, total_paid) VALUES (?, ?, ?, ?) ON CONFLICT(mac) DO UPDATE SET remaining_seconds = remaining_seconds + ?, total_paid = total_paid + ?, ip = ?',
      [mac, clientIp, seconds, pesos, seconds, pesos, clientIp]
    );
    await network.whitelistMAC(mac, clientIp);
    res.json({ success: true, mac });
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

// SYSTEM & CONFIG API
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

app.post('/api/system/reset', async (req, res) => {
  try {
    await db.factoryResetDB();
    await network.cleanupAllNetworkSettings();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NETWORK API
app.get('/api/interfaces', async (req, res) => {
  try { res.json(await network.getInterfaces()); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/hotspots', async (req, res) => {
  try { res.json(await db.all('SELECT * FROM hotspots')); } catch (err) { res.json([]); }
});

app.get('/api/network/wireless', async (req, res) => {
  try { res.json(await db.all('SELECT * FROM wireless_settings')); } catch (err) { res.json([]); }
});

app.post('/api/network/wireless', async (req, res) => {
  try {
    await db.run('INSERT OR REPLACE INTO wireless_settings (interface, ssid, password, bridge) VALUES (?, ?, ?, ?)', [req.body.interface, req.body.ssid, req.body.password, req.body.bridge]);
    await network.configureWifiAP(req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/hotspots', async (req, res) => {
  try {
    await db.run('INSERT OR REPLACE INTO hotspots (interface, ip_address, dhcp_range, enabled) VALUES (?, ?, ?, 1)', [req.body.interface, req.body.ip_address, req.body.dhcp_range]);
    await network.setupHotspot(req.body);
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

app.post('/api/network/vlan', async (req, res) => {
  try {
    await network.createVlan(req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/network/bridge', async (req, res) => {
  try {
    const output = await network.createBridge(req.body);
    res.json({ success: true, output });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/dist')) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Background Timer
setInterval(async () => {
  try {
    const expired = await db.all('SELECT mac, ip FROM sessions WHERE remaining_seconds <= 0');
    for (const s of expired) {
      await network.blockMAC(s.mac, s.ip);
      await db.run('DELETE FROM sessions WHERE mac = ?', [s.mac]);
    }
    await db.run('UPDATE sessions SET remaining_seconds = remaining_seconds - 1 WHERE remaining_seconds > 0');
  } catch (e) { console.error(e); }
}, 1000);

async function bootupRestore() {
  console.log('[AJC] Starting System Restoration...');
  await network.initFirewall();
  
  // 1. Restore Hotspots (DNS/DHCP)
  try {
    const hotspots = await db.all('SELECT * FROM hotspots WHERE enabled = 1');
    for (const h of hotspots) {
      console.log(`[AJC] Restoring Hotspot on ${h.interface}...`);
      await network.setupHotspot(h).catch(e => console.error(`[AJC] Hotspot Restore Failed: ${e.message}`));
    }
  } catch (e) { console.error('[AJC] Failed to load hotspots from DB'); }

  // 2. Restore Wireless APs
  try {
    const wireless = await db.all('SELECT * FROM wireless_settings');
    for (const w of wireless) {
      console.log(`[AJC] Restoring Wi-Fi AP on ${w.interface}...`);
      await network.configureWifiAP(w).catch(e => console.error(`[AJC] AP Restore Failed: ${e.message}`));
    }
  } catch (e) { console.error('[AJC] Failed to load wireless settings from DB'); }

  // 3. Restore GPIO & Hardware
  const board = await db.get('SELECT value FROM config WHERE key = ?', ['boardType']);
  const pin = await db.get('SELECT value FROM config WHERE key = ?', ['coinPin']);
  initGPIO((pesos) => io.emit('coin-pulse', { pesos }), board?.value || 'none', parseInt(pin?.value || '2'));
  
  // 4. Restore Active Sessions
  const sessions = await db.all('SELECT mac, ip FROM sessions WHERE remaining_seconds > 0');
  for (const s of sessions) await network.whitelistMAC(s.mac, s.ip);
  
  console.log('[AJC] System Restoration Complete.');
}

server.listen(80, '0.0.0.0', async () => {
  console.log('[AJC] System Engine Online @ Port 80');
  await bootupRestore();
});