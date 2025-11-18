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

  // Send simulate messages when toggle changes
  simulateToggle.addEventListener('change', () => {
    const enabled = simulateToggle.checked;
    ws.send(JSON.stringify({ type: 'simulate', enabled }));
    status.textContent = enabled ? 'simulating' : (ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected');
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
    } catch (err) {
      console.warn('Invalid message', err);
    }
  });

  ws.addEventListener('open', () => {
    console.log('Connected to server');
  });
  ws.addEventListener('close', () => console.log('Disconnected'));
})();
