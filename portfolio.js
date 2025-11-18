const db = require('./db');
const stats = require('./stats');
const risk = require('./risk');

class PortfolioManager {
  constructor() {
    this.positions = new Map(); // symbol -> positions array
    this.correlationMatrix = new Map(); // symbol pair -> correlation
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

    // Calculate returns for each symbol
    const returns1 = [];
    const returns2 = [];

    for (let i = 1; i < ticks1.length; i++) {
      const ret1 = (ticks1[i].quote - ticks1[i-1].quote) / ticks1[i-1].quote;
      const ret2 = (ticks2[i].quote - ticks2[i-1].quote) / ticks2[i-1].quote;
      returns1.push(ret1);
      returns2.push(ret2);
    }

    // Calculate correlation coefficient
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

    // Check symbol allocation limit
    const currentSymbolAllocation = allocation[symbol] || 0;
    const newSymbolAllocation = (allocation[symbol] * totalAllocated + stake) / (totalAllocated + stake);

    if (newSymbolAllocation > maxSymbolAllocation) {
      return { allowed: false, reason: `Symbol allocation would exceed ${maxSymbolAllocation * 100}% limit` };
    }

    // Check correlation with existing positions
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

  // Optimize portfolio allocation using Modern Portfolio Theory
  optimizeAllocation(symbols, returns, covariances, riskTolerance = 0.5) {
    // Simplified Markowitz optimization
    // This is a basic implementation - in practice, you'd use a proper optimization library

    if (symbols.length < 2) return { [symbols[0]]: 1.0 };

    // Calculate efficient frontier (simplified)
    const numAssets = symbols.length;
    const weights = new Array(numAssets).fill(1 / numAssets); // Equal weight start

    // Simple risk-parity adjustment
    const volatilities = symbols.map((_, i) => Math.sqrt(covariances[i][i]));
    const totalVol = volatilities.reduce((sum, vol) => sum + vol, 0);

    const riskParityWeights = volatilities.map(vol => (totalVol - vol) / (totalVol * (numAssets - 1)));

    // Normalize weights
    const totalWeight = riskParityWeights.reduce((sum, w) => sum + w, 0);
    const normalizedWeights = riskParityWeights.map(w => w / totalWeight);

    // Create allocation object
    const allocation = {};
    symbols.forEach((symbol, i) => {
      allocation[symbol] = normalizedWeights[i];
    });

    return allocation;
  }

  // Rebalance portfolio to target allocation
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

  // Calculate portfolio performance metrics
  calculatePerformance() {
    const allTrades = this.getAllTrades();
    if (allTrades.length === 0) return null;

    const winningTrades = allTrades.filter(t => t.profit > 0);
    const losingTrades = allTrades.filter(t => t.profit < 0);

    const totalProfit = allTrades.reduce((sum, t) => sum + t.profit, 0);
    const winRate = winningTrades.length / allTrades.length;
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.profit, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0) / losingTrades.length) : 0;
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

    // Calculate Sharpe ratio
    const returns = allTrades.map(t => t.profit / t.stake);
    const avgReturn = stats.mean(returns);
    const stdReturn = stats.standardDeviation(returns);
    const sharpeRatio = stdReturn > 0 ? avgReturn / stdReturn * Math.sqrt(252) : 0;

    // Calculate maximum drawdown
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

  // Get all closed trades across portfolio
  getAllTrades() {
    const allTrades = [];

    for (const [symbol, positions] of this.positions) {
      const closedPositions = positions.filter(p => p.status === 'closed');
      allTrades.push(...closedPositions);
    }

    return allTrades.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Update portfolio statistics
  updatePortfolioStats() {
    const openPositions = this.getOpenPositions();
    this.portfolioStats.totalAllocated = openPositions.reduce((sum, p) => sum + p.stake, 0);
    this.portfolioStats.lastUpdate = new Date().toISOString();

    // Calculate total value (simplified - assuming all positions are at stake value)
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

  // Risk assessment for portfolio
  assessRisk() {
    const allocation = this.getAllocation().allocation;
    const symbols = Object.keys(allocation);

    if (symbols.length === 0) return { riskLevel: 'none', issues: [] };

    const issues = [];
    let riskScore = 0;

    // Check diversification
    const maxAllocation = Math.max(...Object.values(allocation));
    if (maxAllocation > 0.5) {
      issues.push('Poor diversification - single symbol allocation too high');
      riskScore += 2;
    }

    // Check correlations
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const correlation = this.getCorrelation(symbols[i], symbols[j]);
        if (Math.abs(correlation) > 0.8) {
          issues.push(`High correlation between ${symbols[i]} and ${symbols[j]} (${correlation.toFixed(2)})`);
          riskScore += 1;
        }
      }
    }

    // Check position sizes
    const openPositions = this.getOpenPositions();
    const avgPositionSize = openPositions.length > 0 ?
      openPositions.reduce((sum, p) => sum + p.stake, 0) / openPositions.length : 0;

    if (avgPositionSize > risk.portfolioStats.totalValue * 0.1) {
      issues.push('Average position size too large relative to portfolio');
      riskScore += 1;
    }

    // Determine risk level
    let riskLevel;
    if (riskScore === 0) riskLevel = 'low';
    else if (riskScore <= 2) riskLevel = 'medium';
    else riskLevel = 'high';

    return {
      riskLevel,
      riskScore,
      issues,
      recommendations: this.generateRiskRecommendations(riskLevel, issues)
    };
  }

  // Generate risk management recommendations
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

  // Clear all positions (for testing/reset)
  clearPositions() {
    this.positions.clear();
    this.portfolioStats.symbols.clear();
    this.updatePortfolioStats();
  }

  // Get portfolio status
  getStatus() {
    return {
      ...this.portfolioStats,
      allocation: this.getAllocation(),
      openPositions: this.getOpenPositions().length,
      totalPositions: Array.from(this.positions.values()).reduce((sum, pos) => sum + pos.length, 0)
    };
  }
}

module.exports = new PortfolioManager();
