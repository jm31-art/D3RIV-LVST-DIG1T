// Market Microstructure Analysis for High-Frequency Digit Trading
// Analyzes tick-by-tick data to understand order flow, slippage, and market dynamics

const stats = require('./stats');

class MarketMicrostructureAnalyzer {
  constructor() {
    this.tickBuffers = new Map(); // symbol -> recent ticks for analysis
    this.orderFlowMetrics = new Map(); // symbol -> order flow analysis
    this.slippageAnalysis = new Map(); // symbol -> slippage metrics
    this.marketImpactModels = new Map(); // symbol -> market impact models
    this.liquidityMetrics = new Map(); // symbol -> liquidity indicators
  }

  /**
   * Analyze tick-by-tick order flow patterns
   * @param {Array} ticks - Recent tick data
   * @param {string} symbol - Trading symbol
   * @returns {Object} Order flow analysis results
   */
  analyzeOrderFlow(ticks, symbol) {
    if (!ticks || ticks.length < 10) {
      return { confidence: 0, signals: [] };
    }

    // Store ticks for analysis
    this.tickBuffers.set(symbol, ticks.slice(-1000)); // Keep last 1000 ticks

    const analysis = {
      tickFrequency: this.calculateTickFrequency(ticks),
      priceClustering: this.analyzePriceClustering(ticks),
      tradeDirectionBias: this.analyzeTradeDirectionBias(ticks),
      orderFlowImbalance: this.calculateOrderFlowImbalance(ticks),
      marketPressure: this.assessMarketPressure(ticks),
      executionQuality: this.analyzeExecutionQuality(ticks)
    };

    // Generate trading signals based on microstructure
    const signals = this.generateMicrostructureSignals(analysis, symbol);

    this.orderFlowMetrics.set(symbol, {
      ...analysis,
      signals,
      timestamp: Date.now()
    });

    return {
      confidence: signals.length > 0 ? 0.8 : 0.3,
      signals,
      analysis
    };
  }

  /**
   * Calculate tick frequency and timing patterns
   */
  calculateTickFrequency(ticks) {
    if (ticks.length < 2) return { frequency: 0, regularity: 0 };

    const intervals = [];
    for (let i = 1; i < ticks.length; i++) {
      intervals.push(ticks[i].timestamp - ticks[i-1].timestamp);
    }

    const avgInterval = stats.mean(intervals);
    const frequency = avgInterval > 0 ? 1000 / avgInterval : 0; // ticks per second
    const regularity = 1 - (stats.standardDeviation(intervals) / avgInterval); // 0-1 scale

    return {
      frequency,
      regularity: Math.max(0, regularity),
      avgInterval,
      intervals
    };
  }

  /**
   * Analyze price clustering around certain digits
   */
  analyzePriceClustering(ticks) {
    const digitCounts = Array(10).fill(0);
    const lastDigits = ticks.map(tick => parseInt(tick.quote.toString().split('.')[1]?.[0] || '0'));

    lastDigits.forEach(digit => digitCounts[digit]++);

    const total = lastDigits.length;
    const frequencies = digitCounts.map(count => count / total);

    // Find clustering patterns
    const clusters = [];
    for (let digit = 0; digit < 10; digit++) {
      const frequency = frequencies[digit];
      if (frequency > 0.15) { // More than 15% clustering
        clusters.push({
          digit,
          frequency,
          strength: (frequency - 0.1) / 0.15 // Normalized strength
        });
      }
    }

    return {
      clusters,
      entropy: this.calculateEntropy(frequencies),
      mostClustered: clusters.length > 0 ? clusters.reduce((max, c) => c.strength > max.strength ? c : max) : null
    };
  }

  /**
   * Analyze directional bias in recent trades
   */
  analyzeTradeDirectionBias(ticks) {
    if (ticks.length < 5) return { bias: 0, strength: 0 };

    let directionalChanges = 0;
    let totalChanges = 0;

    for (let i = 1; i < ticks.length; i++) {
      const prevDigit = parseInt(ticks[i-1].quote.toString().split('.')[1]?.[0] || '0');
      const currDigit = parseInt(ticks[i].quote.toString().split('.')[1]?.[0] || '0');

      if (prevDigit !== currDigit) {
        totalChanges++;
        // Consider upward bias (higher digits)
        if (currDigit > prevDigit) {
          directionalChanges++;
        }
      }
    }

    const bias = totalChanges > 0 ? (directionalChanges / totalChanges - 0.5) * 2 : 0; // -1 to 1 scale
    const strength = Math.abs(bias);

    return {
      bias, // -1 (downward) to +1 (upward)
      strength, // 0 to 1
      directionalChanges,
      totalChanges
    };
  }

  /**
   * Calculate order flow imbalance
   */
  calculateOrderFlowImbalance(ticks) {
    // Since we don't have direct order book data from Deriv,
    // we infer order flow from price movements and timing

    const recentTicks = ticks.slice(-50);
    let buyPressure = 0;
    let sellPressure = 0;

    for (let i = 1; i < recentTicks.length; i++) {
      const prevPrice = parseFloat(recentTicks[i-1].quote);
      const currPrice = parseFloat(recentTicks[i].quote);

      if (currPrice > prevPrice) {
        buyPressure += (currPrice - prevPrice);
      } else if (currPrice < prevPrice) {
        sellPressure += (prevPrice - currPrice);
      }
    }

    const totalPressure = buyPressure + sellPressure;
    const imbalance = totalPressure > 0 ? (buyPressure - sellPressure) / totalPressure : 0;

    return {
      imbalance, // -1 (sell pressure) to +1 (buy pressure)
      buyPressure,
      sellPressure,
      netFlow: buyPressure - sellPressure
    };
  }

  /**
   * Assess overall market pressure
   */
  assessMarketPressure(ticks) {
    const recentTicks = ticks.slice(-20);
    const volatility = this.calculatePriceVolatility(recentTicks);
    const momentum = this.calculatePriceMomentum(recentTicks);
    const volume = this.estimateVolume(recentTicks);

    // Combine metrics to assess market pressure
    const pressureScore = (
      volatility.normalized * 0.4 +
      Math.abs(momentum.strength) * 0.4 +
      volume.normalized * 0.2
    );

    return {
      pressureScore, // 0-1 scale
      volatility,
      momentum,
      volume,
      direction: momentum.strength > 0 ? 'bullish' : 'bearish'
    };
  }

  /**
   * Analyze execution quality and slippage
   */
  analyzeExecutionQuality(ticks) {
    // Since we can't measure actual slippage without order book data,
    // we analyze potential slippage based on tick patterns

    const spread = this.estimateSpread(ticks);
    const slippage = this.calculatePotentialSlippage(ticks, spread);
    const executionSpeed = this.measureExecutionSpeed(ticks);

    return {
      spread,
      slippage,
      executionSpeed,
      qualityScore: this.calculateExecutionQualityScore(spread, slippage, executionSpeed)
    };
  }

  /**
   * Generate trading signals based on microstructure analysis
   */
  generateMicrostructureSignals(analysis, symbol) {
    const signals = [];

    // High-frequency trading signals
    if (analysis.tickFrequency.frequency > 2) { // More than 2 ticks per second
      signals.push({
        type: 'high_frequency_opportunity',
        confidence: 0.7,
        reason: 'High tick frequency indicates active market',
        action: 'increase_position_size'
      });
    }

    // Price clustering signals
    if (analysis.priceClustering.mostClustered && analysis.priceClustering.mostClustered.strength > 0.8) {
      signals.push({
        type: 'price_clustering',
        confidence: analysis.priceClustering.mostClustered.strength,
        targetDigit: analysis.priceClustering.mostClustered.digit,
        reason: `Strong clustering around digit ${analysis.priceClustering.mostClustered.digit}`,
        action: 'bias_toward_cluster'
      });
    }

    // Order flow imbalance signals
    if (Math.abs(analysis.orderFlowImbalance.imbalance) > 0.6) {
      const direction = analysis.orderFlowImbalance.imbalance > 0 ? 'bullish' : 'bearish';
      signals.push({
        type: 'order_flow_imbalance',
        confidence: Math.abs(analysis.orderFlowImbalance.imbalance),
        direction,
        reason: `Strong ${direction} order flow imbalance`,
        action: direction === 'bullish' ? 'bias_higher_digits' : 'bias_lower_digits'
      });
    }

    // Market pressure signals
    if (analysis.marketPressure.pressureScore > 0.7) {
      signals.push({
        type: 'market_pressure',
        confidence: analysis.marketPressure.pressureScore,
        direction: analysis.marketPressure.direction,
        reason: `High market pressure in ${analysis.marketPressure.direction} direction`,
        action: analysis.marketPressure.direction === 'bullish' ? 'aggressive_buying' : 'defensive_selling'
      });
    }

    return signals;
  }

  /**
   * Calculate price volatility from ticks
   */
  calculatePriceVolatility(ticks) {
    if (ticks.length < 2) return { value: 0, normalized: 0 };

    const prices = ticks.map(tick => parseFloat(tick.quote));
    const returns = [];

    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }

    const volatility = stats.standardDeviation(returns);
    const normalized = Math.min(volatility * 100, 1); // Normalize to 0-1

    return {
      value: volatility,
      normalized,
      returns
    };
  }

  /**
   * Calculate price momentum
   */
  calculatePriceMomentum(ticks) {
    if (ticks.length < 5) return { strength: 0, direction: 'neutral' };

    const recent = ticks.slice(-10);
    const prices = recent.map(tick => parseFloat(tick.quote));

    // Simple momentum calculation
    const startPrice = prices[0];
    const endPrice = prices[prices.length - 1];
    const momentum = (endPrice - startPrice) / startPrice;

    return {
      strength: momentum,
      direction: momentum > 0.001 ? 'up' : momentum < -0.001 ? 'down' : 'neutral',
      magnitude: Math.abs(momentum)
    };
  }

  /**
   * Estimate trading volume from tick frequency
   */
  estimateVolume(ticks) {
    const frequency = this.calculateTickFrequency(ticks);
    const volume = frequency.frequency * 60; // Estimated volume per minute
    const normalized = Math.min(volume / 100, 1); // Normalize to 0-1

    return {
      estimated: volume,
      normalized,
      frequency: frequency.frequency
    };
  }

  /**
   * Estimate bid-ask spread from tick patterns
   */
  estimateSpread(ticks) {
    if (ticks.length < 10) return 0.0001; // Default spread

    const prices = ticks.map(tick => parseFloat(tick.quote));
    const priceChanges = [];

    for (let i = 1; i < prices.length; i++) {
      priceChanges.push(Math.abs(prices[i] - prices[i-1]));
    }

    // Estimate spread as a fraction of average price change
    const avgChange = stats.mean(priceChanges);
    const estimatedSpread = avgChange * 0.1; // Conservative estimate

    return Math.max(estimatedSpread, 0.00001);
  }

  /**
   * Calculate potential slippage
   */
  calculatePotentialSlippage(ticks, spread) {
    const volatility = this.calculatePriceVolatility(ticks);

    // Slippage increases with volatility and spread
    const slippage = spread + (volatility.value * 0.5);

    return {
      estimated: slippage,
      spread,
      volatility: volatility.value,
      percentage: (slippage / ticks[ticks.length - 1].quote) * 100
    };
  }

  /**
   * Measure execution speed
   */
  measureExecutionSpeed(ticks) {
    const frequency = this.calculateTickFrequency(ticks);

    // Faster execution in high-frequency markets
    const speed = Math.min(frequency.frequency / 5, 1); // Normalize to 0-1

    return {
      score: speed,
      ticksPerSecond: frequency.frequency,
      avgInterval: frequency.avgInterval
    };
  }

  /**
   * Calculate overall execution quality score
   */
  calculateExecutionQualityScore(spread, slippage, executionSpeed) {
    // Lower spread and slippage, higher speed = better quality
    const spreadScore = Math.max(0, 1 - spread * 10000); // Penalize high spread
    const slippageScore = Math.max(0, 1 - slippage.percentage);
    const speedScore = executionSpeed.score;

    return (spreadScore * 0.4 + slippageScore * 0.4 + speedScore * 0.2);
  }

  /**
   * Calculate entropy of digit distribution
   */
  calculateEntropy(probabilities) {
    return probabilities.reduce((entropy, p) => {
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
      return entropy;
    }, 0);
  }

  /**
   * Get microstructure analysis for a symbol
   */
  getMicrostructureAnalysis(symbol) {
    return {
      orderFlow: this.orderFlowMetrics.get(symbol),
      slippage: this.slippageAnalysis.get(symbol),
      liquidity: this.liquidityMetrics.get(symbol),
      marketImpact: this.marketImpactModels.get(symbol)
    };
  }

  /**
   * Update microstructure analysis with new tick data
   */
  updateWithNewTick(symbol, tick) {
    const buffer = this.tickBuffers.get(symbol) || [];
    buffer.push(tick);

    // Keep only recent ticks
    if (buffer.length > 1000) {
      buffer.shift();
    }

    this.tickBuffers.set(symbol, buffer);

    // Re-analyze if we have enough data
    if (buffer.length >= 50) {
      this.analyzeOrderFlow(buffer, symbol);
    }
  }

  /**
   * Get trading recommendations based on microstructure
   */
  getMicrostructureRecommendations(symbol) {
    const analysis = this.getMicrostructureAnalysis(symbol);
    if (!analysis.orderFlow) return null;

    const signals = analysis.orderFlow.signals || [];
    const recommendations = signals.map(signal => ({
      type: signal.type,
      confidence: signal.confidence,
      action: signal.action,
      reason: signal.reason,
      targetDigit: signal.targetDigit
    }));

    return {
      symbol,
      recommendations,
      overallConfidence: recommendations.length > 0 ?
        recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length : 0,
      timestamp: Date.now()
    };
  }
}

module.exports = new MarketMicrostructureAnalyzer();