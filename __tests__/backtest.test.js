const backtest = require('../backtest');
const db = require('../db');

/**
 * Comprehensive tests for backtesting framework
 * Tests realistic market simulation, transaction costs, slippage, and performance validation
 */
describe('Backtest Engine - Realistic Market Simulation', () => {
  beforeAll(async () => {
    // Ensure database is ready
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Realistic Backtest Execution', () => {
    test('should run backtest with transaction costs and slippage', async () => {
      const result = await backtest.runBacktest('frequency', 'R_10', {
        maxTrades: 10,
        includeTransactionCosts: true,
        slippageModel: 'realistic',
        realisticLatency: true,
        initialBalance: 1000
      });

      expect(result).toHaveProperty('performance');
      expect(result).toHaveProperty('trades');
      expect(result.performance.totalTrades).toBeGreaterThan(0);
      expect(result.performance.totalFees).toBeGreaterThan(0); // Should have fees
    }, 30000);

    test('should simulate market impact on large trades', async () => {
      const result = await backtest.runBacktest('frequency', 'R_10', {
        maxTrades: 5,
        riskPerTrade: 0.1, // High risk to test market impact
        includeTransactionCosts: true,
        slippageModel: 'realistic'
      });

      expect(result.performance.totalTrades).toBeGreaterThan(0);

      // Check that stakes vary (market impact)
      const stakes = result.trades.map(t => t.stake);
      const uniqueStakes = new Set(stakes);

      // Should have some variation in stake sizes due to market impact
      expect(uniqueStakes.size).toBeGreaterThan(1);
    });

    test('should handle prediction latency realistically', async () => {
      const result = await backtest.runBacktest('ensemble', 'R_10', {
        maxTrades: 8,
        realisticLatency: true,
        includeTransactionCosts: true
      });

      expect(result.performance.totalTrades).toBeGreaterThan(0);

      // Check that trades have holding times (latency effect)
      const holdingTimes = result.trades.map(t => t.holdingTime);
      const avgHoldingTime = holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length;

      // Should have non-zero holding times due to latency
      expect(avgHoldingTime).toBeGreaterThan(0);
    });
  });

  describe('Performance Metrics Validation', () => {
    test('should calculate comprehensive performance metrics', async () => {
      const result = await backtest.runBacktest('frequency', 'R_10', {
        maxTrades: 20,
        includeTransactionCosts: true
      });

      const perf = result.performance;

      // Should have all required metrics
      expect(perf).toHaveProperty('totalTrades');
      expect(perf).toHaveProperty('winRate');
      expect(perf).toHaveProperty('profitFactor');
      expect(perf).toHaveProperty('sharpeRatio');
      expect(perf).toHaveProperty('maxDrawdown');
      expect(perf).toHaveProperty('totalProfit');
      expect(perf).toHaveProperty('totalFees');

      // Metrics should be reasonable
      expect(perf.winRate).toBeGreaterThanOrEqual(0);
      expect(perf.winRate).toBeLessThanOrEqual(1);
      expect(perf.totalTrades).toBeGreaterThan(0);
    });

    test('should calculate risk-adjusted metrics correctly', async () => {
      const result = await backtest.runBacktest('markov', 'R_10', {
        maxTrades: 25,
        includeTransactionCosts: true
      });

      expect(result.performance).toHaveProperty('riskAdjustedMetrics');
      const riskMetrics = result.performance.riskAdjustedMetrics;

      expect(riskMetrics).toHaveProperty('valueAtRisk');
      expect(riskMetrics).toHaveProperty('expectedShortfall');
      expect(riskMetrics).toHaveProperty('riskOfRuin');

      // VaR should be positive (loss amount)
      expect(riskMetrics.valueAtRisk).toBeGreaterThanOrEqual(0);
    });

    test('should assess backtest realism', async () => {
      const result = await backtest.runBacktest('ensemble', 'R_10', {
        maxTrades: 15,
        includeTransactionCosts: true,
        slippageModel: 'realistic',
        realisticLatency: true,
        marketHoursOnly: true
      });

      expect(result.metadata).toHaveProperty('backtestRealism');
      const realism = result.metadata.backtestRealism;

      expect(realism.score).toBeGreaterThan(0.5); // Should be moderately realistic
      expect(realism.factors).toContain('transaction_costs');
      expect(realism.factors).toContain('realistic_slippage');
      expect(realism.factors).toContain('prediction_latency');
      expect(realism.factors).toContain('market_hours_filter');
    });
  });

  describe('Strategy Comparison', () => {
    test('should compare multiple strategies objectively', async () => {
      const strategies = ['frequency', 'markov', 'ensemble'];
      const comparison = await backtest.compareStrategies('R_10', strategies, {
        maxTrades: 15,
        includeTransactionCosts: true
      });

      expect(comparison).toHaveProperty('results');
      expect(comparison).toHaveProperty('comparison');

      // Should have results for all strategies
      strategies.forEach(strategy => {
        expect(comparison.results).toHaveProperty(strategy);
        expect(comparison.results[strategy]).toHaveProperty('performance');
      });

      // Should have comparison metrics
      expect(comparison.comparison).toHaveProperty('totalProfit');
      expect(comparison.comparison).toHaveProperty('winRate');
      expect(comparison.comparison).toHaveProperty('sharpeRatio');
    });

    test('should identify best and worst performing strategies', async () => {
      const strategies = ['frequency', 'markov'];
      const comparison = await backtest.compareStrategies('R_10', strategies, {
        maxTrades: 20
      });

      const profitComparison = comparison.comparison.totalProfit;
      expect(profitComparison).toHaveProperty('best');
      expect(profitComparison).toHaveProperty('worst');

      // Best should have higher profit than worst
      expect(profitComparison.best.value).toBeGreaterThanOrEqual(profitComparison.worst.value);
    });
  });

  describe('Walk-Forward Analysis', () => {
    test('should perform walk-forward analysis for robustness', async () => {
      const result = await backtest.walkForwardAnalysis('frequency', 'R_10', {
        trainWindow: 500,
        testWindow: 100,
        stepSize: 100
      });

      expect(result).toHaveProperty('walkForwardResults');
      expect(result).toHaveProperty('averagePerformance');
      expect(result).toHaveProperty('robustness');

      // Should have multiple walk-forward windows
      expect(result.walkForwardResults.length).toBeGreaterThan(1);

      // Should assess robustness
      expect(result.robustness).toHaveProperty('score');
      expect(result.robustness).toHaveProperty('assessment');
    });

    test('should detect overfitting through robustness analysis', async () => {
      const result = await backtest.walkForwardAnalysis('ensemble', 'R_10', {
        trainWindow: 300,
        testWindow: 50,
        stepSize: 50
      });

      const robustness = result.robustness;

      // Should provide robustness assessment
      expect(['highly robust', 'moderately robust', 'somewhat robust', 'not robust'])
        .toContain(robustness.assessment);

      // Should have consistency metrics
      expect(robustness).toHaveProperty('profitConsistency');
      expect(robustness).toHaveProperty('winRateConsistency');
    });
  });

  describe('Market Condition Analysis', () => {
    test('should analyze market conditions during backtest', async () => {
      const result = await backtest.runBacktest('frequency', 'R_10', {
        maxTrades: 10
      });

      expect(result.metadata).toHaveProperty('marketConditions');
      const conditions = result.metadata.marketConditions;

      expect(conditions).toHaveProperty('volatility');
      expect(conditions).toHaveProperty('liquidity');
      expect(conditions).toHaveProperty('trend');

      // Volatility should be reasonable
      expect(conditions.volatility).toBeGreaterThan(0);
      expect(conditions.volatility).toBeLessThan(5);
    });

    test('should filter data by market hours', async () => {
      const result = await backtest.runBacktest('frequency', 'R_10', {
        maxTrades: 10,
        marketHoursOnly: true
      });

      // Should have metadata about date range
      expect(result.metadata).toHaveProperty('dataPoints');
      expect(result.metadata.dataPoints).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle insufficient data gracefully', async () => {
      await expect(backtest.runBacktest('frequency', 'R_10', {
        maxTrades: 1000 // Request more trades than possible
      })).rejects.toThrow('Insufficient historical data');
    });

    test('should handle invalid strategy names', async () => {
      await expect(backtest.runBacktest('invalid_strategy', 'R_10', {
        maxTrades: 5
      })).rejects.toThrow();
    });

    test('should prevent concurrent backtests', async () => {
      const promise1 = backtest.runBacktest('frequency', 'R_10', { maxTrades: 5 });
      const promise2 = backtest.runBacktest('markov', 'R_10', { maxTrades: 5 });

      await expect(Promise.all([promise1, promise2])).rejects.toThrow('Backtest already running');
    });

    test('should handle extreme market conditions', async () => {
      // Test with very high volatility simulation
      const result = await backtest.runBacktest('ensemble', 'R_10', {
        maxTrades: 10,
        slippageModel: 'aggressive' // High slippage
      });

      expect(result.performance.totalTrades).toBeGreaterThan(0);
      // Should still complete despite adverse conditions
    });
  });

  describe('Performance Validation', () => {
    test('should validate that profitable strategies exist', async () => {
      // Run multiple strategies and ensure at least one is profitable
      const strategies = ['frequency', 'markov', 'ensemble'];
      const results = [];

      for (const strategy of strategies) {
        const result = await backtest.runBacktest(strategy, 'R_10', {
          maxTrades: 15,
          includeTransactionCosts: true
        });
        results.push(result);
      }

      // At least one strategy should be able to generate positive returns
      const profitableStrategies = results.filter(r => r.performance.totalProfit > 0);
      expect(profitableStrategies.length).toBeGreaterThan(0);
    });

    test('should ensure realistic Sharpe ratios', async () => {
      const result = await backtest.runBacktest('ensemble', 'R_10', {
        maxTrades: 30,
        includeTransactionCosts: true
      });

      const sharpe = result.performance.sharpeRatio;

      // Sharpe ratio should be reasonable (not infinite or extreme)
      expect(sharpe).toBeGreaterThan(-5);
      expect(sharpe).toBeLessThan(5);

      // Annualized Sharpe ratio should be realistic
      expect(Math.abs(sharpe)).toBeLessThan(3);
    });

    test('should validate maximum drawdown calculations', async () => {
      const result = await backtest.runBacktest('frequency', 'R_10', {
        maxTrades: 20,
        includeTransactionCosts: true
      });

      const maxDD = result.performance.maxDrawdown;

      // Max drawdown should be reasonable
      expect(maxDD).toBeGreaterThanOrEqual(0);
      expect(maxDD).toBeLessThanOrEqual(1); // Max 100% drawdown

      // Should be less than total capital (unless complete loss)
      expect(maxDD).toBeLessThan(0.95); // Allow for near-total loss but not complete
    });
  });

  describe('Statistical Soundness', () => {
    test('should produce statistically valid results', async () => {
      const result = await backtest.runBacktest('markov', 'R_10', {
        maxTrades: 50, // Large sample for statistical validity
        includeTransactionCosts: true
      });

      const perf = result.performance;

      // With sufficient trades, win rate should be between 0.1 and 0.9 (not extreme)
      if (perf.totalTrades > 20) {
        expect(perf.winRate).toBeGreaterThan(0.1);
        expect(perf.winRate).toBeLessThan(0.9);
      }

      // Profit factor should be calculable and reasonable
      expect(perf.profitFactor).toBeGreaterThanOrEqual(0);
      expect(perf.profitFactor).toBeLessThan(10); // Not infinite
    });

    test('should handle random market conditions', async () => {
      // Test that results are consistent across multiple runs
      const results = [];

      for (let i = 0; i < 3; i++) {
        const result = await backtest.runBacktest('frequency', 'R_10', {
          maxTrades: 15,
          includeTransactionCosts: true
        });
        results.push(result);
      }

      // Results should be reasonably consistent (not completely random)
      const profits = results.map(r => r.performance.totalProfit);
      const profitStd = calculateStdDeviation(profits);
      const profitMean = profits.reduce((a, b) => a + b, 0) / profits.length;

      // Coefficient of variation should be reasonable (< 2.0)
      const cv = profitStd / Math.abs(profitMean || 1);
      expect(cv).toBeLessThan(2.0);
    });
  });
});

/**
 * Helper function to calculate standard deviation
 */
function calculateStdDeviation(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
}