const config = require('../config');

/**
 * Unit tests for configuration module
 */
describe('Config Module', () => {
  test('should have all required configuration properties', () => {
    expect(config).toHaveProperty('DEFAULT_SYMBOLS');
    expect(config).toHaveProperty('MIN_SAMPLES_REQUIRED');
    expect(config).toHaveProperty('MIN_PROBABILITY_THRESHOLD');
    expect(config).toHaveProperty('MAX_CONCURRENT_TRADES');
    expect(config).toHaveProperty('TRADE_COOLDOWN_MS');
    expect(config).toHaveProperty('RISK_PER_TRADE');
    expect(config).toHaveProperty('MAX_DRAWDOWN');
    expect(config).toHaveProperty('DEFAULT_STRATEGY');
    expect(config).toHaveProperty('DERIV_APP_ID');
    expect(config).toHaveProperty('WEB_SERVER_PORT');
  });

  test('should have valid default symbols array', () => {
    expect(Array.isArray(config.DEFAULT_SYMBOLS)).toBe(true);
    expect(config.DEFAULT_SYMBOLS.length).toBeGreaterThan(0);
    expect(config.DEFAULT_SYMBOLS).toContain('R_10');
  });

  test('should have reasonable numeric values', () => {
    expect(config.MIN_SAMPLES_REQUIRED).toBeGreaterThan(0);
    expect(config.MIN_PROBABILITY_THRESHOLD).toBeGreaterThan(0);
    expect(config.MIN_PROBABILITY_THRESHOLD).toBeLessThanOrEqual(100);
    expect(config.MAX_CONCURRENT_TRADES).toBeGreaterThan(0);
    expect(config.RISK_PER_TRADE).toBeGreaterThan(0);
    expect(config.RISK_PER_TRADE).toBeLessThanOrEqual(1);
  });

  test('should have valid strategy options', () => {
    const validStrategies = ['frequency', 'markov', 'neural', 'ensemble', 'time_series', 'gradient_boosting', 'lstm'];
    expect(validStrategies).toContain(config.DEFAULT_STRATEGY);
  });

  test('should have valid port configuration', () => {
    expect(config.WEB_SERVER_PORT).toBeGreaterThan(1000);
    expect(config.WEB_SERVER_PORT).toBeLessThan(65535);
  });
});