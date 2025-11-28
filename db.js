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
      digitFrequencies: new Map(),
      timeframes: new Map() // symbol -> { '1m': [], '5m': [], '15m': [] }
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

    // Update multi-timeframe data
    this.updateTimeframeData(symbol, timestamp, quote, lastDigit);

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

  // Update multi-timeframe data
  updateTimeframeData(symbol, timestamp, quote, lastDigit) {
    if (!this.cache.timeframes.has(symbol)) {
      this.cache.timeframes.set(symbol, {
        '1m': [],
        '5m': [],
        '15m': []
      });
    }

    const timeframes = this.cache.timeframes.get(symbol);
    const date = new Date(timestamp);

    // Update each timeframe
    this.updateTimeframeBar(timeframes['1m'], date, quote, lastDigit, 1);
    this.updateTimeframeBar(timeframes['5m'], date, quote, lastDigit, 5);
    this.updateTimeframeBar(timeframes['15m'], date, quote, lastDigit, 15);
  }

  // Update a specific timeframe bar
  updateTimeframeBar(bars, date, quote, lastDigit, minutes) {
    const intervalMs = minutes * 60 * 1000;
    const barTime = Math.floor(date.getTime() / intervalMs) * intervalMs;

    let currentBar = bars[bars.length - 1];

    // Check if we need a new bar
    if (!currentBar || currentBar.timestamp !== barTime) {
      currentBar = {
        timestamp: barTime,
        open: quote,
        high: quote,
        low: quote,
        close: quote,
        digits: [lastDigit],
        volume: 1
      };
      bars.push(currentBar);

      // Keep only last 1000 bars per timeframe
      if (bars.length > 1000) {
        bars.shift();
      }
    } else {
      // Update existing bar
      currentBar.high = Math.max(currentBar.high, quote);
      currentBar.low = Math.min(currentBar.low, quote);
      currentBar.close = quote;
      currentBar.digits.push(lastDigit);
      currentBar.volume++;
    }
  }

  // Get multi-timeframe data for a symbol
  getTimeframeData(symbol, timeframe = '1m', limit = 100) {
    const timeframes = this.cache.timeframes.get(symbol);
    if (!timeframes) return [];

    const bars = timeframes[timeframe] || [];
    return bars.slice(-limit);
  }

  // Get higher timeframe confirmation
  getHigherTimeframeSignal(symbol, currentTimeframe = '1m') {
    const timeframeMap = { '1m': '5m', '5m': '15m' };
    const higherTimeframe = timeframeMap[currentTimeframe];

    if (!higherTimeframe) return null;

    const higherBars = this.getTimeframeData(symbol, higherTimeframe, 5);
    if (higherBars.length < 2) return null;

    const recentBar = higherBars[higherBars.length - 1];
    const prevBar = higherBars[higherBars.length - 2];

    // Simple trend analysis on higher timeframe
    const trend = recentBar.close > recentBar.open ? 'bullish' : 'bearish';
    const prevTrend = prevBar.close > prevBar.open ? 'bullish' : 'bearish';

    // Calculate digit distribution in higher timeframe
    const digitCounts = Array(10).fill(0);
    recentBar.digits.forEach(digit => digitCounts[digit]++);

    const dominantDigit = digitCounts.indexOf(Math.max(...digitCounts));

    return {
      trend,
      trendChanged: trend !== prevTrend,
      dominantDigit,
      digitDistribution: digitCounts,
      barStrength: recentBar.volume
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
