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
  backtestWindow: config.BACKTEST_WINDOW_TICKS,

  // Paper trading mode
  paperTrading: false,

};

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

    // Active trading state
    this.activeTrades = new Map();     // Currently open trades (tradeId -> tradeData)
    this.lastTradeTime = 0;            // Timestamp of last executed trade
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
      case 'optimize_strategy':
        this.handleStrategyOptimization(message);
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
      if (config.paperTrading !== undefined) CONFIG.paperTrading = config.paperTrading;

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
      currentSymbol: CONFIG.symbols[0] || 'None', // Show first symbol as current
      paperTrading: CONFIG.paperTrading
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
      strategy: tradeData.strategy || CONFIG.strategy
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
    logger.info('Authorization request sent - waiting for manual trading start');
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

    logger.info('🚀 Starting trading bot manually...');
    this.tradingEnabled = true;

    // Subscribe to tick data for all symbols
    for (const symbol of CONFIG.symbols) {
      await this.subscribeToTicks(symbol);
    }

    // Start the trading loop
    this.startTradingLoop();

    // Send status update to UI with current symbol
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

    // Check for trading opportunities every 2 seconds
    setInterval(async () => {
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

      logger.debug('Trading loop: Evaluating trading opportunities...');

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
    }, 2000);
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

    // Get recent ticks
    const recentTicks = db.getRecentTicks(symbol, 100);
    if (recentTicks.length < 10) {
      logger.debug(`Not enough recent ticks for ${symbol}: ${recentTicks.length}`);
      return null;
    }

    // Get digit frequencies
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

    // Get recent digits for pattern analysis
    const recentDigits = recentTicks.map(tick => tick.last_digit);

    // Check sentiment analysis for additional signal
    const sentimentSignal = sentiment.generateSentimentSignal(symbol);
    const sentimentBias = sentimentSignal ? sentimentSignal.signal : null;

    // Use selected strategy to predict next digit
    const prediction = await this.generatePrediction(symbol, {
      probabilities,
      recentDigits,
      totalSamples,
      currentDigit: recentDigits[recentDigits.length - 1],
      sentimentBias
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

  calculateStakeSize(symbol, prediction, probabilities) {
    const currentBalance = portfolio.getBalance();

    // Get volatility-adjusted position sizing recommendation
    const sizingRecommendation = risk.getPositionSizingRecommendation(symbol, currentBalance, config.RISK_PER_TRADE);

    // Use Kelly Criterion with volatility adjustment
    const winRate = prediction.probability / 100;
    const avgWin = config.PAYOUT_MULTIPLIER - 1; // Net payout (1.8 - 1 = 0.8)
    const avgLoss = 1.0; // Lose stake

    const kellyStake = risk.calculateKellyStake(winRate, avgWin, avgLoss, currentBalance, config.KELLY_FRACTION);

    // Apply all constraints
    const riskStake = sizingRecommendation.recommendedPositionSize;
    const maxSymbolStake = portfolio.getMaxStakeForSymbol(symbol);

    const finalStake = Math.min(kellyStake, riskStake, maxSymbolStake, currentBalance * config.MAX_STAKE_MULTIPLIER);

    logger.debug(`Position sizing for ${symbol}: Kelly=${kellyStake.toFixed(2)}, Volatility-adjusted=${riskStake.toFixed(2)}, Final=${finalStake.toFixed(2)}`);

    return finalStake;
  }

  /**
   * Execute a trade based on the identified opportunity
   *
   * This method handles the complete trade execution process:
   * - Creates and sends the trade request to Deriv API
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
      logger.info(`${CONFIG.paperTrading ? '[PAPER TRADE]' : '[LIVE TRADE]'} Executing trade: ${opportunity.symbol} -> ${opportunity.prediction} ($${opportunity.stake.toFixed(2)})`);

      let tradeId;

      if (CONFIG.paperTrading) {
        // Paper trading mode - simulate trade execution
        tradeId = `paper_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Simulate immediate trade confirmation for paper trading
        logger.info(`Paper trade ${tradeId} simulated successfully`);

      } else {
        // Live trading mode - send real trade to Deriv
        // Construct the trade request for Deriv's DIGITDIFF contract
        // DIGITDIFF pays if the last digit differs from the predicted digit
        const tradeRequest = {
          buy: 1,  // Buy contract
          parameters: {
            amount: opportunity.stake,        // Stake amount in USD
            basis: 'stake',                   // Specify amount as stake
            contract_type: 'DIGITDIFF',       // Last digit difference contract
            currency: 'USD',                  // Trading currency
            duration: 1,                      // 1 tick duration
            duration_unit: 't',               // Duration in ticks
            symbol: opportunity.symbol,       // Trading symbol (R_10, R_25, etc.)
            barrier: opportunity.prediction.toString() // Predicted digit as barrier
          }
        };

        // Send trade request
        const response = await this.sendRequestAsync(tradeRequest);

        if (response.error) {
          logger.error('Trade execution failed:', response.error);
          return;
        }

        tradeId = response.buy.contract_id;
      }
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

      // Initialize trailing stop for the position
      const stopDistance = opportunity.stake * 0.5; // 50% of stake as initial stop
      risk.initializeTrailingStop(tradeId, opportunity.stake, stopDistance, 'fixed');

      // Set up partial close rules
      risk.setPartialCloseRules(tradeId, {
        levels: [
          { profitTarget: opportunity.stake * 0.5, closePercent: 0.5, description: '50% profit - close 50%' },
          { profitTarget: opportunity.stake * 1.0, closePercent: 0.3, description: '100% profit - close 30%' }
        ]
      });

      // Set up scale-out strategy for taking profits
      risk.createScaleOutStrategy(tradeId, {
        profitLevels: [opportunity.stake * 0.25, opportunity.stake * 0.5, opportunity.stake * 1.0],
        stakeDistribution: [0.3, 0.3, 0.4]
      });

      db.insertTrade(
        opportunity.symbol,
        Date.now(),
        opportunity.prediction,
        opportunity.stake,
        'pending'
      );

      this.lastTradeTime = Date.now();

      if (CONFIG.paperTrading) {
        // For paper trading, simulate trade outcome after a short delay
        setTimeout(() => {
          this.simulatePaperTradeOutcome(tradeId, tradeRecord);
        }, 2000); // Simulate 2-second trade duration
      } else {
        // Subscribe to contract updates for live trading
        this.subscribeToContract(tradeId);
      }

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

  simulatePaperTradeOutcome(tradeId, tradeRecord) {
    try {
      // Get the next tick to determine actual outcome
      const ticks = db.getRecentTicks(tradeRecord.symbol, 2);
      if (ticks.length < 2) {
        logger.warn(`Cannot simulate paper trade ${tradeId}: insufficient tick data`);
        return;
      }

      const actualDigit = ticks[1].last_digit; // The tick after the trade
      const isWin = actualDigit !== tradeRecord.prediction; // DIGITDIFF wins if digits differ

      const profit = isWin ? tradeRecord.stake * 0.8 : -tradeRecord.stake; // 80% payout on win
      const payout = isWin ? tradeRecord.stake * 1.8 : 0;

      // Simulate contract update
      const simulatedContract = {
        contract_id: tradeId,
        status: isWin ? 'won' : 'lost',
        profit: profit
      };

      logger.info(`Paper trade ${tradeId} simulated: predicted ${tradeRecord.prediction}, actual ${actualDigit}, result ${simulatedContract.status}, profit $${profit.toFixed(2)}`);

      // Process the simulated outcome
      this.handleContractUpdate(simulatedContract);

    } catch (error) {
      logger.error(`Error simulating paper trade ${tradeId}:`, error);
    }
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
      if (message.msg_type === 'authorize') {
        if (message.error) {
          logger.error('Authorization failed:', message.error);
          return;
        }
        this.authorized = true;
        logger.info('Successfully authorized - waiting for manual trading start command');

        // Fetch account balance (but don't start trading)
        this.fetchAccountBalance();

      } else if (message.msg_type === 'tick') {
        this.handleTick(message.tick);

      } else if (message.msg_type === 'proposal_open_contract') {
        this.handleContractUpdate(message.proposal_open_contract);

      } else if (message.msg_type === 'balance') {
        // Balance update
        logger.debug('Balance received:', message.balance);

      } else if (message.msg_type === 'buy') {
        // Trade confirmation
        logger.debug('Trade confirmed:', message.buy);

      } else if (message.error) {
        logger.error('API Error:', message.error);

      } else if (message.type === 'compare_strategies') {
        // Handle strategy comparison request from UI
        this.handleStrategyComparison(message);
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

      // Send trade update to UI
      this.sendTradeToUI({
        id: contract_id,
        symbol: trade.symbol,
        prediction: trade.prediction,
        stake: trade.stake,
        result: status,
        profit: trade.profit,
        timestamp: trade.timestamp,
        paperTrade: CONFIG.paperTrading
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

  sendRequestAsync(request) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = Math.floor(Math.random() * 1000000) + 1; // Generate integer req_id
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
