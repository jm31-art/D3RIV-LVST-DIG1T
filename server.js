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
  const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${process.env.DERIV_APP_ID || 1089}`;
  console.log('WS connecting to', wsUrl);
  derivWs = new WebSocket(wsUrl);
  derivWs.on('open', () => {
    console.log('WS opened');
    reconnectMs = 1000;
    derivWs.send(JSON.stringify({ authorize: process.env.DEMO_API_TOKEN }));
    derivWs.send(JSON.stringify({ balance: 1, subscribe: 1 }));
    derivWs.send(JSON.stringify({ ticks: 'R_10', subscribe: 1 }));
    derivWs.send(JSON.stringify({ get_settings: 1 }));
  });
  derivWs.on('close', () => {
    console.log('WS closed');
    setTimeout(connectDeriv, reconnectMs = Math.min(reconnectMs * 2, 60000));
  });
  derivWs.on('error', (err) => {
    console.log('WS error:', err.message);
    if (err.message.includes('rate')) setTimeout(connectDeriv, 60000);
  });
  derivWs.on('message', (data) => {
    let msg = JSON.parse(data);
    console.log('Deriv WS message:', msg.msg_type, msg.error ? 'Error:' + JSON.stringify(msg.error) : '');
    if (msg.msg_type === 'authorize') {
      if (msg.authorize) {
        console.log('Demo authorized - placing test trade');
        // Simple Rise/Fall on frxEURUSD (common demo symbol, quick 5-tick contract)
        const proposal = {
          proposal: 1,
          amount: 1,  // $1 stake (demo safe)
          basis: 'stake',
          contract_type: 'CALL',  // Rise
          currency: 'USD',
          duration: 5,
          duration_unit: 't',
          symbol: 'frxEURUSD'
        };
        derivWs.send(JSON.stringify(proposal));

        // Subscribe to open contracts for outcomes
        derivWs.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));

        // Subscribe to ticks for ongoing trading
        derivWs.send(JSON.stringify({ ticks: 'frxEURUSD', subscribe: 1 }));

        io.emit('status', 'Authorized. Test trade placed...');
      } else {
        console.log('Authorization failed');
        io.emit('status', 'Authorization failed. Check DEMO_API_TOKEN.');
      }
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
    // Enhanced trade logging (catches proposal response + contract updates)
    if (msg.msg_type === 'proposal') {
      // Auto-buy on proposal (for immediate trade)
      derivWs.send(JSON.stringify({ buy: msg.proposal.id, price: msg.proposal.ask_price }));
    }

    if (msg.msg_type === 'buy') {
      console.log('Trade bought:', msg.buy.contract_id);
    }

    if (msg.msg_type === 'proposal_open_contract') {
      const profit = msg.proposal_open_contract.profit || 0;
      const tradeLog = {
        time: new Date().toISOString(),
        symbol: msg.proposal_open_contract.symbol || 'R_10',
        type: msg.proposal_open_contract.contract_type || 'CALL',
        stake: msg.proposal_open_contract.buy_price || 1,
        outcome: profit > 0 ? 'Profit' : (msg.proposal_open_contract.is_sold ? 'Loss' : 'Open'),
        amount: profit
      };
      io.emit('trade_log', tradeLog);  // Send to UI table
      console.log('Trade update:', tradeLog);
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