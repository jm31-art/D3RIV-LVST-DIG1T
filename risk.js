const stats = require('./stats');

class RiskManager {
  constructor() {
    this.maxDrawdown = 0.2; // 20% max drawdown
    this.maxDailyLoss = 0.1; // 10% max daily loss
    this.maxConsecutiveLosses = 5;
    this.dailyStats = new Map(); // date -> { profit, trades, losses }
    this.portfolioStats = {
      totalBalance: 1000,
      peakBalance: 1000,
      currentDrawdown: 0,
      consecutiveLosses: 0,
      dailyLoss: 0,
      lastResetDate: new Date().toDateString()
    };
  }

  // Calculate Kelly Criterion stake size
  calculateKellyStake(winRate, avgWin, avgLoss, currentBalance, fraction = 1.0) {
    if (winRate <= 0 || winRate >= 1 || avgLoss <= 0) {
      return currentBalance * 0.01; // 1% of balance as fallback
    }

    // Kelly formula: f = (bp - q) / b
    // where b = odds (avg win / avg loss), p = win rate, q = loss rate
    const b = avgWin / avgLoss;
    const p = winRate;
    const q = 1 - p;

    const kellyFraction = (b * p - q) / b;
    const optimalStake = kellyFraction * fraction * currentBalance;

    // Conservative Kelly (half Kelly)
    return Math.max(0, optimalStake * 0.5);
  }

  // Calculate position size based on risk management
  calculatePositionSize(currentBalance, riskPerTrade = 0.02, stopLossDistance = 1) {
    // Risk 2% of current balance per trade
    const riskAmount = currentBalance * riskPerTrade;

    // Position size = risk amount / stop loss distance
    // For digit matches, stop loss is the stake amount (lose stake on wrong prediction)
    const positionSize = riskAmount / stopLossDistance;

    return Math.max(1, Math.min(positionSize, currentBalance * 0.1)); // Max 10% of balance
  }

  // Update portfolio statistics
  updatePortfolioStats(tradeResult, stake, profit) {
    const today = new Date().toDateString();

    // Reset daily stats if new day
    if (today !== this.portfolioStats.lastResetDate) {
      this.dailyStats.set(this.portfolioStats.lastResetDate, {
        profit: this.portfolioStats.dailyLoss,
        trades: this.dailyStats.get(this.portfolioStats.lastResetDate)?.trades || 0,
        losses: this.dailyStats.get(this.portfolioStats.lastResetDate)?.losses || 0
      });

      this.portfolioStats.dailyLoss = 0;
      this.portfolioStats.lastResetDate = today;
    }

    // Update balance
    this.portfolioStats.totalBalance += profit;
    this.portfolioStats.peakBalance = Math.max(this.portfolioStats.peakBalance, this.portfolioStats.totalBalance);

    // Calculate drawdown
    this.portfolioStats.currentDrawdown = (this.portfolioStats.peakBalance - this.portfolioStats.totalBalance) / this.portfolioStats.peakBalance;

    // Update consecutive losses
    if (profit < 0) {
      this.portfolioStats.consecutiveLosses++;
      this.portfolioStats.dailyLoss += Math.abs(profit);
    } else {
      this.portfolioStats.consecutiveLosses = 0;
    }

    // Update daily stats
    const daily = this.dailyStats.get(today) || { profit: 0, trades: 0, losses: 0 };
    daily.profit += profit;
    daily.trades++;
    if (profit < 0) daily.losses++;
    this.dailyStats.set(today, daily);
  }

  // Check if trading should be stopped due to risk limits
  shouldStopTrading() {
    // Check max drawdown
    if (this.portfolioStats.currentDrawdown >= this.maxDrawdown) {
      console.log(`Risk management: Max drawdown reached (${(this.portfolioStats.currentDrawdown * 100).toFixed(2)}%)`);
      return { stop: true, reason: 'max_drawdown' };
    }

    // Check max daily loss
    const today = new Date().toDateString();
    const daily = this.dailyStats.get(today);
    if (daily && daily.profit < -this.portfolioStats.totalBalance * this.maxDailyLoss) {
      console.log(`Risk management: Max daily loss reached ($${Math.abs(daily.profit).toFixed(2)})`);
      return { stop: true, reason: 'max_daily_loss' };
    }

    // Check consecutive losses
    if (this.portfolioStats.consecutiveLosses >= this.maxConsecutiveLosses) {
      console.log(`Risk management: Max consecutive losses reached (${this.portfolioStats.consecutiveLosses})`);
      return { stop: true, reason: 'consecutive_losses' };
    }

    return { stop: false };
  }

  // Get dynamic stop loss level
  getStopLossLevel(currentBalance, volatility, atr = null) {
    // Base stop loss on volatility
    const baseSL = currentBalance * 0.05; // 5% of balance

    // Adjust for volatility (higher volatility = wider stop)
    const volatilityMultiplier = Math.max(0.5, Math.min(2.0, volatility / 0.5));

    // ATR-based stop loss if available
    if (atr) {
      const atrSL = atr * 2; // 2 ATR stop loss
      return Math.min(baseSL * volatilityMultiplier, atrSL);
    }

    return baseSL * volatilityMultiplier;
  }

  // Calculate volatility from recent trades
  calculateVolatility(trades, window = 20) {
    if (trades.length < window) return 0.5; // Default volatility

    const recentTrades = trades.slice(-window);
    const returns = recentTrades.map(t => t.profit);

    return stats.standardDeviation(returns);
  }

  // Implement trailing stop loss
  updateTrailingStop(currentPrice, trailingStop, isLong = true) {
    if (isLong) {
      // For long positions, trail the stop up
      const newStop = Math.max(trailingStop, currentPrice - this.getStopLossLevel(currentPrice * 0.1, 0.5));
      return newStop;
    } else {
      // For short positions, trail the stop down
      const newStop = Math.min(trailingStop, currentPrice + this.getStopLossLevel(currentPrice * 0.1, 0.5));
      return newStop;
    }
  }

  // Diversification check - ensure not too much exposure to one symbol
  checkDiversification(symbol, currentPositions, maxSymbolExposure = 0.3) {
    const symbolExposure = currentPositions
      .filter(p => p.symbol === symbol)
      .reduce((sum, p) => sum + p.stake, 0);

    const totalExposure = currentPositions.reduce((sum, p) => sum + p.stake, 0);

    if (totalExposure === 0) return true;

    const exposureRatio = symbolExposure / totalExposure;

    return exposureRatio <= maxSymbolExposure;
  }

  // Risk-adjusted position sizing using Value at Risk (VaR)
  calculateVaRPositionSize(historicalReturns, confidenceLevel = 0.95, timeHorizon = 1) {
    if (historicalReturns.length < 10) return 0;

    // Sort returns in ascending order
    const sortedReturns = [...historicalReturns].sort((a, b) => a - b);

    // Find the return at the confidence level
    const index = Math.floor((1 - confidenceLevel) * sortedReturns.length);
    const varReturn = sortedReturns[index];

    // Position size based on VaR (risk no more than 2% of portfolio)
    const maxLoss = this.portfolioStats.totalBalance * 0.02;
    const positionSize = Math.abs(maxLoss / varReturn);

    return Math.max(1, positionSize);
  }

  // Stress test portfolio against various scenarios
  stressTest(scenarios = []) {
    const results = [];

    for (const scenario of scenarios) {
      const testBalance = this.portfolioStats.totalBalance;
      let stressedBalance = testBalance;

      // Apply scenario shocks
      for (const shock of scenario.shocks) {
        stressedBalance *= (1 + shock);
      }

      const drawdown = (this.portfolioStats.peakBalance - stressedBalance) / this.portfolioStats.peakBalance;

      results.push({
        scenario: scenario.name,
        initialBalance: testBalance,
        stressedBalance,
        drawdown,
        breachLimit: drawdown > this.maxDrawdown
      });
    }

    return results;
  }

  // Generate risk report
  generateRiskReport() {
    const today = new Date().toDateString();
    const daily = this.dailyStats.get(today) || { profit: 0, trades: 0, losses: 0 };

    return {
      timestamp: new Date().toISOString(),
      portfolio: {
        totalBalance: this.portfolioStats.totalBalance,
        peakBalance: this.portfolioStats.peakBalance,
        currentDrawdown: this.portfolioStats.currentDrawdown,
        consecutiveLosses: this.portfolioStats.consecutiveLosses
      },
      daily: {
        date: today,
        profit: daily.profit,
        trades: daily.trades,
        losses: daily.losses,
        lossRate: daily.trades > 0 ? daily.losses / daily.trades : 0
      },
      limits: {
        maxDrawdown: this.maxDrawdown,
        maxDailyLoss: this.maxDailyLoss,
        maxConsecutiveLosses: this.maxConsecutiveLosses
      },
      alerts: this.shouldStopTrading()
    };
  }

  // Reset risk metrics (use with caution)
  resetMetrics() {
    this.portfolioStats = {
      totalBalance: 1000,
      peakBalance: 1000,
      currentDrawdown: 0,
      consecutiveLosses: 0,
      dailyLoss: 0,
      lastResetDate: new Date().toDateString()
    };
    this.dailyStats.clear();
    console.log('Risk metrics reset');
  }

  // Update risk parameters
  updateParameters(newParams = {}) {
    if (newParams.maxDrawdown !== undefined) this.maxDrawdown = newParams.maxDrawdown;
    if (newParams.maxDailyLoss !== undefined) this.maxDailyLoss = newParams.maxDailyLoss;
    if (newParams.maxConsecutiveLosses !== undefined) this.maxConsecutiveLosses = newParams.maxConsecutiveLosses;

    console.log('Risk parameters updated:', {
      maxDrawdown: this.maxDrawdown,
      maxDailyLoss: this.maxDailyLoss,
      maxConsecutiveLosses: this.maxConsecutiveLosses
    });
  }
}

module.exports = new RiskManager();
