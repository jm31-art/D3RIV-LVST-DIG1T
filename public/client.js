(function(){
  // WebSocket connection to the bot backend
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);

  // DOM element references
  const connectionStatus = document.getElementById('connection-status');
  const connectionText = document.getElementById('connection-text');
  const tradingStatus = document.getElementById('trading-status');
  const tradingText = document.getElementById('trading-text');
  const apiTokenInput = document.getElementById('api-token');
  const tradingStrategySelect = document.getElementById('trading-strategy');
  const riskPerTradeInput = document.getElementById('risk-per-trade');
  const minProbabilityInput = document.getElementById('min-probability');
  const maxDrawdownInput = document.getElementById('max-drawdown');
  const maxConcurrentTradesInput = document.getElementById('max-concurrent-trades');
  const symbolsSelect = document.getElementById('symbols');
  const paperTradingCheckbox = document.getElementById('paperTrading');
  const updateConfigBtn = document.getElementById('update-config');
  const startTradingBtn = document.getElementById('start-trading');
  const stopTradingBtn = document.getElementById('stop-trading');

  // Strategy comparison elements
  const compareSymbolSelect = document.getElementById('compareSymbol');
  const runStrategyComparisonBtn = document.getElementById('runStrategyComparison');
  const optimizeStrategyBtn = document.getElementById('optimizeStrategy');
  const strategyComparisonResults = document.getElementById('strategyComparisonResults');

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

  // Chart instances
  let balanceChart = null;
  let winRateChart = null;
  let sentimentChart = null;
  let tradeFrequencyChart = null;
  let performanceChart = null;

  // Chart data storage
  let balanceHistory = [];
  let winRateHistory = [];
  let sentimentHistory = [];
  let tradeFrequencyData = [];
  let performanceData = [];

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
      case 'sentiment_update':
        updateSentimentChart(message.data);
        break;
      case 'market_data':
        updateSentimentChart(message.data.sentimentData);
        break;
      case 'strategy_comparison':
        displayStrategyComparison(message.data);
        break;
      case 'strategy_optimization':
        displayStrategyOptimization(message.data);
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
      const statusText = data.paperTrading ? 'Authorized (Paper Trading)' : 'Authorized';
      updateConnectionStatus(statusText, 'status-connected');
    } else {
      updateConnectionStatus('Connected (Not Authorized)', 'status-authorizing');
    }

    // Update trading status
    if (tradingEnabled) {
      const tradingText = data.paperTrading ? 'Active (Paper Trading)' : 'Active';
      updateTradingStatus(tradingText, 'status-connected');
    } else {
      updateTradingStatus('Ready', 'status-disconnected');
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

    // Update charts with new data
    updateBalanceChart(data.portfolioBalance || 1000);
    updateWinRateChart(data.winRate || 0);
    updatePerformanceChart(
      data.totalProfit || 0,
      data.winRate || 0,
      data.sharpeRatio || 0
    );
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
    const paperTradeIndicator = tradeData.paperTrade ? ' [PAPER]' : '';

    tradeItem.innerHTML = `
      <div class="trade-symbol">${tradeData.symbol}${paperTradeIndicator}</div>
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
    const paperTradeIndicator = tradeData.paperTrade ? ' [PAPER]' : '';

    tradeItem.innerHTML = `
      <div class="trade-symbol">${tradeData.symbol}${paperTradeIndicator}</div>
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
        symbols: symbolsSelect ? Array.from(symbolsSelect.selectedOptions).map(opt => opt.value) : ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'],
        paperTrading: paperTradingCheckbox ? paperTradingCheckbox.checked : false,
      };

      if (isConnected) {
        ws.send(JSON.stringify(config));
        // Show connection message only after manual connect button press
        if (config.apiToken) {
          addConnectionMessage('🔌 Bot connected to websocket - API token updated and authorized');
        }
        alert('Configuration updated and connected successfully!');
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

  // Strategy comparison functionality
  if (runStrategyComparisonBtn) {
    runStrategyComparisonBtn.addEventListener('click', () => {
      const symbol = compareSymbolSelect ? compareSymbolSelect.value : 'R_10';

      if (isConnected) {
        runStrategyComparisonBtn.disabled = true;
        runStrategyComparisonBtn.textContent = 'Running Comparison...';

        ws.send(JSON.stringify({
          type: 'compare_strategies',
          symbol: symbol
        }));

        // Show loading state
        if (strategyComparisonResults) {
          strategyComparisonResults.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #666;">Running strategy comparison...</div>';
        }
      } else {
        alert('Not connected to bot backend');
      }
    });
  }


  // Initialize charts on page load
  initializeCharts();

  // Request initial status on load
  setTimeout(() => {
    if (isConnected) {
      ws.send(JSON.stringify({ type: 'get_status' }));
    }
  }, 1000);

  // Chart initialization functions
  function initializeCharts() {
    initializeBalanceChart();
    initializeWinRateChart();
    initializeSentimentChart();
    initializeTradeFrequencyChart();
    initializePerformanceChart();
  }

  function initializeBalanceChart() {
    const ctx = document.getElementById('balanceChart');
    if (!ctx) return;

    balanceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Portfolio Balance',
          data: [],
          borderColor: '#27ae60',
          backgroundColor: 'rgba(39, 174, 96, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'minute',
              displayFormats: {
                minute: 'HH:mm'
              }
            },
            title: {
              display: true,
              text: 'Time'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Balance ($)'
            },
            beginAtZero: false
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          }
        }
      }
    });
  }

  function initializeWinRateChart() {
    const ctx = document.getElementById('winRateChart');
    if (!ctx) return;

    winRateChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Win Rate (%)',
          data: [],
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'hour',
              displayFormats: {
                hour: 'HH:mm'
              }
            }
          },
          y: {
            title: {
              display: true,
              text: 'Win Rate (%)'
            },
            min: 0,
            max: 100
          }
        }
      }
    });
  }

  function initializeSentimentChart() {
    const ctx = document.getElementById('sentimentChart');
    if (!ctx) return;

    sentimentChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'],
        datasets: [{
          label: 'Bullish Sentiment',
          data: [],
          borderColor: '#27ae60',
          backgroundColor: 'rgba(39, 174, 96, 0.2)',
          pointBackgroundColor: '#27ae60'
        }, {
          label: 'Bearish Sentiment',
          data: [],
          borderColor: '#e74c3c',
          backgroundColor: 'rgba(231, 76, 60, 0.2)',
          pointBackgroundColor: '#e74c3c'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            beginAtZero: true,
            max: 1
          }
        }
      }
    });
  }

  function initializeTradeFrequencyChart() {
    const ctx = document.getElementById('tradeFrequencyChart');
    if (!ctx) return;

    tradeFrequencyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
        datasets: [{
          label: 'Trades per Hour',
          data: [],
          backgroundColor: 'rgba(52, 152, 219, 0.6)',
          borderColor: '#3498db',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Trades'
            }
          }
        }
      }
    });
  }

  function initializePerformanceChart() {
    const ctx = document.getElementById('performanceChart');
    if (!ctx) return;

    performanceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Total Profit ($)',
            data: [],
            borderColor: '#27ae60',
            backgroundColor: 'rgba(39, 174, 96, 0.1)',
            yAxisID: 'y',
            tension: 0.4
          },
          {
            label: 'Win Rate (%)',
            data: [],
            borderColor: '#3498db',
            backgroundColor: 'rgba(52, 152, 219, 0.1)',
            yAxisID: 'y1',
            tension: 0.4
          },
          {
            label: 'Sharpe Ratio',
            data: [],
            borderColor: '#f39c12',
            backgroundColor: 'rgba(243, 156, 18, 0.1)',
            yAxisID: 'y1',
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'hour'
            }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Profit ($)'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Rate / Ratio'
            },
            grid: {
              drawOnChartArea: false,
            },
          }
        }
      }
    });
  }

  // Chart update functions
  function updateBalanceChart(balance, timestamp) {
    if (!balanceChart) return;

    const time = new Date(timestamp || Date.now());
    balanceHistory.push({ x: time, y: balance });

    // Keep only last 100 points
    if (balanceHistory.length > 100) {
      balanceHistory.shift();
    }

    balanceChart.data.labels = balanceHistory.map(point => point.x);
    balanceChart.data.datasets[0].data = balanceHistory.map(point => point.y);
    balanceChart.update('none');
  }

  function updateWinRateChart(winRate, timestamp) {
    if (!winRateChart) return;

    const time = new Date(timestamp || Date.now());
    winRateHistory.push({ x: time, y: winRate * 100 });

    if (winRateHistory.length > 50) {
      winRateHistory.shift();
    }

    winRateChart.data.labels = winRateHistory.map(point => point.x);
    winRateChart.data.datasets[0].data = winRateHistory.map(point => point.y);
    winRateChart.update('none');
  }

  function updateSentimentChart(sentimentData) {
    if (!sentimentChart || !sentimentData) return;

    const bullishData = [];
    const bearishData = [];

    Object.values(sentimentData).forEach(symbolData => {
      if (symbolData.sentimentTrend) {
        if (symbolData.sentimentTrend.trend === 'bullish') {
          bullishData.push(symbolData.sentimentTrend.strength);
          bearishData.push(0);
        } else if (symbolData.sentimentTrend.trend === 'bearish') {
          bullishData.push(0);
          bearishData.push(symbolData.sentimentTrend.strength);
        } else {
          bullishData.push(0.1);
          bearishData.push(0.1);
        }
      }
    });

    sentimentChart.data.datasets[0].data = bullishData;
    sentimentChart.data.datasets[1].data = bearishData;
    sentimentChart.update();
  }

  function updatePerformanceChart(profit, winRate, sharpeRatio, timestamp) {
    if (!performanceChart) return;

    const time = new Date(timestamp || Date.now());
    performanceData.push({
      x: time,
      profit,
      winRate: winRate * 100,
      sharpeRatio
    });

    if (performanceData.length > 50) {
      performanceData.shift();
    }

    performanceChart.data.labels = performanceData.map(point => point.x);
    performanceChart.data.datasets[0].data = performanceData.map(point => point.profit);
    performanceChart.data.datasets[1].data = performanceData.map(point => point.winRate);
    performanceChart.data.datasets[2].data = performanceData.map(point => point.sharpeRatio);
    performanceChart.update('none');
  }

  // Strategy comparison display function
  function displayStrategyComparison(comparisonData) {
    if (!strategyComparisonResults) return;

    // Reset button state
    if (runStrategyComparisonBtn) {
      runStrategyComparisonBtn.disabled = false;
      runStrategyComparisonBtn.textContent = 'Compare Strategies';
    }

    if (!comparisonData || !comparisonData.results) {
      strategyComparisonResults.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #e74c3c;">No comparison data available</div>';
      return;
    }

    const results = comparisonData.results;
    const comparison = comparisonData.comparison;

    let html = '';

    // Best performing strategy highlight
    if (comparison && comparison.totalProfit) {
      const bestStrategy = comparison.totalProfit.best;
      html += `
        <div style="grid-column: 1 / -1; background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
          <h4 style="margin: 0 0 5px 0;">🏆 Best Performing Strategy</h4>
          <p style="margin: 0; font-size: 1.1em;"><strong>${bestStrategy.strategy}</strong> with $${bestStrategy.value.toFixed(2)} profit</p>
        </div>
      `;
    }

    // Individual strategy cards
    Object.entries(results).forEach(([strategy, data]) => {
      if (data.error) {
        html += `
          <div class="strategy-card" style="background: white; border: 2px solid #e74c3c; border-radius: 8px; padding: 15px;">
            <h5 style="margin: 0 0 10px 0; color: #e74c3c;">${strategy}</h5>
            <p style="margin: 0; color: #e74c3c;">Error: ${data.error}</p>
          </div>
        `;
        return;
      }

      const perf = data.performance;
      const isBest = comparison && comparison.totalProfit && comparison.totalProfit.best.strategy === strategy;

      html += `
        <div class="strategy-card ${isBest ? 'best-strategy' : ''}" style="background: white; border: 2px solid ${isBest ? '#27ae60' : '#e9ecef'}; border-radius: 8px; padding: 15px; ${isBest ? 'box-shadow: 0 0 15px rgba(39, 174, 96, 0.3);' : ''}">
          <h5 style="margin: 0 0 10px 0; color: ${isBest ? '#27ae60' : '#2c3e50'};">
            ${strategy} ${isBest ? '⭐' : ''}
          </h5>
          <div style="display: grid; gap: 8px; font-size: 0.9em;">
            <div style="display: flex; justify-content: space-between;">
              <span>Total Profit:</span>
              <span style="font-weight: bold; color: ${perf.totalProfit >= 0 ? '#27ae60' : '#e74c3c'};">$${perf.totalProfit.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Win Rate:</span>
              <span style="font-weight: bold;">${(perf.winRate * 100).toFixed(1)}%</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Profit Factor:</span>
              <span style="font-weight: bold;">${perf.profitFactor.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Max Drawdown:</span>
              <span style="font-weight: bold; color: #e74c3c;">${(perf.maxDrawdown * 100).toFixed(1)}%</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Sharpe Ratio:</span>
              <span style="font-weight: bold;">${perf.sharpeRatio.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Total Trades:</span>
              <span style="font-weight: bold;">${perf.totalTrades}</span>
            </div>
          </div>
        </div>
      `;
    });

    strategyComparisonResults.innerHTML = html;
  }

  // Strategy optimization display function
  function displayStrategyOptimization(optimizationData) {
    if (!strategyComparisonResults) return;

    // Reset button state
    if (optimizeStrategyBtn) {
      optimizeStrategyBtn.disabled = false;
      optimizeStrategyBtn.textContent = 'Optimize Strategy';
    }

    if (!optimizationData) {
      strategyComparisonResults.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #e74c3c;">No optimization data available</div>';
      return;
    }

    let html = `
      <div style="grid-column: 1 / -1; background: linear-gradient(135deg, #9b59b6, #8e44ad); color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
        <h4 style="margin: 0 0 5px 0;">🎯 Strategy Optimization Results</h4>
        <p style="margin: 0; font-size: 1.1em;">Optimal parameters found for <strong>${optimizationData.strategy}</strong></p>
      </div>

      <div class="optimization-card" style="grid-column: 1 / -1; background: white; border: 2px solid #9b59b6; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
        <h5 style="margin: 0 0 15px 0; color: #9b59b6;">Optimal Configuration</h5>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
          <div style="background: #f8f9fa; padding: 10px; border-radius: 6px;">
            <strong>Risk per Trade:</strong> ${(optimizationData.optimalParams.riskPerTrade * 100).toFixed(1)}%
          </div>
          <div style="background: #f8f9fa; padding: 10px; border-radius: 6px;">
            <strong>Min Probability:</strong> ${optimizationData.optimalParams.minProbability.toFixed(1)}%
          </div>
          <div style="background: #f8f9fa; padding: 10px; border-radius: 6px;">
            <strong>Max Drawdown:</strong> ${(optimizationData.optimalParams.maxDrawdown * 100).toFixed(1)}%
          </div>
          <div style="background: #f8f9fa; padding: 10px; border-radius: 6px;">
            <strong>Expected Profit:</strong> $${optimizationData.expectedPerformance.totalProfit.toFixed(2)}
          </div>
        </div>
      </div>

      <div class="optimization-card" style="background: white; border: 2px solid #3498db; border-radius: 8px; padding: 20px;">
        <h5 style="margin: 0 0 15px 0; color: #3498db;">Performance Projection</h5>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
          <div style="text-align: center;">
            <div style="font-size: 1.5em; font-weight: bold; color: #27ae60;">${(optimizationData.expectedPerformance.winRate * 100).toFixed(1)}%</div>
            <div style="color: #666; font-size: 0.9em;">Win Rate</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.5em; font-weight: bold; color: #3498db;">${optimizationData.expectedPerformance.profitFactor.toFixed(2)}</div>
            <div style="color: #666; font-size: 0.9em;">Profit Factor</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.5em; font-weight: bold; color: #f39c12;">${optimizationData.expectedPerformance.sharpeRatio.toFixed(2)}</div>
            <div style="color: #666; font-size: 0.9em;">Sharpe Ratio</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.5em; font-weight: bold; color: #e74c3c;">${(optimizationData.expectedPerformance.maxDrawdown * 100).toFixed(1)}%</div>
            <div style="color: #666; font-size: 0.9em;">Max Drawdown</div>
          </div>
        </div>
      </div>
    `;

    strategyComparisonResults.innerHTML = html;
  }


  // Strategy optimization functionality
  if (optimizeStrategyBtn) {
    optimizeStrategyBtn.addEventListener('click', () => {
      const symbol = compareSymbolSelect ? compareSymbolSelect.value : 'R_10';

      if (isConnected) {
        optimizeStrategyBtn.disabled = true;
        optimizeStrategyBtn.textContent = 'Optimizing...';

        ws.send(JSON.stringify({
          type: 'optimize_strategy',
          symbol: symbol
        }));

        // Show loading state
        if (strategyComparisonResults) {
          strategyComparisonResults.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #666;">Running strategy optimization...</div>';
        }
      } else {
        alert('Not connected to bot backend');
      }
    });
  }

})();
