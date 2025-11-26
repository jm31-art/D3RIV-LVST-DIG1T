// index.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const DerivBot = require('./derivBot');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

// Serve static files (UI)
app.use(express.static(path.join(__dirname, 'public')));

// Create bot instance
const bot = new DerivBot();
bot.connect();

// Handle WebSocket connections from UI
wss.on('connection', (ws) => {
  // Send status updates every 2s
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(bot.getStatus()));
    }
  }, 2000);

  ws.on('message', (msg) => {
    const { action } = JSON.parse(msg);
    if (action === 'start') bot.start();
    if (action === 'stop') bot.stop();
  });

  ws.on('close', () => clearInterval(interval));
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
