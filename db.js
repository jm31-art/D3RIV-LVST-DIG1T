const fs = require('fs');
const path = require('path');

/**
 * File-based database manager for trading bot
 * Provides JSON-based persistence with proper error handling
 * Can be upgraded to SQLite when dependencies are available
 */
class DatabaseManager {
  constructor() {
    this.dataPath = path.join(__dirname, 'data');
    this.files = {
      ticks: path.join(this.dataPath, 'ticks.json'),
      trades: path.join(this.dataPath, 'trades.json'),
      performance: path.join(this.dataPath, 'performance.json'),
      frequencies: path.join(this.dataPath, 'frequencies.json')
    };

    this.data = {
      ticks: [],
      trades: [],
      performance: [],
      frequencies: {}
    };

    this.initialized = false;

    // Initialize database
    this.initializeDatabase();
  }

  initializeDatabase() {
    try {
      // Create data directory if it doesn't exist
      if (!fs.existsSync(this.dataPath)) {
        fs.mkdirSync(this.dataPath, { recursive: true });
      }

      // Load existing data
      this.loadData();

      this.initialized = true;
      console.log('Database initialized successfully (JSON-based)');

    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  loadData() {
    Object.entries(this.files).forEach(([key, filePath]) => {
      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          this.data[key] = JSON.parse(content);
        }
      } catch (error) {
        console.warn(`Failed to load ${key} data:`, error.message);
        this.data[key] = key === 'frequencies' ? {} : [];
      }
    });
  }

  saveData() {
    Object.entries(this.files).forEach(([key, filePath]) => {
      try {
        const content = JSON.stringify(this.data[key], null, 2);
        fs.writeFileSync(filePath, content);
      } catch (error) {
        console.error(`Failed to save ${key} data:`, error.message);
      }
    });
  }

  // JSON-based data structure is ready - no table creation needed
  createTables() {
    // No-op for JSON-based storage
  }

  createIndexes() {
    // No-op for JSON-based storage
  }

  // Insert a new tick with JSON-based storage
  insertTick(symbol, timestamp, quote, lastDigit) {
    const tick = {
      id: Date.now() + Math.random(),
      symbol,
      timestamp,
      quote,
      last_digit: lastDigit,
      created_at: new Date().toISOString()
    };

    this.data.ticks.push(tick);

    // Update digit frequencies
    this.updateDigitFrequency(symbol, lastDigit);

    // Clean up old ticks (keep last MAX_TICKS_PER_SYMBOL)
    const config = require('./config');
    this.cleanupOldTicks(symbol, config.MAX_TICKS_PER_SYMBOL);

    this.saveData();
    return Promise.resolve({ changes: 1, id: tick.id });
  }

  // Insert a new trade
  insertTrade(symbol, timestamp, prediction, stake, result = 'pending', payout = null, profit = null, tradeId = null, strategy = null, probability = null, confidence = null, simulated = false) {
    const finalTradeId = tradeId || `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const trade = {
      id: Date.now() + Math.random(),
      trade_id: finalTradeId,
      symbol,
      timestamp,
      prediction,
      stake,
      result,
      payout,
      profit,
      strategy,
      probability,
      confidence,
      simulated: simulated ? 1 : 0,
      created_at: new Date().toISOString()
    };

    this.data.trades.push(trade);
    this.saveData();

    return Promise.resolve(trade);
  }

  // Update trade result
  updateTrade(tradeId, result, payout, profit) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE trades SET result = ?, payout = ?, profit = ? WHERE trade_id = ?`;

      this.db.run(sql, [result, payout, profit, tradeId], function(err) {
        if (err) {
          console.error('Error updating trade:', err.message);
          reject(err);
          return;
        }
        resolve({ changes: this.changes });
      });
    });
  }

  // Insert performance metrics
  insertPerformance(timestamp, totalProfit, winRate, profitFactor, maxDrawdown, sharpeRatio, totalTrades) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO performance_metrics (timestamp, total_profit, win_rate, profit_factor, max_drawdown, sharpe_ratio, total_trades)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;

      this.db.run(sql, [timestamp, totalProfit, winRate, profitFactor, maxDrawdown, sharpeRatio, totalTrades], function(err) {
        if (err) {
          console.error('Error inserting performance:', err.message);
          reject(err);
          return;
        }
        resolve({ changes: this.changes, id: this.lastID });
      });
    });
  }

  // Get digit frequencies for a symbol
  getDigitFrequencies(symbol) {
    const freqData = this.data.frequencies[symbol] || {};
    const data = {};
    let totalSamples = 0;

    Object.entries(freqData).forEach(([digit, frequency]) => {
      data[parseInt(digit)] = frequency;
      totalSamples += frequency;
    });

    // Return synchronous object for JSON-based storage
    return { data, totalSamples };
  }

  // Update digit frequencies for a symbol
  updateDigitFrequency(symbol, digit) {
    if (!this.data.frequencies[symbol]) {
      this.data.frequencies[symbol] = {};
    }

    this.data.frequencies[symbol][digit] = (this.data.frequencies[symbol][digit] || 0) + 1;
    this.saveData();

    return Promise.resolve({ changes: 1 });
  }

  // Get recent ticks for a symbol
  getRecentTicks(symbol, limit = 1000) {
    const symbolTicks = this.data.ticks
      .filter(tick => tick.symbol === symbol)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(tick => ({
        id: tick.id,
        symbol: tick.symbol,
        timestamp: tick.timestamp,
        quote: tick.quote,
        last_digit: tick.last_digit
      }));

    // Return synchronous array for JSON-based storage
    return symbolTicks;
  }

  // Get recent trades
  getRecentTrades(limit = 100) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM trades ORDER BY timestamp DESC LIMIT ?`;

      this.db.all(sql, [limit], (err, rows) => {
        if (err) {
          console.error('Error getting recent trades:', err.message);
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  }

  // Get latest performance metrics
  getLatestPerformance() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM performance_metrics ORDER BY timestamp DESC LIMIT 1`;

      this.db.get(sql, [], (err, row) => {
        if (err) {
          console.error('Error getting latest performance:', err.message);
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });
  }

  // Get tick count for a symbol
  getTickCount(symbol) {
    const count = this.data.ticks.filter(tick => tick.symbol === symbol).length;
    // Return synchronous count for JSON-based storage
    return count;
  }

  // Get trade statistics
  getTradeStats() {
    const trades = this.data.trades;
    const totalTrades = trades.length;
    const wins = trades.filter(t => t.result === 'won').length;
    const losses = trades.filter(t => t.result === 'lost').length;
    const totalProfit = trades.reduce((sum, t) => sum + (t.profit || 0), 0);
    const avgProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;

    return Promise.resolve({
      total_trades: totalTrades,
      wins,
      losses,
      total_profit: totalProfit,
      avg_profit: avgProfit
    });
  }

  // Clean up old ticks to prevent memory bloat
  cleanupOldTicks(symbol, maxTicks) {
    const symbolTicks = this.data.ticks.filter(tick => tick.symbol === symbol);
    if (symbolTicks.length > maxTicks) {
      // Sort by timestamp descending and keep only the most recent
      const sortedTicks = symbolTicks.sort((a, b) => b.timestamp - a.timestamp);
      const ticksToKeep = sortedTicks.slice(0, maxTicks);
      const tickIdsToKeep = new Set(ticksToKeep.map(tick => tick.id));

      // Remove old ticks
      this.data.ticks = this.data.ticks.filter(tick =>
        tick.symbol !== symbol || tickIdsToKeep.has(tick.id)
      );
    }

    return Promise.resolve({ changes: 1 });
  }

  // Multi-timeframe data (simplified for JSON storage)
  updateTimeframeData(symbol, timestamp, quote, lastDigit) {
    // Simplified - just update digit frequencies for now
    return Promise.resolve();
  }

  // Get multi-timeframe data (stub for JSON storage)
  getTimeframeData(symbol, timeframe = '1m', limit = 100) {
    // Return empty array for now - can be implemented later if needed
    return Promise.resolve([]);
  }

  // Get higher timeframe confirmation (stub)
  getHigherTimeframeSignal(symbol, currentTimeframe = '1m') {
    return Promise.resolve(null);
  }

  // Clean up old data (simplified for JSON storage)
  cleanup() {
    const config = require('./config');
    const retentionMs = config.DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - retentionMs;

    const initialTicks = this.data.ticks.length;
    const initialTrades = this.data.trades.length;
    const initialPerf = this.data.performance.length;

    // Clean up old ticks
    this.data.ticks = this.data.ticks.filter(tick => tick.timestamp >= cutoffTime);

    // Clean up old performance data (keep last 90 days)
    const perfCutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
    this.data.performance = this.data.performance.filter(p => p.timestamp >= perfCutoff);

    this.saveData();

    const summary = {
      ticksDeleted: initialTicks - this.data.ticks.length,
      perfDeleted: initialPerf - this.data.performance.length
    };

    console.log('Database cleanup completed:', summary);
    return Promise.resolve(summary);
  }

  // Vacuum (no-op for JSON storage)
  vacuum() {
    console.log('JSON storage - no vacuum needed');
    return Promise.resolve();
  }

  // Close (no-op for JSON storage)
  close() {
    console.log('JSON storage - no connection to close');
    return Promise.resolve();
  }

  // Get database statistics
  getStats() {
    return Promise.resolve({
      ticks: this.data.ticks.length,
      trades: this.data.trades.length,
      performanceRecords: this.data.performance.length,
      timeframeBars: 0, // Not implemented in JSON version
      totalRecords: this.data.ticks.length + this.data.trades.length + this.data.performance.length
    });
  }
}

module.exports = new DatabaseManager();
