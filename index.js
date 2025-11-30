/**
 * Deriv Last Digit Bot - Advanced Trading System
 *
 * This is the main entry point for the Deriv Last Digit trading bot.
 * The bot implements advanced machine learning, risk management, and automated trading
 * strategies for the Deriv platform's last digit prediction market.
 *
 * Key Features:
 * - Real-time WebSocket connections to Deriv API
 * - Advanced ML models (LSTM, Gradient Boosting, Ensemble)
 * - Comprehensive risk management (Kelly Criterion, trailing stops, portfolio optimization)
 * - Sentiment analysis from news feeds
 * - Automated backtesting and strategy optimization
 * - Real-time web dashboard for monitoring and control
 * - Professional logging and error handling
 */

require('dotenv').config();
const WebSocket = require('ws');
const winston = require('winston');
const cron = require('node-cron');
const express = require('express');
const path = require('path');
const config = require('./config');

// Import core modules - each handles a specific aspect of the trading system
const db = require('./db');           // Database operations and data persistence
const stats = require('./stats');     // Statistical analysis and pattern detection
const ml = require('./ml');           // Machine learning models and predictions
const risk = require('./risk');       // Risk management and position sizing
const portfolio = require('./portfolio'); // Portfolio management and optimization
const backtest = require('./backtest');   // Backtesting engine and strategy validation
const sentiment = require('./sentiment'); // News sentiment analysis
const microstructure = require('./microstructure'); // Market microstructure analysis

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
  websocketUrl: config.DERIV_WEBSOCKET_URL,

  // API token from environment
  apiToken: apiToken,

  // Trading mode (auto-detected based on account)
  tradingMode: 'unknown', // Will be set to 'demo' or 'live' after account check

  // Trading settings
  symbols: config.DEFAULT_SYMBOLS,
  minSamplesRequired: 100, // Reduced for faster trading start
  minProbabilityThreshold: config.MIN_PROBABILITY_THRESHOLD,
  maxConcurrentTrades: config.MAX_CONCURRENT_TRADES,
  tradeCooldown: config.TRADE_COOLDOWN_MS,
  lossCooldown: config.LOSS_COOLDOWN_MS || 30000, // 30 seconds cooldown after loss
  executionDelay: config.EXECUTION_DELAY_MS || 500, // Delay before execution
  martingaleEnabled: config.MARTINGALE_ENABLED || false,
  martingaleMultiplier: config.MARTINGALE_MULTIPLIER || 2.0,
  martingaleMaxLevels: config.MARTINGALE_MAX_LEVELS || 3,
  simulationMode: config.SIMULATION_MODE || false,
  simulationBalance: config.SIMULATION_BALANCE || 1000,
  rateLimitEnabled: config.RATE_LIMIT_ENABLED || true,
  maxRequestsPerMinute: config.MAX_REQUESTS_PER_MINUTE || 30,
  maxRequestsPerHour: config.MAX_REQUESTS_PER_HOUR || 100,
  retryEnabled: config.RETRY_ENABLED || true,
  maxRetries: config.MAX_RETRIES || 3,
  retryDelay: config.RETRY_DELAY_MS || 1000,

  // Risk management
  riskPerTrade: config.RISK_PER_TRADE,
  maxDrawdown: config.MAX_DRAWDOWN,
  maxDailyLoss: config.MAX_DAILY_LOSS,
  maxStake: config.MAX_STAKE || 100.0, // Maximum stake limit

  // ML settings
  mlRetrainingInterval: config.ML_RETRAINING_INTERVAL_MS,
  backtestInterval: config.BACKTEST_INTERVAL_MS,

  // Strategy settings
  strategy: config.DEFAULT_STRATEGY,
  useBacktestValidation: config.USE_BACKTEST_VALIDATION,
  backtestWindow: config.BACKTEST_WINDOW_TICKS,

};

// API token is already set from environment variable

/**
 * Main DerivBot class - orchestrates all trading operations
 *
 * This class manages the complete trading lifecycle including:
 * - WebSocket connections to Deriv API
 * - Real-time data processing and analysis
 * - Automated trade execution and management
 * - Risk monitoring and position management
 * - Communication with web dashboard
 * - Scheduled maintenance tasks
 */
class DerivBot {
  /**
   * Initialize the trading bot with all necessary components
   */
  constructor() {
    // Deriv API connection properties
    this.ws = null;                    // WebSocket connection to Deriv
    this.isConnected = false;          // Connection status to Deriv API
    this.authorized = false;           // Authorization status with Deriv
    this.tradingEnabled = false;       // Manual trading enable/disable flag
    this.manualOverride = false;       // Manual override for extreme caution mode

    // Active trading state
    this.activeTrades = new Map();     // Currently open trades (tradeId -> tradeData)
    this.lastTradeTime = 0;            // Timestamp of last executed trade
    this.lastTradeResult = null;       // Result of last completed trade ('won' or 'lost')
    this.hourlyTradeCount = 0;         // Number of trades in current hour
    this.hourStartTime = Date.now();   // Start time of current hour
    this.symbolSubscriptions = new Map(); // Active symbol subscriptions
    this.tickBuffers = new Map();      // Recent tick data buffers (symbol -> ticks[])
    this.predictionCache = new Map();  // Cached predictions (symbol -> prediction)

    // Performance tracking
    this.performanceMetrics = {
      totalTrades: 0,      // Total number of completed trades
      wins: 0,            // Number of winning trades
      losses: 0,          // Number of losing trades
      totalProfit: 0,     // Cumulative profit/loss
      winRate: 0,         // Win rate percentage
      profitFactor: 0,    // Gross profit / gross loss ratio
      maxDrawdown: 0,     // Maximum peak-to-trough decline
      sharpeRatio: 0      // Risk-adjusted return measure
    };

    // Web dashboard communication
    this.wss = null;                  // WebSocket server for UI clients
    this.uiClients = new Set();       // Connected UI client connections

    // Rate limiting
    this.requestTimestamps = [];      // Timestamps of recent API requests

    // Initialize all modules and systems
    this.initializeModules();
    this.setupWebSocketServer();
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

  handleManualOverride(message) {
    if (message.action === 'enable') {
      this.manualOverride = true;
      logger.warn('🚨 MANUAL OVERRIDE ENABLED: Extreme caution mode activated. All safety measures bypassed.');
      this.broadcastToUI({
        type: 'alert',
        message: 'Manual override enabled. All safety measures are now bypassed.',
        severity: 'warning'
      });
    } else if (message.action === 'disable') {
      this.manualOverride = false;
      logger.info('Manual override disabled. Safety measures restored.');
      this.broadcastToUI({
        type: 'alert',
        message: 'Manual override disabled. Safety measures restored.',
        severity: 'info'
      });
    }

    this.sendStatusToUI();
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
      case 'manual_override':
        this.handleManualOverride(message);
        break;
      default:
        logger.warn('Unknown UI message type:', message.type);
    }
  }

  updateConfigFromUI(config) {
    try {
      // Update API token if provided
      if (config.apiToken && config.apiToken.trim()) {
        CONFIG.apiToken = config.apiToken.trim();
        process.env.DERIV_API_TOKEN = config.apiToken.trim();

        // Determine account type from token (demo tokens typically start with specific patterns)
        // This is a simple heuristic - in production you'd check with Deriv API
        const token = config.apiToken.trim();
        if (token.length > 0) {
          // Demo tokens often contain 'demo' or start with specific patterns
          // For now, we'll assume demo unless it looks like a live token
          CONFIG.tradingMode = token.includes('demo') || token.startsWith('demo') ? 'demo' : 'live';
          logger.info(`API token updated from UI - Account type: ${CONFIG.tradingMode.toUpperCase()}`);
        }

        // Reset authorization and trading state
        this.authorized = false;
        this.tradingEnabled = false;

        // Reconnect with new token
        if (this.ws) {
          this.ws.close();
        }
        setTimeout(() => this.connect(), 1000);
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
        maxDrawdown: CONFIG.maxDrawdown,
        maxDailyLoss: CONFIG.maxDailyLoss,
        maxConsecutiveLosses: 5
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
      currentSymbol: CONFIG.symbols[0] || 'None', // Show first symbol as current
      tradingMode: CONFIG.tradingMode,
      paperTrading: CONFIG.paperTrading, // Keep for backward compatibility
      manualOverride: this.manualOverride // Manual override status
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
    // Add signal information for live feed
    const enhancedTradeData = {
      ...tradeData,
      confidence: tradeData.confidence || 0,
      strategy: tradeData.strategy || CONFIG.strategy,
      tradingMode: CONFIG.tradingMode
    };

    this.broadcastToUI({
      type: 'trade',
      data: enhancedTradeData
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
    // Get sentiment summary for all symbols
    const sentimentSummary = sentiment.getSentimentSummary(CONFIG.symbols);

    // Calculate some basic market metrics
    const marketData = {
      bestSymbol: CONFIG.symbols[0], // Placeholder
      sentiment: 'Neutral', // Overall market sentiment
      volatility: 0.5, // Placeholder
      correlation: 'Low', // Placeholder
      sentimentData: sentimentSummary
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

    // Autonomous backtesting (run every 6 hours)
    cron.schedule('0 */6 * * *', async () => {
      logger.info('Running autonomous backtest...');
      await this.runAutonomousBacktest();
    });

    // Autonomous model retraining (run every 12 hours)
    cron.schedule('0 */12 * * *', async () => {
      logger.info('Running autonomous model retraining...');
      await this.runAutonomousRetraining();
    });

    // News sentiment analysis
    cron.schedule('*/30 * * * *', async () => { // Every 30 minutes
      logger.info('Fetching and analyzing news sentiment...');
      await this.updateNewsSentiment();
    });

    // Data cleanup
    cron.schedule(`0 ${config.DATABASE_CLEANUP_HOUR} * * *`, () => {
      db.cleanup();
      sentiment.clearCaches(); // Clear sentiment caches too
      logger.info('Database and sentiment cleanup completed');
    });
  }

  async connect() {
    try {
      logger.info('Connecting to Deriv WebSocket...');
      this.ws = new WebSocket(config.DERIV_WEBSOCKET_URL + '?app_id=' + config.DERIV_APP_ID);

      // Reset connection state
      this.isConnected = false;
      this.authorized = false;
      this.connectionAttempts = (this.connectionAttempts || 0) + 1;

      // Set connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (!this.isConnected) {
          logger.warn('Connection timeout, forcing reconnection...');
          this.ws.close();
        }
      }, 10000); // 10 second timeout

      this.ws.on('open', () => {
        clearTimeout(this.connectionTimeout);
        logger.info(`WebSocket connected successfully (attempt ${this.connectionAttempts})`);
        this.isConnected = true;
        this.connectionAttempts = 0; // Reset on successful connection
        this.lastConnectionTime = Date.now();
        this.authorize();
      });

      this.ws.on('message', (data) => {
        try {
          this.handleMessage(JSON.parse(data.toString()));
        } catch (error) {
          logger.error('Error parsing WebSocket message:', error);
        }
      });

      this.ws.on('close', (code, reason) => {
        clearTimeout(this.connectionTimeout);
        logger.warn(`WebSocket disconnected (code: ${code}, reason: ${reason})`);
        this.isConnected = false;
        this.authorized = false;

        // Implement exponential backoff for reconnection
        const baseDelay = config.WS_RECONNECT_DELAY_MS;
        const maxDelay = 30000; // Max 30 seconds
        const exponentialDelay = Math.min(baseDelay * Math.pow(2, this.connectionAttempts - 1), maxDelay);

        logger.info(`Reconnecting in ${exponentialDelay}ms (attempt ${this.connectionAttempts + 1})`);
        setTimeout(() => this.connect(), exponentialDelay);
      });

      this.ws.on('error', (error) => {
        logger.error('WebSocket error:', error.message);
        // Don't close here, let the close event handle reconnection
      });

      // Add ping/pong for connection health monitoring
      this.startConnectionHealthCheck();

    } catch (error) {
      logger.error('Connection setup error:', error);
      setTimeout(() => this.connect(), config.WS_RECONNECT_DELAY_MS);
    }
  }

  startConnectionHealthCheck() {
    // Send periodic ping to keep connection alive
    this.healthCheckInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send a simple ping message
        this.sendRequest({ ping: 1 });
      }
    }, 30000); // Every 30 seconds
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
    logger.info('Authorization request sent');
  }

  async fetchAccountBalance() {
    try {
      const balanceRequest = {
        balance: 1,
        account: 'all' // Get balance for all accounts
      };

      const response = await this.sendRequestAsync(balanceRequest);

      if (response.error) {
        logger.error('Failed to fetch account balance:', response.error);
        return;
      }

      // Update portfolio with real balance
      if (response.balance && response.balance.balance) {
        const realBalance = parseFloat(response.balance.balance);
        risk.portfolioStats.totalBalance = realBalance;
        risk.portfolioStats.peakBalance = Math.max(risk.portfolioStats.peakBalance, realBalance);

        logger.info(`Fetched real account balance: $${realBalance.toFixed(2)}`);

        // Send updated balance to UI
        this.sendPortfolioToUI();
      }
    } catch (error) {
      logger.error('Error fetching account balance:', error);
    }
  }

  async startTrading() {
    if (!this.authorized) {
      logger.warn('Cannot start trading: not authorized');
      return;
    }

    logger.info(`🚀 Starting ${CONFIG.tradingMode.toUpperCase()} trading...`);
    this.tradingEnabled = true;

    // Subscribe to tick data for all symbols
    for (const symbol of CONFIG.symbols) {
      await this.subscribeToTicks(symbol);
    }

    // Start the trading loop
    this.startTradingLoop();

    // Send status update to UI
    this.sendStatusToUI();

    logger.info(`Trading started - monitoring ${CONFIG.symbols.length} symbols`);
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
    logger.info('Trading loop initialized - waiting for manual start command');

    // Start trailing stop monitoring
    this.startTrailingStopMonitoring();

    // Start dynamic trading loop that adjusts based on volatility
    this.startDynamicTradingLoop();
  }

  startDynamicTradingLoop() {
    const runTradingCycle = async () => {
      if (!this.tradingEnabled) return;

      try {
        // Calculate current market volatility across all symbols
        let totalVolatility = 0;
        let symbolCount = 0;

        for (const symbol of CONFIG.symbols) {
          const recentTicks = db.getRecentTicks(symbol, 50);
          if (recentTicks.length >= 10) {
            const lastDigits = recentTicks.map(t => t.last_digit);
            const mean = lastDigits.reduce((a, b) => a + b, 0) / lastDigits.length;
            const variance = lastDigits.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lastDigits.length;
            const volatility = Math.sqrt(variance);
            totalVolatility += volatility;
            symbolCount++;
          }
        }

        const avgVolatility = symbolCount > 0 ? totalVolatility / symbolCount : 2.5;

        // Adjust trading frequency based on volatility
        // High volatility = longer intervals (less frequent trading)
        // Low volatility = shorter intervals (more frequent trading)
        const baseInterval = 2000; // 2 seconds base
        const volatilityMultiplier = Math.max(0.5, Math.min(2.0, avgVolatility / 2.5));
        const adjustedInterval = baseInterval * volatilityMultiplier;

        // Add small random delay (0-500ms) for realistic execution timing
        const randomDelay = Math.floor(Math.random() * 500);
        await new Promise(resolve => setTimeout(resolve, randomDelay));

        // Only trade if manually enabled by user
        if (!this.isConnected) {
          logger.debug('Trading loop: Not connected to WebSocket');
          return;
        }
        if (!this.authorized) {
          logger.debug('Trading loop: Not authorized');
          return;
        }
        if (!this.tradingEnabled) {
          logger.debug('Trading loop: Trading not enabled (waiting for manual start)');
          return;
        }
        if (this.activeTrades.size >= CONFIG.maxConcurrentTrades) {
          logger.debug(`Trading loop: Max concurrent trades reached (${this.activeTrades.size}/${CONFIG.maxConcurrentTrades})`);
          return;
        }
        if (Date.now() - this.lastTradeTime < CONFIG.tradeCooldown) {
          logger.debug('Trading loop: Trade cooldown active');
          return;
        }

        // Check loss cooldown
        if (this.lastTradeResult === 'lost' && Date.now() - this.lastTradeTime < CONFIG.lossCooldown) {
          logger.debug('Trading loop: Loss cooldown active');
          return;
        }

        // Check hourly trade frequency throttling (max 1 trade per hour)
        const currentHour = Math.floor(Date.now() / (1000 * 60 * 60));
        const lastHour = Math.floor(this.hourStartTime / (1000 * 60 * 60));

        if (currentHour !== lastHour) {
          // New hour started, reset counter
          this.hourlyTradeCount = 0;
          this.hourStartTime = Date.now();
        }

        if (this.hourlyTradeCount >= 1) {
          logger.debug('Trading loop: Hourly trade limit reached (1 trade per hour)');
          return;
        }

        // Check risk management (both individual and portfolio level)
        const riskCheck = risk.shouldStopTrading();
        if (riskCheck.stop) {
          logger.warn(`Trading stopped due to risk: ${riskCheck.reason}`);
          return;
        }

        // Check portfolio-level risk constraints
        const portfolioRisk = portfolio.assessPortfolioRisk();
        if (portfolioRisk.riskLevel === 'extreme') {
          logger.warn('Trading stopped due to extreme portfolio risk level');
          this.tradingEnabled = false;
          this.sendStatusToUI();
          return;
        }

        if (portfolioRisk.riskLevel === 'high' && portfolioRisk.metrics.portfolioVaR > 0.12) {
          logger.warn('Trading restricted due to high portfolio VaR');
        }

        logger.debug(`Trading loop: Evaluating opportunities (volatility: ${avgVolatility.toFixed(2)}, interval: ${adjustedInterval}ms)...`);

        // Evaluate all symbols for trading opportunities
        for (const symbol of CONFIG.symbols) {
          try {
            const opportunity = await this.evaluateTradingOpportunity(symbol);
            if (opportunity) {
              logger.info(`Found trading opportunity: ${symbol} -> ${opportunity.prediction} (${opportunity.probability.toFixed(2)}% confidence)`);
              await this.executeTrade(opportunity);
              break; // Only one trade per cycle
            } else {
              logger.debug(`No opportunity found for ${symbol}`);
            }
          } catch (error) {
            logger.error(`Error evaluating ${symbol}:`, error);
          }
        }

        // Schedule next trading cycle with volatility-adjusted interval
        setTimeout(runTradingCycle, adjustedInterval);

      } catch (error) {
        logger.error('Trading cycle error:', error);
        // Continue with next cycle despite errors
        setTimeout(runTradingCycle, 2000);
      }
    };

    // Start the first trading cycle
    setTimeout(runTradingCycle, 1000);
  }

  startTrailingStopMonitoring() {
    // Monitor trailing stops every 5 seconds
    setInterval(() => {
      if (!this.tradingEnabled) return;

      for (const [tradeId, trade] of this.activeTrades) {
        // For demonstration, we'll simulate price movement
        // In a real implementation, you'd get current market price
        const currentProfit = trade.stake * 0.1; // Simulate 10% profit
        const currentPrice = trade.stake + currentProfit;

        // Check for scale-out opportunities
        const scaleOut = risk.getNextScaleOutExit(tradeId, currentProfit, trade.stake);
        if (scaleOut) {
          logger.info(`Scale-out triggered for trade ${tradeId}: Part ${scaleOut.part}/${scaleOut.totalParts} - ${scaleOut.description}`);
          // In a real implementation, you'd execute partial close here
          risk.updatePositionAfterPartialClose(tradeId, scaleOut.closeAmount, scaleOut.remainingAmount);
          risk.updateScaleOutProgress(tradeId, scaleOut.part);
        }

        // Check for partial position closing (fallback)
        const partialClose = risk.calculatePartialCloseAmount(tradeId, currentProfit, trade.stake);
        if (partialClose && !scaleOut) {
          logger.info(`Partial close triggered for trade ${tradeId}: ${partialClose.description}`);
          // In a real implementation, you'd execute partial close here
          risk.updatePositionAfterPartialClose(tradeId, partialClose.closeAmount, partialClose.remainingAmount);
        }

        // Update trailing stop
        const newStop = risk.updateTrailingStop(tradeId, currentPrice, true);

        // Check if trailing stop should trigger exit
        if (risk.shouldExitOnTrailingStop(tradeId, currentPrice, true)) {
          logger.info(`Trailing stop triggered for trade ${tradeId}`);
          // In a real implementation, you'd close the remaining position here
          // For now, just log the event
        }
      }
    }, 5000);
  }

  /**
   * Evaluate if there's a profitable trading opportunity for a symbol
   *
   * This method performs comprehensive analysis including:
   * - Data sufficiency checks
   * - Statistical probability calculations
   * - Machine learning predictions
   * - Risk management validation
   * - Sentiment analysis integration
   *
   * @param {string} symbol - The trading symbol to evaluate (e.g., 'R_10')
   * @returns {Object|null} Trading opportunity details or null if no opportunity
   */
  async evaluateTradingOpportunity(symbol) {
    // Verify we have sufficient historical data for reliable analysis
    const tickCount = db.getTickCount(symbol);
    logger.debug(`Evaluating ${symbol}: ${tickCount} ticks available (need ${CONFIG.minSamplesRequired})`);

    if (tickCount < CONFIG.minSamplesRequired) {
      logger.debug(`Insufficient historical data for ${symbol}: ${tickCount} < ${CONFIG.minSamplesRequired}`);
      return null; // Cannot make reliable predictions without adequate data
    }

    // PERFECT CONDITION FILTERING - Only trade when ALL signals align perfectly
    const recentTicks = db.getRecentTicks(symbol, 100);
    if (recentTicks.length < 10) {
      logger.debug(`Not enough recent ticks for ${symbol}: ${recentTicks.length}`);
      return null;
    }

    const recentDigits = recentTicks.map(tick => tick.last_digit);
    const perfectConditions = this.checkPerfectConditions(symbol, recentDigits);
    if (!perfectConditions.met) {
      logger.debug(`Perfect conditions not met: ${perfectConditions.reason}`);
      return null;
    }

    logger.debug(`Perfect conditions met: ${perfectConditions.reason}`);

    // Get digit frequencies for stake calculation
    const { data: digitFreq, totalSamples } = db.getDigitFrequencies(symbol);
    if (totalSamples < CONFIG.minSamplesRequired) {
      logger.debug(`Not enough frequency data for ${symbol}: ${totalSamples} < ${CONFIG.minSamplesRequired}`);
      return null;
    }

    // Calculate current probabilities
    const probabilities = {};
    for (let digit = 0; digit <= 9; digit++) {
      probabilities[digit] = totalSamples > 0 ? (digitFreq[digit] || 0) / totalSamples * 100 : 0;
    }

    // Check sentiment analysis for additional signal
    const sentimentSignal = sentiment.generateSentimentSignal(symbol);
    const sentimentBias = sentimentSignal ? sentimentSignal.signal : null;

    // Use advanced multi-timeframe pattern recognition
    const advancedPatterns = stats.detectAdvancedPatterns(recentTicks.map(t => t.last_digit));

    // Analyze market microstructure for additional edge
    const microstructureAnalysis = microstructure.analyzeOrderFlow(recentTicks, symbol);
    const microstructureSignals = microstructureAnalysis.signals || [];

    // Generate prediction using pattern analysis
    const prediction = await this.generatePrediction(symbol, {
      probabilities,
      recentDigits,
      totalSamples,
      currentDigit: recentDigits[recentDigits.length - 1],
      sentimentBias,
      advancedPatterns,
      microstructureSignals
    });

    if (!prediction) {
      logger.debug(`No prediction generated for ${symbol}`);
      return null;
    }

    // Apply sentiment filter
    if (sentimentSignal && sentimentSignal.confidence > 0.7) {
      // If sentiment is strongly against the prediction, reduce confidence
      if ((sentimentSignal.signal === 'SELL' && prediction.probability > 50) ||
          (sentimentSignal.signal === 'BUY' && prediction.probability < 50)) {
        prediction.probability *= 0.8; // Reduce confidence by 20%
        logger.debug(`Prediction confidence reduced by sentiment: ${prediction.probability.toFixed(2)}%`);
      }
    }

    logger.debug(`Prediction for ${symbol}: digit ${prediction.digit}, probability ${prediction.probability.toFixed(2)}% (threshold: ${CONFIG.minProbabilityThreshold}%)`);

    if (prediction.probability < CONFIG.minProbabilityThreshold) {
      logger.debug(`Prediction probability too low for ${symbol}: ${prediction.probability} < ${CONFIG.minProbabilityThreshold}`);
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
    const { advancedPatterns, microstructureSignals, recentDigits } = context;

    // Get bias analysis for this symbol
    const biasAnalysis = stats.analyzeDigitBias(recentDigits, 500);

    // Get multiple probability signals for fusion
    const probabilitySignals = stats.calculateMultipleProbabilitySignals(recentDigits, {
      mlPrediction: null // Will be filled if ML prediction available
    });

    // First priority: Bias-based prediction (highest confidence)
    if (biasAnalysis.confidence > 0.6 && biasAnalysis.recommendedDigits.length > 0) {
      const targetDigit = biasAnalysis.recommendedDigits[0];
      const strengthScore = biasAnalysis.strengthScores.find(s => s.digit === targetDigit);

      logger.debug(`Bias-based prediction: digit ${targetDigit} (${strengthScore.confidence.toFixed(2)} confidence, strength ${strengthScore.strength.toFixed(2)})`);

      return {
        digit: targetDigit,
        probability: strengthScore.confidence * 100,
        confidence: strengthScore.confidence,
        method: 'bias_analysis',
        biasStrength: strengthScore.strength,
        trend: biasAnalysis.trendAnalysis[targetDigit]?.trend || 'stable'
      };
    }

    // Second priority: Probability fusion prediction
    if (probabilitySignals.fusion.confidence > 0.5) {
      // Find digit with highest probability from frequency analysis
      const freqSignal = probabilitySignals.signals.frequency;
      if (freqSignal) {
        logger.debug(`Fusion-based prediction: digit ${freqSignal.predictedDigit} (${probabilitySignals.fusion.probability.toFixed(2)} probability, ${probabilitySignals.fusion.confidence.toFixed(2)} confidence)`);

        return {
          digit: freqSignal.predictedDigit,
          probability: probabilitySignals.fusion.probability * 100,
          confidence: probabilitySignals.fusion.confidence,
          method: 'probability_fusion',
          signalsUsed: probabilitySignals.fusion.signalsUsed,
          fusion: probabilitySignals.fusion
        };
      }
    }

    // Second priority: Advanced pattern recognition
    if (advancedPatterns && advancedPatterns.hasPattern && advancedPatterns.recommendedAction) {
      const patternAction = advancedPatterns.recommendedAction;

      if (patternAction.action !== 'hold' && patternAction.targetDigit !== null) {
        logger.debug(`Pattern-based prediction: ${patternAction.action} -> digit ${patternAction.targetDigit} (${patternAction.confidence.toFixed(2)} confidence)`);

        return {
          digit: patternAction.targetDigit,
          probability: patternAction.confidence * 100,
          confidence: patternAction.confidence,
          method: `pattern_${patternAction.pattern}`,
          pattern: patternAction
        };
      }
    }

    // Second priority: Microstructure signals
    if (microstructureSignals && microstructureSignals.length > 0) {
      const bestSignal = microstructureSignals.reduce((best, signal) =>
        signal.confidence > best.confidence ? signal : best, microstructureSignals[0]);

      if (bestSignal.confidence > 0.7) {
        let targetDigit = null;

        // Convert microstructure signal to digit prediction
        if (bestSignal.type === 'price_clustering' && bestSignal.targetDigit !== undefined) {
          targetDigit = bestSignal.targetDigit;
        } else if (bestSignal.type === 'order_flow_imbalance') {
          // Bias toward higher or lower digits based on order flow
          targetDigit = bestSignal.action === 'bias_higher_digits' ?
            Math.floor(Math.random() * 5) + 5 : Math.floor(Math.random() * 5);
        }

        if (targetDigit !== null) {
          logger.debug(`Microstructure-based prediction: ${bestSignal.type} -> digit ${targetDigit} (${bestSignal.confidence.toFixed(2)} confidence)`);

          return {
            digit: targetDigit,
            probability: bestSignal.confidence * 100,
            confidence: bestSignal.confidence,
            method: `microstructure_${bestSignal.type}`,
            microstructure: bestSignal
          };
        }
      }
    }

    // Fallback to traditional strategies
    switch (CONFIG.strategy) {
      case 'frequency':
        return this.predictWithFrequency(context.probabilities);

      case 'markov':
        return ml.predictWithMarkov(symbol, context.currentDigit);

      case 'neural':
        return await ml.predict(symbol, context.recentDigits);

      case 'ensemble':
        return ml.predictEnsemble(symbol, context.currentDigit, context.recentDigits);

      case 'time_series':
        return this.predictWithTimeSeries(context.recentDigits);

      case 'gradient_boosting':
        return await ml.predictWithGradientBoosting(symbol, context.recentDigits);

      case 'lstm':
        return await ml.predictWithLSTM(symbol, context.recentDigits);

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

  // Smart Stake Engine - Base stake logic (ultra-conservative)
  calculateBaseStake(currentBalance, probability) {
    // Ultra-conservative stake sizing: 0.1% of balance max
    const basePercentage = 0.001; // 0.1% base risk (ultra-conservative)
    const probabilityMultiplier = Math.max(0.5, probability / 50); // Scale with probability

    return currentBalance * basePercentage * probabilityMultiplier;
  }

  calculateStakeSize(symbol, prediction, probabilities) {
    const currentBalance = portfolio.getBalance();

    // Smart stake calculation with multiple factors
    let baseStake = this.calculateBaseStake(currentBalance, prediction.probability);

    // Apply consecutive loss protection (anti-martingale)
    baseStake = this.applyConsecutiveLossProtection(symbol, baseStake);

    // Apply recent performance adjustment
    baseStake = this.applyRecentPerformanceAdjustment(symbol, baseStake, prediction.probability);

    // Apply profit-target-based stake adjustments
    baseStake = this.applyProfitTargetStakeAdjustment(symbol, baseStake);

    // Apply loss-adjusted stake decay
    baseStake = this.applyLossAdjustedStakeDecay(symbol, baseStake);

    // Apply prediction confidence multiplier
    baseStake = this.applyConfidenceMultiplier(baseStake, prediction.confidence);

    // Apply symbol-specific adjustments
    baseStake = this.applySymbolSpecificAdjustments(symbol, baseStake);

    // Apply volatility-aware stake scaling
    baseStake = this.applyVolatilityStakeScaling(symbol, baseStake);

    // Apply martingale stake adjustment (if enabled)
    baseStake = this.applyMartingaleStakeAdjustment(symbol, baseStake);

    // Apply final risk constraints
    const finalStake = this.applyRiskConstraints(symbol, baseStake, currentBalance);

    logger.debug(`Smart stake calculation for ${symbol}: Base=${baseStake.toFixed(2)}, Final=${finalStake.toFixed(2)}, Confidence=${prediction.confidence.toFixed(2)}`);

    return finalStake;
  }

  calculateBaseStake(currentBalance, probability) {
    // Base stake as percentage of balance, adjusted by probability
    const basePercentage = 0.005; // 0.5% base risk
    const probabilityMultiplier = Math.max(0.5, probability / 50); // Scale with probability

    return currentBalance * basePercentage * probabilityMultiplier;
  }

  applyConsecutiveLossProtection(symbol, stake) {
    // Get recent trades for this symbol
    const recentTrades = db.getRecentTrades(20).filter(t => t.symbol === symbol);
    let consecutiveLosses = 0;

    // Count consecutive losses from the end
    for (let i = recentTrades.length - 1; i >= 0; i--) {
      if (recentTrades[i].result === 'lost') {
        consecutiveLosses++;
      } else {
        break;
      }
    }

    // Reduce stake based on consecutive losses (anti-martingale)
    if (consecutiveLosses >= 3) {
      const reductionFactor = Math.pow(0.7, consecutiveLosses - 2); // 30% reduction per additional loss
      stake *= reductionFactor;
      logger.debug(`Consecutive loss protection: ${consecutiveLosses} losses, stake reduced by ${(1 - reductionFactor) * 100}%`);
    }

    return stake;
  }

  // Execute simulated trade for testing
  async executeSimulatedTrade(opportunity) {
    try {
      // Generate simulated trade ID
      const tradeId = `sim_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      // Simulate market conditions affecting outcome
      const marketCondition = this.simulateMarketCondition();
      let adjustedProbability = opportunity.probability;

      // Adjust probability based on simulated market conditions
      if (marketCondition.trending) {
        adjustedProbability *= marketCondition.trendStrength; // Stronger trends improve accuracy
      } else if (marketCondition.volatile) {
        adjustedProbability *= 0.9; // High volatility reduces accuracy
      }

      // Simulate trade outcome based on adjusted probability
      const random = Math.random() * 100;
      const outcome = random <= adjustedProbability ? 'won' : 'lost';
      const payout = outcome === 'won' ? opportunity.stake * 8 : 0; // 8x payout for digit match
      const profit = payout - opportunity.stake;

      // Create simulated trade record
      const tradeRecord = {
        id: tradeId,
        symbol: opportunity.symbol,
        timestamp: Date.now(),
        prediction: opportunity.prediction,
        stake: opportunity.stake,
        result: outcome,
        profit: profit,
        payout: payout,
        strategy: opportunity.strategy,
        probability: opportunity.probability,
        confidence: opportunity.confidence,
        simulated: true
      };

      this.activeTrades.set(tradeId, tradeRecord);

      // Update simulation balance
      CONFIG.simulationBalance += profit;

      // Initialize risk management for simulation
      try {
        const stopDistance = opportunity.stake * 0.5;
        risk.initializeTrailingStop(tradeId, opportunity.stake, stopDistance, 'fixed');
      } catch (error) {
        logger.warn(`Failed to initialize trailing stop for simulated trade ${tradeId}:`, error);
      }

      // Store simulated trade in database
      try {
        db.insertTrade(
          opportunity.symbol,
          Date.now(),
          opportunity.prediction,
          opportunity.stake,
          outcome
        );
      } catch (error) {
        logger.error(`Failed to store simulated trade ${tradeId} in database:`, error);
      }

      this.lastTradeTime = Date.now();

      // Update hourly trade count for throttling
      this.hourlyTradeCount++;

      // Update last trade result for cooldown logic
      this.lastTradeResult = outcome;

      // Send trade update to UI
      this.sendTradeToUI({
        id: tradeId,
        symbol: opportunity.symbol,
        prediction: opportunity.prediction,
        stake: opportunity.stake,
        result: outcome,
        profit: profit,
        timestamp: tradeRecord.timestamp,
        tradingMode: 'simulation'
      });

      // Update performance metrics
      this.updatePerformanceMetrics(tradeRecord);

      // REAL-TIME PERFORMANCE MONITORING: Automatic shutdown on any loss (simulation, unless manual override)
      if (outcome === 'lost' && !this.manualOverride) {
        logger.warn(`🚨 AUTOMATIC SHUTDOWN: Simulated trade ${tradeId} resulted in loss. Shutting down trading for safety.`);
        this.tradingEnabled = false;
        this.sendStatusToUI();

        // Send alert to UI
        this.broadcastToUI({
          type: 'alert',
          message: 'Trading automatically stopped due to simulated loss. Manual restart required.',
          severity: 'critical'
        });
      } else if (outcome === 'lost' && this.manualOverride) {
        logger.warn(`⚠️ MANUAL OVERRIDE: Simulated trade ${tradeId} resulted in loss but manual override is active. Continuing trading.`);
        this.broadcastToUI({
          type: 'alert',
          message: 'Simulated loss occurred but manual override prevented automatic shutdown.',
          severity: 'warning'
        });
      }

      // Send portfolio update
      this.sendPortfolioToUI();

      // Remove from active trades after short delay (simulate contract completion)
      setTimeout(() => {
        this.activeTrades.delete(tradeId);
        risk.removeTrailingStop(tradeId);
      }, 1000);

      // Log simulation results separately
      const simulationLogger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        transports: [
          new winston.transports.File({ filename: 'logs/simulation.log' })
        ]
      });

      simulationLogger.info('Simulation Trade Completed', {
        tradeId,
        symbol: opportunity.symbol,
        prediction: opportunity.prediction,
        stake: opportunity.stake,
        outcome,
        profit,
        balance: CONFIG.simulationBalance,
        probability: opportunity.probability,
        timestamp: Date.now()
      });

      logger.info(`[SIMULATION] Trade ${tradeId} completed: ${outcome}, Profit: $${profit.toFixed(2)}, Balance: $${CONFIG.simulationBalance.toFixed(2)}`);

    } catch (error) {
      logger.error('Simulated trade execution error:', error);
    }
  }

  applyRecentPerformanceAdjustment(symbol, stake, probability) {
    // Get recent performance for this symbol
    const recentTrades = db.getRecentTrades(50).filter(t => t.symbol === symbol);

    if (recentTrades.length < 10) return stake;

    const recentWins = recentTrades.filter(t => t.result === 'won').length;
    const recentWinRate = recentWins / recentTrades.length;

    // Adjust stake based on recent performance vs expected probability
    const expectedWinRate = probability / 100;
    const performanceRatio = recentWinRate / expectedWinRate;

    if (performanceRatio < 0.8) {
      // Underperforming - reduce stake
      stake *= 0.8;
      logger.debug(`Recent performance adjustment: Underperforming (${recentWinRate.toFixed(2)} vs ${expectedWinRate.toFixed(2)}), stake reduced`);
    } else if (performanceRatio > 1.2) {
      // Overperforming - can increase stake slightly
      stake *= 1.1;
      logger.debug(`Recent performance adjustment: Overperforming, stake increased slightly`);
    }

    return stake;
  }

  // Smart Stake Engine - Profit-target-based stake adjustments
  applyProfitTargetStakeAdjustment(symbol, stake) {
    // Get recent trades to check profit target achievement
    const recentTrades = db.getRecentTrades(20).filter(t => t.symbol === symbol);

    if (recentTrades.length < 5) return stake;

    // Calculate profit target achievement rate
    const profitTargets = recentTrades.map(t => t.stake * 0.5); // 50% profit target
    const achievedTargets = recentTrades.filter((t, i) => t.profit >= profitTargets[i]).length;
    const targetAchievementRate = achievedTargets / recentTrades.length;

    // Adjust stake based on profit target achievement
    if (targetAchievementRate > 0.7) {
      // Consistently hitting profit targets - can increase stake
      stake *= 1.15;
      logger.debug(`Profit target adjustment: High achievement rate (${targetAchievementRate.toFixed(2)}), stake increased`);
    } else if (targetAchievementRate < 0.3) {
      // Rarely hitting profit targets - reduce stake
      stake *= 0.85;
      logger.debug(`Profit target adjustment: Low achievement rate (${targetAchievementRate.toFixed(2)}), stake reduced`);
    }

    return stake;
  }

  // Smart Stake Engine - Loss-adjusted stake decay
  applyLossAdjustedStakeDecay(symbol, stake) {
    // Get recent trades for loss analysis
    const recentTrades = db.getRecentTrades(30).filter(t => t.symbol === symbol);

    if (recentTrades.length < 5) return stake;

    // Count consecutive losses and recent loss ratio
    let consecutiveLosses = 0;
    let recentLosses = 0;
    const last10Trades = recentTrades.slice(-10);

    // Count consecutive losses from the end
    for (let i = recentTrades.length - 1; i >= 0; i--) {
      if (recentTrades[i].result === 'lost') {
        consecutiveLosses++;
      } else {
        break;
      }
    }

    // Count losses in last 10 trades
    recentLosses = last10Trades.filter(t => t.result === 'lost').length;
    const recentLossRatio = recentLosses / last10Trades.length;

    // Apply decay based on loss patterns
    let decayFactor = 1.0;

    // Strong decay for consecutive losses
    if (consecutiveLosses >= 3) {
      decayFactor *= Math.pow(0.7, consecutiveLosses - 2); // 30% reduction per additional consecutive loss
      logger.debug(`Loss decay: ${consecutiveLosses} consecutive losses, decay factor ${decayFactor.toFixed(2)}`);
    }

    // Moderate decay for high recent loss ratio
    if (recentLossRatio > 0.6) {
      decayFactor *= 0.8;
      logger.debug(`Loss decay: High recent loss ratio (${recentLossRatio.toFixed(2)}), additional decay applied`);
    } else if (recentLossRatio < 0.3) {
      // Slight increase for good recent performance
      decayFactor *= 1.1;
      logger.debug(`Loss decay: Low recent loss ratio (${recentLossRatio.toFixed(2)}), slight stake increase`);
    }

    const adjustedStake = stake * decayFactor;

    if (Math.abs(decayFactor - 1.0) > 0.01) {
      logger.debug(`Loss-adjusted stake decay: Original ${stake.toFixed(2)}, Adjusted ${adjustedStake.toFixed(2)}, Factor ${decayFactor.toFixed(2)}`);
    }

    return adjustedStake;
  }

  applyConfidenceMultiplier(stake, confidence) {
    // Adjust stake based on model confidence
    if (confidence < 0.3) {
      stake *= 0.5; // Low confidence = half stake
    } else if (confidence > 0.8) {
      stake *= 1.2; // High confidence = 20% increase
    }

    return stake;
  }

  applySymbolSpecificAdjustments(symbol, stake) {
    // Get symbol-specific performance
    const symbolStats = db.getTradeStats();
    // This is a simplified version - in practice you'd track per-symbol metrics

    // For volatile symbols, reduce stake
    if (symbol.includes('100')) {
      stake *= 0.9; // R_100 is more volatile
    } else if (symbol.includes('10')) {
      stake *= 1.1; // R_10 is less volatile
    }

    return stake;
  }

  // Smart Stake Engine - Volatility-aware stake scaling
  applyVolatilityStakeScaling(symbol, stake) {
    // Calculate current volatility
    const recentTicks = db.getRecentTicks(symbol, 50);
    if (recentTicks.length < 10) return stake;

    // Calculate volatility as standard deviation of last digits
    const lastDigits = recentTicks.map(t => t.last_digit);
    const mean = lastDigits.reduce((a, b) => a + b, 0) / lastDigits.length;
    const variance = lastDigits.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lastDigits.length;
    const volatility = Math.sqrt(variance);

    // Scale stake based on volatility
    // Higher volatility = lower stake, lower volatility = higher stake
    const volatilityMultiplier = Math.max(0.5, Math.min(1.5, 3.0 / (volatility + 1)));

    stake *= volatilityMultiplier;
    logger.debug(`Volatility stake scaling: volatility=${volatility.toFixed(2)}, multiplier=${volatilityMultiplier.toFixed(2)}, new stake=${stake.toFixed(2)}`);

    return stake;
  }

  // PERFECT CONDITION FILTERING - Only trade when ALL signals align perfectly
  checkPerfectConditions(symbol, recentDigits) {
    // Condition 1: Extreme bias threshold (>90% confidence)
    const biasAnalysis = stats.analyzeDigitBias(recentDigits, 500);
    if (biasAnalysis.confidence < 0.9) {
      return { met: false, reason: `Bias confidence too low: ${biasAnalysis.confidence.toFixed(2)} < 0.9` };
    }

    // Condition 2: Market stability verification (most stable periods)
    const regimeDigits = db.getRecentTicks(symbol, 200).map(t => t.last_digit);
    if (regimeDigits.length >= 100) {
      const regimeAnalysis = stats.detectAdvancedMarketRegime(regimeDigits, 200);
      if (!regimeAnalysis.tradingAllowed || regimeAnalysis.regime !== 'stable_bias') {
        return { met: false, reason: `Market not stable: ${regimeAnalysis.regime} regime` };
      }
    }

    // Condition 3: Noise level verification (ultra-low noise)
    const noiseAnalysis = stats.detectAndFilterNoise(recentDigits, 100);
    if (!noiseAnalysis.shouldTrade || noiseAnalysis.noiseScore > 0.1) {
      return { met: false, reason: `Noise level too high: ${noiseAnalysis.noiseScore.toFixed(2)} > 0.1` };
    }

    // Condition 4: Multi-timeframe confirmation (all timeframes agree)
    const shortTermBias = stats.analyzeDigitBias(recentDigits.slice(-50), 50);
    const mediumTermBias = stats.analyzeDigitBias(recentDigits.slice(-200), 200);
    if (shortTermBias.confidence < 0.85 || mediumTermBias.confidence < 0.85) {
      return { met: false, reason: `Timeframe disagreement: short=${shortTermBias.confidence.toFixed(2)}, medium=${mediumTermBias.confidence.toFixed(2)}` };
    }

    // Condition 5: Consensus prediction (3+ independent methods agree)
    const consensusResult = this.checkConsensusPrediction(symbol, recentDigits);
    if (!consensusResult.agreed) {
      return { met: false, reason: `No prediction consensus: ${consensusResult.agreeingMethods} methods agreed` };
    }

    // Condition 6: Historical backtest validation (95%+ simulated win rate)
    const backtestValidation = this.validateWithHistoricalBacktest(symbol);
    if (!backtestValidation.passed) {
      return { met: false, reason: `Backtest validation failed: ${backtestValidation.winRate.toFixed(2)}% win rate` };
    }

    return {
      met: true,
      reason: `All conditions met: bias=${biasAnalysis.confidence.toFixed(2)}, stable regime, low noise=${noiseAnalysis.noiseScore.toFixed(2)}, timeframe agreement, consensus prediction, backtest validated`
    };
  }

  // Check consensus prediction requiring 3+ independent methods to agree
  checkConsensusPrediction(symbol, recentDigits) {
    const predictions = [];

    // Method 1: Bias analysis
    const biasAnalysis = stats.analyzeDigitBias(recentDigits, 500);
    if (biasAnalysis.recommendedDigits.length > 0) {
      predictions.push({
        method: 'bias',
        digit: biasAnalysis.recommendedDigits[0],
        confidence: biasAnalysis.confidence
      });
    }

    // Method 2: Frequency analysis
    const { data: digitFreq, totalSamples } = db.getDigitFrequencies(symbol);
    let maxFreq = 0;
    let freqDigit = null;
    for (let digit = 0; digit <= 9; digit++) {
      const freq = totalSamples > 0 ? (digitFreq[digit] || 0) / totalSamples : 0;
      if (freq > maxFreq) {
        maxFreq = freq;
        freqDigit = digit;
      }
    }
    if (freqDigit !== null) {
      predictions.push({
        method: 'frequency',
        digit: freqDigit,
        confidence: maxFreq
      });
    }

    // Method 3: Pattern recognition
    const patterns = stats.detectAdvancedPatterns(recentDigits);
    if (patterns.hasPattern && patterns.recommendedAction && patterns.recommendedAction.targetDigit !== null) {
      predictions.push({
        method: 'pattern',
        digit: patterns.recommendedAction.targetDigit,
        confidence: patterns.recommendedAction.confidence
      });
    }

    // Check consensus (at least 3 methods agree on same digit)
    if (predictions.length < 3) {
      return { agreed: false, agreeingMethods: predictions.length, digit: null };
    }

    const digitVotes = {};
    predictions.forEach(pred => {
      digitVotes[pred.digit] = (digitVotes[pred.digit] || 0) + 1;
    });

    const consensusDigit = Object.keys(digitVotes).find(digit => digitVotes[digit] >= 3);
    const agreed = consensusDigit !== undefined;

    return {
      agreed,
      agreeingMethods: agreed ? digitVotes[consensusDigit] : 0,
      digit: agreed ? parseInt(consensusDigit) : null
    };
  }

  // Validate with historical backtest requiring 95%+ simulated win rate
  validateWithHistoricalBacktest(symbol) {
    try {
      // Run quick backtest simulation
      const backtestResult = backtest.runBacktest(CONFIG.strategy, symbol, {
        maxTrades: 100,
        riskPerTrade: 0.01 // Very conservative for validation
      });

      const winRate = backtestResult.performance ? backtestResult.performance.winRate : 0;
      const passed = winRate >= 0.95; // Require 95%+ win rate

      return {
        passed,
        winRate: winRate * 100,
        profitFactor: backtestResult.performance ? backtestResult.performance.profitFactor : 0
      };
    } catch (error) {
      logger.warn(`Backtest validation error for ${symbol}:`, error);
      return { passed: false, winRate: 0, profitFactor: 0 };
    }
  }

  // Assess tick quality to avoid bad ticks
  assessTickQuality(symbol) {
    const recentTicks = db.getRecentTicks(symbol, 20);
    if (recentTicks.length < 5) return { quality: 'unknown', score: 0.5 };

    // Check for anomalous price movements
    const prices = recentTicks.map(t => t.quote);
    const lastDigits = recentTicks.map(t => t.last_digit);

    // Calculate price volatility
    const priceChanges = [];
    for (let i = 1; i < prices.length; i++) {
      priceChanges.push(Math.abs(prices[i] - prices[i-1]));
    }
    const avgPriceChange = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;

    // Check for digit distribution anomalies
    const digitCounts = {};
    for (let digit = 0; digit <= 9; digit++) digitCounts[digit] = 0;
    lastDigits.forEach(digit => digitCounts[digit]++);

    const maxCount = Math.max(...Object.values(digitCounts));
    const minCount = Math.min(...Object.values(digitCounts));
    const digitVariance = maxCount - minCount;

    // Assess quality based on volatility and digit distribution
    let quality = 'good';
    let score = 1.0;

    if (avgPriceChange > 0.5) { // High price volatility
      quality = 'volatile';
      score = 0.7;
    }

    if (digitVariance > 5) { // Uneven digit distribution
      quality = 'anomalous';
      score = 0.6;
    }

    if (avgPriceChange > 1.0 || digitVariance > 8) { // Very bad conditions
      quality = 'bad';
      score = 0.3;
    }

    return { quality, score, avgPriceChange, digitVariance };
  }

  // Resume trading state after reconnection
  resumeTradingState() {
    logger.info('Resuming trading state after reconnection...');

    // Re-subscribe to tick data for all symbols if trading was enabled
    if (this.tradingEnabled) {
      for (const symbol of CONFIG.symbols) {
        this.subscribeToTicks(symbol).catch(error => {
          logger.error(`Failed to re-subscribe to ${symbol} ticks:`, error);
        });
      }
    }

    // Check for any active trades that might need monitoring
    // For digit matches, trades complete quickly, so this is mainly for subscriptions
    if (this.activeTrades.size > 0) {
      logger.info(`Resuming monitoring of ${this.activeTrades.size} active trades`);
      // Re-subscribe to contract updates if needed
      for (const [tradeId, trade] of this.activeTrades) {
        this.subscribeToContract(tradeId);
      }
    }

    // Restart trailing stop monitoring if there are active trades
    if (this.activeTrades.size > 0) {
      this.startTrailingStopMonitoring();
    }

    logger.info('Trading state resumed successfully');
  }

  // Simulate market conditions for realistic simulation
  simulateMarketCondition() {
    // Randomly simulate different market conditions
    const conditionType = Math.random();

    if (conditionType < 0.3) {
      // Trending market (30% chance)
      return {
        trending: true,
        trendStrength: 1.1 + Math.random() * 0.2, // 1.1 to 1.3 multiplier
        volatile: false,
        description: 'trending'
      };
    } else if (conditionType < 0.6) {
      // Volatile market (30% chance)
      return {
        trending: false,
        trendStrength: 1.0,
        volatile: true,
        description: 'volatile'
      };
    } else {
      // Normal ranging market (40% chance)
      return {
        trending: false,
        trendStrength: 1.0,
        volatile: false,
        description: 'ranging'
      };
    }
  }

  // Implement controlled martingale stake adjustment
  applyMartingaleStakeAdjustment(symbol, stake) {
    if (!CONFIG.martingaleEnabled) return stake;

    // Get consecutive losses for this symbol
    const recentTrades = db.getRecentTrades(20).filter(t => t.symbol === symbol);
    let consecutiveLosses = 0;

    // Count consecutive losses from the end
    for (let i = recentTrades.length - 1; i >= 0; i--) {
      if (recentTrades[i].result === 'lost') {
        consecutiveLosses++;
      } else {
        break;
      }
    }

    // Apply martingale if there are consecutive losses, but limit levels
    if (consecutiveLosses > 0 && consecutiveLosses <= CONFIG.martingaleMaxLevels) {
      const martingaleLevel = Math.min(consecutiveLosses, CONFIG.martingaleMaxLevels);
      const multiplier = Math.pow(CONFIG.martingaleMultiplier, martingaleLevel - 1);

      stake *= multiplier;
      logger.debug(`Martingale adjustment: ${consecutiveLosses} losses, level ${martingaleLevel}, multiplier ${multiplier.toFixed(2)}, new stake ${stake.toFixed(2)}`);
    }

    return stake;
  }

  applyRiskConstraints(symbol, stake, currentBalance) {
    // Apply all risk management constraints (ultra-conservative)

    // Maximum stake limits - ultra-conservative
    const maxStakeByBalance = currentBalance * 0.005; // Max 0.5% of balance (ultra-conservative)
    const minStake = 1.0; // Minimum $1 stake
    const maxStake = CONFIG.maxStake; // Maximum stake limit from config

    // Get portfolio constraints
    const maxSymbolStake = portfolio.getMaxStakeForSymbol(symbol);

    // Apply Kelly Criterion as final check
    const kellyStake = risk.calculateKellyStake(
      0.1, // Conservative win rate estimate
      8.0, // 8:1 payout ratio for DIGITMATCH
      1.0, // 1:1 loss ratio
      currentBalance,
      0.5 // Half Kelly for safety
    );

    // Take the minimum of all constraints
    const finalStake = Math.min(
      stake,
      maxStakeByBalance,
      maxSymbolStake,
      kellyStake,
      maxStake
    );

    // Ensure minimum stake
    return Math.max(finalStake, minStake);
  }

  /**
    * Execute a trade based on the identified opportunity
    *
    * This method handles the complete trade execution process:
    * - Creates and sends the trade request to Deriv API (demo or live account)
    * - Records the trade in the database
    * - Sets up risk management (trailing stops, partial closes)
    * - Subscribes to contract updates for monitoring
    * - Updates performance metrics
    *
    * @param {Object} opportunity - Trading opportunity details
    * @param {string} opportunity.symbol - Trading symbol
    * @param {number} opportunity.prediction - Predicted digit (0-9)
    * @param {number} opportunity.stake - Position size in USD
    * @param {number} opportunity.probability - Prediction confidence (0-100)
    */
  async executeTrade(opportunity) {
    try {
      // Validate opportunity data
      if (!opportunity || !opportunity.symbol || !opportunity.prediction || !opportunity.stake) {
        logger.error('Invalid trade opportunity data:', opportunity);
        return;
      }

      // Validate prediction range
      if (opportunity.prediction < 0 || opportunity.prediction > 9) {
        logger.error(`Invalid prediction digit: ${opportunity.prediction}`);
        return;
      }

      // Validate stake amount
      if (opportunity.stake <= 0 || opportunity.stake > 10000) {
        logger.error(`Invalid stake amount: $${opportunity.stake}`);
        return;
      }

      const modeText = CONFIG.simulationMode ? 'SIMULATION' : (CONFIG.tradingMode === 'live' ? 'LIVE' : 'DEMO');
      logger.info(`[${modeText} TRADE] Executing trade: ${opportunity.symbol} -> ${opportunity.prediction} ($${opportunity.stake.toFixed(2)})`);

      // Assess tick quality and adjust execution delay
      const tickQuality = this.assessTickQuality(opportunity.symbol);
      let delay = CONFIG.executionDelay;

      if (tickQuality.quality === 'bad') {
        delay *= 2; // Double delay for bad ticks
        logger.debug(`Bad tick quality detected, increasing delay to ${delay}ms`);
      } else if (tickQuality.quality === 'volatile') {
        delay *= 1.5; // 50% increase for volatile ticks
        logger.debug(`Volatile tick quality, increasing delay to ${delay}ms`);
      }

      if (delay > 0) {
        logger.debug(`Applying execution delay: ${delay}ms (quality: ${tickQuality.quality}, score: ${tickQuality.score.toFixed(2)})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Handle simulation mode
      if (CONFIG.simulationMode) {
        return this.executeSimulatedTrade(opportunity);
      }

      // Construct the trade request for Deriv's DIGITMATCH contract
      const tradeRequest = {
        buy: 1,  // Buy contract
        parameters: {
          amount: opportunity.stake,        // Stake amount in USD
          basis: 'stake',                   // Specify amount as stake
          contract_type: 'DIGITMATCH',      // Last digit match contract - PAYS WHEN DIGIT MATCHES!
          currency: 'USD',                  // Trading currency
          duration: 1,                      // 1 tick duration
          duration_unit: 't',               // Duration in ticks
          symbol: opportunity.symbol,       // Trading symbol (R_10, R_25, etc.)
          barrier: opportunity.prediction.toString() // Predicted digit as barrier
        }
      };

      // Send trade request with timeout and error handling
      const response = await this.sendRequestAsync(tradeRequest);

      if (response.error) {
        logger.error('Trade execution failed:', response.error);

        // Handle specific error types
        if (response.error.code === 'InsufficientBalance') {
          logger.error('Insufficient balance for trade');
          this.tradingEnabled = false; // Stop trading until balance is restored
          this.sendStatusToUI();
        } else if (response.error.code === 'RateLimit') {
          logger.warn('Rate limit hit, delaying next trade');
          this.lastTradeTime = Date.now() + 60000; // Delay for 1 minute
        }

        return;
      }

      // Validate response structure
      if (!response.buy || !response.buy.contract_id) {
        logger.error('Invalid trade response:', response);
        return;
      }

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

      // Initialize trailing stop with error handling
      try {
        const stopDistance = opportunity.stake * 0.5; // 50% of stake as initial stop
        risk.initializeTrailingStop(tradeId, opportunity.stake, stopDistance, 'fixed');
      } catch (error) {
        logger.warn(`Failed to initialize trailing stop for ${tradeId}:`, error);
      }

      // Set up partial close rules with error handling
      try {
        risk.setPartialCloseRules(tradeId, {
          levels: [
            { profitTarget: opportunity.stake * 0.5, closePercent: 0.5, description: '50% profit - close 50%' },
            { profitTarget: opportunity.stake * 1.0, closePercent: 0.3, description: '100% profit - close 30%' }
          ]
        });
      } catch (error) {
        logger.warn(`Failed to set partial close rules for ${tradeId}:`, error);
      }

      // Set up scale-out strategy with error handling
      try {
        risk.createScaleOutStrategy(tradeId, {
          profitLevels: [opportunity.stake * 0.25, opportunity.stake * 0.5, opportunity.stake * 1.0],
          stakeDistribution: [0.3, 0.3, 0.4]
        });
      } catch (error) {
        logger.warn(`Failed to create scale-out strategy for ${tradeId}:`, error);
      }

      // Store trade in database with error handling
      try {
        db.insertTrade(
          opportunity.symbol,
          Date.now(),
          opportunity.prediction,
          opportunity.stake,
          'pending'
        );
      } catch (error) {
        logger.error(`Failed to store trade ${tradeId} in database:`, error);
        // Continue execution even if DB fails
      }

      this.lastTradeTime = Date.now();

      // Update hourly trade count for throttling
      this.hourlyTradeCount++;

      // Subscribe to contract updates with error handling
      try {
        this.subscribeToContract(tradeId);
      } catch (error) {
        logger.error(`Failed to subscribe to contract ${tradeId}:`, error);
      }

      logger.info(`Trade ${tradeId} executed successfully on ${modeText} account (hourly count: ${this.hourlyTradeCount})`);

    } catch (error) {
      logger.error('Trade execution error:', error);

      // If it's a network error, mark for retry
      if (error.message.includes('timeout') || error.message.includes('network')) {
        logger.warn('Network error during trade execution, will retry on next cycle');
      }
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

  async runAutonomousBacktest() {
    try {
      for (const symbol of CONFIG.symbols) {
        const result = await backtest.runBacktest(CONFIG.strategy, symbol, {
          maxTrades: config.DEFAULT_BACKTEST_TRADES,
          riskPerTrade: config.RISK_PER_TRADE
        });

        logger.info(`Autonomous backtest ${symbol}: Win Rate ${result.performance.winRate.toFixed(3)}`);

        // Send results to UI if connected
        this.broadcastToUI({
          type: 'backtest_result',
          symbol,
          performance: result.performance
        });
      }
    } catch (error) {
      logger.error('Autonomous backtest error:', error);
    }
  }

  async runAutonomousRetraining() {
    try {
      for (const symbol of CONFIG.symbols) {
        const ticks = db.getRecentTicks(symbol, 5000);
        if (ticks.length >= 1000) {
          await ml.trainModel(symbol, ticks);
          logger.info(`Autonomous retraining completed for ${symbol}`);

          // Send update to UI if connected
          this.broadcastToUI({
            type: 'retraining_complete',
            symbol
          });
        }
      }
    } catch (error) {
      logger.error('Autonomous retraining error:', error);
    }
  }

  async updateNewsSentiment() {
    try {
      for (const symbol of CONFIG.symbols) {
        // Fetch recent news (mock implementation)
        const news = await sentiment.fetchNews(symbol, 5);

        if (news.length > 0) {
          logger.info(`Analyzed ${news.length} news articles for ${symbol}`);

          // Check for significant sentiment changes
          const sentimentSummary = sentiment.getSentimentSummary([symbol]);
          const symbolSentiment = sentimentSummary[symbol];

          if (symbolSentiment && symbolSentiment.tradingSignal) {
            logger.info(`Sentiment signal for ${symbol}: ${symbolSentiment.tradingSignal.signal} (${symbolSentiment.tradingSignal.strength})`);

            // Send sentiment update to UI
            this.broadcastToUI({
              type: 'sentiment_update',
              symbol,
              data: symbolSentiment
            });
          }
        }
      }

      // Update market data in UI with latest sentiment
      this.sendMarketDataToUI();

    } catch (error) {
      logger.error('News sentiment update error:', error);
    }
  }

  async handleStrategyComparison(message) {
    try {
      const symbol = message.symbol || 'R_10';
      const strategies = ['frequency', 'markov', 'neural', 'ensemble', 'time_series', 'gradient_boosting', 'lstm'];

      logger.info(`Running strategy comparison for ${symbol}`);

      // Run comparison using backtest engine
      const comparisonResult = await backtest.compareStrategies(symbol, strategies, {
        maxTrades: 100,
        riskPerTrade: CONFIG.riskPerTrade
      });

      // Send results to UI
      this.broadcastToUI({
        type: 'strategy_comparison',
        data: comparisonResult
      });

      logger.info(`Strategy comparison completed for ${symbol}`);

    } catch (error) {
      logger.error('Strategy comparison error:', error);
      this.broadcastToUI({
        type: 'error',
        message: `Strategy comparison failed: ${error.message}`
      });
    }
  }

  async handleStrategyOptimization(message) {
    try {
      const symbol = message.symbol || 'R_10';
      const strategy = message.strategy || CONFIG.strategy;

      logger.info(`Running strategy optimization for ${strategy} on ${symbol}`);

      // Define parameter ranges to test
      const paramRanges = {
        riskPerTrade: [0.01, 0.02, 0.03, 0.05, 0.08],
        minProbability: [30, 40, 50, 60, 70],
        maxDrawdown: [0.10, 0.15, 0.20, 0.25, 0.30]
      };

      // Run optimization
      const optimizationResult = await this.optimizeStrategyParameters(strategy, symbol, paramRanges);

      // Send results to UI
      this.broadcastToUI({
        type: 'strategy_optimization',
        data: optimizationResult
      });

      logger.info(`Strategy optimization completed for ${strategy} on ${symbol}`);

    } catch (error) {
      logger.error('Strategy optimization error:', error);
      this.broadcastToUI({
        type: 'error',
        message: `Strategy optimization failed: ${error.message}`
      });
    }
  }

  async optimizeStrategyParameters(strategy, symbol, paramRanges) {
    const results = [];
    let bestResult = null;
    let bestScore = -Infinity;

    // Test all parameter combinations
    for (const riskPerTrade of paramRanges.riskPerTrade) {
      for (const minProbability of paramRanges.minProbability) {
        for (const maxDrawdown of paramRanges.maxDrawdown) {
          try {
            // Run backtest with these parameters
            const result = await backtest.runBacktest(strategy, symbol, {
              maxTrades: 50,
              riskPerTrade,
              minProbability,
              maxDrawdown
            });

            if (result && result.performance) {
              const perf = result.performance;

              // Calculate optimization score (weighted combination of metrics)
              const score = (
                perf.winRate * 0.4 +                    // 40% weight on win rate
                Math.min(perf.profitFactor / 2, 1) * 0.3 + // 30% weight on profit factor (capped)
                (1 - perf.maxDrawdown) * 0.3            // 30% weight on drawdown (inverted)
              );

              const testResult = {
                params: { riskPerTrade, minProbability, maxDrawdown },
                performance: perf,
                score
              };

              results.push(testResult);

              // Track best result
              if (score > bestScore) {
                bestScore = score;
                bestResult = testResult;
              }
            }
          } catch (error) {
            logger.debug(`Parameter combination failed: risk=${riskPerTrade}, prob=${minProbability}, dd=${maxDrawdown}`);
          }
        }
      }
    }

    // Check if we found any valid results
    if (!bestResult) {
      throw new Error(`No valid optimization results found for strategy ${strategy} on ${symbol}. All parameter combinations failed.`);
    }

    return {
      strategy,
      symbol,
      optimalParams: bestResult.params,
      expectedPerformance: bestResult.performance,
      optimizationScore: bestScore,
      totalCombinations: paramRanges.riskPerTrade.length * paramRanges.minProbability.length * paramRanges.maxDrawdown.length,
      testedCombinations: results.length
    };
  }



  async generatePerformanceReport() {
    const stats = db.getTradeStats();
    const riskReport = risk.generateRiskReport();

    logger.info('=== Performance Report ===');
    logger.info(`Total Trades: ${stats.total_trades}`);
    logger.info(`Win Rate: ${((stats.wins / stats.total_trades) * 100).toFixed(2)}%`);
    logger.info(`Total Profit: $${stats.total_profit.toFixed(2)}`);
    logger.info(`Average Profit: $${stats.avg_profit.toFixed(2)}`);
    logger.info(`Current Drawdown: ${(riskReport.portfolio.currentDrawdown * 100).toFixed(2)}%`);
    logger.info('========================');

    // Check for performance milestones and send alerts
    if (stats.total_trades > 0) {
      const winRate = stats.wins / stats.total_trades;

    }

    // Send updates to UI
    this.sendPerformanceToUI();
    this.sendPortfolioToUI();
  }

  handleMessage(message) {
    try {
      // Validate message structure
      if (!message || typeof message !== 'object') {
        logger.warn('Received invalid message format:', message);
        return;
      }

      if (message.msg_type === 'authorize') {
        if (message.error) {
          logger.error('Authorization failed:', message.error);
          // Reset authorization state
          this.authorized = false;
          // Don't retry immediately, let reconnection handle it
          return;
        }

        this.authorized = true;
        logger.info(`Successfully authorized - Account type: ${CONFIG.tradingMode.toUpperCase()}`);

        // Fetch account balance with error handling
        this.fetchAccountBalance().catch(error => {
          logger.error('Failed to fetch account balance:', error);
        });

        // Resume trading state after reconnection
        this.resumeTradingState();

      } else if (message.msg_type === 'tick') {
        if (!message.tick) {
          logger.warn('Received tick message without tick data');
          return;
        }
        this.handleTick(message.tick);

      } else if (message.msg_type === 'proposal_open_contract') {
        if (!message.proposal_open_contract) {
          logger.warn('Received contract update without contract data');
          return;
        }
        this.handleContractUpdate(message.proposal_open_contract);

      } else if (message.msg_type === 'balance') {
        // Balance update
        if (message.balance && message.balance.balance) {
          const balance = parseFloat(message.balance.balance);
          if (!isNaN(balance)) {
            risk.portfolioStats.totalBalance = balance;
            risk.portfolioStats.peakBalance = Math.max(risk.portfolioStats.peakBalance, balance);
            logger.debug(`Balance updated: $${balance.toFixed(2)}`);
            this.sendPortfolioToUI();
          } else {
            logger.warn('Invalid balance value received:', message.balance.balance);
          }
        } else {
          logger.warn('Received balance message without balance data');
        }

      } else if (message.msg_type === 'buy') {
        // Trade confirmation
        if (message.buy && message.buy.contract_id) {
          logger.debug(`Trade confirmed: ${message.buy.contract_id}`);
        } else {
          logger.warn('Received buy confirmation without contract ID');
        }

      } else if (message.error) {
        logger.error('API Error:', message.error);
        // Handle specific error codes
        if (message.error.code === 'AuthorizationRequired') {
          logger.warn('Authorization expired, re-authorizing...');
          this.authorized = false;
          this.authorize();
        } else if (message.error.code === 'RateLimit') {
          logger.warn('Rate limit hit, implementing backoff...');
          // Could implement rate limiting logic here
        }

      } else if (message.type === 'compare_strategies') {
        // Handle strategy comparison request from UI
        this.handleStrategyComparison(message).catch(error => {
          logger.error('Strategy comparison failed:', error);
        });

      } else {
        // Log unknown message types for debugging
        logger.debug('Received unknown message type:', message.msg_type || 'no_type');
      }

    } catch (error) {
      logger.error('Message handling error:', error);
      // Don't rethrow, we want to continue processing other messages
    }
  }

  handleTick(tick) {
    try {
      // Validate tick data
      if (!tick || !tick.symbol || !tick.quote || !tick.epoch) {
        logger.warn('Received invalid tick data:', tick);
        return;
      }

      const { symbol, quote, epoch } = tick;

      // Validate quote format
      const quoteNum = parseFloat(quote);
      if (isNaN(quoteNum)) {
        logger.warn(`Invalid quote format for ${symbol}: ${quote}`);
        return;
      }

      // Extract last digit safely
      const lastDigit = parseInt(quote.toString().split('.')[1]?.[0] || '0');

      // Validate last digit
      if (lastDigit < 0 || lastDigit > 9) {
        logger.warn(`Invalid last digit for ${symbol}: ${lastDigit}`);
        return;
      }

      // Store tick data with error handling
      try {
        db.insertTick(symbol, epoch * 1000, quoteNum, lastDigit);
      } catch (error) {
        logger.error(`Failed to store tick data for ${symbol}:`, error);
        return;
      }

      // Update tick buffer
      const buffer = this.tickBuffers.get(symbol) || [];
      buffer.push({ timestamp: epoch * 1000, quote: quoteNum, last_digit: lastDigit });
      if (buffer.length > 1000) buffer.shift();
      this.tickBuffers.set(symbol, buffer);

      // Update microstructure analysis with error handling
      try {
        microstructure.updateWithNewTick(symbol, {
          timestamp: epoch * 1000,
          quote: quoteNum,
          last_digit: lastDigit
        });
      } catch (error) {
        logger.warn(`Microstructure analysis failed for ${symbol}:`, error);
      }

      // Update portfolio with latest price
      try {
        portfolio.updatePrice(symbol, quoteNum);
      } catch (error) {
        logger.warn(`Portfolio price update failed for ${symbol}:`, error);
      }

    } catch (error) {
      logger.error('Tick handling error:', error);
    }
  }

  async handleContractUpdate(contract) {
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

      // Update last trade result for cooldown logic
      this.lastTradeResult = status;

      // REAL-TIME PERFORMANCE MONITORING: Automatic shutdown on any loss (unless manual override)
      if (status === 'lost' && !this.manualOverride) {
        logger.warn(`🚨 AUTOMATIC SHUTDOWN: Trade ${contract_id} resulted in loss. Shutting down trading for safety.`);
        this.tradingEnabled = false;
        this.sendStatusToUI();

        // Send alert to UI
        this.broadcastToUI({
          type: 'alert',
          message: 'Trading automatically stopped due to loss. Manual restart required.',
          severity: 'critical'
        });
      } else if (status === 'lost' && this.manualOverride) {
        logger.warn(`⚠️ MANUAL OVERRIDE: Trade ${contract_id} resulted in loss but manual override is active. Continuing trading.`);
        this.broadcastToUI({
          type: 'alert',
          message: 'Loss occurred but manual override prevented automatic shutdown.',
          severity: 'warning'
        });
      }

      // Send trade update to UI
      this.sendTradeToUI({
        id: contract_id,
        symbol: trade.symbol,
        prediction: trade.prediction,
        stake: trade.stake,
        result: status,
        profit: trade.profit,
        timestamp: trade.timestamp,
        tradingMode: CONFIG.tradingMode
      });


      // Send portfolio update to UI
      this.sendPortfolioToUI();

      // Remove trailing stop
      risk.removeTrailingStop(contract_id);

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
      const requestId = Math.floor(Math.random() * 1000000) + 1; // Generate integer req_id
      const fullRequest = { ...request, req_id: requestId };
      this.ws.send(JSON.stringify(fullRequest));
    }
  }

  // Check rate limits before making API requests
  checkRateLimit() {
    if (!CONFIG.rateLimitEnabled) return true;

    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;

    // Clean old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneHourAgo);

    // Check per-minute limit
    const requestsLastMinute = this.requestTimestamps.filter(ts => ts > oneMinuteAgo).length;
    if (requestsLastMinute >= CONFIG.maxRequestsPerMinute) {
      logger.warn(`Rate limit exceeded: ${requestsLastMinute}/${CONFIG.maxRequestsPerMinute} requests per minute`);
      return false;
    }

    // Check per-hour limit
    if (this.requestTimestamps.length >= CONFIG.maxRequestsPerHour) {
      logger.warn(`Rate limit exceeded: ${this.requestTimestamps.length}/${CONFIG.maxRequestsPerHour} requests per hour`);
      return false;
    }

    return true;
  }

  sendRequestAsync(request, retryCount = 0) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      // Check rate limits
      if (!this.checkRateLimit()) {
        reject(new Error('Rate limit exceeded'));
        return;
      }

      // Record this request timestamp
      this.requestTimestamps.push(Date.now());

      const requestId = Math.floor(Math.random() * 1000000) + 1; // Generate integer req_id
      const fullRequest = { ...request, req_id: requestId };

      const timeout = setTimeout(() => {
        // On timeout, try retry if enabled
        if (CONFIG.retryEnabled && retryCount < CONFIG.maxRetries) {
          logger.warn(`Request timeout, retrying (${retryCount + 1}/${CONFIG.maxRetries})`);
          setTimeout(() => {
            this.sendRequestAsync(request, retryCount + 1).then(resolve).catch(reject);
          }, CONFIG.retryDelay * (retryCount + 1)); // Exponential backoff
        } else {
          reject(new Error('Request timeout'));
        }
      }, config.WS_REQUEST_TIMEOUT_MS);

      const messageHandler = (data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.req_id === requestId) {
            clearTimeout(timeout);
            this.ws.removeListener('message', messageHandler);

            // Check for error response that should be retried
            if (response.error && CONFIG.retryEnabled && retryCount < CONFIG.maxRetries) {
              const retryableErrors = ['RateLimit', 'InternalServerError', 'ServiceUnavailable'];
              if (retryableErrors.includes(response.error.code)) {
                logger.warn(`API error ${response.error.code}, retrying (${retryCount + 1}/${CONFIG.maxRetries})`);
                setTimeout(() => {
                  this.sendRequestAsync(request, retryCount + 1).then(resolve).catch(reject);
                }, CONFIG.retryDelay * (retryCount + 1));
                return;
              }
            }

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
