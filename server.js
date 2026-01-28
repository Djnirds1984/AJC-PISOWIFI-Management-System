require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const si = require('systeminformation');
const db = require('./lib/db');
const { initGPIO, updateGPIO, registerSlotCallback, unregisterSlotCallback } = require('./lib/gpio');
const NodeMCUListener = require('./lib/nodemcu-listener');
const network = require('./lib/network');
const { verifyPassword, hashPassword } = require('./lib/auth');
const crypto = require('crypto');
const multer = require('multer');
const edgeSync = require('./lib/edge-sync');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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
    const session = await db.get('SELECT * FROM admin_sessions WHERE token = ? AND expires_at > datetime("now")', [token]);
    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }
    req.adminUser = session.username;
    next();
  } catch (err) {
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

    // Check trial status
    const trialStatus = await checkTrialStatus(systemHardwareId);
    
    // Check cloud license verification
    const verification = await licenseManager.verifyLicense();

    res.json({
      hardwareId: systemHardwareId,
      isLicensed: verification.isValid && verification.isActivated,
      licenseKey: verification.licenseKey,
      trial: {
        isActive: trialStatus.isTrialActive,
        hasEnded: trialStatus.trialEnded,
        daysRemaining: trialStatus.daysRemaining,
        expiresAt: trialStatus.expiresAt
      },
      canOperate: verification.isValid || trialStatus.isTrialActive
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
    if (!systemHardwareId) {
      systemHardwareId = await getUniqueHardwareId();
    }
    res.json({ hardwareId: systemHardwareId });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
const { syncSaleToCloud, getSyncStats } = require('./lib/edge-sync');

// Initialize license manager (will use env variables if available)
const licenseManager = initializeLicenseManager();
let systemHardwareId = null;

// Initialize hardware ID on startup
(async () => {
  try {
    systemHardwareId = await getUniqueHardwareId();
    console.log(`[License] Hardware ID: ${systemHardwareId}`);

    // Attempt to sync license from cloud on startup
    await licenseManager.fetchAndCacheLicense(systemHardwareId);
  } catch (error) {
    console.error('[License] Failed to get hardware ID:', error);
  }
})();

// Helper: Get MAC from IP using ARP table and DHCP leases
async function getMacFromIp(ip) {
  if (ip === '::1' || ip === '127.0.0.1' || !ip) return null;
  
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

  return null;
}

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
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
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
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
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
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
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
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
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
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
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
    const session = await db.get('SELECT mac FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
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

  const mac = await getMacFromIp(clientIp);
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
    }
  }

  // FORCE REDIRECT to common domain for session sharing (localStorage)
  const PORTAL_DOMAIN = 'portal.ajcpisowifi.com';

  if (isProbe) {
      // Probes get the file directly to satisfy the CNA
      return res.sendFile(path.join(__dirname, 'index.html'));
  }

  // If we are NOT on the portal domain (and not localhost), redirect.
  // This catches IP address access (10.0.0.1) and forces it to the domain.
  if (host !== PORTAL_DOMAIN && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      return res.redirect(`http://${PORTAL_DOMAIN}/`);
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
    const existingSession = await db.get('SELECT token FROM sessions WHERE mac = ?', [mac]);
    const token = existingSession && existingSession.token ? existingSession.token : crypto.randomBytes(16).toString('hex');

    await db.run(
      'INSERT INTO sessions (mac, ip, remaining_seconds, total_paid, download_limit, upload_limit, token) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(mac) DO UPDATE SET remaining_seconds = remaining_seconds + ?, total_paid = total_paid + ?, ip = ?, download_limit = ?, upload_limit = ?, token = ?',
      [mac, clientIp, seconds, pesos, downloadLimit, uploadLimit, token, seconds, pesos, clientIp, downloadLimit, uploadLimit, token]
    );
    
    // Whitelist the device in firewall
    await network.whitelistMAC(mac, clientIp);
    
    console.log(`[AUTH] Session started for ${mac} (${clientIp}) - ${seconds}s, ₱${pesos}, Limits: ${downloadLimit}/${uploadLimit} Mbps`);
    
    // Sync sale to cloud (non-blocking)
    syncSaleToCloud({
      amount: pesos,
      session_duration: seconds,
      customer_mac: mac,
      transaction_type: 'coin_insert'
    }).catch(err => {
      console.error('[Sync] Failed to sync sale to cloud:', err);
    });
    
    res.json({ success: true, mac, token, message: 'Internet access granted. Please refresh your browser or wait a moment for connection to activate.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sessions/restore', async (req, res) => {
  const { token } = req.body;
  const clientIp = req.ip.replace('::ffff:', '');
  const mac = await getMacFromIp(clientIp);
  
  if (!token || !mac) return res.status(400).json({ error: 'Invalid request' });

  try {
    const session = await db.get('SELECT * FROM sessions WHERE token = ?', [token]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    if (session.mac === mac) {
       // Same device, just update IP if changed and ensure whitelisted
       if (session.ip !== clientIp) {
         await db.run('UPDATE sessions SET ip = ? WHERE mac = ?', [clientIp, mac]);
         await network.whitelistMAC(mac, clientIp);
       }
       return res.json({ success: true, remainingSeconds: session.remaining_seconds });
    }
    
    console.log(`[AUTH] Restoring session ${token} from ${session.mac} to ${mac}`);

    // Check if the target MAC already has a session
    const targetSession = await db.get('SELECT * FROM sessions WHERE mac = ?', [mac]);
    let extraTime = 0;
    let extraPaid = 0;
    
    if (targetSession) {
      // Merge existing time from the target MAC if any
      extraTime = targetSession.remaining_seconds;
      extraPaid = targetSession.total_paid;
      await db.run('DELETE FROM sessions WHERE mac = ?', [mac]);
    }

    // Delete the old session record
    await db.run('DELETE FROM sessions WHERE mac = ?', [session.mac]);
    
    // Insert new record with merged data
    await db.run(
      'INSERT INTO sessions (mac, ip, remaining_seconds, total_paid, connected_at, download_limit, upload_limit, token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [mac, clientIp, session.remaining_seconds + extraTime, session.total_paid + extraPaid, session.connected_at, session.download_limit, session.upload_limit, token]
    );
    
    // Switch whitelist
    await network.blockMAC(session.mac, session.ip); // Block old
    await network.whitelistMAC(mac, clientIp); // Allow new
    
    res.json({ success: true, migrated: true, remainingSeconds: session.remaining_seconds + extraTime });
  } catch (err) { 
    console.error('[AUTH] Restore error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

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
    const [system, os] = await Promise.all([
      si.system(),
      si.osInfo()
    ]);
    
    res.json({
      manufacturer: system.manufacturer,
      model: system.model,
      distro: os.distro,
      arch: os.arch,
      platform: os.platform
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
    
    res.json({ 
      boardType: board?.value || 'none', 
      coinPin: parseInt(pin?.value || '2'),
      boardModel: model?.value || null,
      espIpAddress: espIpAddress?.value || '192.168.4.1',
      espPort: parseInt(espPort?.value || '80'),
      coinSlots: coinSlots?.value ? JSON.parse(coinSlots.value) : [],
      nodemcuDevices: nodemcuDevices?.value ? JSON.parse(nodemcuDevices.value) : [],
      registrationKey: registrationKey?.value || '7B3F1A9'
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
       
       return res.json({ success: true, device: updatedDevices[existingDeviceIndex], message: 'Device updated' });
    }
    
    // Create new pending device
    const newDevice = {
      id: `nodemcu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `NodeMCU-${macAddress.replace(/[:]/g, '').substring(0, 6)}`,
      ipAddress,
      macAddress,
      pin: 12, // D6 on ESP8266 (GPIO 12)
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
    
    res.json({ success: true, device: newDevice });
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
    
    res.json({ success: true, device: { ...device, status: device.status } });
  } catch (err) {
    console.error('Error authenticating NodeMCU device:', err);
    res.status(500).json({ error: err.message });
  }
});

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
    const availableDevices = devices
      .filter(d => d.status === 'accepted')
      .map(d => {
        const lastSeen = new Date(d.lastSeen).getTime();
        const isOnline = (now - lastSeen) < 10000; // Online if seen in last 10 seconds (5 heartbeats)
        return {
          id: d.id,
          name: d.name,
          macAddress: d.macAddress,
          isOnline
        };
      });
      
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
    const isOnline = (now - lastSeen) < 10000;
    
    res.json({ online: isOnline, lastSeen: device.lastSeen });
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
    const { name, vlanId, pin } = req.body;
    
    const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
    const existingDevices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
    
    const deviceIndex = existingDevices.findIndex(d => d.id === deviceId);
    if (deviceIndex === -1) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    const updatedDevices = [...existingDevices];
    updatedDevices[deviceIndex] = { 
      ...updatedDevices[deviceIndex], 
      name: typeof name === 'string' && name.trim().length > 0 ? name.trim() : updatedDevices[deviceIndex].name,
      vlanId: typeof vlanId === 'number' ? vlanId : updatedDevices[deviceIndex].vlanId,
      pin: typeof pin === 'number' ? pin : updatedDevices[deviceIndex].pin
    };
    
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['nodemcuDevices', JSON.stringify(updatedDevices)]);
    
    res.json({ success: true, device: updatedDevices[deviceIndex] });
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    await network.deleteVlan(req.params.name);
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
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const result = await network.addPPPoEUser(username, password);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    const sessions = await db.all('SELECT mac, ip, remaining_seconds as remainingSeconds, total_paid as totalPaid, connected_at as connectedAt FROM sessions WHERE remaining_seconds > 0');
    
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

// Firmware download endpoint
app.get('/api/firmware/nodemcu', requireAdmin, (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Check if firmware file exists
    const firmwarePath = path.join(__dirname, 'firmware', 'NodeMCU_ESP8266', 'NodeMCU_ESP8266.ino');
    
    if (!fs.existsSync(firmwarePath)) {
      return res.status(404).json({ error: 'Firmware file not found' });
    }
    
    // Set headers for file download
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="NodeMCU_ESP8266.ino"');
    
    // Stream the file
    const fileStream = fs.createReadStream(firmwarePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (err) => {
      console.error('Error streaming firmware file:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download firmware' });
      }
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
    
    // Update device if information changed
    if (newIp !== device.ip || newHostname !== device.hostname) {
      await db.run(
        'UPDATE wifi_devices SET ip = ?, hostname = ?, last_seen = ? WHERE id = ?',
        [newIp, newHostname, Date.now(), req.params.id]
      );
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

// Periodic TC rule cleanup (every 30 seconds) to prevent accumulation of stale rules
setInterval(async () => {
  try {
    // Clean up TC rules for inactive sessions
    const inactiveSessions = await db.all('SELECT mac, ip FROM sessions WHERE remaining_seconds <= 0');
    for (const session of inactiveSessions) {
      await network.removeSpeedLimit(session.mac, session.ip);
    }
    
    // Also clean up any orphaned TC rules that don't correspond to active sessions
    const activeSessions = await db.all('SELECT ip FROM sessions WHERE remaining_seconds > 0');
    const activeIPs = new Set(activeSessions.map(s => s.ip));
    
    // Get all interfaces and check for orphaned rules
    const { stdout: interfacesOutput } = await execPromise(`ip link show | grep -E "eth|wlan|br|vlan" | awk '{print $2}' | sed 's/:$//'`).catch(() => ({ stdout: '' }));
    const interfaces = interfacesOutput.trim().split('\n').filter(i => i);
    
    for (const iface of interfaces) {
      try {
        // Check for download filters with IPs that are no longer active
        const { stdout: downloadFilters } = await execPromise(`tc filter show dev ${iface} parent 1:0 2>/dev/null || echo ""`).catch(() => ({ stdout: '' }));
        const downloadIPs = downloadFilters.match(/\d+\.\d+\.\d+\.\d+/g) || [];
        
        for (const ip of downloadIPs) {
          if (!activeIPs.has(ip)) {
            await execPromise(`tc filter del dev ${iface} parent 1:0 protocol ip prio 1 u32 match ip dst ${ip} 2>/dev/null || true`).catch(() => {});
            console.log(`[CLEANUP] Removed orphaned download rule for ${ip} on ${iface}`);
          }
        }
        
        // Check for upload filters with IPs that are no longer active
        const { stdout: uploadFilters } = await execPromise(`tc filter show dev ${iface} parent ffff: 2>/dev/null || echo ""`).catch(() => ({ stdout: '' }));
        const uploadIPs = uploadFilters.match(/\d+\.\d+\.\d+\.\d+/g) || [];
        
        for (const ip of uploadIPs) {
          if (!activeIPs.has(ip)) {
            await execPromise(`tc filter del dev ${iface} parent ffff: protocol ip prio 1 u32 match ip src ${ip} 2>/dev/null || true`).catch(() => {});
            console.log(`[CLEANUP] Removed orphaned upload rule for ${ip} on ${iface}`);
          }
        }
      } catch (e) {
        // Ignore errors for individual interfaces
      }
    }
  } catch (e) { 
    console.error('[CLEANUP] Periodic TC cleanup error:', e.message); 
  }
}, 30000); // Run every 30 seconds

async function bootupRestore() {
  console.log('[AJC] Starting System Restoration...');
  
  // Auto-Provision Interfaces & Bridge if needed
  await network.autoProvisionNetwork();

  await network.initFirewall();
  
  // 0. Restore VLANs
  try {
    const vlans = await db.all('SELECT * FROM vlans');
    for (const v of vlans) {
      console.log(`[AJC] Restoring VLAN ${v.name} on ${v.parent} ID ${v.id}...`);
      await network.createVlan(v).catch(e => console.error(`[AJC] VLAN Restore Failed: ${e.message}`));
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
      await network.setupHotspot(h).catch(e => console.error(`[AJC] Hotspot Restore Failed: ${e.message}`));
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

  const sessions = await db.all('SELECT mac, ip FROM sessions WHERE remaining_seconds > 0');
  for (const s of sessions) await network.whitelistMAC(s.mac, s.ip);
  
  console.log('[AJC] System Restoration Complete.');
}

// SPA Fallback for client-side routing & Captive Portal catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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

    const trialStatus = await checkTrialStatus(systemHardwareId);
    const verification = await licenseManager.verifyLicense();
    
    const isLicensed = verification.isValid && verification.isActivated;
    const canOperate = isLicensed || trialStatus.isTrialActive;

    console.log(`[License] Hardware ID: ${systemHardwareId}`);
    console.log(`[License] Licensed: ${isLicensed ? 'YES' : 'NO'}`);
    console.log(`[License] Trial Active: ${trialStatus.isTrialActive ? 'YES' : 'NO'}`);
    
    if (trialStatus.isTrialActive && !isLicensed) {
      console.log(`[License] Trial Mode - ${trialStatus.daysRemaining} days remaining`);
      console.log(`[License] Trial expires: ${trialStatus.expiresAt}`);
    }
    
    if (!canOperate) {
      console.error('╔════════════════════════════════════════════════════════════╗');
      console.error('║                   LICENSE REQUIRED                         ║');
      console.error('╠════════════════════════════════════════════════════════════╣');
      console.error('║  Your 7-day trial has expired and no valid license        ║');
      console.error('║  was found for this device.                                ║');
      console.error('║                                                            ║');
      console.error('║  Hardware ID: ' + systemHardwareId.padEnd(41) + '║');
      console.error('║                                                            ║');
      console.error('║  To activate:                                              ║');
      console.error('║  1. Contact your vendor for a license key                 ║');
      console.error('║  2. Navigate to http://[device-ip]/admin                  ║');
      console.error('║  3. Go to System Settings > License Activation            ║');
      console.error('║  4. Enter your license key                                 ║');
      console.error('║                                                            ║');
      console.error('║  The system will continue to run in demo mode but         ║');
      console.error('║  PisoWiFi services are disabled.                          ║');
      console.error('╚════════════════════════════════════════════════════════════╝');
      
      // Don't restore services if not licensed
      console.log('[License] Skipping service restoration - License required');
      return;
    }
    
    console.log('[License] ✓ License verification passed - Starting services...');
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
  
  await bootupRestore();
});
