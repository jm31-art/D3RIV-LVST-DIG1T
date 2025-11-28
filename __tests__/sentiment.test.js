const sentiment = require('../sentiment');

/**
 * Unit tests for sentiment analysis module
 */
describe('Sentiment Analysis Module', () => {
  describe('analyzeSentiment', () => {
    test('should return neutral sentiment for empty text', () => {
      const result = sentiment.analyzeSentiment('');
      expect(result.score).toBe(0);
      expect(result.confidence).toBe(0);
    });

    test('should analyze positive sentiment', () => {
      const result = sentiment.analyzeSentiment('This stock is performing exceptionally well with strong growth');
      expect(result.score).toBeGreaterThan(0);
      expect(result.classification).toBe('positive');
      expect(result.confidence).toBeGreaterThan(0);
    });

    test('should analyze negative sentiment', () => {
      const result = sentiment.analyzeSentiment('The company is facing severe financial difficulties and losses');
      expect(result.score).toBeLessThan(0);
      expect(result.classification).toBe('negative');
    });

    test('should handle neutral sentiment', () => {
      const result = sentiment.analyzeSentiment('The market conditions remain stable today');
      expect(result.classification).toBe('neutral');
      expect(Math.abs(result.score)).toBeLessThan(0.3);
    });
  });

  describe('analyzeNewsArticle', () => {
    test('should analyze news article with sentiment', () => {
      const article = {
        title: 'Company Reports Strong Quarterly Earnings',
        content: 'The company exceeded analyst expectations with record profits.',
        source: 'Financial Times',
        publishedAt: new Date().toISOString(),
        url: 'https://example.com/news'
      };

      const result = sentiment.analyzeNewsArticle(article, 'COMPANY');

      expect(result).toHaveProperty('marketImpact');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('marketImpact.score');
      expect(result).toHaveProperty('marketImpact.level');
      expect(result.symbol).toBe('COMPANY');
    });

    test('should calculate market impact correctly', () => {
      const article = {
        title: 'Breaking: Major Acquisition Announced',
        content: 'Company A acquires Company B in a $10 billion deal.',
        source: 'Bloomberg',
        publishedAt: new Date().toISOString()
      };

      const result = sentiment.analyzeNewsArticle(article);

      expect(result.marketImpact).toHaveProperty('score');
      expect(result.marketImpact).toHaveProperty('level');
      expect(result.marketImpact).toHaveProperty('direction');
      expect(['bullish', 'bearish', 'neutral']).toContain(result.marketImpact.direction);
    });
  });

  describe('getSentimentTrend', () => {
    test('should return neutral trend for no data', () => {
      const trend = sentiment.getSentimentTrend('TEST');
      expect(trend.trend).toBe('neutral');
      expect(trend.strength).toBe(0);
    });

    test('should calculate sentiment trend', () => {
      // Add some mock sentiment data
      sentiment.sentimentHistory.set('TEST', [
        { timestamp: new Date().toISOString(), score: 0.5, impact: 0.8 },
        { timestamp: new Date().toISOString(), score: 0.3, impact: 0.6 },
        { timestamp: new Date().toISOString(), score: 0.7, impact: 0.9 }
      ]);

      const trend = sentiment.getSentimentTrend('TEST');
      expect(trend).toHaveProperty('trend');
      expect(trend).toHaveProperty('strength');
      expect(trend).toHaveProperty('change');
      expect(trend).toHaveProperty('sampleSize');
    });
  });

  describe('generateSentimentSignal', () => {
    test('should return null for no signal', () => {
      const signal = sentiment.generateSentimentSignal('TEST');
      expect(signal).toBeNull();
    });

    test('should generate trading signal from sentiment', () => {
      // Mock sentiment history with strong bullish sentiment
      sentiment.sentimentHistory.set('TEST', [
        { timestamp: new Date(Date.now() - 1000).toISOString(), score: 0.8, impact: 0.9 },
        { timestamp: new Date(Date.now() - 2000).toISOString(), score: 0.7, impact: 0.8 },
        { timestamp: new Date(Date.now() - 3000).toISOString(), score: 0.9, impact: 1.0 }
      ]);

      const signal = sentiment.generateSentimentSignal('TEST');
      expect(signal).toHaveProperty('signal');
      expect(signal).toHaveProperty('strength');
      expect(signal).toHaveProperty('confidence');
      expect(['BUY', 'SELL']).toContain(signal.signal);
    });
  });

  describe('getSentimentSummary', () => {
    test('should return sentiment summary for symbols', () => {
      const symbols = ['TEST1', 'TEST2'];
      const summary = sentiment.getSentimentSummary(symbols);

      expect(summary).toHaveProperty('TEST1');
      expect(summary).toHaveProperty('TEST2');

      expect(summary.TEST1).toHaveProperty('sentimentTrend');
      expect(summary.TEST1).toHaveProperty('newsCount24h');
      expect(summary.TEST1).toHaveProperty('avgImpact');
      expect(summary.TEST1).toHaveProperty('tradingSignal');
    });
  });

  describe('Source Credibility', () => {
    test('should assign higher credibility to reputable sources', () => {
      // This is tested indirectly through the market impact calculation
      const reputableArticle = {
        title: 'Market Update',
        content: 'Stocks are rising',
        source: 'Bloomberg',
        publishedAt: new Date().toISOString()
      };

      const lessReputableArticle = {
        title: 'Market Update',
        content: 'Stocks are rising',
        source: 'Unknown Blog',
        publishedAt: new Date().toISOString()
      };

      const reputableResult = sentiment.analyzeNewsArticle(reputableArticle);
      const lessReputableResult = sentiment.analyzeNewsArticle(lessReputableArticle);

      // Reputable source should have higher impact due to credibility multiplier
      expect(reputableResult.marketImpact.score).toBeGreaterThanOrEqual(lessReputableResult.marketImpact.score);
    });
  });

  describe('Article Type Impact', () => {
    test('should give higher impact to breaking news', () => {
      const breakingNews = {
        title: 'BREAKING: Major Merger Announced',
        content: 'Two major companies announce merger',
        source: 'Reuters',
        publishedAt: new Date().toISOString()
      };

      const regularNews = {
        title: 'Company Reports Earnings',
        content: 'Quarterly earnings were reported',
        source: 'Reuters',
        publishedAt: new Date().toISOString()
      };

      const breakingResult = sentiment.analyzeNewsArticle(breakingNews);
      const regularResult = sentiment.analyzeNewsArticle(regularNews);

      expect(breakingResult.marketImpact.score).toBeGreaterThan(regularResult.marketImpact.score);
    });
  });

  describe('Recency Impact', () => {
    test('should reduce impact of older news', () => {
      const recentArticle = {
        title: 'Market News',
        content: 'Positive market development',
        source: 'Reuters',
        publishedAt: new Date().toISOString() // Now
      };

      const oldArticle = {
        title: 'Market News',
        content: 'Positive market development',
        source: 'Reuters',
        publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 24 hours ago
      };

      const recentResult = sentiment.analyzeNewsArticle(recentArticle);
      const oldResult = sentiment.analyzeNewsArticle(oldArticle);

      expect(recentResult.score).toBeGreaterThan(oldResult.score);
    });
  });
});