require('dotenv').config();
const WebSocket = require('ws');
const winston = require('winston');
const cron = require('node-cron');
const express = require('express');
const path = require('path');
const config = require('./config');

// Import our modules
const db = require('./db');
const stats = require('./stats');
const ml = require('./ml');
const risk = require('./risk');
const portfolio = require('./portfolio');
const backtest = require('./backtest');

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'deriv-bot' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Startup check: require API token to be present
const apiToken = process.env.DERIV_API_TOKEN;
if (!apiToken) {
  console.error('Missing required environment variable: DERIV_API_TOKEN.\nPlease add DERIV_API_TOKEN to your environment variables or .env file.');
  process.exit(1);
}

// Bot configuration - using centralized config
const CONFIG = {
  // Deriv API settings
  appId: config.DERIV_APP_ID,
  apiToken: apiToken,
  websocketUrl: config.DERIV_WEBSOCKET_URL,

  // Trading settings
  symbols: config.DEFAULT_SYMBOLS,
  minSamplesRequired: config.MIN_SAMPLES_REQUIRED,
  minProbabilityThreshold: config.MIN_PROBABILITY_THRESHOLD,
  maxConcurrentTrades: config.MAX_CONCURRENT_TRADES,
  tradeCooldown: config.TRADE_COOLDOWN_MS,

  // Risk management
  riskPerTrade: config.RISK_PER_TRADE,
  maxDrawdown: config.MAX_DRAWDOWN,
  maxDailyLoss: config.MAX_DAILY_LOSS,

  // ML settings
  mlRetrainingInterval: config.ML_RETRAINING_INTERVAL_MS,
  backtestInterval: config.BACKTEST_INTERVAL_MS,

  // Strategy settings
  strategy: config.DEFAULT_STRATEGY,
  useBacktestValidation: config.USE_BACKTEST_VALIDATION,
  backtestWindow: config.BACKTEST_WINDOW_TICKS
};

class DerivBot {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.authorized = false;
    this.tradingEnabled = false;
    this.activeTrades = new Map();
    this.lastTradeTime = 0;
    this.symbolSubscriptions = new Map();
    this.tickBuffers = new Map(); // symbol -> recent ticks
    this.predictionCache = new Map(); // symbol -> last prediction
    this.performanceMetrics = {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      winRate: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      sharpeRatio: 0
    };

    // WebSocket server for UI
    this.wss = null;
    this.uiClients = new Set();

    // Initialize modules
    this.initializeModules();

    // Setup WebSocket server for UI
    this.setupWebSocketServer();

    // Schedule periodic tasks
    this.scheduleTasks();
  }

  initializeModules() {
    logger.info('Initializing bot modules...');

    // Update risk parameters
    risk.updateParameters({
      maxDrawdown: CONFIG.maxDrawdown,
      maxDailyLoss: CONFIG.maxDailyLoss
    });

    // Initialize portfolio
    portfolio.initialize(CONFIG.symbols);

    logger.info('Modules initialized successfully');
  }

  setupWebSocketServer() {
    // Setup Express server for static files
    const app = express();
    const server = require('http').createServer(app);

    // Serve static files from public directory
    app.use(express.static(path.join(__dirname, 'public')));

    // Serve index.html for root path
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Setup WebSocket server for UI communication
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws) => {
      logger.info('UI client connected');
      this.uiClients.add(ws);

      // Send initial status
      this.sendStatusToUI();

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleUIMessage(ws, data);
        } catch (error) {
          logger.error('Error parsing UI message:', error);
        }
      });

      ws.on('close', () => {
        logger.info('UI client disconnected');
        this.uiClients.delete(ws);
      });

      ws.on('error', (error) => {
        logger.error('UI WebSocket error:', error);
        this.uiClients.delete(ws);
      });
    });

    // Start server
    server.listen(config.WEB_SERVER_PORT, () => {
      logger.info(`Web interface available at http://localhost:${config.WEB_SERVER_PORT}`);
    });
  }

  handleUIMessage(ws, message) {
    switch (message.type) {
      case 'get_status':
        this.sendStatusToUI();
        break;
      case 'update_config':
        this.updateConfigFromUI(message);
        break;
      case 'start_trading':
        this.startTrading();
        break;
      case 'stop_trading':
        this.stopTrading();
        break;
      case 'run_backtest':
        this.runBacktestFromUI();
        break;
      case 'retrain_models':
        this.retrainModelsFromUI();
        break;
      default:
        logger.warn('Unknown UI message type:', message.type);
    }
  }

  updateConfigFromUI(config) {
    try {
      // Update API token if provided
      if (config.apiToken) {
        CONFIG.apiToken = config.apiToken;
        process.env.DERIV_API_TOKEN = config.apiToken;
      }

      // Update other config parameters
      if (config.strategy) CONFIG.strategy = config.strategy;
      if (config.riskPerTrade) CONFIG.riskPerTrade = config.riskPerTrade;
      if (config.minProbability) CONFIG.minProbabilityThreshold = config.minProbability;
      if (config.maxDrawdown) CONFIG.maxDrawdown = config.maxDrawdown;
      if (config.maxConcurrentTrades) CONFIG.maxConcurrentTrades = config.maxConcurrentTrades;
      if (config.symbols) CONFIG.symbols = config.symbols;

      // Update risk parameters
      risk.updateParameters({
        maxDrawdown: config.MAX_DRAWDOWN,
        maxDailyLoss: config.MAX_DAILY_LOSS,
        maxConsecutiveLosses: config.MAX_CONSECUTIVE_LOSSES
      });

      // Reinitialize portfolio with new symbols
      portfolio.initialize(CONFIG.symbols);

      logger.info('Configuration updated from UI');
      this.sendStatusToUI();
    } catch (error) {
      logger.error('Error updating config from UI:', error);
    }
  }

  runBacktestFromUI() {
    // Run backtest asynchronously
    setImmediate(async () => {
      try {
        for (const symbol of CONFIG.symbols) {
          const result = await backtest.runBacktest(CONFIG.strategy, symbol, {
            maxTrades: config.DEFAULT_BACKTEST_TRADES,
            riskPerTrade: config.RISK_PER_TRADE
          });

          logger.info(`Backtest completed for ${symbol}: Win Rate ${result.performance.winRate.toFixed(3)}`);
        }
      } catch (error) {
        logger.error('Backtest error from UI:', error);
      }
    });
  }

  retrainModelsFromUI() {
    // Retrain models asynchronously
    setImmediate(async () => {
      try {
        for (const symbol of CONFIG.symbols) {
          const ticks = db.getRecentTicks(symbol, 5000);
          if (ticks.length >= 1000) {
            await ml.trainModel(symbol, ticks);
            logger.info(`Retrained ML model for ${symbol}`);
          }
        }
      } catch (error) {
        logger.error('Model retraining error from UI:', error);
      }
    });
  }

  stopTrading() {
    // Stop the trading loop by setting a flag
    this.tradingEnabled = false;
    logger.info('Trading stopped');
    this.sendStatusToUI();
  }

  sendStatusToUI() {
    const statusMessage = {
      type: 'status',
      authorized: this.authorized,
      tradingEnabled: this.tradingEnabled || false,
      connected: this.isConnected,
      strategy: CONFIG.strategy,
      riskPerTrade: CONFIG.riskPerTrade,
      activeTrades: this.activeTrades.size,
      balance: risk.portfolioStats.totalBalance
    };

    this.broadcastToUI(statusMessage);
  }

  sendPerformanceToUI() {
    const performanceData = {
      totalTrades: this.performanceMetrics.totalTrades,
      winRate: this.performanceMetrics.winRate,
      totalProfit: this.performanceMetrics.totalProfit,
      profitFactor: this.performanceMetrics.profitFactor,
      currentDrawdown: risk.portfolioStats.currentDrawdown,
      sharpeRatio: this.performanceMetrics.sharpeRatio
    };

    this.broadcastToUI({
      type: 'performance',
      data: performanceData
    });
  }

  sendTradeToUI(tradeData) {
    this.broadcastToUI({
      type: 'trade',
      data: tradeData
    });
  }

  sendPortfolioToUI() {
    const portfolioData = {
      balance: risk.portfolioStats.totalBalance,
      activeTrades: this.activeTrades.size
    };

    this.broadcastToUI({
      type: 'portfolio',
      data: portfolioData
    });
  }

  sendMLStatusToUI() {
    const mlData = {
      trainedModels: CONFIG.symbols.filter(symbol => ml.getModelStatus(symbol).hasNeuralNetwork).length,
      lastRetraining: new Date().toLocaleString(), // Could track actual last retraining time
      accuracy: 0.85, // Placeholder - would need to calculate from recent performance
      currentStrategy: CONFIG.strategy,
      dataProgress: Math.min(100, (db.getTickCount(CONFIG.symbols[0]) / CONFIG.minSamplesRequired) * 100)
    };

    this.broadcastToUI({
      type: 'ml_status',
      data: mlData
    });
  }

  sendMarketDataToUI() {
    // Calculate some basic market metrics
    const marketData = {
      bestSymbol: CONFIG.symbols[0], // Placeholder
      sentiment: 'Neutral', // Would need sentiment analysis
      volatility: 0.5, // Placeholder
      correlation: 'Low' // Placeholder
    };

    this.broadcastToUI({
      type: 'market_data',
      data: marketData
    });
  }

  broadcastToUI(message) {
    const messageStr = JSON.stringify(message);
    this.uiClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  scheduleTasks() {
    // Daily backtest and performance analysis
    cron.schedule(`0 ${config.DAILY_BACKTEST_HOUR} * * *`, async () => {
      logger.info('Running scheduled backtest...');
      await this.runScheduledBacktest();
    });

    // ML model retraining - use minutes for intervals < 1 hour
    const mlIntervalHours = config.ML_RETRAINING_INTERVAL_MS / (1000 * 60 * 60);
    let mlCronExpression;
    if (mlIntervalHours >= 1) {
      // Use hours for intervals >= 1 hour
      mlCronExpression = `0 */${Math.floor(mlIntervalHours)} * * *`;
    } else {
      // Use minutes for intervals < 1 hour
      const mlIntervalMinutes = Math.floor(config.ML_RETRAINING_INTERVAL_MS / (1000 * 60));
      mlCronExpression = `*/${mlIntervalMinutes} * * * *`;
    }

    cron.schedule(mlCronExpression, async () => {
      logger.info('Retraining ML models...');
      await this.retrainModels();
    });

    // Performance reporting
    cron.schedule(`0 */${config.PERFORMANCE_REPORT_INTERVAL_HOURS} * * *`, () => {
      this.generatePerformanceReport();
    });

    // Data cleanup
    cron.schedule(`0 ${config.DATABASE_CLEANUP_HOUR} * * *`, () => {
      db.cleanup();
      logger.info('Database cleanup completed');
    });
  }

  async connect() {
    try {
      logger.info('Connecting to Deriv WebSocket...');
      this.ws = new WebSocket(config.DERIV_WEBSOCKET_URL + '?app_id=' + config.DERIV_APP_ID);

      this.ws.on('open', () => {
        logger.info('WebSocket connected');
        this.isConnected = true;
        this.authorize();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(JSON.parse(data.toString()));
      });

      this.ws.on('close', () => {
        logger.warn('WebSocket disconnected');
        this.isConnected = false;
        this.authorized = false;
        setTimeout(() => this.connect(), config.WS_RECONNECT_DELAY_MS);
      });

      this.ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
      });

    } catch (error) {
      logger.error('Connection error:', error);
      setTimeout(() => this.connect(), config.WS_RECONNECT_DELAY_MS);
    }
  }

  authorize() {
    if (!this.ws || !CONFIG.apiToken) {
      logger.error('Cannot authorize: missing WebSocket or API token');
      return;
    }

    const authRequest = {
      authorize: CONFIG.apiToken
    };

    this.sendRequest(authRequest);
    logger.info('Authorization request sent - will start trading automatically when authorized');
  }

  async startTrading() {
    if (!this.authorized) {
      logger.warn('Cannot start trading: not authorized');
      return;
    }

    logger.info('Starting trading bot...');
    this.tradingEnabled = true;

    // Subscribe to tick data for all symbols
    for (const symbol of CONFIG.symbols) {
      await this.subscribeToTicks(symbol);
    }

    // Start the trading loop
    this.startTradingLoop();

    // Send status update to UI
    this.sendStatusToUI();
  }

  async subscribeToTicks(symbol) {
    if (this.symbolSubscriptions.has(symbol)) {
      return; // Already subscribed
    }

    const tickRequest = {
      ticks: symbol,
      subscribe: 1
    };

    this.sendRequest(tickRequest);
    this.symbolSubscriptions.set(symbol, true);
    this.tickBuffers.set(symbol, []);

    logger.info(`Subscribed to ${symbol} ticks`);
  }

  startTradingLoop() {
    // Check for trading opportunities every 2 seconds
    setInterval(async () => {
      if (!this.isConnected || !this.authorized || !this.tradingEnabled) return;
      if (this.activeTrades.size >= CONFIG.maxConcurrentTrades) return;
      if (Date.now() - this.lastTradeTime < CONFIG.tradeCooldown) return;

      // Check risk management
      const riskCheck = risk.shouldStopTrading();
      if (riskCheck.stop) {
        logger.warn(`Trading stopped due to risk: ${riskCheck.reason}`);
        return;
      }

      // Evaluate all symbols for trading opportunities
      for (const symbol of CONFIG.symbols) {
        try {
          const opportunity = await this.evaluateTradingOpportunity(symbol);
          if (opportunity) {
            await this.executeTrade(opportunity);
            break; // Only one trade per cycle
          }
        } catch (error) {
          logger.error(`Error evaluating ${symbol}:`, error);
        }
      }
    }, 2000);
  }

  async evaluateTradingOpportunity(symbol) {
    // Check if we have enough data
    const tickCount = db.getTickCount(symbol);
    if (tickCount < CONFIG.minSamplesRequired) {
      return null; // Not enough data
    }

    // Get recent ticks
    const recentTicks = db.getRecentTicks(symbol, 100);
    if (recentTicks.length < 10) return null;

    // Get digit frequencies
    const { data: digitFreq, totalSamples } = db.getDigitFrequencies(symbol);
    if (totalSamples < CONFIG.minSamplesRequired) return null;

    // Calculate current probabilities
    const probabilities = {};
    for (let digit = 0; digit <= 9; digit++) {
      probabilities[digit] = totalSamples > 0 ? (digitFreq[digit] || 0) / totalSamples * 100 : 0;
    }

    // Get recent digits for pattern analysis
    const recentDigits = recentTicks.map(tick => tick.last_digit);

    // Use selected strategy to predict next digit
    const prediction = await this.generatePrediction(symbol, {
      probabilities,
      recentDigits,
      totalSamples,
      currentDigit: recentDigits[recentDigits.length - 1]
    });

    if (!prediction || prediction.probability < CONFIG.minProbabilityThreshold) {
      return null;
    }

    // Validate with backtest if enabled
    if (CONFIG.useBacktestValidation) {
      const isValid = await this.validateWithBacktest(symbol, prediction);
      if (!isValid) {
        logger.debug(`Backtest validation failed for ${symbol} prediction ${prediction.digit}`);
        return null;
      }
    }

    // Calculate stake size using Kelly Criterion
    const stake = this.calculateStakeSize(symbol, prediction, probabilities);

    return {
      symbol,
      prediction: prediction.digit,
      stake,
      probability: prediction.probability,
      confidence: prediction.confidence,
      strategy: CONFIG.strategy
    };
  }

  async generatePrediction(symbol, context) {
    switch (CONFIG.strategy) {
      case 'frequency':
        return this.predictWithFrequency(context.probabilities);

      case 'markov':
        return ml.predictWithMarkov(symbol, context.currentDigit);

      case 'neural':
        return ml.predict(symbol, context.recentDigits);

      case 'ensemble':
        return ml.predictEnsemble(symbol, context.currentDigit, context.recentDigits);

      case 'time_series':
        return this.predictWithTimeSeries(context.recentDigits);

      default:
        return this.predictWithFrequency(context.probabilities);
    }
  }

  predictWithFrequency(probabilities) {
    let maxProb = 0;
    let predictedDigit = null;

    for (let digit = 0; digit <= 9; digit++) {
      if (probabilities[digit] > maxProb) {
        maxProb = probabilities[digit];
        predictedDigit = digit;
      }
    }

    return predictedDigit !== null ? {
      digit: predictedDigit,
      probability: maxProb,
      confidence: maxProb / 100
    } : null;
  }

  predictWithTimeSeries(recentDigits) {
    if (recentDigits.length < 5) return null;

    // Simple trend analysis
    const series = recentDigits.slice(-10);
    const trend = series[series.length - 1] - series[series.length - 2];
    const predicted = Math.max(0, Math.min(9, series[series.length - 1] + trend));

    return {
      digit: Math.round(predicted),
      probability: 50, // Placeholder
      confidence: 0.5
    };
  }

  async validateWithBacktest(symbol, prediction) {
    try {
      // Run quick backtest on recent data
      const backtestResult = await backtest.runBacktest(CONFIG.strategy, symbol, {
        maxTrades: Math.floor(config.DEFAULT_BACKTEST_TRADES / 2),
        riskPerTrade: config.RISK_PER_TRADE
      });

      // Check if strategy is profitable
      return backtestResult.performance.winRate > 0.5 &&
             backtestResult.performance.profitFactor > 1.1;

    } catch (error) {
      logger.error('Backtest validation error:', error);
      return false;
    }
  }

  calculateStakeSize(symbol, prediction, probabilities) {
    const currentBalance = portfolio.getBalance();

    // Use Kelly Criterion
    const winRate = prediction.probability / 100;
    const avgWin = config.PAYOUT_MULTIPLIER - 1; // Net payout (1.8 - 1 = 0.8)
    const avgLoss = 1.0; // Lose stake

    const kellyStake = risk.calculateKellyStake(winRate, avgWin, avgLoss, currentBalance, config.KELLY_FRACTION);
    const riskStake = currentBalance * config.RISK_PER_TRADE;

    // Apply diversification check
    const maxSymbolStake = portfolio.getMaxStakeForSymbol(symbol);

    return Math.min(kellyStake, riskStake, maxSymbolStake, currentBalance * config.MAX_STAKE_MULTIPLIER);
  }

  async executeTrade(opportunity) {
    try {
      logger.info(`Executing trade: ${opportunity.symbol} -> ${opportunity.prediction} ($${opportunity.stake.toFixed(2)})`);

      // Create trade request
      const tradeRequest = {
        buy: 1,
        parameters: {
          amount: opportunity.stake,
          basis: 'stake',
          contract_type: 'DIGITDIFF',
          currency: 'USD',
          duration: 1,
          duration_unit: 't',
          symbol: opportunity.symbol,
          barrier: opportunity.prediction.toString()
        }
      };

      // Send trade request
      const response = await this.sendRequestAsync(tradeRequest);

      if (response.error) {
        logger.error('Trade execution failed:', response.error);
        return;
      }

      // Record the trade
      const tradeId = response.buy.contract_id;
      const tradeRecord = {
        id: tradeId,
        symbol: opportunity.symbol,
        timestamp: Date.now(),
        prediction: opportunity.prediction,
        stake: opportunity.stake,
        result: 'pending',
        strategy: opportunity.strategy,
        probability: opportunity.probability,
        confidence: opportunity.confidence
      };

      this.activeTrades.set(tradeId, tradeRecord);
      db.insertTrade(
        opportunity.symbol,
        Date.now(),
        opportunity.prediction,
        opportunity.stake,
        'pending'
      );

      this.lastTradeTime = Date.now();

      // Subscribe to contract updates
      this.subscribeToContract(tradeId);

      logger.info(`Trade ${tradeId} executed successfully`);

    } catch (error) {
      logger.error('Trade execution error:', error);
    }
  }

  subscribeToContract(contractId) {
    const request = {
      proposal_open_contract: 1,
      contract_id: contractId,
      subscribe: 1
    };

    this.sendRequest(request);
  }

  async runScheduledBacktest() {
    try {
      for (const symbol of CONFIG.symbols) {
        const result = await backtest.runBacktest(CONFIG.strategy, symbol, {
          maxTrades: config.DEFAULT_BACKTEST_TRADES,
          riskPerTrade: config.RISK_PER_TRADE
        });

        logger.info(`Backtest ${symbol}: Win Rate ${result.performance.winRate.toFixed(3)}, Profit Factor ${result.performance.profitFactor.toFixed(2)}`);
      }
    } catch (error) {
      logger.error('Scheduled backtest error:', error);
    }
  }

  async retrainModels() {
    try {
      for (const symbol of CONFIG.symbols) {
        const ticks = db.getRecentTicks(symbol, 5000);
        if (ticks.length >= 1000) {
          await ml.trainModel(symbol, ticks);
          logger.info(`Retrained ML model for ${symbol}`);
        }
      }
    } catch (error) {
      logger.error('Model retraining error:', error);
    }
  }

  generatePerformanceReport() {
    const stats = db.getTradeStats();
    const riskReport = risk.generateRiskReport();

    logger.info('=== Performance Report ===');
    logger.info(`Total Trades: ${stats.total_trades}`);
    logger.info(`Win Rate: ${((stats.wins / stats.total_trades) * 100).toFixed(2)}%`);
    logger.info(`Total Profit: $${stats.total_profit.toFixed(2)}`);
    logger.info(`Average Profit: $${stats.avg_profit.toFixed(2)}`);
    logger.info(`Current Drawdown: ${(riskReport.portfolio.currentDrawdown * 100).toFixed(2)}%`);
    logger.info('========================');

    // Send updates to UI
    this.sendPerformanceToUI();
    this.sendPortfolioToUI();
  }

  handleMessage(message) {
    try {
      if (message.msg_type === 'authorize') {
        if (message.error) {
          logger.error('Authorization failed:', message.error);
          return;
        }
        this.authorized = true;
        logger.info('Successfully authorized - starting trading automatically');
        // Auto-start trading when authorized
        setTimeout(() => this.startTrading(), 1000);

      } else if (message.msg_type === 'tick') {
        this.handleTick(message.tick);

      } else if (message.msg_type === 'proposal_open_contract') {
        this.handleContractUpdate(message.proposal_open_contract);

      } else if (message.msg_type === 'buy') {
        // Trade confirmation
        logger.debug('Trade confirmed:', message.buy);

      } else if (message.error) {
        logger.error('API Error:', message.error);
      }

    } catch (error) {
      logger.error('Message handling error:', error);
    }
  }

  handleTick(tick) {
    const { symbol, quote, epoch } = tick;
    const lastDigit = parseInt(quote.toString().split('.')[1]?.[0] || '0');

    // Store tick data
    db.insertTick(symbol, epoch * 1000, quote, lastDigit);

    // Update tick buffer
    const buffer = this.tickBuffers.get(symbol) || [];
    buffer.push({ timestamp: epoch * 1000, quote, last_digit: lastDigit });
    if (buffer.length > 1000) buffer.shift();
    this.tickBuffers.set(symbol, buffer);

    // Update portfolio with latest price
    portfolio.updatePrice(symbol, quote);
  }

  handleContractUpdate(contract) {
    const { contract_id, status, profit } = contract;

    if (!this.activeTrades.has(contract_id)) return;

    const trade = this.activeTrades.get(contract_id);

    if (status === 'won' || status === 'lost') {
      // Trade completed
      trade.result = status;
      trade.profit = profit || 0;
      trade.payout = trade.stake + profit;

      // Update database
      db.updateTrade(contract_id, status, trade.payout, trade.profit);

      // Update risk management
      risk.updatePortfolioStats(status === 'won', trade.stake, trade.profit);

      // Update performance metrics
      this.updatePerformanceMetrics(trade);

      // Send trade update to UI
      this.sendTradeToUI({
        id: contract_id,
        symbol: trade.symbol,
        prediction: trade.prediction,
        stake: trade.stake,
        result: status,
        profit: trade.profit,
        timestamp: trade.timestamp
      });

      // Send portfolio update to UI
      this.sendPortfolioToUI();

      // Remove from active trades
      this.activeTrades.delete(contract_id);

      logger.info(`Trade ${contract_id} completed: ${status}, Profit: $${trade.profit.toFixed(2)}`);
    }
  }

  updatePerformanceMetrics(trade) {
    this.performanceMetrics.totalTrades++;
    if (trade.result === 'won') {
      this.performanceMetrics.wins++;
    } else {
      this.performanceMetrics.losses++;
    }
    this.performanceMetrics.totalProfit += trade.profit;

    // Recalculate derived metrics
    this.performanceMetrics.winRate = this.performanceMetrics.wins / this.performanceMetrics.totalTrades;
    // Add more metric calculations as needed
  }

  sendRequest(request) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const requestId = Math.random().toString(36).substr(2, 9);
      const fullRequest = { ...request, req_id: requestId };
      this.ws.send(JSON.stringify(fullRequest));
    }
  }

  sendRequestAsync(request) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = Math.random().toString(36).substr(2, 9);
      const fullRequest = { ...request, req_id: requestId };

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, config.WS_REQUEST_TIMEOUT_MS);

      const messageHandler = (data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.req_id === requestId) {
            clearTimeout(timeout);
            this.ws.removeListener('message', messageHandler);
            resolve(response);
          }
        } catch (error) {
          clearTimeout(timeout);
          this.ws.removeListener('message', messageHandler);
          reject(error);
        }
      };

      this.ws.on('message', messageHandler);
      this.ws.send(JSON.stringify(fullRequest));
    });
  }

  async shutdown() {
    logger.info('Shutting down bot...');

    if (this.ws) {
      this.ws.close();
    }

    // Save final performance metrics
    const finalStats = db.getTradeStats();
    db.insertPerformance(Date.now(), finalStats.total_profit, this.performanceMetrics.winRate, 0, 0, 0, finalStats.total_trades);

    logger.info('Bot shutdown complete');
  }
}

// Start the bot
const bot = new DerivBot();

// Graceful shutdown
process.on('SIGINT', async () => {
  await bot.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await bot.shutdown();
  process.exit(0);
});

// Connect and start
bot.connect();

module.exports = bot;
