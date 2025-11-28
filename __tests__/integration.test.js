const db = require('../db');
const stats = require('../stats');
const ml = require('../ml');
const risk = require('../risk');
const portfolio = require('../portfolio');
const sentiment = require('../sentiment');

/**
 * Integration tests for bot functionality
 */
describe('Bot Integration Tests', () => {
  beforeEach(() => {
    // Reset all modules to clean state
    jest.clearAllMocks();

    // Reset portfolio
    portfolio.clearPositions();

    // Reset risk manager
    risk.portfolioStats = {
      totalBalance: 1000,
      peakBalance: 1000,
      currentDrawdown: 0,
      consecutiveLosses: 0,
      dailyLoss: 0,
      lastResetDate: new Date().toDateString()
    };

    // Clear sentiment caches
    sentiment.clearCaches();
  });

  describe('Trading Opportunity Evaluation', () => {
    test('should evaluate trading opportunity with all modules', async () => {
      // Setup mock data
      const symbol = 'R_10';
      const mockTicks = [];
      for (let i = 0; i < 1000; i++) {
        mockTicks.push({
          id: i,
          symbol,
          timestamp: Date.now() - (1000 - i) * 1000,
          quote: 1.2345 + Math.random() * 0.01,
          last_digit: Math.floor(Math.random() * 10)
        });
      }

      // Insert mock data into database
      mockTicks.forEach(tick => {
        db.insertTick(tick.symbol, tick.timestamp, tick.quote, tick.last_digit);
      });

      // Test evaluation components
      const tickCount = db.getTickCount(symbol);
      expect(tickCount).toBeGreaterThan(900);

      const recentTicks = db.getRecentTicks(symbol, 100);
      expect(recentTicks.length).toBe(100);

      // Test digit frequency calculation
      const { data: digitFreq, totalSamples } = db.getDigitFrequencies(symbol);
      expect(totalSamples).toBeGreaterThan(900);

      // Test probability calculation
      const probabilities = {};
      for (let digit = 0; digit <= 9; digit++) {
        probabilities[digit] = totalSamples > 0 ? (digitFreq[digit] || 0) / totalSamples * 100 : 0;
      }

      // Verify probabilities sum to approximately 100%
      const totalProb = Object.values(probabilities).reduce((sum, prob) => sum + prob, 0);
      expect(totalProb).toBeGreaterThan(95);
      expect(totalProb).toBeLessThan(105);

      // Test ML prediction (mock)
      const recentDigits = recentTicks.map(tick => tick.last_digit);
      const prediction = await ml.predict(symbol, recentDigits);

      if (prediction) {
        expect(prediction).toHaveProperty('digit');
        expect(prediction).toHaveProperty('confidence');
        expect(prediction.digit).toBeGreaterThanOrEqual(0);
        expect(prediction.digit).toBeLessThanOrEqual(9);
      }

      // Test sentiment analysis
      const sentimentSignal = sentiment.generateSentimentSignal(symbol);
      // May be null if no sentiment data, which is fine

      // Test risk management
      const sizingRecommendation = risk.getPositionSizingRecommendation(symbol, 1000, 0.02);
      expect(sizingRecommendation).toHaveProperty('recommendedPositionSize');
      expect(sizingRecommendation.recommendedPositionSize).toBeGreaterThan(0);

      // Test portfolio management
      const canAdd = portfolio.canAddPosition(symbol, 10);
      expect(canAdd).toHaveProperty('allowed');
    });
  });

  describe('Portfolio Risk Assessment', () => {
    test('should perform comprehensive portfolio risk assessment', () => {
      // Add some mock positions
      portfolio.addPosition('R_10', { stake: 50, prediction: 5, timestamp: Date.now() });
      portfolio.addPosition('R_25', { stake: 30, prediction: 3, timestamp: Date.now() });
      portfolio.addPosition('R_50', { stake: 20, prediction: 7, timestamp: Date.now() });

      // Test portfolio allocation
      const allocation = portfolio.getAllocation();
      expect(allocation).toHaveProperty('allocation');
      expect(allocation).toHaveProperty('totalAllocated');
      expect(allocation.totalAllocated).toBe(100);

      // Test risk assessment
      const riskAssessment = portfolio.assessPortfolioRisk();
      expect(riskAssessment).toHaveProperty('riskLevel');
      expect(riskAssessment).toHaveProperty('riskScore');
      expect(riskAssessment).toHaveProperty('issues');
      expect(riskAssessment).toHaveProperty('metrics');

      // Test correlation calculation
      const correlation = portfolio.getCorrelation('R_10', 'R_25');
      expect(typeof correlation).toBe('number');
      expect(correlation).toBeGreaterThanOrEqual(-1);
      expect(correlation).toBeLessThanOrEqual(1);

      // Test dynamic risk limits
      const dynamicLimits = portfolio.getDynamicRiskLimits();
      expect(dynamicLimits).toHaveProperty('limits');
      expect(dynamicLimits).toHaveProperty('reasoning');
      expect(dynamicLimits.limits).toHaveProperty('maxDrawdown');
      expect(dynamicLimits.limits).toHaveProperty('maxAllocation');
    });
  });

  describe('Sentiment Integration', () => {
    test('should integrate sentiment analysis with trading', async () => {
      const symbol = 'TEST';

      // Mock news articles
      const mockNews = [
        {
          title: 'Positive Market Development',
          content: 'The market shows strong bullish signals with increasing momentum.',
          source: 'Bloomberg',
          publishedAt: new Date().toISOString()
        },
        {
          title: 'Earnings Beat Expectations',
          content: 'Company reports better than expected quarterly earnings.',
          source: 'Financial Times',
          publishedAt: new Date().toISOString()
        }
      ];

      // Analyze news
      for (const article of mockNews) {
        sentiment.analyzeNewsArticle(article, symbol);
      }

      // Test sentiment summary
      const summary = sentiment.getSentimentSummary([symbol]);
      expect(summary).toHaveProperty(symbol);
      expect(summary[symbol]).toHaveProperty('sentimentTrend');
      expect(summary[symbol]).toHaveProperty('newsCount24h');
      expect(summary[symbol].newsCount24h).toBeGreaterThan(0);

      // Test sentiment signal generation
      const signal = sentiment.generateSentimentSignal(symbol);
      if (signal) {
        expect(signal).toHaveProperty('signal');
        expect(signal).toHaveProperty('confidence');
        expect(['BUY', 'SELL']).toContain(signal.signal);
      }
    });
  });

  describe('Risk Management Integration', () => {
    test('should integrate all risk management features', () => {
      const tradeId = 'test_trade_1';

      // Test trailing stop initialization
      const trailingStop = risk.initializeTrailingStop(tradeId, 100, 5, 'fixed');
      expect(trailingStop).toHaveProperty('currentStop', 95);

      // Test partial close setup
      const partialRules = risk.setPartialCloseRules(tradeId);
      expect(partialRules).toHaveProperty('levels');

      // Test scale-out strategy
      const scaleOutStrategy = risk.createScaleOutStrategy(tradeId);
      expect(scaleOutStrategy).toHaveProperty('profitLevels');

      // Test position sizing
      const sizing = risk.getPositionSizingRecommendation('R_10', 1000, 0.02);
      expect(sizing).toHaveProperty('recommendedPositionSize');
      expect(sizing).toHaveProperty('reasoning');

      // Test portfolio stress testing
      const stressTest = portfolio.stressTestPortfolio([
        { name: 'Market Crash', shocks: { R_10: -0.3, R_25: -0.25 }, maxVaR: 0.2 },
        { name: 'Bull Market', shocks: { R_10: 0.2, R_25: 0.15 }, maxVaR: 0.1 }
      ]);

      expect(stressTest).toHaveProperty('stressTestResults');
      expect(stressTest.stressTestResults.length).toBe(2);
    });
  });

  describe('ML Model Integration', () => {
    test('should integrate ML models with trading logic', async () => {
      const symbol = 'R_10';

      // Create mock training data
      const mockTicks = [];
      for (let i = 0; i < 2000; i++) {
        mockTicks.push({
          timestamp: Date.now() - (2000 - i) * 1000,
          quote: 1.2345 + Math.sin(i * 0.01),
          last_digit: Math.floor(Math.random() * 10)
        });
      }

      // Test ML training (this may take time, so we'll mock it)
      const trainingResult = await ml.trainModel(symbol, mockTicks.slice(0, 1000));
      // Training result may be false if insufficient data, which is fine

      // Test prediction generation
      const recentDigits = mockTicks.slice(-50).map(t => t.last_digit);
      const prediction = await ml.predict(symbol, recentDigits);

      if (prediction) {
        expect(prediction).toHaveProperty('digit');
        expect(prediction).toHaveProperty('confidence');
        expect(prediction.digit).toBeGreaterThanOrEqual(0);
        expect(prediction.digit).toBeLessThanOrEqual(9);
      }

      // Test ensemble prediction
      const ensemblePrediction = ml.predictEnsemble(symbol, recentDigits[recentDigits.length - 1], recentDigits);
      if (ensemblePrediction) {
        expect(ensemblePrediction).toHaveProperty('digit');
        expect(ensemblePrediction).toHaveProperty('confidence');
      }
    });
  });

  describe('Performance Metrics Integration', () => {
    test('should calculate comprehensive performance metrics', () => {
      // Add mock trades to portfolio
      const mockTrades = [
        { profit: 10, stake: 50, result: 'closed', timestamp: Date.now() - 86400000 },
        { profit: -5, stake: 50, result: 'closed', timestamp: Date.now() - 86400000 * 2 },
        { profit: 15, stake: 50, result: 'closed', timestamp: Date.now() - 86400000 * 3 },
        { profit: 8, stake: 50, result: 'closed', timestamp: Date.now() - 86400000 * 4 },
        { profit: -3, stake: 50, result: 'closed', timestamp: Date.now() - 86400000 * 5 }
      ];

      // Mock the getAllTrades method to return our test data
      const originalGetAllTrades = portfolio.getAllTrades;
      portfolio.getAllTrades = jest.fn().mockReturnValue(mockTrades);

      const performance = portfolio.calculatePerformance();

      expect(performance).toHaveProperty('totalTrades', 5);
      expect(performance).toHaveProperty('winRate');
      expect(performance).toHaveProperty('totalProfit');
      expect(performance).toHaveProperty('profitFactor');
      expect(performance).toHaveProperty('sharpeRatio');
      expect(performance).toHaveProperty('maxDrawdown');

      // Verify calculations
      expect(performance.totalProfit).toBe(25); // 10 + 15 + 8 - 5 - 3
      expect(performance.winRate).toBe(0.6); // 3 wins out of 5 trades

      // Restore original method
      portfolio.getAllTrades = originalGetAllTrades;
    });
  });
});