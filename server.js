
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./lib/db');
const { initGPIO, updateGPIO } = require('./lib/gpio');
const network = require('./lib/network');
const updater = require('./lib/updater');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// API Routes
app.get('/api/rates', async (req, res) => {
  try {
    const rates = await db.all('SELECT * FROM rates');
    res.json(rates || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new rate record
app.post('/api/rates', async (req, res) => {
  const { pesos, minutes } = req.body;
  try {
    await db.run('INSERT INTO rates (pesos, minutes) VALUES (?, ?)', [pesos, minutes]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a rate record
app.delete('/api/rates/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM rates WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retrieve hardware configuration from persistence layer
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

// Update hardware configuration and refresh GPIO mappings
app.post('/api/config', async (req, res) => {
  const { boardType, coinPin } = req.body;
  try {
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['boardType', boardType]);
    await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['coinPin', coinPin.toString()]);
    // Notify GPIO module to update physical pin mapping
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

app.post('/api/network/wan', async (req, res) => {
  try {
    await network.configureWan(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/network/vlan', async (req, res) => {
  const { parent, id, name } = req.body;
  try {
    await network.createVlan(parent, id, name);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/network/bridge', async (req, res) => {
  const { name, members, stp } = req.body;
  try {
    const output = await network.createBridge(name, members, stp);
    res.json({ output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  socket.on('disconnect', () => {});
});

// Initialize GPIO listener on startup with stored configuration
(async () => {
  try {
    const boardType = await db.get('SELECT value FROM config WHERE key = ?', ['boardType']);
    const coinPin = await db.get('SELECT value FROM config WHERE key = ?', ['coinPin']);
    initGPIO((pesos) => {
      // Broadcast hardware coin insertion events to all socket clients
      io.emit('coin-pulse', { pesos });
    }, boardType?.value || 'none', parseInt(coinPin?.value || '3'));
  } catch (e) {
    console.error('Failed to init GPIO on startup:', e);
  }
})();

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`AJC PISOWIFI Server running on http://0.0.0.0:${PORT}`);
});
