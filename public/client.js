(function(){
  // WebSocket connection to the bot backend
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);

  // DOM element references
  const connectionStatus = document.getElementById('connection-status');
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
  const runBacktestBtn = document.getElementById('run-backtest');
  const retrainModelsBtn = document.getElementById('retrain-models');

  // Live trading status elements
  const activeTradesEl = document.getElementById('active-trades').querySelector('.metric-value');
  const currentBalanceEl = document.getElementById('current-balance').querySelector('.metric-value');
  const lastTradeTimeEl = document.getElementById('last-trade-time').querySelector('.metric-value');
  const currentStrategyDisplayEl = document.getElementById('current-strategy-display').querySelector('.metric-value');

  // Current symbol display
  const currentSymbolEl = document.getElementById('current-symbol').querySelector('.metric-value');

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

  // Update bot status
  function updateBotStatus(data) {
    botAuthorized = data.authorized || false;
    tradingEnabled = data.tradingEnabled || false;

    if (data.authorized) {
      updateConnectionStatus('Authorized', 'status-connected');
    } else {
      updateConnectionStatus('Connected (Not Authorized)', 'status-authorizing');
    }

    // Update trading status
    if (tradingEnabled) {
      updateTradingStatus('Active', 'status-connected');
    } else {
      updateTradingStatus('Stopped', 'status-disconnected');
    }

    // Update live trading status
    updateLiveTradingStatus(data);

    updateTradingButtons();
  }

  // Update performance metrics display
  function updatePerformanceMetrics(data) {
    // Only update elements that exist in simplified UI
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
    if (currentBalanceEl) currentBalanceEl.textContent = '$' + (data.balance || 1000).toFixed(2);
    if (lastTradeTimeEl) lastTradeTimeEl.textContent = data.lastTradeTime || 'Never';
    if (currentStrategyDisplayEl) currentStrategyDisplayEl.textContent = data.strategy || 'Ensemble';
    if (currentSymbolEl) currentSymbolEl.textContent = data.currentSymbol || 'R_100';
  }

  // Add trade to history
  function addTradeToHistory(tradeData) {
    if (!tradeListEl) return;

    const tradeItem = document.createElement('div');
    tradeItem.className = `trade-item ${tradeData.result}`;

    const timestamp = new Date(tradeData.timestamp).toLocaleString();
    const profit = tradeData.profit ? `$${tradeData.profit.toFixed(2)}` : 'Pending';

    tradeItem.innerHTML = `
      <div class="trade-symbol">${tradeData.symbol}</div>
      <div class="trade-details">
        Prediction: ${tradeData.prediction} | Stake: $${tradeData.stake} | ${timestamp}
      </div>
      <div class="trade-result ${tradeData.result}">${tradeData.result.toUpperCase()} (${profit})</div>
    `;

    // Insert at the top of the list
    tradeListEl.insertBefore(tradeItem, tradeListEl.firstChild);

    // Keep only last 50 trades
    while (tradeListEl.children.length > 50) {
      tradeListEl.removeChild(tradeListEl.lastChild);
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
    if (runBacktestBtn) {
      runBacktestBtn.disabled = !isConnected;
    }
    if (retrainModelsBtn) {
      retrainModelsBtn.disabled = !isConnected;
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

    // Insert at the top of the list
    tradeListEl.insertBefore(messageItem, tradeListEl.firstChild);

    // Keep only last 50 items
    while (tradeListEl.children.length > 50) {
      tradeListEl.removeChild(tradeListEl.lastChild);
    }
  }

  // Show error message
  function showError(message) {
    console.error('Bot error:', message);
    addConnectionMessage(`Error: ${message}`);
  }

  // Event listeners for UI controls
  if (updateConfigBtn) {
    updateConfigBtn.addEventListener('click', () => {
      const config = {
        type: 'update_config',
        apiToken: apiTokenInput ? apiTokenInput.value : '',
        strategy: tradingStrategySelect ? tradingStrategySelect.value : 'ensemble',
        riskPerTrade: riskPerTradeInput ? parseFloat(riskPerTradeInput.value) : 0.02,
        minProbability: minProbabilityInput ? parseFloat(minProbabilityInput.value) : 50,
        maxDrawdown: maxDrawdownInput ? parseFloat(maxDrawdownInput.value) : 0.15,
        maxConcurrentTrades: maxConcurrentTradesInput ? parseInt(maxConcurrentTradesInput.value) : 1,
        symbols: symbolsSelect ? Array.from(symbolsSelect.selectedOptions).map(opt => opt.value) : ['R_10', 'R_25', 'R_50', 'R_75', 'R_100']
      };

      if (isConnected) {
        ws.send(JSON.stringify(config));
        // Update local display immediately
        if (currentStrategyDisplayEl) currentStrategyDisplayEl.textContent = config.strategy;
        // Show connection message if API token was provided
        if (config.apiToken) {
          addConnectionMessage('Bot connected to websocket - API token updated');
        }
        alert('Configuration updated successfully!');
      } else {
        alert('Not connected to bot backend');
      }
    });
  }

  if (startTradingBtn) {
    startTradingBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to start trading? This will begin live trades.')) {
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

  if (runBacktestBtn) {
    runBacktestBtn.addEventListener('click', () => {
      if (isConnected) {
        ws.send(JSON.stringify({ type: 'run_backtest' }));
        alert('Backtest started. Results will be available shortly.');
      } else {
        alert('Not connected to bot backend');
      }
    });
  }

  if (retrainModelsBtn) {
    retrainModelsBtn.addEventListener('click', () => {
      if (isConnected) {
        ws.send(JSON.stringify({ type: 'retrain_models' }));
        alert('Model retraining started. This may take several minutes.');
      } else {
        alert('Not connected to bot backend');
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
