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

// Ensure dist directory exists
const distPath = path.join(__dirname, 'dist');
if (!fs.existsSync(distPath)) {
  fs.mkdirSync(distPath, { recursive: true });
}

// Serve static files
app.use('/dist', express.static(distPath));
app.use(express.static(__dirname));

// API Routes
app.get('/api/rates', async (req, res) => {
  try {
    const rates = await db.all('SELECT * FROM rates');
    res.json(rates || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rates', async (req, res) => {
  const { pesos, minutes } = req.body;
  try {
    await db.run('INSERT INTO rates (pesos, minutes) VALUES (?, ?)', [pesos, minutes]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/rates/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM rates WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config', async (req, res) => {
  try {
    const boardType = await db.get('SELECT value FROM config WHERE key = ?', ['boardType']);
    const coinPin = await db.get('SELECT value FROM config WHERE key = ?', ['coinPin']);
    res.json({
      boardType: boardType?.value || 'none',
      coinPin: parseInt(coinPin?.value || '3')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config', async (req, res) => {
  const { boardType, coinPin } = req.body;
  try {
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['boardType', boardType]);
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['coinPin', coinPin.toString()]);
    updateGPIO(boardType, coinPin);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/interfaces', async (req, res) => {
  try {
    const ifaces = await network.getInterfaces();
    res.json(ifaces);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/network/status', async (req, res) => {
  const { name, status } = req.body;
  try {
    await network.setInterfaceStatus(name, status);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Explicit Admin Route Handling
app.get(['/admin', '/admin/*'], (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// SPA Support
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/dist')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
});

// Start hardware listener
(async () => {
  try {
    const boardTypeRow = await db.get('SELECT value FROM config WHERE key = ?', ['boardType']);
    const coinPinRow = await db.get('SELECT value FROM config WHERE key = ?', ['coinPin']);
    
    const boardType = boardTypeRow?.value || 'none';
    const coinPin = parseInt(coinPinRow?.value || '3');

    console.log(`[AJC-CORE] Starting with Board=${boardType}, BCM=${coinPin}`);
    
    initGPIO((pesos) => {
      io.emit('coin-pulse', { pesos });
    }, boardType, coinPin);
  } catch (e) {
    console.error('[AJC-CORE] Hardware Startup Failed:', e.message);
  }
})();

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`AJC PISOWIFI Server running on http://0.0.0.0:${PORT}`);
});