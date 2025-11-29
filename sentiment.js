const natural = require('natural');
const sw = require('stopword');

// News Sentiment Analysis Module
class SentimentAnalyzer {
  constructor() {
    this.sentimentAnalyzer = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
    this.sentimentCache = new Map(); // Cache sentiment scores
    this.newsCache = new Map(); // Cache news articles
    this.marketImpact = new Map(); // Track market impact of news
    this.sentimentHistory = new Map(); // Historical sentiment data
  }

  // Analyze sentiment of news text
  analyzeSentiment(text) {
    if (!text || typeof text !== 'string') return { score: 0, confidence: 0 };

    try {
      // Preprocess text
      const cleanText = this.preprocessText(text);

      // Get sentiment score (-1 to 1)
      const score = this.sentimentAnalyzer.getSentiment(cleanText.split(' '));

      // Calculate confidence based on text length and word variety
      const words = cleanText.split(' ').filter(word => word.length > 2);
      const confidence = Math.min(words.length / 20, 1); // More words = higher confidence

      return {
        score: Math.max(-1, Math.min(1, score)), // Clamp to [-1, 1]
        confidence,
        magnitude: Math.abs(score),
        classification: this.classifySentiment(score)
      };
    } catch (error) {
      console.error('Error analyzing sentiment:', error);
      return { score: 0, confidence: 0 };
    }
  }

  // Preprocess text for sentiment analysis
  preprocessText(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .replace(/\d+/g, ' ') // Remove numbers
      .split(' ')
      .filter(word => word.length > 1)
      .join(' ');
  }

  // Classify sentiment score
  classifySentiment(score) {
    if (score > 0.01) return 'positive';
    if (score < -0.01) return 'negative';
    return 'neutral';
  }

  // Analyze news article with market context
  analyzeNewsArticle(article, symbol = null) {
    const sentiment = this.analyzeSentiment(article.content || article.title);

    // Enhance sentiment with market context
    const marketContext = this.getMarketContext(symbol);
    const adjustedSentiment = this.adjustForMarketContext(sentiment, marketContext, article);

    // Calculate market impact potential
    const marketImpact = this.calculateMarketImpact(adjustedSentiment, article);

    const analysis = {
      ...adjustedSentiment,
      marketImpact,
      timestamp: article.publishedAt || new Date().toISOString(),
      source: article.source,
      symbol: symbol,
      title: article.title,
      url: article.url
    };

    // Cache the analysis
    const cacheKey = `${symbol}_${article.title}_${article.publishedAt}`;
    this.sentimentCache.set(cacheKey, analysis);

    // Update sentiment history
    this.updateSentimentHistory(symbol, analysis);

    return analysis;
  }

  // Get market context for sentiment adjustment
  getMarketContext(symbol) {
    // In a real implementation, this would check current market conditions
    // For now, return neutral context
    return {
      marketTrend: 'neutral',
      volatility: 0.2,
      sectorSentiment: 'neutral',
      recentNewsCount: 0
    };
  }

  // Adjust sentiment based on market context
  adjustForMarketContext(sentiment, marketContext, article) {
    let adjustedScore = sentiment.score;

    // Adjust for market trend
    if (marketContext.marketTrend === 'bullish' && sentiment.score > 0) {
      adjustedScore *= 1.2; // Amplify positive sentiment in bullish markets
    } else if (marketContext.marketTrend === 'bearish' && sentiment.score < 0) {
      adjustedScore *= 1.2; // Amplify negative sentiment in bearish markets
    }

    // Adjust for volatility
    if (marketContext.volatility > 0.3) {
      adjustedScore *= 0.8; // Dampen sentiment in volatile markets
    }

    // Adjust for recency (newer news has more impact)
    const hoursOld = (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60);
    const recencyMultiplier = Math.max(0.3, 1 - (hoursOld / 24)); // Fade over 24 hours
    adjustedScore *= recencyMultiplier;

    return {
      ...sentiment,
      score: Math.max(-1, Math.min(1, adjustedScore)),
      adjustments: {
        marketTrend: marketContext.marketTrend,
        volatility: marketContext.volatility,
        recency: recencyMultiplier
      }
    };
  }

  // Calculate potential market impact
  calculateMarketImpact(sentiment, article) {
    let impact = 0;

    // Base impact on sentiment strength and confidence
    impact += sentiment.magnitude * sentiment.confidence * 0.5;

    // Source credibility multiplier
    const sourceMultiplier = this.getSourceCredibility(article.source);
    impact *= sourceMultiplier;

    // Article type multiplier
    const typeMultiplier = this.getArticleTypeMultiplier(article);
    impact *= typeMultiplier;

    // Headline emphasis (articles with strong headlines have more impact)
    if (article.title && article.title.length < 100) {
      const headlineSentiment = this.analyzeSentiment(article.title);
      impact += headlineSentiment.magnitude * 0.2;
    }

    return {
      score: Math.min(1, impact),
      level: impact > 0.7 ? 'high' : impact > 0.4 ? 'medium' : 'low',
      timeHorizon: this.estimateImpactDuration(impact, article),
      direction: sentiment.score > 0 ? 'bullish' : sentiment.score < 0 ? 'bearish' : 'neutral'
    };
  }

  // Get source credibility score
  getSourceCredibility(source) {
    const credibleSources = ['Reuters', 'Bloomberg', 'Financial Times', 'Wall Street Journal', 'CNBC'];
    const lessCredibleSources = ['Some Blog', 'Unknown Source'];

    if (credibleSources.some(s => source.includes(s))) return 1.2;
    if (lessCredibleSources.some(s => source.includes(s))) return 0.7;
    return 1.0; // Neutral credibility
  }

  // Get article type multiplier
  getArticleTypeMultiplier(article) {
    const title = article.title.toLowerCase();
    const content = (article.content || '').toLowerCase();

    // Breaking news has higher impact
    if (title.toLowerCase().includes('breaking') || title.toLowerCase().includes('urgent')) return 1.3;

    // Earnings reports have high impact
    if (title.includes('earnings') || title.includes('results')) return 1.2;

    // Analyst upgrades/downgrades have high impact
    if (title.includes('upgrade') || title.includes('downgrade') ||
        title.includes('buy') || title.includes('sell')) return 1.2;

    // General news has normal impact
    return 1.0;
  }

  // Estimate impact duration
  estimateImpactDuration(impact, article) {
    if (impact > 0.7) return 'long'; // Several days
    if (impact > 0.4) return 'medium'; // 1-2 days
    return 'short'; // Hours to 1 day
  }

  // Update sentiment history
  updateSentimentHistory(symbol, analysis) {
    if (!symbol) return;

    const history = this.sentimentHistory.get(symbol) || [];
    history.push({
      timestamp: analysis.timestamp,
      score: analysis.score,
      impact: analysis.marketImpact.score,
      classification: analysis.classification
    });

    // Keep last 100 entries
    if (history.length > 100) history.shift();
    this.sentimentHistory.set(symbol, history);
  }

  // Get sentiment trend for a symbol
  getSentimentTrend(symbol, hours = 24) {
    const history = this.sentimentHistory.get(symbol) || [];
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);

    const recentSentiment = history.filter(h => new Date(h.timestamp).getTime() > cutoff);

    if (recentSentiment.length < 2) return { trend: 'neutral', strength: 0 };

    const avgSentiment = recentSentiment.reduce((sum, h) => sum + h.score, 0) / recentSentiment.length;
    const sentimentChange = recentSentiment[recentSentiment.length - 1].score - recentSentiment[0].score;

    let trend = 'neutral';
    if (avgSentiment > 0.2) trend = 'bullish';
    else if (avgSentiment < -0.2) trend = 'bearish';

    return {
      trend,
      strength: Math.abs(avgSentiment),
      change: sentimentChange,
      sampleSize: recentSentiment.length
    };
  }

  // Generate trading signal based on sentiment
  generateSentimentSignal(symbol) {
    const trend = this.getSentimentTrend(symbol);
    const recentNews = this.getRecentNews(symbol, 1); // Last hour

    if (!trend || recentNews.length === 0) return null;

    const avgImpact = recentNews.reduce((sum, news) => sum + news.marketImpact.score, 0) / recentNews.length;
    const highImpactNews = recentNews.filter(news => news.marketImpact.level === 'high');

    // Generate signal based on sentiment and impact
    if (trend.trend === 'bullish' && avgImpact > 0.3 && highImpactNews.length > 0) {
      return {
        signal: 'BUY',
        strength: 'strong',
        reason: `Strong bullish sentiment with high-impact news`,
        confidence: Math.min(trend.strength * avgImpact, 1)
      };
    } else if (trend.trend === 'bearish' && avgImpact > 0.3 && highImpactNews.length > 0) {
      return {
        signal: 'SELL',
        strength: 'strong',
        reason: `Strong bearish sentiment with high-impact news`,
        confidence: Math.min(trend.strength * avgImpact, 1)
      };
    }

    return null;
  }

  // Get recent news for a symbol
  getRecentNews(symbol, hours = 24) {
    const allNews = Array.from(this.sentimentCache.values());
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);

    return allNews
      .filter(news => news.symbol === symbol && new Date(news.timestamp).getTime() > cutoff)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // Mock news fetching (in real implementation, this would call news APIs)
  async fetchNews(symbol, limit = 10) {
    // This is a mock implementation
    // In a real system, this would call APIs like Alpha Vantage, NewsAPI, etc.

    const mockNews = [
      {
        title: `${symbol} Shows Strong Q4 Performance`,
        content: `Market analysis shows ${symbol} has demonstrated exceptional performance in the fourth quarter with significant growth in key metrics.`,
        source: 'Financial Times',
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        url: `https://example.com/news/${symbol}-q4-performance`
      },
      {
        title: `Analyst Upgrades ${symbol} Rating`,
        content: `Leading financial analyst has upgraded ${symbol} from hold to buy, citing improved market position and growth prospects.`,
        source: 'Bloomberg',
        publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
        url: `https://example.com/news/${symbol}-analyst-upgrade`
      }
    ];

    // Analyze and cache the mock news
    const analyzedNews = mockNews.slice(0, limit).map(article =>
      this.analyzeNewsArticle({ ...article, symbol }, symbol)
    );

    return analyzedNews;
  }

  // Get sentiment summary for dashboard
  getSentimentSummary(symbols = []) {
    const summary = {};

    for (const symbol of symbols) {
      const trend = this.getSentimentTrend(symbol);
      const recentNews = this.getRecentNews(symbol, 24);
      const signal = this.generateSentimentSignal(symbol);

      summary[symbol] = {
        sentimentTrend: trend,
        newsCount24h: recentNews.length,
        avgImpact: recentNews.length > 0 ?
          recentNews.reduce((sum, news) => sum + news.marketImpact.score, 0) / recentNews.length : 0,
        tradingSignal: signal,
        lastUpdate: new Date().toISOString()
      };
    }

    return summary;
  }

  // Clear caches (for memory management)
  clearCaches() {
    this.sentimentCache.clear();
    this.newsCache.clear();
    this.marketImpact.clear();
    console.log('Sentiment analysis caches cleared');
  }
}

module.exports = new SentimentAnalyzer();