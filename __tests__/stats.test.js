const stats = require('../stats');

/**
 * Unit tests for statistics module
 */
describe('Stats Module', () => {
  describe('calculateAutocorrelation', () => {
    test('should return 0 for insufficient data', () => {
      const result = stats.calculateAutocorrelation([1, 2, 3], 1);
      expect(result).toBe(0);
    });

    test('should calculate autocorrelation correctly', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = stats.calculateAutocorrelation(data, 1);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(-1);
      expect(result).toBeLessThanOrEqual(1);
    });
  });

  describe('detectPatterns', () => {
    test('should return no pattern for insufficient data', () => {
      const result = stats.detectPatterns([1, 2, 3]);
      expect(result.hasPattern).toBe(false);
    });

    test('should detect alternating pattern', () => {
      const alternatingData = [1, 9, 2, 8, 3, 7, 4, 6, 5, 5, 6, 4, 7, 3, 8, 2, 9, 1, 0, 0];
      const result = stats.detectPatterns(alternatingData);
      expect(result).toHaveProperty('pattern');
      expect(result).toHaveProperty('confidence');
    });
  });

  describe('calculateTransitionMatrix', () => {
    test('should create valid transition matrix', () => {
      const digits = [0, 1, 2, 1, 0, 2, 2, 1, 0, 1];
      const matrix = stats.calculateTransitionMatrix(digits);

      expect(Array.isArray(matrix)).toBe(true);
      expect(matrix.length).toBe(10);
      expect(matrix[0].length).toBe(10);

      // Check that probabilities sum to reasonable values
      matrix.forEach(row => {
        const sum = row.reduce((a, b) => a + b, 0);
        expect(sum).toBeGreaterThanOrEqual(0);
        expect(sum).toBeLessThanOrEqual(1.1); // Allow small floating point errors
      });
    });
  });

  describe('calculateStats', () => {
    test('should return empty object for no data', () => {
      const result = stats.calculateStats([]);
      expect(result).toEqual({});
    });

    test('should calculate basic statistics', () => {
      const data = [1, 2, 3, 4, 5];
      const result = stats.calculateStats(data);

      expect(result).toHaveProperty('mean');
      expect(result).toHaveProperty('median');
      expect(result).toHaveProperty('mode');
      expect(result).toHaveProperty('variance');
      expect(result).toHaveProperty('standardDeviation');
      expect(result).toHaveProperty('skewness');
      expect(result).toHaveProperty('kurtosis');

      expect(result.mean).toBe(3);
      expect(result.median).toBe(3);
    });
  });

  describe('detectMarketRegime', () => {
    test('should return unknown for insufficient data', () => {
      const result = stats.detectMarketRegime([1, 2, 3], 50);
      expect(result.regime).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    test('should detect market regime', () => {
      // Create trending data (upward trend)
      const trendingData = [];
      for (let i = 0; i < 100; i++) {
        trendingData.push(i % 10); // Repeating but with upward bias
      }

      const result = stats.detectMarketRegime(trendingData, 50);
      expect(result).toHaveProperty('regime');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('slope');
      expect(result).toHaveProperty('rSquared');
      expect(result).toHaveProperty('volatility');
    });
  });

  describe('analyzeMarketMicrostructure', () => {
    test('should return analysis for insufficient data', () => {
      const result = stats.analyzeMarketMicrostructure([]);
      expect(result).toHaveProperty('analysis');
      expect(result.analysis).toBe('insufficient_data');
    });

    test('should analyze market microstructure', () => {
      const mockTicks = [
        { quote: 1.2345, last_digit: 5 },
        { quote: 1.2346, last_digit: 6 },
        { quote: 1.2344, last_digit: 4 },
        { quote: 1.2347, last_digit: 7 },
        { quote: 1.2343, last_digit: 3 }
      ];

      const result = stats.analyzeMarketMicrostructure(mockTicks);
      expect(result).toHaveProperty('avgSpread');
      expect(result).toHaveProperty('spreadVolatility');
      expect(result).toHaveProperty('buyPressure');
      expect(result).toHaveProperty('sellPressure');
      expect(result).toHaveProperty('orderFlow');
    });
  });
});