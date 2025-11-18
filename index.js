#!/usr/bin/env node
require('dotenv').config();
const WebSocket = require('ws');

// Load configuration from env (can be set in a local .env)
const APP_ID = process.env.DERIV_APP_ID || '1089'; // example public app_id
const DERIV_APP_NAME = process.env.DERIV_APP_NAME || 'PURP_MATCH_31';
const WS_URL = process.env.DERIV_WS_URL || `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`;
// Cycle length: countdown duration before entering display/sampling phase.
// Default changed to 10s per your request; override with POLL_INTERVAL_MS env.
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 10_000; // 10 seconds
// How long to display / sample signals after each countdown.
const DISPLAY_DURATION_MS = Number(process.env.DISPLAY_DURATION_MS) || 7000; // how long to display the signal (ms)
// Sampling interval while in the display period (emit a signal every SAMPLE_MS)
// Set SAMPLE_MS=1000 for 1s sampling or SAMPLE_MS=2000 for 2s.
const SAMPLE_MS = Number(process.env.SAMPLE_MS) || 1000;

// Optional credentials (only used if provided)
const DEMO_ACCOUNT_ID = process.env.DEMO_ACCOUNT_ID;
const DEMO_TOKEN = process.env.DEMO_TOKEN;
const REAL_ACCOUNT_ID = process.env.REAL_ACCOUNT_ID;
const REAL_TOKEN = process.env.REAL_TOKEN;

// Startup check: require a demo token to be present (safety: we do not use
// the real token from the local .env by default; keep real tokens out of
// working directories). If you intentionally need to use a real token,
// set it at runtime instead of storing it locally.
if (!DEMO_TOKEN) {
  console.error('Missing required environment variable: DEMO_TOKEN.\nPlease add DEMO_TOKEN to your local .env or export it in your shell.');
  process.exit(1);
}

// We'll store the latest tick per symbol here
const latestTicks = new Map();
let subscribedSymbols = [];

// Autonomous trading state
let isTradingEnabled = false; // Flag to enable/disable trading
let currentProfit = 0; // Track total profit/loss
let currentStake = 1; // Current stake amount (will be set from config)
let consecutiveWins = 0; // Track consecutive wins for stake progression
let profitableDigits = new Map(); // symbol -> { digit: probability }

// Trading configuration (can be updated via UI) - initialized from env
let targetSymbol2 = process.env.TARGET_SYMBOL || 'R_100';
let targetProfit2 = parseFloat(process.env.TARGET_PROFIT) || 100;
let initialStake2 = parseFloat(process.env.INITIAL_STAKE) || 1;
let stakeMultiplier2 = parseFloat(process.env.STAKE_MULTIPLIER) || 2;
let maxStake2 = parseFloat(process.env.MAX_STAKE) || 100;
let minProbabilityThreshold2 = parseFloat(process.env.MIN_PROBABILITY_THRESHOLD) || 12;

// Initialize current stake from config
currentStake = initialStake2;

// Digit frequency tracking (for analysis)
const digitFrequencies = new Map(); // symbol -> { digit: count, total: count }

// Trade tracking for UI
const tradeHistory = [];

// current Deriv WS connection (used by admin reload)
let currentDerivWS = null;

// Simulation mode state
let simulate = false;
const simulateTimers = new Map();

function startSimulation() {
  if (simulate) return;
  simulate = true;
  log('Starting simulation mode');
  subscribedSymbols.forEach(sym => {
    if (simulateTimers.has(sym)) return;
    // emit a simulated tick at randomized intervals (3-8s)
    const timer = setInterval(() => {
      // generate a pseudo-random quote
      const base = 100 + Math.random() * 100; // arbitrary base
      const quote = (base + Math.random()).toFixed(5);
      latestTicks.set(sym, { quote, epoch: Date.now() });
      // occasionally emit an error event
      if (Math.random() < 0.03) {
        broadcastToClients({ type: 'error', symbol: sym, message: 'simulated error' });
      }
      // notify clients of a tick (optional)
      broadcastToClients({ type: 'tick', symbol: sym, quote });
    }, 3000 + Math.floor(Math.random() * 5000));
    simulateTimers.set(sym, timer);
  });
}

function stopSimulation() {
  if (!simulate) return;
  simulate = false;
  log('Stopping simulation mode');
  simulateTimers.forEach((t) => clearInterval(t));
  simulateTimers.clear();
}


// Per-symbol cycle state (countdown + display timers)
const cycles = new Map(); // symbol -> { countdownInterval, displayTimeout, remainingMs }

// Simple static file server + WebSocket server for a browser UI
const http = require('http');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, 'public');
const LOG_PATH = path.join(__dirname, 'logs');

if (!fs.existsSync(LOG_PATH)) fs.mkdirSync(LOG_PATH, { recursive: true });
const logStream = fs.createWriteStream(path.join(LOG_PATH, 'server.log'), { flags: 'a' });
function log(...args) {
  const line = `[${new Date().toISOString()}] ` + args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  logStream.write(line + '\n');
}

const server = http.createServer((req, res) => {
  let urlPath = req.url === '/' ? '/index.html' : req.url;
  // Simple logs endpoint to inspect recent server logs
  if (urlPath === '/logs') {
    const file = path.join(LOG_PATH, 'server.log');
    if (!fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('No logs yet');
      return;
    }
    const tail = fs.readFileSync(file, 'utf8').split('\n').slice(-200).join('\n');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(tail);
    return;
  }
  const filePath = path.join(publicDir, urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === '.js' ? 'application/javascript' : 'text/html';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

const clientWSS = new WebSocket.Server({ server });

function broadcastToClients(obj) {
  const payload = JSON.stringify(obj);
  clientWSS.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(payload);
  });
}

clientWSS.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'snapshot', symbols: subscribedSymbols, ticks: Array.from(latestTicks.entries()), pollInterval: POLL_INTERVAL_MS, sampleMs: SAMPLE_MS, displayMs: DISPLAY_DURATION_MS }));
  // Send current trading config and status
  ws.send(JSON.stringify({ type: 'configUpdate', config: {
    targetSymbol: targetSymbol2,
    targetProfit: targetProfit2,
    initialStake: initialStake2,
    stakeMultiplier: stakeMultiplier2,
    maxStake: maxStake2,
    minProbabilityThreshold: minProbabilityThreshold2
  } }));
  ws.send(JSON.stringify({ type: 'tradeUpdate', tradingEnabled: isTradingEnabled, currentProfit, currentStake }));
  log('Client connected to Web UI');
  // Listen for control messages from the browser (simulate toggle, trading controls)
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg && msg.type === 'simulate') {
        if (msg.enabled) startSimulation(); else stopSimulation();
        broadcastToClients({ type: 'simulate', enabled: msg.enabled });
        log('Simulation set to', msg.enabled);
      } else if (msg.type === 'updateToken') {
        // Update demo token
        process.env.DEMO_TOKEN = msg.token;
        log('Demo token updated via UI');
        // Optionally reconnect with new token
        if (currentDerivWS) {
          currentDerivWS.close();
        }
      } else if (msg.type === 'updateConfig') {
        // Update autonomous trading configuration
        targetSymbol2 = msg.targetSymbol;
        targetProfit2 = msg.targetProfit;
        initialStake2 = msg.initialStake;
        stakeMultiplier2 = msg.stakeMultiplier;
        maxStake2 = msg.maxStake;
        minProbabilityThreshold2 = msg.minProbabilityThreshold;
        // Reset trading state when config changes
        currentStake = initialStake2;
        consecutiveWins = 0;
        currentProfit = 0;
        log(`Autonomous config updated: ${targetSymbol2}, target profit $${targetProfit2}, stake ${initialStake2}x multiplier, max $${maxStake2}, min prob ${minProbabilityThreshold2}%`);
        broadcastToClients({ type: 'configUpdate', config: {
          targetSymbol: targetSymbol2,
          targetProfit: targetProfit2,
          initialStake: initialStake2,
          stakeMultiplier: stakeMultiplier2,
          maxStake: maxStake2,
          minProbabilityThreshold: minProbabilityThreshold2
        } });
        broadcastToClients({ type: 'profitUpdate', currentProfit, currentStake });
      } else if (msg.type === 'startTrading') {
        isTradingEnabled = true;
        log('Autonomous trading started via UI');
        broadcastToClients({ type: 'tradeUpdate', tradingEnabled: true, currentProfit, currentStake });
      } else if (msg.type === 'stopTrading') {
        isTradingEnabled = false;
        log('Autonomous trading stopped via UI');
        broadcastToClients({ type: 'tradeUpdate', tradingEnabled: false, currentProfit, currentStake });
      }
    } catch (err) {
      log('Invalid client message', err.message || err);
    }
  });
});

server.listen(PORT, () => {
  log(`Web UI available at http://localhost:${PORT}`);
  // Optionally expose via localtunnel if enabled
  if (process.env.ENABLE_TUNNEL === 'true') {
    try {
      const lt = child_process.spawn('npx', ['localtunnel', '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
      lt.stdout.on('data', d => log('tunnel:', d.toString().trim()));
      lt.stderr.on('data', d => log('tunnel-err:', d.toString().trim()));
      lt.on('close', code => log('localtunnel exited', code));
    } catch (err) {
      log('Failed to start localtunnel:', err.message || err);
    }
  }
});

// Admin HTTP endpoints for basic control (start/stop/reload)
// Example: POST /admin/stop or GET /admin/stop
server.on('request', (req, res) => {
  try {
    const url = req.url || '';
    if (!url.startsWith('/admin/')) return; // ignore
    // parse action
    // Protect admin endpoints with ADMIN_TOKEN when set
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
    if (ADMIN_TOKEN) {
      const provided = req.headers['x-admin-token'] || req.headers['admin-token'];
      if (!provided || provided !== ADMIN_TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        log('Admin: unauthorized request to', url);
        return;
      }
    } else {
      // no admin token configured — log a warning
      log('Warning: ADMIN_TOKEN not set; admin endpoints are unprotected');
    }
    const action = url.split('/')[2];
    if (action === 'stop') {
      stopAllCycles();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, action: 'stopped' }));
      log('Admin: stop called');
      return;
    }
    if (action === 'start') {
      setupSymbolCycles(subscribedSymbols);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, action: 'started' }));
      log('Admin: start called');
      return;
    }
    if (action === 'reload') {
      if (typeof currentDerivWS === 'object' && currentDerivWS) {
        requestActiveSymbols(currentDerivWS);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, action: 'reload requested' }));
        log('Admin: reload requested');
        return;
      }
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'no connection' }));
      return;
    }
    // unknown action
    res.writeHead(404);
    res.end('unknown admin action');
  } catch (err) {
    log('Admin handler error', err.message || err);
  }
});

function connect() {
  console.log(`Connecting to Deriv WebSocket at ${WS_URL}`);
  const ws = new WebSocket(WS_URL);
  // track current connection for admin/reload actions
  currentDerivWS = ws;

  ws.on('open', () => {
    console.log('WebSocket open.');
    // If a token is available, attempt to authorize first. The authorize
    // request is optional for public tick streams but some account-related
    // actions require it.
    if (DEMO_TOKEN) {
      console.log('Authorizing with demo token...');
      ws.send(JSON.stringify({ authorize: DEMO_TOKEN }));
      return;
    }

    // No token provided (shouldn't happen because we require DEMO_TOKEN),
    // but keep the previous behavior as a fallback.
    requestActiveSymbols(ws);
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(ws, msg);
    } catch (err) {
      log('Failed to parse message:', err.message || err);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket closed. Stopping cycles and reconnecting in 3s...');
    stopAllCycles();
    currentDerivWS = null;
    setTimeout(connect, 3000);
  });

  ws.on('error', (err) => {
    log('WebSocket error:', err && err.message ? err.message : err);
  });
}

function handleMessage(ws, msg) {
  // If this is an authorize response, proceed with active_symbols
  if (msg.authorize) {
    console.log('Authorization successful. Proceeding to request active symbols...');
    isTradingEnabled = true; // Enable trading after successful authorization
    log('Trading enabled for demo account');
    requestActiveSymbols(ws);
    return;
  }

  // If authorize returned an error object instead (older/alternate formats)
  if (msg.error && msg.msg_type === 'authorize') {
    console.error('Authorization failed:', msg.error.message || msg.error);
    // Fall back to active symbols without auth
    requestActiveSymbols(ws);
    return;
  }

  // If this is the active_symbols response, extract volatility indices
  if (msg.active_symbols) {
    // Filter candidate volatility indices by common symbol patterns. The
    // Deriv symbol naming convention frequently uses R_<number> for
    // volatility indices (e.g. R_100). We'll keep any symbol that matches
    // that pattern or contains 'VOL' as a fallback.
    const raw = msg.active_symbols || [];
    const candidateSymbols = raw.map(s => s.symbol).filter(Boolean);
    const symbols = candidateSymbols.filter(sym => {
      if (!sym) return false;
      const up = sym.toUpperCase();
      return /^R_\d+/i.test(sym) || up.includes('VOL') || up.includes('VIX');
    });

    if (symbols.length === 0) {
      console.warn('No volatility-like symbols found in active_symbols. If this is unexpected, set SYMBOLS env var with a comma-separated list (e.g. "R_100,R_50").');
      maybeUseEnvSymbols(ws);
      return;
    }
    // Ensure we include the most common volatility indices explicitly
    const forced = ['R_10','R_25','R_50','R_75','R_100'];
    // Merge and dedupe discovered symbols with forced list
    const combined = Array.from(new Set([...symbols, ...forced]));

    // Subscribe to ticks for each symbol
    subscribedSymbols = combined;
    console.log(`Subscribing to ${combined.length} symbols (first 10 shown):`, combined.slice(0, 10));
    combined.forEach(sym => {
      const req = { ticks: sym };
      ws.send(JSON.stringify(req));
    });
    // Start per-symbol countdown/display cycles
    setupSymbolCycles(combined);
    return;
  }

  // Handle trade result (win/loss/payout)
  if (msg.proposal_open_contract) {
    const contract = msg.proposal_open_contract;
    if (contract.status === 'won' || contract.status === 'lost') {
      const payout = contract.payout || 0;
      const stake = contract.buy_price || 0;
      const profit = payout - stake;

      // Update profit tracking
      currentProfit += profit;

      // Update stake based on win/loss
      if (contract.status === 'won') {
        consecutiveWins++;
        // Increase stake exponentially after every 10 wins
        if (consecutiveWins % 10 === 0) {
          currentStake = Math.min(currentStake * stakeMultiplier, maxStake);
          log(`Stake increased to $${currentStake.toFixed(2)} after ${consecutiveWins} consecutive wins`);
        }
      } else {
        // Reset consecutive wins on loss
        consecutiveWins = 0;
        // Reset stake to initial on loss (martingale would increase, but we avoid fixed losses)
        currentStake = initialStake;
        log(`Loss detected, resetting stake to $${currentStake.toFixed(2)}`);
      }

      log(`Trade result: ${contract.status.toUpperCase()}, stake: $${stake.toFixed(2)}, payout: $${payout.toFixed(2)}, profit: $${profit.toFixed(2)}, total profit: $${currentProfit.toFixed(2)}`);

      // Update UI
      broadcastToClients({ type: 'tradeResult', symbol: contract.symbol || targetSymbol2, prediction: contract.contract_type === 'DIGITMATCH' ? (contract.digit || 'auto') : 'auto', result: contract.status, payout });
      broadcastToClients({ type: 'profitUpdate', currentProfit, currentStake });

      // Check if target profit reached
      if (currentProfit >= targetProfit2) {
        log(`Target profit $${targetProfit2} reached! Stopping autonomous trading.`);
        isTradingEnabled = false;
        broadcastToClients({ type: 'tradeUpdate', tradingEnabled: false, currentProfit, currentStake });
      }
    }
  }

  // Handle incoming ticks
  if (msg.tick && msg.tick.symbol) {
    const symbol = msg.tick.symbol;
    const quote = msg.tick.quote;
    latestTicks.set(symbol, { quote, epoch: Date.now() });
    return;
  }

  // Handle buy response (trade confirmation)
  if (msg.buy) {
    log(`Trade placed: ${JSON.stringify(msg.buy)}`);
    broadcastToClients({ type: 'trade', data: msg.buy });

    // Track trade for UI
    const trade = {
      id: msg.buy.contract_id || Date.now(),
      symbol: msg.buy.symbol || targetSymbol2,
      prediction: msg.buy.digit || 'auto',
      stake: msg.buy.price || currentStake,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    tradeHistory.push(trade);
    broadcastToClients({ type: 'tradeResult', symbol: trade.symbol, prediction: trade.prediction, result: 'pending', payout: null });

    return;
  }

  // If the API returned an error
  if (msg.error) {
    console.error('API error:', msg.error.message || msg.error.code || msg.error);
    // Fall back to env symbols if provided
    maybeUseEnvSymbols(ws);
    return;
  }

  // Any other message we print lightly for debugging
  // console.debug('Received message:', JSON.stringify(msg));
}

function maybeUseEnvSymbols(ws) {
  const env = process.env.SYMBOLS;
  if (env && env.trim().length > 0) {
    const symbols = env.split(',').map(s => s.trim()).filter(Boolean);
    if (symbols.length > 0) {
      // Ensure forced indices are included
      const forced = ['R_10','R_25','R_50','R_75','R_100'];
      const combined = Array.from(new Set([...symbols, ...forced]));
      subscribedSymbols = combined;
      console.log('Using symbols from SYMBOLS env (plus forced indices):', combined);
      combined.forEach(sym => ws.send(JSON.stringify({ ticks: sym })));
      setupSymbolCycles(combined);
      return;
    }
  }
  console.warn('No symbols to subscribe to. Provide a list via SYMBOLS env or check active_symbols call. Exiting.');
  process.exit(1);
}

// Helper to request active symbols (kept separate so we can call it after
// successful authorization)
function requestActiveSymbols(ws) {
  console.log('Requesting list of volatility indices...');
  const req = { active_symbols: 'brief' };
  ws.send(JSON.stringify(req));
}

// Setup per-symbol cycles: each symbol has a 15s countdown, then we display
// the latest signal for DISPLAY_DURATION_MS, then the cycle repeats.
function setupSymbolCycles(symbols) {
  symbols.forEach(sym => {
    if (cycles.has(sym)) return; // already running
    startCycle(sym);
  });
}

function startCycle(sym) {
  const state = {
    remainingMs: POLL_INTERVAL_MS,
    countdownInterval: null,
    displayTimeout: null,
    sampleInterval: null,
  };

  function tick() {
    state.remainingMs -= 1000;
    const secs = Math.max(0, Math.ceil(state.remainingMs / 1000));
    // Broadcast countdown update to browser clients
    broadcastToClients({ type: 'countdown', symbol: sym, remainingMs: state.remainingMs, remainingSec: secs });
    process.stdout.write(`${sym} - next signal in ${secs}s\r`);
    if (state.remainingMs <= 0) {
      clearInterval(state.countdownInterval);
      state.countdownInterval = null;
      // Show signal
      showSignal(sym, state);
    }
  }

  // start the countdown immediately (show initial value)
  state.countdownInterval = setInterval(tick, 1000);
  // immediately write the first line and broadcast initial countdown
  const initialSecs = Math.ceil(state.remainingMs/1000);
  process.stdout.write(`${sym} - next signal in ${initialSecs}s\n`);
  broadcastToClients({ type: 'countdown', symbol: sym, remainingMs: state.remainingMs, remainingSec: initialSecs });

  cycles.set(sym, state);
}

function showSignal(sym, state) {
  // Sampling mode: during the DISPLAY_DURATION_MS window, emit a signal
  // every SAMPLE_MS milliseconds using the latest tick we have for the symbol.
  function emitSample() {
    const tick = latestTicks.get(sym);
    const lastDigit = (tick && tick.quote !== undefined && tick.quote !== null)
      ? String(tick.quote).replace(/[^0-9]/g, '').slice(-1)
      : null;

    // Track digit frequency for analysis
    if (lastDigit !== null) {
      if (!digitFrequencies.has(sym)) {
        digitFrequencies.set(sym, { total: 0 });
      }
      const freq = digitFrequencies.get(sym);
      freq[lastDigit] = (freq[lastDigit] || 0) + 1;
      freq.total += 1;
    }

    log(`${sym} >>> SAMPLE: ${lastDigit !== null ? lastDigit : 'N/A'}`);
    broadcastToClients({ type: 'signal', symbol: sym, lastDigit: lastDigit, displayMs: DISPLAY_DURATION_MS });

    // Autonomous trading: check if we should place a trade based on probability analysis
    if (sym === targetSymbol2 && lastDigit !== null && currentDerivWS && isTradingEnabled) {
      // Check if target profit reached
      if (currentProfit >= targetProfit2) {
        log(`Target profit $${targetProfit2} reached! Stopping autonomous trading.`);
        isTradingEnabled = false;
        broadcastToClients({ type: 'tradeUpdate', tradingEnabled: false, currentProfit, currentStake });
        return;
      }

      // Get profitable digits for this symbol
      const profitable = profitableDigits.get(sym) || {};
      const probability = profitable[lastDigit] || 0;

      // Only trade if probability meets threshold (ensures martingale recovery potential)
      if (probability >= minProbabilityThreshold2) {
        log(`Autonomous trade: ${sym} digit ${lastDigit} (${probability.toFixed(2)}% probability), stake $${currentStake.toFixed(2)}`);
        placeAutonomousTrade(currentDerivWS, sym, lastDigit);
      } else {
        log(`Skipping trade: ${sym} digit ${lastDigit} probability ${probability.toFixed(2)}% < threshold ${minProbabilityThreshold2}%`);
      }
    }
  }

  // Emit the first sample immediately when display starts
  emitSample();
  // Then start regular sampling
  state.sampleInterval = setInterval(emitSample, SAMPLE_MS);

  // After DISPLAY_DURATION_MS stop sampling and restart countdown
  state.displayTimeout = setTimeout(() => {
    if (state.sampleInterval) {
      clearInterval(state.sampleInterval);
      state.sampleInterval = null;
    }
    // Reset remaining and restart countdown
    state.remainingMs = POLL_INTERVAL_MS;
    // Analyze digit frequencies and update profitable digits
    analyzeAndUpdateProfitableDigits(sym);
    // Start a fresh countdown interval
    state.countdownInterval = setInterval(() => {
      state.remainingMs -= 1000;
      const secs = Math.max(0, Math.ceil(state.remainingMs / 1000));
      broadcastToClients({ type: 'countdown', symbol: sym, remainingMs: state.remainingMs, remainingSec: secs });
      process.stdout.write(`${sym} - next signal in ${secs}s\r`);
      if (state.remainingMs <= 0) {
        clearInterval(state.countdownInterval);
        state.countdownInterval = null;
        showSignal(sym, state);
      }
    }, 1000);
  }, DISPLAY_DURATION_MS);
}

function stopAllCycles() {
  cycles.forEach((state, sym) => {
    if (state.countdownInterval) clearInterval(state.countdownInterval);
    if (state.displayTimeout) clearTimeout(state.displayTimeout);
    if (state.sampleInterval) clearInterval(state.sampleInterval);
  });
  cycles.clear();
  // Reset digit frequencies
  digitFrequencies.clear();
  // Reset profitable digits
  profitableDigits.clear();
}

// Function to place autonomous "Digit Matches" trade
function placeAutonomousTrade(ws, symbol, targetDigit) {
  if (!isTradingEnabled) {
    log('Autonomous trading not enabled, skipping trade');
    return;
  }

  const contractType = 'DIGITMATCH'; // For "Digit Matches" contract

  const buyRequest = {
    buy: 1,
    price: currentStake,
    parameters: {
      contract_type: contractType,
      symbol: symbol,
      digit: targetDigit
    }
  };

  log(`Placing autonomous trade: ${symbol} digit ${targetDigit}, stake $${currentStake.toFixed(2)}`);
  ws.send(JSON.stringify(buyRequest));
}
// Function to analyze digit frequencies and update profitable digits for autonomous trading
function analyzeAndUpdateProfitableDigits(symbol) {
  const freq = digitFrequencies.get(symbol);
  if (!freq || freq.total === 0) return;

  const percentages = {};
  for (let digit = 0; digit <= 9; digit++) {
    const count = freq[digit] || 0;
    percentages[digit] = (count / freq.total) * 100;
  }

  // Update profitable digits map
  profitableDigits.set(symbol, percentages);

  // Log analysis
  log(`=== Digit Frequency Analysis for ${symbol} ===`);
  log(`Total samples: ${freq.total}`);

  // Sort digits by frequency descending
  const sortedDigits = Object.keys(percentages)
    .sort((a, b) => percentages[b] - percentages[a]);

  sortedDigits.forEach(digit => {
    const percentage = percentages[digit].toFixed(2);
    const count = freq[digit] || 0;
    log(`  Digit ${digit}: ${count} times (${percentage}%)`);

    // Mark as profitable if above threshold
    const pct = parseFloat(percentage);
    if (pct >= minProbabilityThreshold2) {
      log(`    *** PROFITABLE: Digit ${digit} has ${percentage}% occurrence (≥${minProbabilityThreshold2}% threshold)`);
    }
  });
  log('=== End Analysis ===');

  // Clear frequencies for next cycle
  digitFrequencies.delete(symbol);
}


// Start the client
connect();

// Handle clean shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, stopping cycles and exiting...');
  stopAllCycles();
  process.exit(0);
});

