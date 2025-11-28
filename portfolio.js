const db = require('./db');
const stats = require('./stats');
const risk = require('./risk');

class PortfolioManager {
  constructor() {
    this.positions = new Map(); // symbol -> positions array
    this.correlationMatrix = new Map(); // symbol pair -> correlation
    this.latestPrices = new Map(); // symbol -> latest price
    this.portfolioStats = {
      totalValue: 0,
      totalAllocated: 0,
      symbols: new Set(),
      lastUpdate: null
    };
  }

  // Add a position to the portfolio
  addPosition(symbol, position) {
    if (!this.positions.has(symbol)) {
      this.positions.set(symbol, []);
    }

    this.positions.get(symbol).push({
      id: Date.now() + Math.random(),
      symbol,
      stake: position.stake,
      prediction: position.prediction,
      timestamp: position.timestamp || Date.now(),
      status: 'open',
      result: null,
      profit: 0
    });

    this.portfolioStats.symbols.add(symbol);
    this.updatePortfolioStats();
  }

  // Update position result
  updatePosition(symbol, positionId, result, profit) {
    const symbolPositions = this.positions.get(symbol);
    if (!symbolPositions) return false;

    const position = symbolPositions.find(p => p.id === positionId);
    if (!position) return false;

    position.status = 'closed';
    position.result = result;
    position.profit = profit;

    this.updatePortfolioStats();
    return true;
  }

  // Get open positions for a symbol
  getOpenPositions(symbol = null) {
    if (symbol) {
      return this.positions.get(symbol)?.filter(p => p.status === 'open') || [];
    }

    // All open positions
    const allOpen = [];
    for (const [sym, positions] of this.positions) {
      allOpen.push(...positions.filter(p => p.status === 'open'));
    }
    return allOpen;
  }

  // Get portfolio allocation by symbol
  getAllocation() {
    const allocation = {};
    let totalAllocated = 0;

    for (const [symbol, positions] of this.positions) {
      const symbolAllocated = positions
        .filter(p => p.status === 'open')
        .reduce((sum, p) => sum + p.stake, 0);

      allocation[symbol] = symbolAllocated;
      totalAllocated += symbolAllocated;
    }

    // Convert to percentages
    Object.keys(allocation).forEach(symbol => {
      allocation[symbol] = totalAllocated > 0 ? allocation[symbol] / totalAllocated : 0;
    });

    return { allocation, totalAllocated };
  }

  // Calculate correlation between symbols
  calculateCorrelation(symbol1, symbol2, window = 1000) {
    const ticks1 = db.getRecentTicks(symbol1, window);
    const ticks2 = db.getRecentTicks(symbol2, window);

    if (ticks1.length !== ticks2.length || ticks1.length < 10) {
      return 0; // Not enough data
    }

    const returns1 = [];
    const returns2 = [];

    for (let i = 1; i < ticks1.length; i++) {
      const ret1 = (ticks1[i].quote - ticks1[i-1].quote) / ticks1[i-1].quote;
      const ret2 = (ticks2[i].quote - ticks2[i-1].quote) / ticks2[i-1].quote;
      returns1.push(ret1);
      returns2.push(ret2);
    }

    const correlation = stats.sampleCorrelation(returns1, returns2);
    return isNaN(correlation) ? 0 : correlation;
  }

  // Update correlation matrix for all symbol pairs
  updateCorrelationMatrix(symbols) {
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const symbol1 = symbols[i];
        const symbol2 = symbols[j];
        const pairKey = [symbol1, symbol2].sort().join('_');

        const correlation = this.calculateCorrelation(symbol1, symbol2);
        this.correlationMatrix.set(pairKey, correlation);
      }
    }
  }

  // Get correlation between two symbols
  getCorrelation(symbol1, symbol2) {
    const pairKey = [symbol1, symbol2].sort().join('_');
    return this.correlationMatrix.get(pairKey) || 0;
  }

  // Check if adding a position maintains diversification
  canAddPosition(symbol, stake, maxSymbolAllocation = 0.3, minCorrelationThreshold = 0.7) {
    const { allocation, totalAllocated } = this.getAllocation();

    const currentSymbolAllocation = allocation[symbol] || 0;
    const newSymbolAllocation =
      (allocation[symbol] * totalAllocated + stake) / (totalAllocated + stake);

    if (newSymbolAllocation > maxSymbolAllocation) {
      return { allowed: false, reason: `Symbol allocation would exceed ${maxSymbolAllocation * 100}% limit` };
    }

    const openSymbols = Object.keys(allocation);
    for (const existingSymbol of openSymbols) {
      if (existingSymbol === symbol) continue;

      const correlation = this.getCorrelation(symbol, existingSymbol);
      if (Math.abs(correlation) > minCorrelationThreshold) {
        return {
          allowed: false,
          reason: `High correlation (${correlation.toFixed(2)}) with ${existingSymbol}`
        };
      }
    }

    return { allowed: true };
  }

  // Optimize portfolio allocation
  optimizeAllocation(symbols, returns, covariances, riskTolerance = 0.5) {
    if (symbols.length < 2) return { [symbols[0]]: 1.0 };

    const numAssets = symbols.length;
    const weights = new Array(numAssets).fill(1 / numAssets);

    const volatilities = symbols.map((_, i) => Math.sqrt(covariances[i][i]));
    const totalVol = volatilities.reduce((sum, vol) => sum + vol, 0);

    const riskParityWeights = volatilities.map(
      vol => (totalVol - vol) / (totalVol * (numAssets - 1))
    );

    const totalWeight = riskParityWeights.reduce((sum, w) => sum + w, 0);
    const normalizedWeights = riskParityWeights.map(w => w / totalWeight);

    const allocation = {};
    symbols.forEach((symbol, i) => {
      allocation[symbol] = normalizedWeights[i];
    });

    return allocation;
  }

  // Rebalance portfolio
  rebalancePortfolio(targetAllocation) {
    const currentAllocation = this.getAllocation().allocation;
    const adjustments = {};

    for (const symbol of Object.keys(targetAllocation)) {
      const target = targetAllocation[symbol];
      const current = currentAllocation[symbol] || 0;
      const difference = target - current;

      adjustments[symbol] = {
        current,
        target,
        difference,
        action: difference > 0 ? 'increase' : difference < 0 ? 'decrease' : 'hold'
      };
    }

    return adjustments;
  }

  // Calculate performance
  calculatePerformance() {
    const allTrades = this.getAllTrades();
    if (allTrades.length === 0) return null;

    const winningTrades = allTrades.filter(t => t.profit > 0);
    const losingTrades = allTrades.filter(t => t.profit < 0);

    const totalProfit = allTrades.reduce((sum, t) => sum + t.profit, 0);
    const winRate = winningTrades.length / allTrades.length;
    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.profit, 0) / winningTrades.length
      : 0;
    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0) / losingTrades.length)
      : 0;

    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

    const returns = allTrades.map(t => t.profit / t.stake);
    const avgReturn = stats.mean(returns);
    const stdReturn = stats.standardDeviation(returns);
    const sharpeRatio = stdReturn > 0 ? avgReturn / stdReturn * Math.sqrt(252) : 0;

    let peak = 0;
    let maxDrawdown = 0;
    let runningBalance = 0;

    for (const trade of allTrades.sort((a, b) => a.timestamp - b.timestamp)) {
      runningBalance += trade.profit;
      if (runningBalance > peak) {
        peak = runningBalance;
      }
      const drawdown = (peak - runningBalance) / (peak || 1);
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return {
      totalTrades: allTrades.length,
      totalProfit,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length
    };
  }

  // Get all closed trades
  getAllTrades() {
    const allTrades = [];

    for (const [symbol, positions] of this.positions) {
      const closedPositions = positions.filter(p => p.status === 'closed');
      allTrades.push(...closedPositions);
    }

    return allTrades.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Update portfolio stats
  updatePortfolioStats() {
    const openPositions = this.getOpenPositions();
    this.portfolioStats.totalAllocated = openPositions.reduce((sum, p) => sum + p.stake, 0);
    this.portfolioStats.lastUpdate = new Date().toISOString();
    this.portfolioStats.totalValue = this.portfolioStats.totalAllocated;
  }

  // Generate portfolio report
  generateReport() {
    const performance = this.calculatePerformance();
    const allocation = this.getAllocation();
    const openPositions = this.getOpenPositions();

    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalValue: this.portfolioStats.totalValue,
        totalAllocated: this.portfolioStats.totalAllocated,
        numSymbols: this.portfolioStats.symbols.size,
        numOpenPositions: openPositions.length
      },
      allocation,
      performance,
      positions: {
        open: openPositions,
        totalClosed: this.getAllTrades().length
      },
      correlations: Object.fromEntries(this.correlationMatrix)
    };
  }

  // Advanced portfolio-level risk management
  assessPortfolioRisk() {
    const allocation = this.getAllocation().allocation;
    const symbols = Object.keys(allocation);
    const openPositions = this.getOpenPositions();

    if (symbols.length === 0) return { riskLevel: 'none', issues: [], metrics: {} };

    const issues = [];
    let riskScore = 0;

    // Calculate comprehensive risk metrics
    const riskMetrics = this.calculatePortfolioRiskMetrics(symbols, allocation, openPositions);

    // Diversification assessment
    if (riskMetrics.effectiveBets < 3) {
      issues.push(`Poor diversification - only ${riskMetrics.effectiveBets.toFixed(1)} effective bets`);
      riskScore += 2;
    }

    // Concentration risk
    const maxAllocation = Math.max(...Object.values(allocation));
    if (maxAllocation > 0.4) {
      issues.push(`High concentration - largest position ${(maxAllocation * 100).toFixed(1)}% of portfolio`);
      riskScore += 2;
    }

    // Correlation risk
    if (riskMetrics.avgCorrelation > 0.6) {
      issues.push(`High average correlation (${riskMetrics.avgCorrelation.toFixed(2)}) reduces diversification benefits`);
      riskScore += 1;
    }

    // Volatility risk
    if (riskMetrics.portfolioVolatility > 0.3) {
      issues.push(`High portfolio volatility (${(riskMetrics.portfolioVolatility * 100).toFixed(1)}%)`);
      riskScore += 1;
    }

    // Liquidity risk
    if (openPositions.length > 10) {
      issues.push(`Too many open positions (${openPositions.length}) - liquidity risk`);
      riskScore += 1;
    }

    // Value at Risk assessment
    if (riskMetrics.portfolioVaR > 0.15) {
      issues.push(`High Value at Risk (${(riskMetrics.portfolioVaR * 100).toFixed(1)}% daily loss potential)`);
      riskScore += 2;
    }

    // Determine risk level
    let riskLevel;
    if (riskScore === 0) riskLevel = 'low';
    else if (riskScore <= 2) riskLevel = 'medium';
    else if (riskScore <= 4) riskLevel = 'high';
    else riskLevel = 'extreme';

    return {
      riskLevel,
      riskScore,
      issues,
      metrics: riskMetrics,
      recommendations: this.generateAdvancedRiskRecommendations(riskLevel, issues, riskMetrics)
    };
  }

  // Calculate comprehensive portfolio risk metrics
  calculatePortfolioRiskMetrics(symbols, allocation, positions) {
    const metrics = {
      effectiveBets: 0,
      avgCorrelation: 0,
      portfolioVolatility: 0,
      portfolioVaR: 0,
      concentrationRatio: 0,
      diversificationRatio: 0,
      riskAdjustedReturn: 0
    };

    if (symbols.length === 0) return metrics;

    // Calculate correlations and effective bets
    const correlations = [];
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const corr = this.getCorrelation(symbols[i], symbols[j]);
        if (!isNaN(corr)) correlations.push(corr);
      }
    }

    metrics.avgCorrelation = correlations.length > 0 ?
      correlations.reduce((sum, corr) => sum + corr, 0) / correlations.length : 0;

    // Calculate effective number of bets (1 / sum of squared weights)
    const weights = Object.values(allocation);
    metrics.effectiveBets = 1 / weights.reduce((sum, weight) => sum + weight * weight, 0);

    // Estimate portfolio volatility using correlation
    const avgVolatility = 0.25; // Assume 25% average volatility per asset
    metrics.portfolioVolatility = avgVolatility * Math.sqrt(1 + metrics.avgCorrelation * (symbols.length - 1));

    // Calculate Value at Risk (simplified)
    metrics.portfolioVaR = metrics.portfolioVolatility * 2.33; // 99% confidence

    // Concentration metrics
    const sortedWeights = [...weights].sort((a, b) => b - a);
    metrics.concentrationRatio = sortedWeights[0] / (sortedWeights.slice(0, 3).reduce((a, b) => a + b, 0) || 1);

    // Risk-adjusted return (simplified Sharpe-like ratio)
    const expectedReturn = 0.15; // Assume 15% expected annual return
    metrics.riskAdjustedReturn = expectedReturn / metrics.portfolioVolatility;

    return metrics;
  }

  // Generate advanced risk recommendations
  generateAdvancedRiskRecommendations(riskLevel, issues, metrics) {
    const recommendations = [];

    if (issues.some(issue => issue.includes('diversification'))) {
      recommendations.push('Increase diversification by adding uncorrelated assets');
      recommendations.push(`Target at least 5-7 effective bets (currently ${metrics.effectiveBets.toFixed(1)})`);
    }

    if (issues.some(issue => issue.includes('concentration'))) {
      recommendations.push('Reduce position sizes in highly allocated assets');
      recommendations.push('Implement maximum allocation limits per asset (suggested: 25% max)');
    }

    if (issues.some(issue => issue.includes('correlation'))) {
      recommendations.push('Add assets with negative or low correlation to current holdings');
      recommendations.push('Consider alternative assets or strategies with different market drivers');
    }

    if (issues.some(issue => issue.includes('volatility'))) {
      recommendations.push('Implement volatility-based position sizing');
      recommendations.push('Consider hedging strategies or options for volatility management');
    }

    if (issues.some(issue => issue.includes('VaR'))) {
      recommendations.push('Reduce overall portfolio leverage');
      recommendations.push('Implement stricter stop-loss rules');
    }

    if (riskLevel === 'extreme') {
      recommendations.push('URGENT: Consider closing positions to reduce risk exposure');
      recommendations.push('Implement immediate trading halt until risk is reduced');
    }

    return recommendations;
  }

  // Portfolio rebalancing with risk constraints
  rebalancePortfolioRiskAdjusted(targetAllocations, riskConstraints = {}) {
    const currentAllocation = this.getAllocation().allocation;
    const riskAssessment = this.assessPortfolioRisk();

    // Apply risk constraints
    const constraints = {
      maxAllocation: riskConstraints.maxAllocation || 0.25,
      maxCorrelation: riskConstraints.maxCorrelation || 0.7,
      minEffectiveBets: riskConstraints.minEffectiveBets || 5,
      ...riskConstraints
    };

    const adjustments = {};

    for (const symbol of Object.keys(targetAllocations)) {
      let targetWeight = targetAllocations[symbol];
      const currentWeight = currentAllocation[symbol] || 0;

      // Apply risk constraints
      if (targetWeight > constraints.maxAllocation) {
        targetWeight = constraints.maxAllocation;
        adjustments[symbol] = {
          ...adjustments[symbol],
          riskAdjusted: true,
          reason: `Reduced from ${(targetAllocations[symbol] * 100).toFixed(1)}% to ${(targetWeight * 100).toFixed(1)}% due to concentration limit`
        };
      }

      // Check correlation constraints
      const highCorrSymbols = Object.keys(currentAllocation).filter(s =>
        s !== symbol && Math.abs(this.getCorrelation(symbol, s)) > constraints.maxCorrelation
      );

      if (highCorrSymbols.length > 0 && targetWeight > currentWeight) {
        targetWeight = currentWeight; // Don't increase correlated positions
        adjustments[symbol] = {
          ...adjustments[symbol],
          riskAdjusted: true,
          reason: `Held at ${(targetWeight * 100).toFixed(1)}% due to high correlation with ${highCorrSymbols.join(', ')}`
        };
      }

      adjustments[symbol] = {
        current: currentWeight,
        target: targetWeight,
        difference: targetWeight - currentWeight,
        action: targetWeight > currentWeight ? 'increase' : targetWeight < currentWeight ? 'decrease' : 'hold',
        ...adjustments[symbol]
      };
    }

    return {
      adjustments,
      riskAssessment,
      constraints,
      rebalancingNeeded: Object.values(adjustments).some(adj => Math.abs(adj.difference) > 0.01)
    };
  }

  // Stress testing for portfolio
  stressTestPortfolio(scenarios = []) {
    const baseMetrics = this.calculatePortfolioRiskMetrics(
      Object.keys(this.getAllocation().allocation),
      this.getAllocation().allocation,
      this.getOpenPositions()
    );

    const results = [];

    for (const scenario of scenarios) {
      // Apply scenario shocks
      const stressedAllocations = {};
      for (const [symbol, allocation] of Object.entries(this.getAllocation().allocation)) {
        const shock = scenario.shocks[symbol] || scenario.defaultShock || 0;
        stressedAllocations[symbol] = Math.max(0, allocation * (1 + shock));
      }

      // Recalculate metrics under stress
      const symbols = Object.keys(stressedAllocations);
      const stressedMetrics = this.calculatePortfolioRiskMetrics(symbols, stressedAllocations, []);

      results.push({
        scenario: scenario.name,
        baseVaR: baseMetrics.portfolioVaR,
        stressedVaR: stressedMetrics.portfolioVaR,
        varIncrease: stressedMetrics.portfolioVaR - baseMetrics.portfolioVaR,
        breachLimit: stressedMetrics.portfolioVaR > (scenario.maxVaR || 0.2),
        recommendations: scenario.recommendations || []
      });
    }

    return {
      baseMetrics,
      stressTestResults: results,
      overallRisk: results.some(r => r.breachLimit) ? 'high' : 'acceptable'
    };
  }

  // Dynamic risk limits based on portfolio performance
  getDynamicRiskLimits() {
    const performance = this.calculatePerformance();
    const riskAssessment = this.assessPortfolioRisk();

    const baseLimits = {
      maxDrawdown: 0.15,
      maxDailyLoss: 0.08,
      maxAllocation: 0.25,
      maxPositions: 10
    };

    // Adjust limits based on performance
    if (performance && performance.sharpeRatio < 0.5) {
      // Poor risk-adjusted returns - tighten limits
      baseLimits.maxDrawdown *= 0.8;
      baseLimits.maxDailyLoss *= 0.8;
      baseLimits.maxAllocation *= 0.8;
    } else if (performance && performance.sharpeRatio > 1.5) {
      // Good risk-adjusted returns - can be slightly more aggressive
      baseLimits.maxDrawdown *= 1.1;
      baseLimits.maxDailyLoss *= 1.1;
      baseLimits.maxAllocation *= 1.1;
    }

    // Adjust based on current risk level
    if (riskAssessment.riskLevel === 'high') {
      baseLimits.maxDrawdown *= 0.7;
      baseLimits.maxDailyLoss *= 0.7;
      baseLimits.maxAllocation *= 0.7;
    } else if (riskAssessment.riskLevel === 'extreme') {
      baseLimits.maxDrawdown *= 0.5;
      baseLimits.maxDailyLoss *= 0.5;
      baseLimits.maxAllocation *= 0.5;
      baseLimits.maxPositions = 5;
    }

    return {
      limits: baseLimits,
      reasoning: this.generateDynamicLimitReasoning(performance, riskAssessment),
      lastUpdated: new Date().toISOString()
    };
  }

  // Generate reasoning for dynamic limits
  generateDynamicLimitReasoning(performance, riskAssessment) {
    const reasons = [];

    if (performance && performance.sharpeRatio < 0.5) {
      reasons.push('Poor Sharpe ratio - tightening risk limits');
    }
    if (riskAssessment.riskLevel === 'high') {
      reasons.push('High portfolio risk - conservative limits applied');
    }
    if (performance && performance.maxDrawdown > 0.2) {
      reasons.push('Large drawdown experienced - reducing exposure limits');
    }

    return reasons;
  }

  // Legacy risk assessment method (for backward compatibility)
  assessRisk() {
    return this.assessPortfolioRisk();
  }

  // Legacy risk recommendations
  generateRiskRecommendations(riskLevel, issues) {
    const recommendations = [];

    if (issues.some(issue => issue.includes('diversification'))) {
      recommendations.push('Increase diversification by adding more uncorrelated symbols');
    }

    if (issues.some(issue => issue.includes('correlation'))) {
      recommendations.push('Reduce exposure to highly correlated symbols');
    }

    if (issues.some(issue => issue.includes('position size'))) {
      recommendations.push('Reduce average position size to improve risk management');
    }

    if (riskLevel === 'high') {
      recommendations.push('Consider implementing stricter position limits and stop-losses');
      recommendations.push('Reduce overall portfolio leverage');
    }

    return recommendations;
  }

  // Clear all positions
  clearPositions() {
    this.positions.clear();
    this.portfolioStats.symbols.clear();
    this.updatePortfolioStats();
  }

  // Portfolio status
  getStatus() {
    return {
      ...this.portfolioStats,
      allocation: this.getAllocation(),
      openPositions: this.getOpenPositions().length,
      totalPositions: Array.from(this.positions.values()).reduce(
        (sum, pos) => sum + pos.length,
        0
      )
    };
  }

  // Update latest price for a symbol
  updatePrice(symbol, price) {
    this.latestPrices.set(symbol, {
      price: parseFloat(price),
      timestamp: Date.now()
    });
  }

  // Get latest price for a symbol
  getLatestPrice(symbol) {
    const priceData = this.latestPrices.get(symbol);
    return priceData ? priceData.price : null;
  }

  // ✅ NEW initialize() method (correct location inside class)
  initialize(symbols = []) {
    this.positions = new Map();
    this.correlationMatrix = new Map();
    this.latestPrices = new Map();
    this.portfolioStats = {
      totalValue: 0,
      totalAllocated: 0,
      symbols: new Set(),
      lastUpdate: null
    };

    if (symbols.length > 1) {
      this.updateCorrelationMatrix(symbols);
    }

    return true;
  }
}

// Export instance
module.exports = new PortfolioManager();
