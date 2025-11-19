require('dotenv').config();
const WebSocket = require('ws');
const winston = require('winston');
const cron = require('node-cron');

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

// Bot configuration
const CONFIG = {
  // Deriv API settings
  appId: process.env.DERIV_APP_ID || '1089',
  apiToken: process.env.DERIV_API_TOKEN,
  websocketUrl: 'wss://ws.derivws.com/websockets/v3',

  // Trading settings
  symbols: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'],
  minSamplesRequired: 10000, // Minimum samples before trading
  minProbabilityThreshold: 50, // Realistic threshold for better accuracy
  maxConcurrentTrades: 1, // Reduced for safer trading
  tradeCooldown: 10000, // Increased cooldown for safety

  // Risk management
  riskPerTrade: 0.02, // 2% risk per trade
  maxDrawdown: 0.15, // 15% max drawdown
  maxDailyLoss: 0.08, // 8% max daily loss

  // ML settings
  mlRetrainingInterval: 1800000, // 30 minutes for faster adaptation to 95%+ accuracy
  backtestInterval: 86400000, // Daily backtest

  // Strategy settings
  strategy: 'ensemble', // 'frequency', 'markov', 'neural', 'ensemble', 'time_series'
  useBacktestValidation: true,
  backtestWindow: 1000 // ticks for backtest validation
};

class DerivBot {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.authorized = false;
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

    // Initialize modules
    this.initializeModules();

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

  scheduleTasks() {
    // Daily backtest and performance analysis
    cron.schedule('0 2 * * *', async () => { // 2 AM daily
      logger.info('Running scheduled backtest...');
      await this.runScheduledBacktest();
    });

    // ML model retraining
    cron.schedule('0 */1 * * *', async () => { // Every hour
      logger.info('Retraining ML models...');
      await this.retrainModels();
    });

    // Performance reporting
    cron.schedule('0 */4 * * *', () => { // Every 4 hours
      this.generatePerformanceReport();
    });

    // Data cleanup
    cron.schedule('0 3 * * *', () => { // 3 AM daily
      db.cleanup();
      logger.info('Database cleanup completed');
    });
  }

  async connect() {
    try {
      logger.info('Connecting to Deriv WebSocket...');
      this.ws = new WebSocket(CONFIG.websocketUrl + '?app_id=' + CONFIG.appId);

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
        setTimeout(() => this.connect(), 5000); // Reconnect after 5 seconds
      });

      this.ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
      });

    } catch (error) {
      logger.error('Connection error:', error);
      setTimeout(() => this.connect(), 5000);
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
    logger.info('Authorization request sent');
  }

  async startTrading() {
    if (!this.authorized) {
      logger.warn('Cannot start trading: not authorized');
      return;
    }

    logger.info('Starting trading bot...');

    // Subscribe to tick data for all symbols
    for (const symbol of CONFIG.symbols) {
      await this.subscribeToTicks(symbol);
    }

    // Start the trading loop
    this.startTradingLoop();
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
      if (!this.isConnected || !this.authorized) return;
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
        maxTrades: 50,
        riskPerTrade: CONFIG.riskPerTrade
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
    const avgWin = 0.8; // 80% payout
    const avgLoss = 1.0; // Lose stake

    const kellyStake = risk.calculateKellyStake(winRate, avgWin, avgLoss, currentBalance, 0.5);
    const riskStake = currentBalance * CONFIG.riskPerTrade;

    // Apply diversification check
    const maxSymbolStake = portfolio.getMaxStakeForSymbol(symbol);

    return Math.min(kellyStake, riskStake, maxSymbolStake, currentBalance * 0.1);
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
          maxTrades: 100,
          riskPerTrade: CONFIG.riskPerTrade
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
  }

  handleMessage(message) {
    try {
      if (message.msg_type === 'authorize') {
        if (message.error) {
          logger.error('Authorization failed:', message.error);
          return;
        }
        this.authorized = true;
        logger.info('Successfully authorized');
        this.startTrading();

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
      }, 10000);

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
