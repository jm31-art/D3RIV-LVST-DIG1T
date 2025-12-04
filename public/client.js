(function(){
  // WebSocket connection to the bot backend
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);

  // DOM element references
  const connectionStatus = document.getElementById('connection-status');
  const connectionText = document.getElementById('connection-text');
  const tradingStatus = document.getElementById('trading-status');
  const tradingText = document.getElementById('trading-text');
  const safetyStatus = document.getElementById('safety-status');
  const safetyText = document.getElementById('safety-text');
  const apiTokenInput = document.getElementById('api-token');
  const tradingStrategySelect = document.getElementById('trading-strategy');
  const riskPerTradeInput = document.getElementById('risk-per-trade');
  const minProbabilityInput = document.getElementById('min-probability');
  const maxDrawdownInput = document.getElementById('max-drawdown');
  const maxConcurrentTradesInput = document.getElementById('max-concurrent-trades');
  const symbolsSelect = document.getElementById('symbols');
  const updateConfigBtn = document.getElementById('update-config');
  const startTradingBtn = document.getElementById('start-trading');
  const stopTradingBtn = document.getElementById('stop-trading');
  const enableOverrideBtn = document.getElementById('enable-override');
  const disableOverrideBtn = document.getElementById('disable-override');
  const overrideStatusEl = document.getElementById('override-status');

  // Live trading elements
  const activeTradesEl = document.getElementById('active-trades').querySelector('.metric-value');
  const currentSymbolEl = document.getElementById('current-symbol').querySelector('.metric-value');

  // Live trade feed
  const liveTradeFeed = document.getElementById('live-trade-feed');

  // Trade history
  const tradeListEl = document.getElementById('trade-list');

  // Connection state
  let isConnected = false;
  let botAuthorized = false;
  let tradingEnabled = false;

  // Initialize WebSocket event handlers
  ws.addEventListener('open', () => {
    console.log('Connected to bot backend');
    isConnected = true;
    updateConnectionStatus('Connected', 'status-connected');
  });

  ws.addEventListener('close', () => {
    console.log('Disconnected from bot backend');
    isConnected = false;
    botAuthorized = false;
    tradingEnabled = false;
    updateConnectionStatus('Disconnected', 'status-disconnected');
    updateTradingButtons();
  });

  ws.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  // Handle incoming WebSocket messages
  function handleWebSocketMessage(message) {
    switch (message.type) {
      case 'status':
        updateBotStatus(message);
        break;
      case 'performance':
        updatePerformanceMetrics(message.data);
        break;
      case 'trade':
        addTradeToHistory(message.data);
        break;
      case 'portfolio':
        updatePortfolioInfo(message.data);
        break;
      case 'backtest_result':
        addConnectionMessage(`Autonomous backtest completed for ${message.symbol}: Win Rate ${(message.performance.winRate * 100).toFixed(2)}%`);
        break;
      case 'retraining_complete':
        addConnectionMessage(`Autonomous model retraining completed for ${message.symbol}`);
        break;
      case 'alert':
        showAlert(message.message, message.severity || 'info');
        break;
      case 'error':
        showError(message.message);
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  // Update connection status indicator
  function updateConnectionStatus(status, className) {
    if (connectionStatus && connectionText) {
      const indicator = connectionStatus.querySelector('.status-indicator');
      if (indicator) indicator.className = `status-indicator ${className}`;
      connectionText.textContent = status;
    }
  }

  // Update trading status indicator
  function updateTradingStatus(status, className) {
    if (tradingStatus && tradingText) {
      const indicator = tradingStatus.querySelector('.status-indicator');
      if (indicator) indicator.className = `status-indicator ${className}`;
      tradingText.textContent = status;
    }
  }

  // Update safety status indicator
  function updateSafetyStatus(manualOverride) {
    if (safetyStatus && safetyText) {
      const indicator = safetyStatus.querySelector('.status-indicator');
      if (manualOverride) {
        indicator.className = 'status-indicator status-danger';
        safetyText.textContent = 'Safety Mode: DISABLED';
      } else {
        indicator.className = 'status-indicator status-safe';
        safetyText.textContent = 'Safety Mode: Active';
      }
    }

    // Update override status text
    if (overrideStatusEl) {
      overrideStatusEl.textContent = manualOverride ? 'Manual Override: ACTIVE (DANGER)' : 'Safety Mode: Active (Recommended)';
      overrideStatusEl.className = manualOverride ? 'override-status danger' : 'override-status safe';
    }

    // Update override buttons
    if (enableOverrideBtn && disableOverrideBtn) {
      enableOverrideBtn.disabled = manualOverride;
      disableOverrideBtn.disabled = !manualOverride;
    }
  }

  // Update bot status
  function updateBotStatus(data) {
    botAuthorized = data.authorized || false;
    tradingEnabled = data.tradingEnabled || false;

    if (data.authorized) {
      const modeText = data.tradingMode === 'live' ? 'LIVE ACCOUNT' : 'DEMO ACCOUNT';
      updateConnectionStatus(`Authorized (${modeText})`, 'status-connected');
    } else {
      updateConnectionStatus('Connected (Not Authorized)', 'status-authorizing');
    }

    // Update trading status
    if (tradingEnabled) {
      const modeText = data.tradingMode === 'live' ? 'Active (LIVE)' : 'Active (DEMO)';
      updateTradingStatus(modeText, 'status-connected');
    } else {
      updateTradingStatus('Ready to Trade', 'status-disconnected');
    }

    // Update safety status
    updateSafetyStatus(data.manualOverride || false);

    // Update live trading status
    updateLiveTradingStatus(data);

    updateTradingButtons();
  }

  // Update performance metrics display
  function updatePerformanceMetrics(data) {
    // Update elements that exist in simplified UI
    const totalTradesEl = document.getElementById('total-trades');
    const winRateEl = document.getElementById('win-rate');
    const totalProfitEl = document.getElementById('total-profit');

    if (totalTradesEl) totalTradesEl.querySelector('.metric-value').textContent = data.totalTrades || 0;
    if (winRateEl) winRateEl.querySelector('.metric-value').textContent = data.winRate ? (data.winRate * 100).toFixed(2) + '%' : '0.00%';
    if (totalProfitEl) totalProfitEl.querySelector('.metric-value').textContent = data.totalProfit ? '$' + data.totalProfit.toFixed(2) : '$0.00';
  }

  // Update portfolio information
  function updatePortfolioInfo(data) {
    if (activeTradesEl) activeTradesEl.textContent = data.activeTrades || 0;
    if (currentBalanceEl) currentBalanceEl.textContent = '$' + (data.balance || 1000).toFixed(2);
  }

  // Update live trading status
  function updateLiveTradingStatus(data) {
    if (activeTradesEl) activeTradesEl.textContent = data.activeTrades || 0;
    if (currentSymbolEl) currentSymbolEl.textContent = data.currentSymbol || 'None';
  }

  // Add trade to history and live feed
  function addTradeToHistory(tradeData) {
    // Add to live trade feed first (more prominent)
    addToLiveTradeFeed(tradeData);

    // Also add to trade history
    if (!tradeListEl) return;

    const tradeItem = document.createElement('div');
    tradeItem.className = `trade-item ${tradeData.result}`;

    const timestamp = new Date(tradeData.timestamp).toLocaleString();
    const profit = tradeData.profit ? `$${tradeData.profit.toFixed(2)}` : 'Pending';
    const modeIndicator = tradeData.tradingMode === 'live' ? ' [LIVE]' : ' [DEMO]';

    tradeItem.innerHTML = `
      <div class="trade-symbol">${tradeData.symbol}${modeIndicator}</div>
      <div class="trade-details">
        Prediction: ${tradeData.prediction} | Stake: $${tradeData.stake} | ${timestamp}
      </div>
      <div class="trade-result ${tradeData.result}">${tradeData.result.toUpperCase()} (${profit})</div>
    `;

    // Insert at the bottom of the list (to prevent auto-scrolling)
    tradeListEl.appendChild(tradeItem);

    // Keep only last 50 trades
    while (tradeListEl.children.length > 50) {
      tradeListEl.removeChild(tradeListEl.firstChild);
    }
  }

  // Add trade to live feed
  function addToLiveTradeFeed(tradeData) {
    if (!liveTradeFeed) return;

    const tradeItem = document.createElement('div');
    tradeItem.className = `trade-item ${tradeData.result}`;

    const timestamp = new Date(tradeData.timestamp).toLocaleTimeString();
    const profit = tradeData.profit !== undefined ? `$${tradeData.profit.toFixed(2)}` : 'Pending';
    const profitClass = tradeData.profit > 0 ? 'profit-positive' : tradeData.profit < 0 ? 'profit-negative' : '';

    // Show signal information and result
    const signalInfo = tradeData.confidence ? `Signal: ${tradeData.prediction} (${(tradeData.confidence * 100).toFixed(1)}% confidence)` : `Signal: ${tradeData.prediction}`;
    const resultText = tradeData.result === 'won' ? `✅ WIN (+${profit})` : tradeData.result === 'lost' ? `❌ LOSS (${profit})` : '⏳ PENDING';
    const modeIndicator = tradeData.tradingMode === 'live' ? ' [LIVE]' : ' [DEMO]';

    tradeItem.innerHTML = `
      <div class="trade-symbol">${tradeData.symbol}${modeIndicator}</div>
      <div class="trade-details">
        ${signalInfo} | Stake: $${tradeData.stake} | ${timestamp}
      </div>
      <div class="trade-result ${tradeData.result} ${profitClass}">${resultText}</div>
    `;

    // Insert at the top of the live feed
    liveTradeFeed.insertBefore(tradeItem, liveTradeFeed.firstChild);

    // Keep only last 20 trades in live feed
    while (liveTradeFeed.children.length > 20) {
      liveTradeFeed.removeChild(liveTradeFeed.lastChild);
    }
  }

  // Update trading button states
  function updateTradingButtons() {
    if (startTradingBtn) {
      startTradingBtn.disabled = !isConnected || !botAuthorized || tradingEnabled;
    }
    if (stopTradingBtn) {
      stopTradingBtn.disabled = !tradingEnabled;
    }
  }

  // Add connection message to trade history
  function addConnectionMessage(message) {
    if (!tradeListEl) return;

    const messageItem = document.createElement('div');
    messageItem.className = 'trade-item connection';

    const timestamp = new Date().toLocaleString();
    messageItem.innerHTML = `
      <div class="trade-symbol">System</div>
      <div class="trade-details">${message}</div>
      <div class="trade-result connection">${timestamp}</div>
    `;

    // Insert at the bottom of the list (to prevent auto-scrolling)
    tradeListEl.appendChild(messageItem);

    // Keep only last 50 items
    while (tradeListEl.children.length > 50) {
      tradeListEl.removeChild(tradeListEl.firstChild);
    }
  }

  // Show alert message
  function showAlert(message, severity = 'info') {
    console.log(`Bot alert (${severity}):`, message);

    // Create alert element
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${severity}`;
    alertDiv.innerHTML = `
      <strong>${severity.toUpperCase()}:</strong> ${message}
      <button class="alert-close" onclick="this.parentElement.remove()">×</button>
    `;

    // Insert at top of page
    const container = document.querySelector('.container');
    if (container) {
      container.insertBefore(alertDiv, container.firstChild);

      // Auto-remove after 10 seconds
      setTimeout(() => {
        if (alertDiv.parentElement) {
          alertDiv.remove();
        }
      }, 10000);
    }

    // Also add to trade history
    addConnectionMessage(`Alert: ${message}`);
  }

  // Show error message
  function showError(message) {
    console.error('Bot error:', message);
    addConnectionMessage(`Error: ${message}`);
  }

  // Event listeners for UI controls
  if (updateConfigBtn) {
   updateConfigBtn.addEventListener('click', () => {
      const apiToken = apiTokenInput ? apiTokenInput.value.trim() : '';
      if (!apiToken) {
        alert('Please enter your Deriv API token');
        return;
      }

      const config = {
        type: 'update_config',
        apiToken: apiToken,
        strategy: tradingStrategySelect ? tradingStrategySelect.value : 'ensemble',
        riskPerTrade: riskPerTradeInput ? parseFloat(riskPerTradeInput.value) : 0.02,
        minProbability: minProbabilityInput ? parseFloat(minProbabilityInput.value) : 50,
        maxDrawdown: maxDrawdownInput ? parseFloat(maxDrawdownInput.value) : 0.15,
        maxConcurrentTrades: maxConcurrentTradesInput ? parseInt(maxConcurrentTradesInput.value) : 1,
        symbols: symbolsSelect ? Array.from(symbolsSelect.selectedOptions).map(opt => opt.value) : ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'],
      };

      if (isConnected) {
        ws.send(JSON.stringify(config));
        addConnectionMessage(`🔌 Bot configuration updated successfully`);
        alert('Configuration updated successfully!');
      } else {
        alert('Not connected to bot backend');
      }
    });
  }


  if (startTradingBtn) {
    startTradingBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to start trading? This will begin automated trades.')) {
        if (isConnected) {
          ws.send(JSON.stringify({ type: 'start_trading' }));
        } else {
          alert('Not connected to bot backend');
        }
      }
    });
  }

  if (stopTradingBtn) {
    stopTradingBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to stop trading?')) {
        if (isConnected) {
          ws.send(JSON.stringify({ type: 'stop_trading' }));
        } else {
          alert('Not connected to bot backend');
        }
      }
    });
  }

  // Manual override controls
  if (enableOverrideBtn) {
    enableOverrideBtn.addEventListener('click', () => {
      const confirmed = confirm('⚠️ DANGER: This will disable ALL safety features including automatic shutdown on losses. Are you absolutely sure you want to enable manual override?');
      if (confirmed) {
        const reallyConfirmed = confirm('FINAL WARNING: Manual override removes all protections. You could lose your entire balance. Type "I UNDERSTAND" to confirm.');
        if (reallyConfirmed === 'I UNDERSTAND') {
          if (isConnected) {
            ws.send(JSON.stringify({ type: 'manual_override', action: 'enable' }));
          } else {
            alert('Not connected to bot backend');
          }
        }
      }
    });
  }

  if (disableOverrideBtn) {
    disableOverrideBtn.addEventListener('click', () => {
      if (confirm('Restore all safety features?')) {
        if (isConnected) {
          ws.send(JSON.stringify({ type: 'manual_override', action: 'disable' }));
        } else {
          alert('Not connected to bot backend');
        }
      }
    });
  }

  // Request initial status on load
  setTimeout(() => {
    if (isConnected) {
      ws.send(JSON.stringify({ type: 'get_status' }));
    }
  }, 1000);

})();
