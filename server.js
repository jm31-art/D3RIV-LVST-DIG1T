require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files (HTML/JS/CSS)
app.use(express.static('public'));

// Integrate bot modules
const db = require('./db');
const strategies = require('./strategies');
const risk = require('./risk');
const config = require('./config');
const ml = require('./ml');

let tradesToday = 0;
let totalProfit = 0;
let requestQueue = [];

// Deriv WS setup
let derivWs;
let reconnectMs = 1000;

function connectDeriv() {
  derivWs = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${process.env.DERIV_APP_ID}`);
  derivWs.on('open', () => {
    reconnectMs = 1000;
    derivWs.send(JSON.stringify({ authorize: process.env.DEMO_API_TOKEN }));
    derivWs.send(JSON.stringify({ balance: 1, subscribe: 1 }));
    derivWs.send(JSON.stringify({ ticks: '1HZ100V', subscribe: 1 }));
    derivWs.send(JSON.stringify({ get_settings: 1 }));
  });
  derivWs.on('close', () => setTimeout(connectDeriv, reconnectMs = Math.min(reconnectMs * 2, 60000)));
  derivWs.on('error', (err) => {
    if (err.message.includes('rate')) setTimeout(connectDeriv, 60000);
  });
  derivWs.on('message', (data) => {
    let msg = JSON.parse(data);
    if (msg.msg_type === 'authorize') {
      console.log('Demo Auth:', msg.authorize ? 'Success' : 'Fail');
      io.emit('status', 'Authorized. Starting bot...');
      startBotTrading();
    }
    if (msg.msg_type === 'balance') {
      console.log('Demo Funds:', msg.balance.balance);
      risk.updateBalance(parseFloat(msg.balance.balance));
    }
    if (msg.msg_type === 'tick') {
      db.addTick(msg.tick.symbol, msg.tick.last_digit, msg.tick.quote);
      let ticks = db.getHistoricalTicks(msg.tick.symbol, 100);
      let pred = strategies.getEnsemblePrediction(ticks, 0.5, 0.5);
      let vol = strategies.calculateVol(ticks);
      if (vol < 0.5 && pred > config.confThreshold && tradesToday < config.maxTradesDay) {
        let stake = risk.getStake(1, true, 0);
        let type = pred % 2 === 0 ? 'even' : 'odd';
        strategies.proposeContract(derivWs, type, msg.tick.symbol, stake, 5);
      }
    }
    if (msg.msg_type === 'proposal') {
      if (msg.proposal.ask_price < 10) {
        queuedSend({ buy: msg.proposal.id, price: msg.proposal.ask_price });
      }
    }
    if (msg.msg_type === 'buy') {
      tradesToday++;
      console.log('Trade executed');
      const tradeLog = {
        time: new Date().toISOString(),
        symbol: '1HZ100V',
        type: 'demo',
        stake: 1,
        outcome: 'Executed',
        amount: 0
      };
      io.emit('trade_log', tradeLog);
    }
    if (msg.msg_type === 'pong') console.log('Latency OK');
    if (msg.msg_type === 'website_status' && msg.website_status.uptime < 99) console.log('Low uptime');
    if (msg.error) {
      console.error('Error:', msg.error.message);
      if (msg.error.code === 'RateLimit') {
        setTimeout(() => { if (requestQueue.length) derivWs.send(requestQueue.shift()); }, 1000);
      }
    }
  });
}

setInterval(() => derivWs.send(JSON.stringify({ ping: 1 })), 30000);
setInterval(() => derivWs.send(JSON.stringify({ website_status: 1 })), 60000);

function validatePayload(payload) {
  try { JSON.parse(JSON.stringify(payload)); return true; } catch { return false; }
}

function queuedSend(payload) {
  if (validatePayload(payload)) { requestQueue.push(JSON.stringify(payload)); if (requestQueue.length === 1) derivWs.send(requestQueue.shift()); }
  else console.error('Invalid payload');
}

function startBotTrading() {
  console.log('Bot trading started in demo mode');
}

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('start-demo', () => {
    if (!derivWs || derivWs.readyState !== WebSocket.OPEN) {
      connectDeriv();
      socket.emit('status', 'Connecting to Deriv Demo...');
    } else {
      socket.emit('status', 'Already connected. Starting trades...');
      startBotTrading();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));