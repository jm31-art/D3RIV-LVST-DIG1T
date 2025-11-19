(function(){
  // Client-side timing values (will be overridden by server snapshot)
  let POLL_INTERVAL_MS = 15000;
  let SAMPLE_MS = 1000;
  let DISPLAY_MS = 7000;
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  const grid = document.getElementById('grid');
  const status = document.getElementById('status');
  const simulateToggle = document.getElementById('simulateToggle');
  const items = new Map();

  // Trading UI elements
  const demoTokenInput = document.getElementById('demoToken');
  const updateTokenBtn = document.getElementById('updateTokenBtn');
  const targetSymbolSelect = document.getElementById('targetSymbol');
  const targetProfitInput = document.getElementById('targetProfit');
  const initialStakeInput = document.getElementById('initialStake');
  const stakeMultiplierInput = document.getElementById('stakeMultiplier');
  const maxStakeInput = document.getElementById('maxStake');
  const minProbabilityThresholdInput = document.getElementById('minProbabilityThreshold');
  const updateConfigBtn = document.getElementById('updateConfigBtn');
  const startTradingBtn = document.getElementById('startTradingBtn');
  const stopTradingBtn = document.getElementById('stopTradingBtn');
  const tradingStatus = document.getElementById('tradingStatus');
  const currentProfitSpan = document.getElementById('currentProfit');
  const currentStakeSpan = document.getElementById('currentStake');
  const tradeLogContainer = document.getElementById('tradeLogContainer');

  // Add tooltips for better UX
  function addTooltip(element, text) {
    element.title = text;
  }

  addTooltip(updateTokenBtn, 'Update your Deriv API token');
  addTooltip(updateConfigBtn, 'Apply trading configuration changes');
  addTooltip(startTradingBtn, 'Start autonomous trading');
  addTooltip(stopTradingBtn, 'Stop all trading activities');

  // Send simulate messages when toggle changes
  simulateToggle.addEventListener('change', () => {
    const enabled = simulateToggle.checked;
    ws.send(JSON.stringify({ type: 'simulate', enabled }));
    status.textContent = enabled ? 'simulating' : (ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected');
  });

  // Trading control event listeners
  updateTokenBtn.addEventListener('click', () => {
    const token = demoTokenInput.value.trim();
    if (token) {
      ws.send(JSON.stringify({ type: 'updateToken', token }));
      alert('Token updated successfully!');
    } else {
      alert('Please enter a valid token');
    }
  });

  updateConfigBtn.addEventListener('click', () => {
    const config = {
      type: 'updateConfig',
      targetSymbol: targetSymbolSelect.value,
      targetProfit: parseFloat(targetProfitInput.value),
      initialStake: parseFloat(initialStakeInput.value),
      stakeMultiplier: parseFloat(stakeMultiplierInput.value),
      maxStake: parseFloat(maxStakeInput.value),
      minProbabilityThreshold: parseFloat(minProbabilityThresholdInput.value)
    };
    ws.send(JSON.stringify(config));
    alert('Autonomous configuration updated successfully!');
  });

  startTradingBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to start autonomous trading? This will begin real trades.')) {
      ws.send(JSON.stringify({ type: 'startTrading' }));
      startTradingBtn.disabled = true;
      stopTradingBtn.disabled = false;
    }
  });

  stopTradingBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to stop trading?')) {
      ws.send(JSON.stringify({ type: 'stopTrading' }));
      startTradingBtn.disabled = false;
      stopTradingBtn.disabled = true;
    }
  });

  function renderSymbol(sym) {
    if (items.has(sym)) return items.get(sym);
    const card = document.createElement('div');
    card.className = 'card';
    const s = document.createElement('div'); s.className='symbol'; s.textContent = sym;
    const c = document.createElement('div'); c.className='countdown'; c.textContent = 'waiting...';
    const progWrap = document.createElement('div'); progWrap.className = 'progress';
    const prog = document.createElement('i'); prog.style.width = '0%'; progWrap.appendChild(prog);
    const sig = document.createElement('div'); sig.className='signal n/a'; sig.textContent = '-';
    card.appendChild(s); card.appendChild(c); card.appendChild(sig);
    card.appendChild(progWrap);
    grid.appendChild(card);
    items.set(sym, { card, countdownEl: c, signalEl: sig, progressEl: prog, remainingSec: null });
    return items.get(sym);
  }

  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'snapshot') {
        // update timing values from server
        if (msg.pollInterval) POLL_INTERVAL_MS = msg.pollInterval;
        if (msg.sampleMs) SAMPLE_MS = msg.sampleMs;
        if (msg.displayMs) DISPLAY_MS = msg.displayMs;
        if (msg.symbols && msg.symbols.length) {
          msg.symbols.forEach(sym => renderSymbol(sym));
        }
        if (msg.ticks && msg.ticks.length) {
          msg.ticks.forEach(([sym, tick]) => {
            renderSymbol(sym).signalEl.textContent = (tick && tick.quote!=null) ? String(tick.quote).replace(/[^0-9]/g,'').slice(-1) : '-';
          });
        }
      }
      if (msg.type === 'countdown') {
        const sym = msg.symbol;
        const it = renderSymbol(sym);
        const secs = Math.max(0, Math.ceil((msg.remainingMs||0)/1000));
        it.countdownEl.textContent = `next signal in ${secs}s`;
        // progress calculation
        const pct = Math.max(0, Math.min(100, ((POLL_INTERVAL_MS - (msg.remainingMs||0)) / POLL_INTERVAL_MS) * 100));
        if (it.progressEl) it.progressEl.style.width = `${pct}%`;
      }
      if (msg.type === 'signal') {
        const sym = msg.symbol;
        const it = renderSymbol(sym);
        const val = msg.lastDigit !== null && msg.lastDigit !== undefined ? msg.lastDigit : 'N/A';
        it.signalEl.textContent = val;
        it.signalEl.className = 'signal show';
        // after displayMs revert style to muted
        setTimeout(() => {
          it.signalEl.className = 'signal n/a';
        }, msg.displayMs || 5000);
      }
      if (msg.type === 'tick') {
        // optional immediate tick notification (simulation helper)
        const sym = msg.symbol;
        const it = renderSymbol(sym);
        it.countdownEl.textContent = `tick: ${String(msg.quote)}`;
      }
      if (msg.type === 'error') {
        const sym = msg.symbol;
        const it = renderSymbol(sym);
        it.countdownEl.textContent = `ERROR: ${msg.message}`;
      }
      if (msg.type === 'tradeUpdate') {
        // Update trading status
        tradingStatus.textContent = msg.tradingEnabled ? 'Enabled' : 'Disabled';
        tradingStatus.style.color = msg.tradingEnabled ? '#28a745' : '#dc3545';
      }
      if (msg.type === 'tradeResult') {
        // Add trade result to log
        const entry = document.createElement('div');
        entry.className = `trade-entry ${msg.result}`;
        const timestamp = new Date().toLocaleTimeString();
        entry.textContent = `[${timestamp}] ${msg.symbol} digit ${msg.prediction} - ${msg.result.toUpperCase()} (${msg.payout ? '$' + msg.payout : 'N/A'})`;
        tradeLogContainer.insertBefore(entry, tradeLogContainer.firstChild);

        // Keep only last 50 entries
        while (tradeLogContainer.children.length > 50) {
          tradeLogContainer.removeChild(tradeLogContainer.lastChild);
        }
      }
      if (msg.type === 'configUpdate') {
        // Update UI with current autonomous config
        if (msg.config) {
          targetSymbolSelect.value = msg.config.targetSymbol || 'R_100';
          targetProfitInput.value = msg.config.targetProfit || 100;
          initialStakeInput.value = msg.config.initialStake || 1;
          stakeMultiplierInput.value = msg.config.stakeMultiplier || 2;
          maxStakeInput.value = msg.config.maxStake || 100;
          minProbabilityThresholdInput.value = msg.config.minProbabilityThreshold || 12;
        }
      }
      if (msg.type === 'profitUpdate') {
        // Update profit and stake display
        currentProfitSpan.textContent = msg.currentProfit.toFixed(2);
        currentStakeSpan.textContent = msg.currentStake.toFixed(2);
      }
      if (msg.type === 'connectionStatus') {
        // Add connection status to trade log
        const entry = document.createElement('div');
        entry.className = 'trade-entry connection';
        const timestamp = new Date().toLocaleTimeString();
        entry.textContent = `[${timestamp}] ${msg.message}`;
        tradeLogContainer.insertBefore(entry, tradeLogContainer.firstChild);
      }
    } catch (err) {
      console.warn('Invalid message', err);
    }
  });

  ws.addEventListener('open', () => {
    console.log('Connected to server');
  });
  ws.addEventListener('close', () => console.log('Disconnected'));
})();
