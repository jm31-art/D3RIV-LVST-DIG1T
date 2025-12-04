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
    this.activePositions = new Map(); // positionId -> { entryPrice, currentStop, trailingAmount, ... }
    this.trailingStops = new Map(); // symbol -> trailing stop configuration
    this.partialCloseRules = new Map(); // positionId -> partial close configuration
    this.scaleInStrategies = new Map(); // strategyId -> scale-in configuration
    this.scaleOutStrategies = new Map(); // strategyId -> scale-out configuration
  }

  // Enhanced Kelly Criterion with multiple variants
  calculateKellyStake(winRate, avgWin, avgLoss, currentBalance, fraction = 1.0, variant = 'classic') {
    if (winRate <= 0 || winRate >= 1 || avgLoss <= 0) {
      return currentBalance * 0.01; // 1% of balance as fallback
    }

    const b = avgWin / avgLoss; // Odds ratio
    const p = winRate;
    const q = 1 - p;

    let kellyFraction;

    switch (variant) {
      case 'classic':
        // Original Kelly: f = (bp - q) / b
        kellyFraction = (b * p - q) / b;
        break;

      case 'fractional':
        // Fractional Kelly (more conservative)
        kellyFraction = ((b * p - q) / b) * fraction;
        break;

      case 'robust':
        // Robust Kelly (accounts for uncertainty)
        const variance = this.estimateWinRateVariance(winRate, 50); // Assume 50 trades for estimation
        const adjustedP = Math.max(0.1, Math.min(0.9, p - variance));
        kellyFraction = (b * adjustedP - q) / b;
        break;

      case 'dynamic':
        // Dynamic Kelly based on recent performance
        const recentPerformance = this.getRecentPerformanceMetrics();
        const confidenceMultiplier = Math.max(0.5, Math.min(1.5, recentPerformance.consistency));
        kellyFraction = ((b * p - q) / b) * confidenceMultiplier;
        break;

      default:
        kellyFraction = (b * p - q) / b;
    }

    // Apply safety constraints
    const optimalStake = kellyFraction * currentBalance;
    const maxStake = currentBalance * 0.05; // Max 5% of balance
    const minStake = currentBalance * 0.001; // Min 0.1% of balance

    // Conservative approach: use half Kelly
    const conservativeStake = Math.max(minStake, Math.min(maxStake, optimalStake * 0.5));

    return conservativeStake;
  }

  // Calculate advanced Kelly with multiple factors
  calculateAdvancedKellyStake(symbol, currentBalance, winRate, avgWin, avgLoss, context = {}) {
    // Get symbol-specific metrics
    const symbolStats = this.getSymbolPerformanceStats(symbol);
    const marketRegime = context.marketRegime || 'unknown';
    const volatility = context.volatility || 0.5;

    // Adjust Kelly based on market conditions
    let regimeMultiplier = 1.0;
    switch (marketRegime) {
      case 'stable_bias':
        regimeMultiplier = 1.2; // More aggressive in stable conditions
        break;
      case 'directional_drift':
        regimeMultiplier = 1.1;
        break;
      case 'chaotic_noisy':
        regimeMultiplier = 0.6; // Much more conservative in chaos
        break;
      case 'random_spikes':
        regimeMultiplier = 0.5; // Very conservative
        break;
      default:
        regimeMultiplier = 1.0;
    }

    // Adjust for volatility
    const volatilityMultiplier = Math.max(0.5, Math.min(1.5, 2.0 - volatility));

    // Adjust for symbol performance
    const performanceMultiplier = symbolStats ? symbolStats.consistency : 1.0;

    // Calculate base Kelly
    const baseKelly = this.calculateKellyStake(winRate, avgWin, avgLoss, currentBalance, 1.0, 'fractional');

    // Apply all multipliers
    const adjustedKelly = baseKelly * regimeMultiplier * volatilityMultiplier * performanceMultiplier;

    // Final safety constraints
    const finalStake = Math.max(
      currentBalance * 0.001, // Min 0.1%
      Math.min(
        currentBalance * 0.03, // Max 3% of balance
        adjustedKelly
      )
    );

    return {
      stake: finalStake,
      baseKelly,
      multipliers: {
        regime: regimeMultiplier,
        volatility: volatilityMultiplier,
        performance: performanceMultiplier
      },
      reasoning: this.generateKellyReasoning(regimeMultiplier, volatilityMultiplier, performanceMultiplier)
    };
  }

  // Estimate variance in win rate estimation
  estimateWinRateVariance(observedWinRate, sampleSize) {
    // Use binomial distribution variance: p(1-p)/n
    return Math.sqrt((observedWinRate * (1 - observedWinRate)) / sampleSize);
  }

  // Get recent performance metrics for dynamic Kelly
  getRecentPerformanceMetrics() {
    // Simplified - in practice would analyze recent trades
    return {
      consistency: 0.8, // Placeholder
      volatility: 0.3,
      trend: 'stable'
    };
  }

  // Get symbol-specific performance statistics
  getSymbolPerformanceStats(symbol) {
    // Simplified - would track per-symbol metrics
    return {
      consistency: 0.75,
      avgWinRate: 0.55,
      volatility: 0.4
    };
  }

  // Generate reasoning for Kelly stake calculation
  generateKellyReasoning(regimeMult, volMult, perfMult) {
    const reasons = [];

    if (regimeMult > 1.1) reasons.push('Favorable market regime allows higher stakes');
    else if (regimeMult < 0.8) reasons.push('Unfavorable market conditions reduce stake size');

    if (volMult < 0.9) reasons.push('High volatility requires stake reduction');
    else if (volMult > 1.1) reasons.push('Low volatility allows stake increase');

    if (perfMult > 1.1) reasons.push('Strong recent performance supports higher stakes');
    else if (perfMult < 0.9) reasons.push('Poor recent performance reduces stake size');

    return reasons;
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

  // Calculate volatility-adjusted position size
  calculateVolatilityAdjustedPositionSize(symbol, currentBalance, baseRiskPerTrade = 0.02, volatility = null) {
    // Get volatility if not provided
    if (volatility === null) {
      const ticks = require('./db').getRecentTicks(symbol, 200);
      if (ticks.length > 10) {
        const digitChanges = [];
        for (let i = 1; i < ticks.length; i++) {
          digitChanges.push(Math.abs(ticks[i].last_digit - ticks[i-1].last_digit));
        }
        volatility = require('./stats').standardDeviation(digitChanges);
      } else {
        volatility = 2.5; // Default moderate volatility
      }
    }

    // Adjust risk based on volatility
    // Higher volatility = lower risk per trade
    const volatilityMultiplier = Math.max(0.3, Math.min(1.5, 3.0 / (volatility + 1)));
    const adjustedRiskPerTrade = baseRiskPerTrade * volatilityMultiplier;

    // Calculate base position size
    const riskAmount = currentBalance * adjustedRiskPerTrade;

    // For digit trading, stop loss is typically the full stake amount
    const stopLossDistance = 1; // Normalized stop loss
    const positionSize = riskAmount / stopLossDistance;

    // Apply additional volatility-based adjustments
    const volatilityAdjustment = this.getVolatilityAdjustmentFactor(volatility);
    const adjustedPositionSize = positionSize * volatilityAdjustment;

    // Ensure reasonable bounds
    const minSize = Math.max(1, currentBalance * 0.001); // Min 0.1% of balance
    const maxSize = Math.min(adjustedPositionSize, currentBalance * 0.05); // Max 5% of balance

    return {
      positionSize: Math.max(minSize, maxSize),
      adjustedRiskPerTrade,
      volatility,
      volatilityMultiplier,
      volatilityAdjustment
    };
  }

  // Get volatility adjustment factor
  getVolatilityAdjustmentFactor(volatility) {
    // Volatility bands and corresponding adjustment factors
    if (volatility < 1.5) return 1.2;      // Low volatility - can trade larger
    if (volatility < 2.5) return 1.0;      // Normal volatility - standard sizing
    if (volatility < 3.5) return 0.7;      // High volatility - reduce size
    if (volatility < 4.5) return 0.5;      // Very high volatility - significant reduction
    return 0.3;                           // Extreme volatility - minimal size
  }

  // Calculate ATR-based position sizing (Average True Range)
  calculateATRPositionSize(symbol, currentBalance, baseRiskPerTrade = 0.02) {
    const ticks = require('./db').getRecentTicks(symbol, 100);

    // Add validation for ticks array
    if (!Array.isArray(ticks) || ticks.length < 14) {
      return this.calculateVolatilityAdjustedPositionSize(symbol, currentBalance, baseRiskPerTrade);
    }

    // Calculate True Range for each period
    const trueRanges = [];
    for (let i = 1; i < ticks.length; i++) {
      // Validate tick data
      if (!ticks[i] || !ticks[i-1] || typeof ticks[i].quote !== 'number' || typeof ticks[i-1].quote !== 'number') {
        continue;
      }

      const high = Math.max(ticks[i].quote, ticks[i-1].quote);
      const low = Math.min(ticks[i].quote, ticks[i-1].quote);
      const trueRange = high - low;
      trueRanges.push(trueRange);
    }

    if (trueRanges.length < 14) {
      return this.calculateVolatilityAdjustedPositionSize(symbol, currentBalance, baseRiskPerTrade);
    }

    // Calculate ATR (14-period simple moving average)
    const atrPeriod = 14;
    const atr = trueRanges.slice(-atrPeriod).reduce((sum, tr) => sum + tr, 0) / atrPeriod;

    // Use ATR to determine position size
    const riskAmount = currentBalance * baseRiskPerTrade;
    const positionSize = riskAmount / atr;

    // Normalize based on average price with validation
    const recentTicks = ticks.slice(-10).filter(tick => typeof tick.quote === 'number');
    if (recentTicks.length === 0) {
      return { positionSize: Math.max(1, Math.min(riskAmount, currentBalance * 0.03)) };
    }

    const avgPrice = recentTicks.reduce((sum, tick) => sum + tick.quote, 0) / recentTicks.length;
    const normalizedPositionSize = (positionSize / avgPrice) * currentBalance;

    return {
      positionSize: Math.max(1, Math.min(normalizedPositionSize, currentBalance * 0.03)),
      atr,
      avgPrice,
      riskAmount
    };
  }

  // Get comprehensive position sizing recommendation
  getPositionSizingRecommendation(symbol, currentBalance, baseRiskPerTrade = 0.02) {
    const volatilityAdjusted = this.calculateVolatilityAdjustedPositionSize(symbol, currentBalance, baseRiskPerTrade);
    const atrBased = this.calculateATRPositionSize(symbol, currentBalance, baseRiskPerTrade);

    // Use the more conservative of the two methods
    const recommendedSize = Math.min(volatilityAdjusted.positionSize, atrBased.positionSize);

    // Get additional market context
    const regime = require('./stats').detectMarketRegime(
      require('./db').getRecentTicks(symbol, 100).map(t => t.last_digit), 50
    );

    // Adjust for market regime
    let regimeAdjustment = 1.0;
    if (regime.regime === 'uptrend' || regime.regime === 'downtrend') {
      regimeAdjustment = 1.1; // Slightly increase in trending markets
    } else if (regime.regime === 'ranging') {
      regimeAdjustment = 0.9; // Slightly decrease in ranging markets
    }

    const finalSize = recommendedSize * regimeAdjustment;

    return {
      recommendedPositionSize: Math.max(1, finalSize),
      volatilityAdjusted: volatilityAdjusted,
      atrBased: atrBased,
      marketRegime: regime,
      regimeAdjustment,
      reasoning: this.generatePositionSizingReasoning(volatilityAdjusted, atrBased, regime)
    };
  }

  // Generate reasoning for position sizing
  generatePositionSizingReasoning(volatilityAdjusted, atrBased, regime) {
    const reasons = [];

    if (volatilityAdjusted.volatility > 3.0) {
      reasons.push(`High volatility (${volatilityAdjusted.volatility.toFixed(2)}) requires reduced position size`);
    } else if (volatilityAdjusted.volatility < 2.0) {
      reasons.push(`Low volatility (${volatilityAdjusted.volatility.toFixed(2)}) allows for normal position size`);
    }

    if (regime.regime === 'trending') {
      reasons.push(`Trending market (${regime.regime}) supports slightly larger positions`);
    } else if (regime.regime === 'ranging') {
      reasons.push(`Ranging market (${regime.regime}) suggests more conservative sizing`);
    }

    return reasons;
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

  // Initialize trailing stop for a position
  initializeTrailingStop(positionId, entryPrice, stopDistance, trailingType = 'percentage') {
    const trailingStop = {
      entryPrice,
      initialStop: entryPrice - stopDistance,
      currentStop: entryPrice - stopDistance,
      trailingType, // 'percentage', 'fixed', 'atr'
      trailingAmount: stopDistance,
      highestPrice: entryPrice,
      lowestPrice: entryPrice,
      activated: false
    };

    this.activePositions.set(positionId, trailingStop);
    return trailingStop;
  }

  // Update trailing stop based on current price
  updateTrailingStop(positionId, currentPrice, isLong = true) {
    const position = this.activePositions.get(positionId);
    if (!position) return null;

    let newStop = position.currentStop;

    if (isLong) {
      // For long positions, trail the stop up as price increases
      if (currentPrice > position.highestPrice) {
        position.highestPrice = currentPrice;

        if (position.trailingType === 'percentage') {
          // Percentage-based trailing stop
          newStop = currentPrice * (1 - position.trailingAmount);
        } else if (position.trailingType === 'fixed') {
          // Fixed amount trailing stop
          newStop = currentPrice - position.trailingAmount;
        }

        // Only move stop up, never down
        if (newStop > position.currentStop) {
          position.currentStop = newStop;
          position.activated = true;
        }
      }
    } else {
      // For short positions, trail the stop down as price decreases
      if (currentPrice < position.lowestPrice) {
        position.lowestPrice = currentPrice;

        if (position.trailingType === 'percentage') {
          newStop = currentPrice * (1 + position.trailingAmount);
        } else if (position.trailingType === 'fixed') {
          newStop = currentPrice + position.trailingAmount;
        }

        // Only move stop down, never up
        if (newStop < position.currentStop) {
          position.currentStop = newStop;
          position.activated = true;
        }
      }
    }

    return position.currentStop;
  }

  // Check if trailing stop should trigger exit
  shouldExitOnTrailingStop(positionId, currentPrice, isLong = true) {
    const position = this.activePositions.get(positionId);
    if (!position) return false;

    if (isLong) {
      return currentPrice <= position.currentStop;
    } else {
      return currentPrice >= position.currentStop;
    }
  }

  // Configure trailing stop settings for a symbol
  setTrailingStopConfig(symbol, config = {}) {
    const defaultConfig = {
      enabled: true,
      type: 'percentage', // 'percentage', 'fixed', 'atr'
      amount: 0.02, // 2% for percentage, $X for fixed
      activationThreshold: 0.01, // 1% profit before activation
      minStopDistance: 0.005 // 0.5% minimum stop distance
    };

    this.trailingStops.set(symbol, { ...defaultConfig, ...config });
    return this.trailingStops.get(symbol);
  }

  // Get trailing stop configuration for a symbol
  getTrailingStopConfig(symbol) {
    return this.trailingStops.get(symbol) || this.setTrailingStopConfig(symbol);
  }

  // Calculate optimal trailing stop distance based on volatility
  calculateOptimalTrailingStop(symbol, volatility, avgRange) {
    // Base stop on volatility and average range
    const volatilityMultiplier = Math.max(0.5, Math.min(2.0, volatility / 2));
    const rangeMultiplier = Math.max(0.5, Math.min(2.0, avgRange / 3));

    // Combine factors for optimal stop distance
    const optimalStop = (volatilityMultiplier + rangeMultiplier) / 2 * 0.02; // Base 2%

    return Math.max(0.005, Math.min(0.1, optimalStop)); // Between 0.5% and 10%
  }

  // Advanced trailing stop with multiple levels
  initializeMultiLevelTrailingStop(positionId, entryPrice, levels = []) {
    const multiLevelStop = {
      entryPrice,
      levels: levels.sort((a, b) => b.profit - a.profit), // Sort by profit descending
      currentLevel: 0,
      activated: false
    };

    this.activePositions.set(positionId, multiLevelStop);
    return multiLevelStop;
  }

  // Update multi-level trailing stop
  updateMultiLevelTrailingStop(positionId, currentPrice, currentProfit, isLong = true) {
    const position = this.activePositions.get(positionId);
    if (!position || !position.levels) return null;

    // Find appropriate level based on current profit
    let targetLevel = 0;
    for (let i = 0; i < position.levels.length; i++) {
      if (currentProfit >= position.levels[i].profit) {
        targetLevel = i;
        break;
      }
    }

    if (targetLevel > position.currentLevel) {
      position.currentLevel = targetLevel;
      position.activated = true;

      const level = position.levels[targetLevel];
      return {
        stopPrice: isLong ? currentPrice * (1 - level.stopDistance) : currentPrice * (1 + level.stopDistance),
        level: targetLevel,
        description: level.description || `Level ${targetLevel + 1}`
      };
    }

    return null;
  }

  // Remove trailing stop for closed position
  removeTrailingStop(positionId) {
    this.activePositions.delete(positionId);
  }

  // Get all active trailing stops
  getActiveTrailingStops() {
    return Object.fromEntries(this.activePositions);
  }

  // Set partial close rules for a position
  setPartialCloseRules(positionId, rules = {}) {
    const defaultRules = {
      enabled: true,
      levels: [
        { profitTarget: 0.5, closePercent: 0.5, description: '50% profit - close 50%' },
        { profitTarget: 1.0, closePercent: 0.3, description: '100% profit - close 30%' },
        { profitTarget: 2.0, closePercent: 0.2, description: '200% profit - close 20%' }
      ],
      minHoldingTime: 30000, // 30 seconds minimum hold time
      maxPartialCloses: 3
    };

    this.partialCloseRules.set(positionId, { ...defaultRules, ...rules });
    return this.partialCloseRules.get(positionId);
  }

  // Check if partial close should be triggered
  shouldPartialClose(positionId, currentProfit, holdingTime) {
    const rules = this.partialCloseRules.get(positionId);
    if (!rules || !rules.enabled) return null;

    // Check minimum holding time
    if (holdingTime < rules.minHoldingTime) return null;

    // Check profit targets
    for (const level of rules.levels) {
      if (currentProfit >= level.profitTarget) {
        return {
          closePercent: level.closePercent,
          description: level.description,
          profitTarget: level.profitTarget
        };
      }
    }

    return null;
  }

  // Calculate partial close amount
  calculatePartialCloseAmount(positionId, currentProfit, totalStake) {
    const partialClose = this.shouldPartialClose(positionId, currentProfit, Date.now() - this.activePositions.get(positionId)?.timestamp);
    if (!partialClose) return null;

    return {
      closeAmount: totalStake * partialClose.closePercent,
      remainingAmount: totalStake * (1 - partialClose.closePercent),
      description: partialClose.description,
      profitTarget: partialClose.profitTarget
    };
  }

  // Update position after partial close
  updatePositionAfterPartialClose(positionId, closedAmount, remainingAmount) {
    const position = this.activePositions.get(positionId);
    if (!position) return false;

    // Update position size
    position.originalStake = position.originalStake || position.entryPrice; // Use entryPrice as fallback
    position.currentStake = remainingAmount;
    position.closedAmount = (position.closedAmount || 0) + closedAmount;

    // Adjust trailing stop for remaining position if it exists
    if (position.trailingType === 'fixed' && position.trailingAmount) {
      position.trailingAmount = position.trailingAmount * (remainingAmount / position.originalStake);
    }

    return true;
  }

  // Get partial close statistics
  getPartialCloseStats(positionId) {
    const rules = this.partialCloseRules.get(positionId);
    const position = this.activePositions.get(positionId);

    return {
      rules: rules || null,
      position: position ? {
        currentStake: position.currentStake || position.entryPrice,
        originalStake: position.originalStake || position.entryPrice,
        closedAmount: position.closedAmount || 0
      } : null
    };
  }

  // Create scale-in strategy (gradually enter position)
  createScaleInStrategy(strategyId, config = {}) {
    const defaultConfig = {
      enabled: true,
      totalParts: 3,
      priceLevels: [], // Will be calculated based on entry
      stakeDistribution: [0.4, 0.3, 0.3], // 40%, 30%, 30%
      priceIncrement: 0.01, // 1% price movement between entries
      maxTimeBetweenEntries: 300000, // 5 minutes
      direction: 'bullish' // 'bullish' or 'bearish'
    };

    const strategy = { ...defaultConfig, ...config };
    this.scaleInStrategies.set(strategyId, strategy);
    return strategy;
  }

  // Create scale-out strategy (gradually exit position)
  createScaleOutStrategy(strategyId, config = {}) {
    const defaultConfig = {
      enabled: true,
      totalParts: 3,
      profitLevels: [0.25, 0.5, 1.0], // 25%, 50%, 100% profit targets
      stakeDistribution: [0.3, 0.3, 0.4], // Close 30%, 30%, 40%
      trailingStopAfterFirstClose: true,
      direction: 'bullish'
    };

    const strategy = { ...defaultConfig, ...config };
    this.scaleOutStrategies.set(strategyId, strategy);
    return strategy;
  }

  // Get next scale-in entry
  getNextScaleInEntry(strategyId, currentPrice, entryPrice) {
    const strategy = this.scaleInStrategies.get(strategyId);
    if (!strategy || !strategy.enabled) return null;

    // Calculate price levels if not set
    if (strategy.priceLevels.length === 0) {
      strategy.priceLevels = [];
      for (let i = 0; i < strategy.totalParts; i++) {
        const level = strategy.direction === 'bullish' ?
          entryPrice * (1 + (i * strategy.priceIncrement)) :
          entryPrice * (1 - (i * strategy.priceIncrement));
        strategy.priceLevels.push(level);
      }
    }

    // Find next entry level
    for (let i = 0; i < strategy.priceLevels.length; i++) {
      const level = strategy.priceLevels[i];
      const shouldEnter = strategy.direction === 'bullish' ?
        currentPrice >= level : currentPrice <= level;

      if (shouldEnter) {
        return {
          part: i + 1,
          priceLevel: level,
          stakePercent: strategy.stakeDistribution[i],
          totalParts: strategy.totalParts
        };
      }
    }

    return null;
  }

  // Get next scale-out exit
  getNextScaleOutExit(strategyId, currentProfit, totalStake) {
    const strategy = this.scaleOutStrategies.get(strategyId);
    if (!strategy || !strategy.enabled) return null;

    // Find next profit level to exit
    for (let i = 0; i < strategy.profitLevels.length; i++) {
      if (currentProfit >= strategy.profitLevels[i]) {
        return {
          part: i + 1,
          profitLevel: strategy.profitLevels[i],
          closePercent: strategy.stakeDistribution[i],
          closeAmount: totalStake * strategy.stakeDistribution[i],
          remainingAmount: totalStake * (1 - strategy.stakeDistribution.slice(0, i + 1).reduce((a, b) => a + b, 0)),
          totalParts: strategy.totalParts
        };
      }
    }

    return null;
  }

  // Update scale-in strategy progress
  updateScaleInProgress(strategyId, completedParts) {
    const strategy = this.scaleInStrategies.get(strategyId);
    if (strategy) {
      strategy.completedParts = completedParts;
      strategy.lastEntryTime = Date.now();
    }
  }

  // Update scale-out strategy progress
  updateScaleOutProgress(strategyId, completedParts) {
    const strategy = this.scaleOutStrategies.get(strategyId);
    if (strategy) {
      strategy.completedParts = completedParts;
      strategy.lastExitTime = Date.now();
    }
  }

  // Check if scale-in strategy is complete
  isScaleInComplete(strategyId) {
    const strategy = this.scaleInStrategies.get(strategyId);
    return strategy ? (strategy.completedParts || 0) >= strategy.totalParts : true;
  }

  // Check if scale-out strategy is complete
  isScaleOutComplete(strategyId) {
    const strategy = this.scaleOutStrategies.get(strategyId);
    return strategy ? (strategy.completedParts || 0) >= strategy.totalParts : true;
  }

  // Get scale strategy statistics
  getScaleStrategyStats(strategyId, type = 'in') {
    const strategies = type === 'in' ? this.scaleInStrategies : this.scaleOutStrategies;
    const strategy = strategies.get(strategyId);

    if (!strategy) return null;

    return {
      totalParts: strategy.totalParts,
      completedParts: strategy.completedParts || 0,
      remainingParts: strategy.totalParts - (strategy.completedParts || 0),
      isComplete: (strategy.completedParts || 0) >= strategy.totalParts,
      lastActivity: type === 'in' ? strategy.lastEntryTime : strategy.lastExitTime
    };
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
