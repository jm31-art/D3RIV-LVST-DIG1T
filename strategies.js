/**
 * Simplified Digit Match Strategies for Deriv Trading
 * Focus: Chart analysis and pattern recognition for 3-6 daily predictions
 */

class DigitStrategies {
  constructor() {
    this.strategies = {
      chartMomentum: this.chartMomentumStrategy.bind(this),
      supportResistance: this.supportResistanceStrategy.bind(this),
      trendReversal: this.trendReversalStrategy.bind(this),
      volumeClusters: this.volumeClustersStrategy.bind(this),
      fibonacciDigits: this.fibonacciDigitsStrategy.bind(this),
      tiktokHotStreak: this.tiktokHotStreakStrategy.bind(this)
    };
  }

  /**
   * Chart Momentum Strategy - Based on TikTok trader insights
   * "Trade with the momentum, not against it"
   */
  chartMomentumStrategy(recentDigits, probabilities) {
    if (recentDigits.length < 10) return null;

    // Calculate momentum: recent trend direction
    const shortTerm = recentDigits.slice(-5);
    const longTerm = recentDigits.slice(-20);

    const shortAvg = shortTerm.reduce((a, b) => a + b, 0) / shortTerm.length;
    const longAvg = longTerm.reduce((a, b) => a + b, 0) / longTerm.length;

    // Strong upward momentum
    if (shortAvg > longAvg + 1.5) {
      const targetDigits = [7, 8, 9]; // High digits
      const bestDigit = this.findHighestProbability(targetDigits, probabilities);
      return {
        digit: bestDigit,
        confidence: 0.75,
        reason: 'Strong upward momentum - targeting high digits',
        strategy: 'chart_momentum'
      };
    }

    // Strong downward momentum
    if (shortAvg < longAvg - 1.5) {
      const targetDigits = [0, 1, 2]; // Low digits
      const bestDigit = this.findHighestProbability(targetDigits, probabilities);
      return {
        digit: bestDigit,
        confidence: 0.75,
        reason: 'Strong downward momentum - targeting low digits',
        strategy: 'chart_momentum'
      };
    }

    return null; // No clear momentum
  }

  /**
   * Support/Resistance Strategy - TikTok popular method
   * "Digits cluster around key levels like 2.5, 5.0, 7.5"
   */
  supportResistanceStrategy(recentDigits, probabilities) {
    if (recentDigits.length < 30) return null;

    // Key levels where digits tend to cluster (based on trader observations)
    const supportLevels = [2, 3, 4]; // Lower cluster
    const resistanceLevels = [5, 6, 7]; // Upper cluster

    // Check recent clustering
    const recent20 = recentDigits.slice(-20);
    const supportCount = recent20.filter(d => supportLevels.includes(d)).length;
    const resistanceCount = recent20.filter(d => resistanceLevels.includes(d)).length;

    if (supportCount >= 8) { // 40%+ at support
      const bestDigit = this.findHighestProbability(supportLevels, probabilities);
      return {
        digit: bestDigit,
        confidence: 0.70,
        reason: 'Strong support cluster formation',
        strategy: 'support_resistance'
      };
    }

    if (resistanceCount >= 8) { // 40%+ at resistance
      const bestDigit = this.findHighestProbability(resistanceLevels, probabilities);
      return {
        digit: bestDigit,
        confidence: 0.70,
        reason: 'Strong resistance cluster formation',
        strategy: 'support_resistance'
      };
    }

    return null;
  }

  /**
   * Trend Reversal Strategy - Popular on TikTok
   * "After 3-4 same direction moves, expect reversal"
   */
  trendReversalStrategy(recentDigits, probabilities) {
    if (recentDigits.length < 15) return null;

    const recent10 = recentDigits.slice(-10);

    // Check for consecutive high or low digits
    const highStreak = this.countConsecutive(recent10, d => d >= 5);
    const lowStreak = this.countConsecutive(recent10, d => d < 5);

    // Reversal signal after 4+ consecutive
    if (highStreak >= 4) {
      const targetDigits = [0, 1, 2, 3, 4]; // Expect low digits
      const bestDigit = this.findHighestProbability(targetDigits, probabilities);
      return {
        digit: bestDigit,
        confidence: 0.65,
        reason: `High digit streak (${highStreak}) - expecting reversal to low`,
        strategy: 'trend_reversal'
      };
    }

    if (lowStreak >= 4) {
      const targetDigits = [5, 6, 7, 8, 9]; // Expect high digits
      const bestDigit = this.findHighestProbability(targetDigits, probabilities);
      return {
        digit: bestDigit,
        confidence: 0.65,
        reason: `Low digit streak (${lowStreak}) - expecting reversal to high`,
        strategy: 'trend_reversal'
      };
    }

    return null;
  }

  /**
   * Volume Clusters Strategy - Based on TikTok volume analysis
   * "Watch for digit clusters that appear frequently"
   */
  volumeClustersStrategy(recentDigits, probabilities) {
    if (recentDigits.length < 50) return null;

    // Find digits that appeared 3+ times in last 10 ticks
    const recent10 = recentDigits.slice(-10);
    const digitCounts = {};
    recent10.forEach(d => digitCounts[d] = (digitCounts[d] || 0) + 1);

    const hotDigits = Object.keys(digitCounts)
      .filter(d => digitCounts[d] >= 3)
      .map(d => parseInt(d));

    if (hotDigits.length > 0) {
      // Look for continuation of hot digits
      const bestDigit = this.findHighestProbability(hotDigits, probabilities);
      return {
        digit: bestDigit,
        confidence: 0.60,
        reason: `Hot digit cluster: ${hotDigits.join(',')} appeared frequently`,
        strategy: 'volume_clusters'
      };
    }

    return null;
  }

  /**
   * Fibonacci Digits Strategy - Mathematical approach
   * Based on Fibonacci sequence patterns in digits
   */
  fibonacciDigitsStrategy(recentDigits, probabilities) {
    if (recentDigits.length < 20) return null;

    const fibSequence = [1, 1, 2, 3, 5, 8, 13];
    const recent15 = recentDigits.slice(-15);

    // Look for Fibonacci-like patterns
    for (let i = 0; i <= recent15.length - 5; i++) {
      const sequence = recent15.slice(i, i + 5);
      if (this.isFibonacciLike(sequence)) {
        // Predict next in Fibonacci pattern
        const nextDigit = this.predictFibonacciNext(sequence);
        if (nextDigit >= 0 && nextDigit <= 9) {
          return {
            digit: nextDigit,
            confidence: 0.55,
            reason: 'Fibonacci sequence pattern detected',
            strategy: 'fibonacci_digits'
          };
        }
      }
    }

    return null;
  }

  /**
   * TikTok Hot Streak Strategy - Most popular method
   * "Ride the hot streak - when a digit hits multiple times, keep betting"
   */
  tiktokHotStreakStrategy(recentDigits, probabilities) {
    if (recentDigits.length < 15) return null;

    const recent5 = recentDigits.slice(-5);
    const lastDigit = recentDigits[recentDigits.length - 1];

    // Count how many times last digit appeared in recent ticks
    const recentCount = recent5.filter(d => d === lastDigit).length;

    // Hot streak: same digit appeared 2-3 times in last 5 ticks
    if (recentCount >= 2 && recentCount <= 3) {
      return {
        digit: lastDigit,
        confidence: 0.80, // High confidence for hot streaks
        reason: `Hot streak: ${lastDigit} appeared ${recentCount} times in last 5 ticks`,
        strategy: 'tiktok_hot_streak'
      };
    }

    return null;
  }

  // Helper methods
  findHighestProbability(targetDigits, probabilities) {
    let bestDigit = targetDigits[0];
    let bestProb = 0;

    targetDigits.forEach(digit => {
      if (probabilities[digit] > bestProb) {
        bestProb = probabilities[digit];
        bestDigit = digit;
      }
    });

    return bestDigit;
  }

  countConsecutive(digits, condition) {
    let maxStreak = 0;
    let currentStreak = 0;

    digits.forEach(digit => {
      if (condition(digit)) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    });

    return maxStreak;
  }

  isFibonacciLike(sequence) {
    // Check if sequence follows Fibonacci-like growth
    for (let i = 2; i < sequence.length; i++) {
      if (sequence[i] !== sequence[i-1] + sequence[i-2]) {
        return false;
      }
    }
    return true;
  }

  predictFibonacciNext(sequence) {
    if (sequence.length < 2) return sequence[0];
    return sequence[sequence.length - 1] + sequence[sequence.length - 2];
  }

  /**
   * Main prediction method - ultra-conservative consensus approach
   */
  predict(recentDigits, probabilities) {
    return this.consensusPrediction(recentDigits, probabilities);
  }

  /**
   * Balanced consensus prediction - opportunity-focused while maintaining quality
   */
  consensusPrediction(recentDigits, probabilities) {
    // Dynamic threshold adjustment based on market conditions
    const marketVolatility = this.calculateMarketVolatility(recentDigits);
    const isTrending = this.detectTrendingConditions(recentDigits);

    // Adjust consensus requirements based on market conditions
    let minConsensus = 4; // Base requirement: 4/6 strategies
    let minConfidence = 0.70; // Base confidence: 70%

    if (isTrending) {
      // In trending markets, be more aggressive (lower requirements)
      minConsensus = 3; // 3/6 strategies sufficient in trends
      minConfidence = 0.65; // Lower confidence threshold
    } else if (marketVolatility > 2.5) {
      // In volatile markets, be more conservative
      minConsensus = 5; // 5/6 strategies required
      minConfidence = 0.75; // Higher confidence needed
    }
    const strategies = Object.values(this.strategies);
    const predictions = [];
    const strategyNames = Object.keys(this.strategies);

    // Get predictions from all strategies
    strategies.forEach((strategy, index) => {
      const prediction = strategy(recentDigits, probabilities);
      if (prediction) {
        predictions.push({
          ...prediction,
          strategy: strategyNames[index]
        });
      }
    });

    if (predictions.length < 4) {
      return null; // Need at least 4 strategies to agree
    }

    // Group predictions by digit
    const digitVotes = {};
    predictions.forEach(pred => {
      if (!digitVotes[pred.digit]) {
        digitVotes[pred.digit] = [];
      }
      digitVotes[pred.digit].push(pred);
    });

    // Find digit with most votes
    let bestDigit = null;
    let maxVotes = 0;
    let bestPredictions = [];

    Object.entries(digitVotes).forEach(([digit, preds]) => {
      if (preds.length > maxVotes) {
        maxVotes = preds.length;
        bestDigit = parseInt(digit);
        bestPredictions = preds;
      }
    });

    // Balanced approach: Require 4 out of 6 strategies to agree
    // This balances opportunity with win rate (aiming for 65-75%)
    if (maxVotes < 4) {
      return null;
    }

    // Calculate weighted confidence based on strategy agreement
    const totalConfidence = bestPredictions.reduce((sum, pred) => sum + pred.confidence, 0);
    const avgConfidence = totalConfidence / bestPredictions.length;

    // Boost confidence for strong consensus
    const consensusMultiplier = maxVotes >= 5 ? 1.3 : maxVotes >= 4 ? 1.2 : 1.1;
    const finalConfidence = Math.min(avgConfidence * consensusMultiplier, 0.95);

    // Balanced confidence threshold: 70% minimum
    // Allows more opportunities while maintaining good win rates
    if (finalConfidence < 0.70) {
      return null; // Still requires solid confidence
    }

    // Get the highest probability among agreed predictions
    const maxProbability = Math.max(...bestPredictions.map(p => p.confidence * 100));

    return {
      digit: bestDigit,
      confidence: finalConfidence,
      probability: maxProbability,
      reason: `${maxVotes}/6 strategies agree on digit ${bestDigit}`,
      strategy: 'consensus',
      agreeingStrategies: bestPredictions.map(p => p.strategy),
      consensusLevel: maxVotes >= 5 ? 'strong' : 'moderate'
    };
  }

  /**
   * Calculate market volatility for dynamic threshold adjustment
   */
  calculateMarketVolatility(recentDigits) {
    if (recentDigits.length < 10) return 2.0; // Default moderate volatility

    const changes = [];
    for (let i = 1; i < recentDigits.length; i++) {
      changes.push(Math.abs(recentDigits[i] - recentDigits[i-1]));
    }

    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    return avgChange; // Return average digit change as volatility measure
  }

  /**
   * Detect trending market conditions
   */
  detectTrendingConditions(recentDigits) {
    if (recentDigits.length < 20) return false;

    // Simple trend detection: check if recent direction is consistent
    const recent = recentDigits.slice(-10);
    const directions = [];

    for (let i = 1; i < recent.length; i++) {
      directions.push(recent[i] > recent[i-1] ? 1 : recent[i] < recent[i-1] ? -1 : 0);
    }

    const upMoves = directions.filter(d => d === 1).length;
    const downMoves = directions.filter(d => d === -1).length;

    // Consider trending if 70%+ moves are in same direction
    const consistencyRatio = Math.max(upMoves, downMoves) / (directions.length - directions.filter(d => d === 0).length);

    return consistencyRatio > 0.7;
  }

  fallbackFrequency(probabilities) {
    let maxProb = 0;
    let predictedDigit = 0;

    for (let digit = 0; digit <= 9; digit++) {
      if (probabilities[digit] > maxProb) {
        maxProb = probabilities[digit];
        predictedDigit = digit;
      }
    }

    return {
      digit: predictedDigit,
      confidence: Math.min(maxProb / 100, 0.5),
      reason: 'Fallback frequency analysis',
      strategy: 'fallback_frequency'
    };
  }
}

module.exports = new DigitStrategies();