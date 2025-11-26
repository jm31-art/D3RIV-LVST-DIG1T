// derivBot.js
require('dotenv').config();
const WebSocket = require('ws');

class DerivBot {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.authorized = false;
    this.activeTrades = new Map();
    this.balance = 1000; // default starting balance
    this.profitToday = 0;
    this.status = 'Idle';
    this.pendingRequests = {};
  }

  connect() {
    if (this.isConnected) return;
    this.ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${process.env.DERIV_APP_ID || 1089}`);
    
    this.ws.on('open', () => {
      this.isConnected = true;
      this.status = 'Connected';
      this.authorize();
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (err) {
        console.error('Failed to parse message', err);
      }
    });

    this.ws.on('close', () => {
      this.isConnected = false;
      this.authorized = false;
      this.status = 'Disconnected';
      setTimeout(() => this.connect(), 5000); // reconnect after 5s
    });

    this.ws.on('error', (err) => {
      console.error('WebSocket error', err);
    });
  }

  authorize() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const authReq = { authorize: process.env.DERIV_API_TOKEN };
    this.sendRequest(authReq);
  }

  start() {
    if (!this.authorized) return;
    this.status = 'Running';
    // Example: simple trade simulation every 5s
    this.tradeInterval = setInterval(() => this.simulateTrade(), 5000);
  }

  stop() {
    this.status = 'Idle';
    clearInterval(this.tradeInterval);
  }

  simulateTrade() {
    // Simulate a trade with random profit/loss
    const profit = (Math.random() - 0.5) * 10; // -5 to +5
    this.profitToday += profit;
    this.balance += profit;
  }

  handleMessage(msg) {
    if (msg.msg_type === 'authorize' && !msg.error) {
      this.authorized = true;
      this.status = 'Idle';
    }
  }

  sendRequest(req) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const reqId = Date.now();
    this.ws.send(JSON.stringify({ ...req, req_id: reqId }));
  }

  getStatus() {
    return {
      balance: this.balance.toFixed(2),
      profitToday: this.profitToday.toFixed(2),
      status: this.status,
    };
  }
}

module.exports = DerivBot;
