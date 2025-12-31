// derivBot.js
process.env.NODE_OPTIONS = '--max-old-space-size=512';
const WebSocket = require('ws');
require('dotenv').config();
const db = require('./db');
const strategies = require('./strategies');
const risk = require('./risk');
const config = require('./config');
const ml = require('./ml');
const nodemailer = require('nodemailer');

async function sendAlert(message) {
  let transporter = nodemailer.createTransporter({ service: 'gmail', auth: { user: 'your@gmail.com', pass: 'app_pass' } });
  await transporter.sendMail({ from: 'bot@gmail.com', to: 'you@gmail.com', subject: 'Bot Alert', text: message });
}

let tradesToday = 0;
let totalProfit = 0;
let requestQueue = [];

const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${process.env.DERIV_APP_ID}`;
let ws;
let reconnectMs = 1000;

function connect() {
  ws = new WebSocket(wsUrl);
  ws.on('open', () => {
    reconnectMs = 1000;
    ws.send(JSON.stringify({ authorize: process.env.DEMO_API_TOKEN }));
    ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
    ws.send(JSON.stringify({ ticks: '1HZ100V', subscribe: 1 }));
  });
  ws.on('close', () => setTimeout(connect, reconnectMs = Math.min(reconnectMs * 2, 60000)));
  ws.on('error', (err) => {
    if (err.message.includes('rate')) setTimeout(connect, 60000);
  });
  ws.on('message', (data) => {
    let msg = JSON.parse(data);
    if (msg.msg_type === 'authorize') console.log('Demo Auth:', msg.authorize ? 'Success' : 'Fail');
    if (msg.msg_type === 'balance') {
      console.log('Demo Funds:', msg.balance.balance);
      risk.updateBalance(parseFloat(msg.balance.balance));
    }
    if (msg.msg_type === 'tick') {
      db.addTick(msg.tick.symbol, msg.tick.last_digit, msg.tick.quote);
      let ticks = db.getHistoricalTicks(msg.tick.symbol, 100);
      let pred = strategies.getEnsemblePrediction(ticks, 0.5, 0.5); // placeholder
      let vol = strategies.calculateVol(ticks);
      if (vol < 0.5 && pred > config.confThreshold && tradesToday < config.maxTradesDay) {
        let stake = risk.getStake(1, true, 0);
        let type = pred % 2 === 0 ? 'even' : 'odd'; // for VIX
        strategies.proposeContract(ws, type, msg.tick.symbol, stake, 5);
      }
    }
    if (msg.msg_type === 'proposal') {
      if (msg.proposal.ask_price < 10) { // arbitrary
        queuedSend({ buy: msg.proposal.id, price: msg.proposal.ask_price });
      }
    }
    if (msg.msg_type === 'buy') {
      tradesToday++;
      console.log('Trade executed');
      console.log('Trade logged for compliance:', tradesToday);
      if (tradesToday > 100 && totalProfit > 0.05 * risk.getStake(1, true, 0) * 100) sendAlert('Target hit');
    }
    if (msg.msg_type === 'pong') console.log('Latency OK');
    if (msg.error) {
      console.error('Error:', msg.error.message);
      if (msg.error.code === 'RateLimit') {
        console.warn('Backoff');
        setTimeout(() => { if (requestQueue.length) ws.send(requestQueue.shift()); }, 1000);
      }
    }
  });
}

connect();

setInterval(() => ws.send(JSON.stringify({ ping: 1 })), 30000);

function queuedSend(payload) {
  requestQueue.push(JSON.stringify(payload));
  if (requestQueue.length === 1) ws.send(requestQueue.shift());
}

// For Render: server setup
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot running'));
app.listen(process.env.PORT || 3000, () => console.log('On port', process.env.PORT || 3000));

// Test: npm start, check logs for auth/balance. Trades use demo funds if authorized
