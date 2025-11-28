const risk = require('../risk');

/**
 * Unit tests for risk management module
 */
describe('Risk Management Module', () => {
  beforeEach(() => {
    // Reset risk manager state before each test
    risk.portfolioStats = {
      totalBalance: 1000,
      peakBalance: 1000,
      currentDrawdown: 0,
      consecutiveLosses: 0,
      dailyLoss: 0,
      lastResetDate: new Date().toDateString()
    };
  });

  describe('calculateKellyStake', () => {
    test('should return conservative stake for valid inputs', () => {
      const stake = risk.calculateKellyStake(0.6, 0.8, 1.0, 1000, 1.0);
      expect(stake).toBeGreaterThan(0);
      expect(stake).toBeLessThan(1000);
    });

    test('should return fallback stake for invalid inputs', () => {
      const stake = risk.calculateKellyStake(0, 0.8, 1.0, 1000, 1.0);
      expect(stake).toBe(10); // 1% of balance
    });
  });

  describe('calculatePositionSize', () => {
    test('should calculate position size based on risk', () => {
      const size = risk.calculatePositionSize(1000, 0.02, 1);
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThanOrEqual(20); // 2% of 1000
    });
  });

  describe('updatePortfolioStats', () => {
    test('should update portfolio stats correctly for wins', () => {
      risk.updatePortfolioStats(true, 10, 8); // Win: stake 10, profit 8

      expect(risk.portfolioStats.totalBalance).toBe(1008);
      expect(risk.portfolioStats.peakBalance).toBe(1008);
      expect(risk.portfolioStats.consecutiveLosses).toBe(0);
    });

    test('should update portfolio stats correctly for losses', () => {
      risk.updatePortfolioStats(false, 10, -10); // Loss: stake 10, loss 10

      expect(risk.portfolioStats.totalBalance).toBe(990);
      expect(risk.portfolioStats.peakBalance).toBe(1000);
      expect(risk.portfolioStats.consecutiveLosses).toBe(1);
      expect(risk.portfolioStats.currentDrawdown).toBe(0.01); // 1% drawdown
    });
  });

  describe('shouldStopTrading', () => {
    test('should not stop trading under normal conditions', () => {
      const result = risk.shouldStopTrading();
      expect(result.stop).toBe(false);
    });

    test('should stop trading on excessive drawdown', () => {
      risk.portfolioStats.currentDrawdown = 0.25; // 25% drawdown
      const result = risk.shouldStopTrading();
      expect(result.stop).toBe(true);
      expect(result.reason).toBe('max_drawdown');
    });

    test('should stop trading on consecutive losses', () => {
      risk.portfolioStats.consecutiveLosses = 6; // More than max
      const result = risk.shouldStopTrading();
      expect(result.stop).toBe(true);
      expect(result.reason).toBe('consecutive_losses');
    });
  });

  describe('Trailing Stop Functionality', () => {
    test('should initialize trailing stop', () => {
      const stop = risk.initializeTrailingStop('trade1', 100, 5, 'fixed');
      expect(stop).toHaveProperty('entryPrice', 100);
      expect(stop).toHaveProperty('currentStop', 95);
      expect(stop).toHaveProperty('trailingAmount', 5);
    });

    test('should update trailing stop for long position', () => {
      risk.initializeTrailingStop('trade1', 100, 5, 'fixed');

      // Price increases
      const newStop = risk.updateTrailingStop('trade1', 110, true);
      expect(newStop).toBe(105); // 110 - 5
    });

    test('should not move stop down for long position', () => {
      risk.initializeTrailingStop('trade1', 100, 5, 'fixed');
      risk.updateTrailingStop('trade1', 110, true); // Stop moves to 105

      // Price decreases - stop should not move down
      const newStop = risk.updateTrailingStop('trade1', 102, true);
      expect(newStop).toBe(105); // Stop stays at 105
    });

    test('should trigger exit when price hits stop', () => {
      risk.initializeTrailingStop('trade1', 100, 5, 'fixed');
      risk.updateTrailingStop('trade1', 110, true); // Stop at 105

      const shouldExit = risk.shouldExitOnTrailingStop('trade1', 104, true);
      expect(shouldExit).toBe(true);
    });
  });

  describe('Partial Close Rules', () => {
    test('should set partial close rules', () => {
      const rules = risk.setPartialCloseRules('trade1', {
        levels: [
          { profitTarget: 0.5, closePercent: 0.5, description: '50% profit - close 50%' }
        ]
      });

      expect(rules).toHaveProperty('levels');
      expect(rules.levels).toHaveLength(1);
    });

    test('should calculate partial close amount', () => {
      risk.setPartialCloseRules('trade1');

      const partialClose = risk.calculatePartialCloseAmount('trade1', 0.6, 100);
      expect(partialClose).toHaveProperty('closeAmount');
      expect(partialClose).toHaveProperty('remainingAmount');
      expect(partialClose.closeAmount).toBe(50); // 50% of 100
      expect(partialClose.remainingAmount).toBe(50);
    });

    test('should update position after partial close', () => {
      risk.initializeTrailingStop('trade1', 100, 5, 'fixed');
      risk.setPartialCloseRules('trade1');

      const success = risk.updatePositionAfterPartialClose('trade1', 50, 50);
      expect(success).toBe(true);

      const stats = risk.getPartialCloseStats('trade1');
      expect(stats.position.currentStake).toBe(50);
      expect(stats.position.closedAmount).toBe(50);
    });
  });

  describe('Scale Strategies', () => {
    test('should create scale-in strategy', () => {
      const strategy = risk.createScaleInStrategy('scale1', {
        totalParts: 3,
        stakeDistribution: [0.4, 0.3, 0.3]
      });

      expect(strategy).toHaveProperty('totalParts', 3);
      expect(strategy).toHaveProperty('stakeDistribution');
    });

    test('should create scale-out strategy', () => {
      const strategy = risk.createScaleOutStrategy('scale1', {
        profitLevels: [0.25, 0.5, 1.0],
        stakeDistribution: [0.3, 0.3, 0.4]
      });

      expect(strategy).toHaveProperty('profitLevels');
      expect(strategy).toHaveProperty('stakeDistribution');
    });

    test('should get next scale-out exit', () => {
      risk.createScaleOutStrategy('scale1');

      const exit = risk.getNextScaleOutExit('scale1', 0.3, 100);
      expect(exit).toHaveProperty('closePercent');
      expect(exit).toHaveProperty('closeAmount');
      expect(exit.closeAmount).toBe(30); // 30% of 100
    });
  });

  describe('Volatility-Adjusted Position Sizing', () => {
    test('should calculate volatility-adjusted position size', () => {
      const result = risk.calculateVolatilityAdjustedPositionSize('R_10', 1000, 0.02, 2.5);

      expect(result).toHaveProperty('positionSize');
      expect(result).toHaveProperty('volatility');
      expect(result).toHaveProperty('volatilityMultiplier');
      expect(result.positionSize).toBeGreaterThan(0);
    });

    test('should get comprehensive position sizing recommendation', () => {
      const recommendation = risk.getPositionSizingRecommendation('R_10', 1000, 0.02);

      expect(recommendation).toHaveProperty('recommendedPositionSize');
      expect(recommendation).toHaveProperty('volatilityAdjusted');
      expect(recommendation).toHaveProperty('atrBased');
      expect(recommendation).toHaveProperty('marketRegime');
      expect(recommendation).toHaveProperty('reasoning');
    });
  });
});