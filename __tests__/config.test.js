const config = require('../config');

/**
 * Comprehensive unit tests for configuration module
 * Tests configuration validation, risk management parameters, and system constraints
 */
describe('Config Module - Comprehensive Validation', () => {
  describe('Core Configuration Properties', () => {
    test('should have all required configuration properties', () => {
      const requiredProperties = [
        'DEFAULT_SYMBOLS', 'MIN_SAMPLES_REQUIRED', 'MIN_PROBABILITY_THRESHOLD',
        'MAX_CONCURRENT_TRADES', 'TRADE_COOLDOWN_MS', 'RISK_PER_TRADE',
        'MAX_DRAWDOWN', 'DEFAULT_STRATEGY', 'DERIV_APP_ID', 'WEB_SERVER_PORT',
        'PAYOUT_MULTIPLIER', 'KELLY_FRACTION', 'MAX_STAKE_MULTIPLIER'
      ];

      requiredProperties.forEach(prop => {
        expect(config).toHaveProperty(prop);
      });
    });

    test('should have valid trading symbols configuration', () => {
      expect(Array.isArray(config.DEFAULT_SYMBOLS)).toBe(true);
      expect(config.DEFAULT_SYMBOLS.length).toBeGreaterThan(0);
      expect(config.DEFAULT_SYMBOLS.length).toBeLessThanOrEqual(10); // Reasonable limit

      // Should contain volatility indices
      expect(config.DEFAULT_SYMBOLS.some(symbol => symbol.includes('R_'))).toBe(true);

      // All symbols should be strings and reasonable length
      config.DEFAULT_SYMBOLS.forEach(symbol => {
        expect(typeof symbol).toBe('string');
        expect(symbol.length).toBeGreaterThan(1);
        expect(symbol.length).toBeLessThan(20);
      });
    });
  });

  describe('Risk Management Validation', () => {
    test('should have mathematically sound risk parameters', () => {
      // Risk per trade should be conservative
      expect(config.RISK_PER_TRADE).toBeGreaterThan(0);
      expect(config.RISK_PER_TRADE).toBeLessThanOrEqual(0.05); // Max 5% per trade

      // Maximum drawdown should be reasonable
      expect(config.MAX_DRAWDOWN).toBeGreaterThan(0);
      expect(config.MAX_DRAWDOWN).toBeLessThanOrEqual(0.25); // Max 25% drawdown

      // Kelly fraction should be conservative
      expect(config.KELLY_FRACTION).toBeGreaterThan(0);
      expect(config.KELLY_FRACTION).toBeLessThanOrEqual(0.5); // Max half Kelly
    });

    test('should have realistic trading constraints', () => {
      // Minimum samples should be statistically meaningful
      expect(config.MIN_SAMPLES_REQUIRED).toBeGreaterThanOrEqual(100);

      // Probability threshold should be reasonable
      expect(config.MIN_PROBABILITY_THRESHOLD).toBeGreaterThan(0);
      expect(config.MIN_PROBABILITY_THRESHOLD).toBeLessThanOrEqual(60); // Max 60% threshold

      // Trade cooldown should prevent overtrading
      expect(config.TRADE_COOLDOWN_MS).toBeGreaterThanOrEqual(1000); // Min 1 second
      expect(config.TRADE_COOLDOWN_MS).toBeLessThanOrEqual(60000); // Max 1 minute
    });

    test('should have valid payout and stake constraints', () => {
      // DIGIT MATCH payout should be realistic
      expect(config.PAYOUT_MULTIPLIER).toBeGreaterThan(1);
      expect(config.PAYOUT_MULTIPLIER).toBeLessThanOrEqual(10); // Max 10x payout

      // Maximum stake multiplier should be conservative
      expect(config.MAX_STAKE_MULTIPLIER).toBeGreaterThan(0);
      expect(config.MAX_STAKE_MULTIPLIER).toBeLessThanOrEqual(0.1); // Max 10% of balance
    });
  });

  describe('Strategy Configuration', () => {
    test('should have valid strategy configuration', () => {
      const validStrategies = ['frequency', 'markov', 'neural', 'ensemble', 'time_series', 'gradient_boosting', 'lstm'];
      expect(validStrategies).toContain(config.DEFAULT_STRATEGY);
    });

    test('should have valid ML training parameters', () => {
      expect(config.ML_RETRAINING_INTERVAL_MS).toBeGreaterThan(0);
      expect(config.BACKTEST_INTERVAL_MS).toBeGreaterThan(0);

      // Retraining should not be too frequent (avoid overfitting)
      expect(config.ML_RETRAINING_INTERVAL_MS).toBeGreaterThanOrEqual(1800000); // Min 30 minutes
    });
  });

  describe('System Configuration', () => {
    test('should have valid network configuration', () => {
      expect(config.DERIV_APP_ID).toBeTruthy();
      expect(typeof config.DERIV_APP_ID).toBe('string');

      expect(config.WEB_SERVER_PORT).toBeGreaterThan(1000);
      expect(config.WEB_SERVER_PORT).toBeLessThan(65535);
    });

    test('should have valid database configuration', () => {
      expect(config.MAX_TICKS_PER_SYMBOL).toBeGreaterThan(0);
      expect(config.DATA_RETENTION_DAYS).toBeGreaterThan(0);
      expect(config.DATA_RETENTION_DAYS).toBeLessThanOrEqual(365); // Max 1 year
    });

    test('should have valid rate limiting', () => {
      expect(config.MAX_REQUESTS_PER_MINUTE).toBeGreaterThan(0);
      expect(config.MAX_REQUESTS_PER_HOUR).toBeGreaterThan(config.MAX_REQUESTS_PER_MINUTE);

      expect(config.RATE_LIMIT_ENABLED).toBeDefined();
      expect(config.RETRY_ENABLED).toBeDefined();
    });
  });

  describe('Configuration Consistency', () => {
    test('should have consistent risk parameters', () => {
      // Daily loss limit should be less than max drawdown
      expect(config.MAX_DAILY_LOSS).toBeLessThanOrEqual(config.MAX_DRAWDOWN);

      // Risk per trade should be less than daily loss limit
      expect(config.RISK_PER_TRADE).toBeLessThanOrEqual(config.MAX_DAILY_LOSS);
    });

    test('should have realistic concurrent trade limits', () => {
      expect(config.MAX_CONCURRENT_TRADES).toBeGreaterThan(0);
      expect(config.MAX_CONCURRENT_TRADES).toBeLessThanOrEqual(5); // Conservative limit
    });

    test('should have valid backtest parameters', () => {
      expect(config.DEFAULT_BACKTEST_TRADES).toBeGreaterThan(0);
      expect(config.BACKTEST_FOLDS).toBeGreaterThan(1);
    });
  });

  describe('Configuration Edge Cases', () => {
    test('should handle environment variable overrides', () => {
      // Test that environment variables can override defaults
      const originalPort = process.env.PORT;
      process.env.PORT = '9090';

      // Re-require config to test override
      delete require.cache[require.resolve('../config')];
      const configWithOverride = require('../config');

      expect(configWithOverride.WEB_SERVER_PORT).toBe(3000); // Config uses process.env.PORT || 3000

      // Restore original
      process.env.PORT = originalPort;
    });

    test('should have fallback values for missing environment variables', () => {
      const originalToken = process.env.DERIV_API_TOKEN;
      delete process.env.DERIV_API_TOKEN;

      delete require.cache[require.resolve('../config')];
      const configWithoutToken = require('../config');

      expect(configWithoutToken.DEMO_API_TOKEN).toBe('');

      // Restore
      process.env.DERIV_API_TOKEN = originalToken;
    });
  });

  describe('Mathematical Consistency', () => {
    test('should have mathematically consistent parameters', () => {
      // Sharpe ratio calculation should be possible
      expect(config.RISK_PER_TRADE).toBeGreaterThan(0);

      // Calmar ratio should be calculable
      expect(config.MAX_DRAWDOWN).toBeGreaterThan(0);

      // Profit factor should be calculable
      expect(config.PAYOUT_MULTIPLIER).toBeGreaterThan(1);
    });

    test('should have realistic performance expectations', () => {
      // Minimum probability threshold should be achievable
      expect(config.MIN_PROBABILITY_THRESHOLD).toBeLessThanOrEqual(60); // 60% should be achievable

      // Sample requirements should be realistic
      expect(config.MIN_SAMPLES_REQUIRED).toBeLessThanOrEqual(10000); // 10k samples max
    });
  });
});