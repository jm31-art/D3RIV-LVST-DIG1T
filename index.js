require('dotenv').config();
const express = require('express');
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

// Startup check: require API token to be present
const apiToken = process.env.DERIV_API_TOKEN;
if (!apiToken) {
  logger.error('Missing required environment variable: DERIV_API_TOKEN. Please add DERIV_API_TOKEN to your environment variables or .env file.');
  process.exit(1);
}

// Bot configuration
const CONFIG = {
  // Deriv API settings
  appId: process.env.DERIV_APP_ID || '1089',
  apiToken: apiToken,
  websocketUrl: 'wss://ws.derivws.com/websockets/v3',

  // Trading settings
  symbols: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'],
  minSamplesRequired: 10000,
  minProbabilityThreshold: 50,
  maxConcurrentTrades: 1,
  tradeCooldown: 10000,

  // Risk management
  riskPerTrade: 0.02,
  maxDrawdown: 0.15,
  maxDailyLoss: 0.08,

  // ML settings
  mlRetrainingInterval: 1800000,
  backtestInterval: 86400000,

  // Strategy settings
  strategy: 'ensemble',
  useBacktestValidation: true,
  backtestWindow: 1000
};

class DerivBot {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.authorized = false;
    this.activeTrades = new Map();
    this.lastTradeTime = 0;
    this.symbolSubscriptions = new Map();
    this.tickBuffers = new Map();
    this.predictionCache = new Map();
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

    // reconnect/backoff helpers
    this.reconnectDelay = 5000; // start at 5s
    this.maxReconnectDelay = 60000; // cap at 60s

    // Initialize modules
    this.initializeModules();

    // Schedule periodic tasks
    this.scheduleTasks();
  }

  initializeModules() {
    logger.info('Initializing bot modules...');

    // Update risk parameters
    if (risk && typeof risk.updateParameters === 'function') {
      risk.updateParameters({
        maxDrawdown: CONFIG.maxDrawdown,
        maxDailyLoss: CONFIG.maxDailyLoss
      });
    }

    // Initialize portfolio
    if (portfolio && typeof portfolio.initialize === 'function') {
      portfolio.initialize(CONFIG.symbols);
    }

    logger.info('Modules initialized successfully');
  }

  scheduleTasks() {
    cron.schedule('0 2 * * *', async () => { // 2 AM daily
      logger.info('Running scheduled backtest...');
      await this.runScheduledBacktest();
    });

    cron.schedule('0 */1 * * *', async () => { // Every hour
      logger.info('Retraining ML models...');
      await this.retrainModels();
    });

    cron.schedule('0 */4 * * *', () => { // Every 4 hours
      this.generatePerformanceReport();
    });

    cron.schedule('0 3 * * *', () => { // 3 AM daily
      if (db && typeof db.cleanup === 'function') {
        db.cleanup();
        logger.info('Database cleanup completed');
      }
    });
  }

  async connect() {
    try {
      logger.info('Connecting to Deriv WebSocket...');
      this.ws = new WebSocket(CONFIG.websocketUrl + '?app_id=' + CONFIG.appId);

      this.ws.on('open', () => {
        logger.info('WebSocket connected');
        this.isConnected = true;
        // reset reconnect delay on successful connection
        this.reconnectDelay = 5000;
        this.authorize();
      });

      this.ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          this.handleMessage(parsed);
        } catch (err) {
          logger.error('Failed to parse incoming message', err);
        }
      });

      this.ws.on('close', (code, reason) => {
        logger.warn('WebSocket disconnected', { code, reason });
        this.isConnected = false;
        this.authorized = false;
        // Exponential backoff for reconnect
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
      });

      this.ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        // ws 'error' will often be followed by 'close' — no need to immediately reconnect here
      });

    } catch (error) {
      logger.error('Connection error:', error);
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
    }
  }

  authorize() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !CONFIG.apiToken) {
      logger.error('Cannot authorize: missing WebSocket or API token or socket not open');
      return;
    }

    const authRequest = {
      authorize: CONFIG.apiToken
      // do NOT set req_id here; sendRequest will add a numeric req_id
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

    for (const symbol of CONFIG.symbols) {
      await this.subscribeToTicks(symbol);
    }

    this.startTradingLoop();
  }

  async subscribeToTicks(symbol) {
    if (this.symbolSubscriptions.has(symbol)) return;

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
    setInterval(async () => {
      if (!this.isConnected || !this.authorized) return;
      if (this.activeTrades.size >= CONFIG.maxConcurrentTrades) return;
      if (Date.now() - this.lastTradeTime < CONFIG.tradeCooldown) return;

      const riskCheck = (risk && typeof risk.shouldStopTrading === 'function') ? risk.shouldStopTrading() : { stop: false };
      if (riskCheck.stop) {
        logger.warn(`Trading stopped due to risk: ${riskCheck.reason}`);
        return;
      }

      for (const symbol of CONFIG.symbols) {
        try {
          const opportunity = await this.evaluateTradingOpportunity(symbol);
          if (opportunity) {
            await this.executeTrade(opportunity);
            break;
          }
        } catch (error) {
          logger.error(`Error evaluating ${symbol}:`, error);
        }
      }
    }, 2000);
  }

  async evaluateTradingOpportunity(symbol) {
    const tickCount = db.getTickCount ? db.getTickCount(symbol) : 0;
    if (tickCount < CONFIG.minSamplesRequired) return null;

    const recentTicks = db.getRecentTicks ? db.getRecentTicks(symbol, 100) : [];
    if (recentTicks.length < 10) return null;

    const df = db.getDigitFrequencies ? db.getDigitFrequencies(symbol) : { data: {}, totalSamples: 0 };
    const digitFreq = df.data || {};
    const totalSamples = df.totalSamples || 0;
    if (totalSamples < CONFIG.minSamplesRequired) return null;

    const probabilities = {};
    for (let digit = 0; digit <= 9; digit++) {
      probabilities[digit] = totalSamples > 0 ? (digitFreq[digit] || 0) / totalSamples * 100 : 0;
    }

    const recentDigits = recentTicks.map(tick => tick.last_digit);

    const prediction = await this.generatePrediction(symbol, {
      probabilities,
      recentDigits,
      totalSamples,
      currentDigit: recentDigits[recentDigits.length - 1]
    });

    if (!prediction || prediction.probability < CONFIG.minProbabilityThreshold) return null;

    if (CONFIG.useBacktestValidation) {
      const isValid = await this.validateWithBacktest(symbol, prediction);
      if (!isValid) {
        logger.debug(`Backtest validation failed for ${symbol} prediction ${prediction.digit}`);
        return null;
      }
    }

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
        return ml.predictWithMarkov ? ml.predictWithMarkov(symbol, context.currentDigit) : null;
      case 'neural':
        return ml.predict ? ml.predict(symbol, context.recentDigits) : null;
      case 'ensemble':
        return ml.predictEnsemble ? ml.predictEnsemble(symbol, context.currentDigit, context.recentDigits) : null;
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
    if (!recentDigits || recentDigits.length < 5) return null;
    const series = recentDigits.slice(-10);
    const trend = series[series.length - 1] - series[series.length - 2];
    const predicted = Math.max(0, Math.min(9, series[series.length - 1] + trend));
    return { digit: Math.round(predicted), probability: 50, confidence: 0.5 };
  }

  async validateWithBacktest(symbol, prediction) {
    try {
      if (!backtest || typeof backtest.runBacktest !== 'function') return false;
      const backtestResult = await backtest.runBacktest(CONFIG.strategy, symbol, {
        maxTrades: 50,
        riskPerTrade: CONFIG.riskPerTrade
      });
      return backtestResult.performance.winRate > 0.5 &&
             backtestResult.performance.profitFactor > 1.1;
    } catch (error) {
      logger.error('Backtest validation error:', error);
      return false;
    }
  }

  calculateStakeSize(symbol, prediction, probabilities) {
    const currentBalance = (portfolio && typeof portfolio.getBalance === 'function') ? portfolio.getBalance() : 100; // fallback
    const winRate = prediction.probability / 100;
    const avgWin = 0.8;
    const avgLoss = 1.0;

    const kellyStake = (risk && typeof risk.calculateKellyStake === 'function') ?
      risk.calculateKellyStake(winRate, avgWin, avgLoss, currentBalance, 0.5) : currentBalance * 0.01;

    const riskStake = currentBalance * CONFIG.riskPerTrade;
    const maxSymbolStake = (portfolio && typeof portfolio.getMaxStakeForSymbol === 'function') ?
      portfolio.getMaxStakeForSymbol(symbol) : currentBalance * 0.1;

    return Math.min(kellyStake, riskStake, maxSymbolStake, currentBalance * 0.1);
  }

  async executeTrade(opportunity) {
    try {
      logger.info(`Executing trade: ${opportunity.symbol} -> ${opportunity.prediction} ($${opportunity.stake.toFixed(2)})`);

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

      const response = await this.sendRequestAsync(tradeRequest);

      if (response.error) {
        logger.error('Trade execution failed:', response.error);
        return;
      }

      const tradeId = response.buy?.contract_id;
      if (!tradeId) {
        logger.error('No contract_id returned in buy response', { response });
        return;
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
      if (db && typeof db.insertTrade === 'function') {
        db.insertTrade(opportunity.symbol, Date.now(), opportunity.prediction, opportunity.stake, 'pending');
      }

      this.lastTradeTime = Date.now();
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
        const ticks = db.getRecentTicks(symbol, 5000) || [];
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
    const statsObj = db.getTradeStats ? db.getTradeStats() : { total_trades: 0, wins: 0, total_profit: 0, avg_profit: 0 };
    const riskReport = (risk && typeof risk.generateRiskReport === 'function') ? risk.generateRiskReport() : { portfolio: { currentDrawdown: 0 } };

    logger.info('=== Performance Report ===');
    logger.info(`Total Trades: ${statsObj.total_trades}`);
    logger.info(`Win Rate: ${statsObj.total_trades ? ((statsObj.wins / statsObj.total_trades) * 100).toFixed(2) : '0.00'}%`);
    logger.info(`Total Profit: $${(statsObj.total_profit || 0).toFixed(2)}`);
    logger.info(`Average Profit: $${(statsObj.avg_profit || 0).toFixed(2)}`);
    logger.info(`Current Drawdown: ${(riskReport.portfolio.currentDrawdown * 100).toFixed(2)}%`);
    logger.info('========================');
  }

  handleMessage(message) {
    try {
      // Authorization response
      if (message.msg_type === 'authorize') {
        if (message.error) {
          logger.error('Authorization failed:', message.error);
          return;
        }
        this.authorized = true;
        logger.info('Successfully authorized');
        this.startTrading();

      } else if (message.msg_type === 'tick' || message.tick) {
        this.handleTick(message.tick || message);

      } else if (message.msg_type === 'proposal_open_contract' || message.proposal_open_contract) {
        this.handleContractUpdate(message.proposal_open_contract || message);

      } else if (message.msg_type === 'buy' || message.buy) {
        // buy confirmations handled in sendRequestAsync via req_id; keep debug
        logger.debug('Buy message:', message.buy || message);

      } else if (message.error) {
        logger.error('API Error:', message.error);
      }

    } catch (error) {
      logger.error('Message handling error:', error);
    }
  }

  handleTick(tick) {
    if (!tick) return;
    const { symbol, quote, epoch } = tick;
    const lastDigit = parseInt(quote.toString().split('.')[1]?.[0] || '0');

    if (db && typeof db.insertTick === 'function') {
      db.insertTick(symbol, epoch * 1000, quote, lastDigit);
    }

    const buffer = this.tickBuffers.get(symbol) || [];
    buffer.push({ timestamp: epoch * 1000, quote, last_digit: lastDigit });
    if (buffer.length > 1000) buffer.shift();
    this.tickBuffers.set(symbol, buffer);

    if (portfolio && typeof portfolio.updatePrice === 'function') {
      portfolio.updatePrice(symbol, quote);
    }
  }

  handleContractUpdate(contract) {
    const { contract_id, status, profit } = contract;

    if (!this.activeTrades.has(contract_id)) return;

    const trade = this.activeTrades.get(contract_id);

    if (status === 'won' || status === 'lost') {
      trade.result = status;
      trade.profit = profit || 0;
      trade.payout = trade.stake + profit;

      if (db && typeof db.updateTrade === 'function') {
        db.updateTrade(contract_id, status, trade.payout, trade.profit);
      }

      if (risk && typeof risk.updatePortfolioStats === 'function') {
        risk.updatePortfolioStats(status === 'won', trade.stake, trade.profit);
      }

      this.updatePerformanceMetrics(trade);
      this.activeTrades.delete(contract_id);

      logger.info(`Trade ${contract_id} completed: ${status}, Profit: $${trade.profit.toFixed(2)}`);
    }
  }

  updatePerformanceMetrics(trade) {
    this.performanceMetrics.totalTrades++;
    if (trade.result === 'won') this.performanceMetrics.wins++;
    else this.performanceMetrics.losses++;
    this.performanceMetrics.totalProfit += (trade.profit || 0);
    this.performanceMetrics.winRate = this.performanceMetrics.wins / Math.max(1, this.performanceMetrics.totalTrades);
  }

  // sendRequest uses integer req_id
  sendRequest(request) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const requestId = Number(Date.now()); // integer requirement by Deriv
      const fullRequest = { ...request, req_id: requestId };
      try {
        this.ws.send(JSON.stringify(fullRequest));
      } catch (err) {
        logger.error('Failed to send request', err);
      }
    }
  }

  // sendRequestAsync resolves when a response with matching numeric req_id arrives
  sendRequestAsync(request, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
           }

    const requestId = Number(Date.now());
    const fullRequest = { ...request, req_id: requestId };

    const timeout = setTimeout(() => {
      delete this.pendingRequests[requestId];
      reject(new Error(`Timeout waiting for response to req_id ${requestId}`));
    }, timeoutMs);

    this.pendingRequests[requestId] = (response) => {
      clearTimeout(timeout);
      resolve(response);
    };

    try {
      this.ws.send(JSON.stringify(fullRequest));
    } catch (err) {
      clearTimeout(timeout);
      delete this.pendingRequests[requestId];
      reject(err);
    }
  });
}

// End of class
}

// Export class
module.exports = DerivBot;

// Start the bot if running directly
if (require.main === module) {
  const bot = new DerivBot();
  bot.connect();
}
const http = require("http");
const PORT = process.env.PORT || 10000;

http
  .createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot running");
  })
  .listen(PORT, () => console.log(`Server running on ${PORT}`));
