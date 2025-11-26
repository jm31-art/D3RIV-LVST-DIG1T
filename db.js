const fs = require('fs');
const path = require('path');

// Simple file-based database implementation
class DatabaseManager {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    this.ensureDataDir();

    // In-memory cache for performance
    this.cache = {
      ticks: new Map(),
      trades: [],
      performance: null,
      digitFrequencies: new Map()
    };

    // Load existing data
    this.loadData();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  loadData() {
    try {
      // Load digit frequencies
      const freqFile = path.join(this.dataDir, 'digit_frequencies.json');
      if (fs.existsSync(freqFile)) {
        const data = JSON.parse(fs.readFileSync(freqFile, 'utf8'));
        this.cache.digitFrequencies = new Map(Object.entries(data));
      }

      // Load trades
      const tradesFile = path.join(this.dataDir, 'trades.json');
      if (fs.existsSync(tradesFile)) {
        this.cache.trades = JSON.parse(fs.readFileSync(tradesFile, 'utf8'));
      }

      // Load performance
      const perfFile = path.join(this.dataDir, 'performance.json');
      if (fs.existsSync(perfFile)) {
        this.cache.performance = JSON.parse(fs.readFileSync(perfFile, 'utf8'));
      }

      console.log('Database loaded successfully');
    } catch (error) {
      console.error('Error loading database:', error.message);
    }
  }

  saveData() {
    try {
      // Save digit frequencies
      const freqData = Object.fromEntries(this.cache.digitFrequencies);
      fs.writeFileSync(
        path.join(this.dataDir, 'digit_frequencies.json'),
        JSON.stringify(freqData, null, 2)
      );

      // Save trades
      fs.writeFileSync(
        path.join(this.dataDir, 'trades.json'),
        JSON.stringify(this.cache.trades, null, 2)
      );

      // Save performance
      if (this.cache.performance) {
        fs.writeFileSync(
          path.join(this.dataDir, 'performance.json'),
          JSON.stringify(this.cache.performance, null, 2)
        );
      }
    } catch (error) {
      console.error('Error saving database:', error.message);
    }
  }

  // Insert a new tick
  insertTick(symbol, timestamp, quote, lastDigit) {
    if (!this.cache.ticks.has(symbol)) {
      this.cache.ticks.set(symbol, []);
    }
    const ticks = this.cache.ticks.get(symbol);
    ticks.push({ timestamp, quote, lastDigit });

    // Keep only last MAX_TICKS_PER_SYMBOL ticks per symbol
    const config = require('./config');
    if (ticks.length > config.MAX_TICKS_PER_SYMBOL) {
      ticks.shift();
    }

    // Update digit frequencies
    this.updateDigitFrequency(symbol, lastDigit);

    return { changes: 1 };
  }

  // Insert a new trade
  insertTrade(symbol, timestamp, prediction, stake, result = 'pending', payout = null, profit = null) {
    const trade = {
      id: Date.now(),
      symbol,
      timestamp,
      prediction,
      stake,
      result,
      payout,
      profit
    };
    this.cache.trades.push(trade);
    this.saveData();
    return trade;
  }

  // Update trade result
  updateTrade(tradeId, result, payout, profit) {
    const trade = this.cache.trades.find(t => t.id === tradeId);
    if (trade) {
      trade.result = result;
      trade.payout = payout;
      trade.profit = profit;
      this.saveData();
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  // Insert performance metrics
  insertPerformance(timestamp, totalProfit, winRate, profitFactor, maxDrawdown, sharpeRatio, totalTrades) {
    this.cache.performance = {
      timestamp,
      totalProfit,
      winRate,
      profitFactor,
      maxDrawdown,
      sharpeRatio,
      totalTrades
    };
    this.saveData();
    return { changes: 1 };
  }

  // Get digit frequencies for a symbol
  getDigitFrequencies(symbol) {
    const data = this.cache.digitFrequencies.get(symbol) || {};
    const totalSamples = Object.values(data).reduce((sum, count) => sum + count, 0);
    return { data, totalSamples };
  }

  // Update digit frequencies for a symbol
  updateDigitFrequency(symbol, digit) {
    if (!this.cache.digitFrequencies.has(symbol)) {
      this.cache.digitFrequencies.set(symbol, {});
    }
    const freq = this.cache.digitFrequencies.get(symbol);
    freq[digit] = (freq[digit] || 0) + 1;
  }

  // Update digit frequencies (for bulk updates)
  updateDigitFrequencies(symbol, data, totalSamples) {
    this.cache.digitFrequencies.set(symbol, data);
    this.saveData();
  }

  // Get recent ticks for a symbol
  getRecentTicks(symbol, limit = 1000) {
    const ticks = this.cache.ticks.get(symbol) || [];
    return ticks.slice(-limit).map((tick, index) => ({
      id: index,
      symbol,
      ...tick
    }));
  }

  // Get recent trades
  getRecentTrades(limit = 100) {
    return this.cache.trades.slice(-limit);
  }

  // Get latest performance metrics
  getLatestPerformance() {
    return this.cache.performance;
  }

  // Get tick count for a symbol
  getTickCount(symbol) {
    const ticks = this.cache.ticks.get(symbol) || [];
    return ticks.length;
  }

  // Get trade statistics
  getTradeStats() {
    const trades = this.cache.trades;
    const totalTrades = trades.length;
    const wins = trades.filter(t => t.result === 'won').length;
    const losses = trades.filter(t => t.result === 'lost').length;
    const totalProfit = trades.reduce((sum, t) => sum + (t.profit || 0), 0);
    const avgProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;

    return {
      total_trades: totalTrades,
      wins,
      losses,
      total_profit: totalProfit,
      avg_profit: avgProfit
    };
  }

  // Clean up old data (keep last DATA_RETENTION_DAYS days of ticks, all trades)
  cleanup() {
    const config = require('./config');
    const retentionMs = config.DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - retentionMs;

    for (const [symbol, ticks] of this.cache.ticks) {
      const filteredTicks = ticks.filter(tick => tick.timestamp >= cutoffTime);
      this.cache.ticks.set(symbol, filteredTicks);
    }

    console.log('Database cleanup completed');
    this.saveData();
  }

  // Close database connection (no-op for file-based)
  close() {
    this.saveData();
  }
}

module.exports = new DatabaseManager();
