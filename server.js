
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

app.post('/api/rates', async (req, res) => {
  const { pesos, minutes } = req.body;
  try {
    const result = await db.run('INSERT INTO rates (pesos, minutes) VALUES (?, ?)', [pesos, minutes]);
    res.json({ id: result.lastID, pesos, minutes });
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
    const boardType = await db.get("SELECT value FROM config WHERE key = 'boardType'");
    const coinPin = await db.get("SELECT value FROM config WHERE key = 'coinPin'");
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
    await db.run("UPDATE config SET value = ? WHERE key = 'boardType'", [boardType]);
    await db.run("UPDATE config SET value = ? WHERE key = 'coinPin'", [coinPin.toString()]);
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

app.post('/api/network/bridge', async (req, res) => {
  const { name, members } = req.body;
  try {
    const output = await network.createBridge(name, members);
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
  console.log('Client connected:', socket.id);
  socket.on('start-update', (config) => {
    updater.runUpdate(config, (log) => socket.emit('update-log', log));
  });
  socket.on('disconnect', () => console.log('Client disconnected'));
});

// Initialize Hardware with loaded config
(async () => {
  const b = await db.get("SELECT value FROM config WHERE key = 'boardType'");
  const p = await db.get("SELECT value FROM config WHERE key = 'coinPin'");
  initGPIO((pesos) => {
    console.log(`Coin detected: ₱${pesos}`);
    io.emit('coin-pulse', { pesos });
  }, b?.value || 'none', parseInt(p?.value || '3'));
})();

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`AJC PISOWIFI Server running on http://0.0.0.0:${PORT}`);
});
