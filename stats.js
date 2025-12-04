const ss = require('simple-statistics');

/**
 * Core Statistical Analysis for Digit Prediction
 *
 * Simplified and focused implementation providing essential statistical
 * methods for reliable digit pattern analysis.
 */
class StatsAnalyzer {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Calculate autocorrelation for digit sequences
   */
  calculateAutocorrelation(digits, lag = 1) {
    if (digits.length < lag + 10) return 0;

    const n = digits.length - lag;
    const mean = ss.mean(digits);
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      const diff1 = digits[i] - mean;
      const diff2 = digits[i + lag] - mean;
      numerator += diff1 * diff2;
      denominator += diff1 * diff1;
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Simplified pattern detection - focus on proven methods only
   */
  detectPatterns(digits) {
    if (digits.length < 50) {
      return { hasPattern: false, pattern: null, confidence: 0 };
    }

    // Only check for the most reliable patterns
    const patterns = {
      frequency: this.analyzeFrequencyBias(digits),
      trend: this.analyzeTrend(digits),
      cycles: this.detectCycles(digits)
    };

    // Find the strongest pattern
    let bestPattern = null;
    let maxConfidence = 0;

    for (const [type, analysis] of Object.entries(patterns)) {
      if (analysis.confidence > maxConfidence) {
        maxConfidence = analysis.confidence;
        bestPattern = { type, ...analysis };
      }
    }

    return {
      hasPattern: maxConfidence > 0.6,
      pattern: bestPattern,
      confidence: maxConfidence
    };
  }

  /**
   * Analyze frequency bias in digits
   */
  analyzeFrequencyBias(digits) {
    const freq = Array(10).fill(0);
    digits.forEach(d => freq[d]++);

    const total = digits.length;
    const probabilities = freq.map(f => f / total);
    const maxProb = Math.max(...probabilities);
    const uniformProb = 0.1; // Expected for random

    const biasStrength = (maxProb - uniformProb) / (1 - uniformProb);
    const predictedDigit = probabilities.indexOf(maxProb);

    return {
      predictedDigit,
      probability: maxProb,
      confidence: Math.min(biasStrength, 1.0),
      strength: biasStrength
    };
  }

  /**
   * Analyze trend in digit sequences
   */
  analyzeTrend(digits) {
    const recent = digits.slice(-20);
    const diffs = recent.slice(1).map((d, i) => d - recent[i]);
    const positiveChanges = diffs.filter(d => d > 0).length;
    const trendStrength = Math.abs(positiveChanges - diffs.length / 2) / (diffs.length / 2);

    return {
      direction: positiveChanges > diffs.length / 2 ? 'up' : 'down',
      confidence: trendStrength,
      strength: trendStrength
    };
  }

  /**
   * Detect simple cycles in digit patterns
   */
  detectCycles(digits) {
    if (digits.length < 30) return { confidence: 0 };

    let bestCycle = 0;
    let maxCorrelation = 0;

    // Test cycles from 2-8 digits
    for (let cycle = 2; cycle <= 8; cycle++) {
      let matches = 0;
      let total = 0;

      for (let i = cycle; i < digits.length; i++) {
        if (digits[i] === digits[i - cycle]) matches++;
        total++;
      }

      const correlation = total > 0 ? matches / total : 0;
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestCycle = cycle;
      }
    }

    return {
      cycle: bestCycle,
      confidence: maxCorrelation,
      strength: maxCorrelation
    };
  }

  /**
   * Calculate digit distribution
   */
  calculateDigitDistribution(digits) {
    const distribution = Array(10).fill(0);
    digits.forEach(digit => distribution[digit]++);
    return distribution.map(count => count / digits.length);
  }

  /**
   * Calculate concentration index (how biased the distribution is)
   */
  calculateConcentrationIndex(distribution) {
    const maxProb = Math.max(...distribution);
    const uniformProb = 1/10; // 0.1 for uniform distribution
    return (maxProb - uniformProb) / (1 - uniformProb); // 0-1 scale
  }

  /**
   * Analyze market regime (trend vs range)
   */
  detectMarketRegime(digits, window = 100) {
    if (digits.length < window) {
      return { regime: 'unknown', confidence: 0 };
    }

    const recent = digits.slice(-window);

    // Calculate trend strength using linear regression
    const x = Array.from({ length: recent.length }, (_, i) => i);
    const regression = ss.linearRegression(x.map((val, idx) => [val, recent[idx]]));
    const slope = regression.m;
    const rSquared = this.calculateRSquared(recent, x, regression);

    // Calculate volatility (standard deviation)
    const volatility = ss.standardDeviation(recent);

    // Determine regime based on slope and volatility
    let regime = 'sideways';
    let confidence = 0;

    // Strong trend: high slope and high R-squared
    if (Math.abs(slope) > 0.01 && rSquared > 0.3) {
      regime = slope > 0 ? 'uptrend' : 'downtrend';
      confidence = Math.min(1.0, rSquared * 2);
    }
    // Ranging market: low slope, moderate volatility
    else if (volatility > 1.5 && Math.abs(slope) <= 0.01) {
      regime = 'ranging';
      confidence = Math.min(1.0, volatility / 3);
    }

    return {
      regime,
      confidence,
      slope,
      rSquared,
      volatility,
      trendStrength: Math.abs(slope) * rSquared
    };
  }

  /**
   * Calculate R-squared for regression
   */
  calculateRSquared(y, x, regression) {
    const yMean = ss.mean(y);
    const totalSumSquares = y.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
    const residualSumSquares = y.reduce((sum, val, idx) => {
      const predicted = regression.m * x[idx] + regression.b;
      return sum + Math.pow(val - predicted, 2);
    }, 0);

    return totalSumSquares > 0 ? 1 - (residualSumSquares / totalSumSquares) : 0;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Check for alternating high/low pattern
   */
  checkAlternatingPattern(digits) {
    let alternations = 0;
    const recent = digits.slice(-20);

    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i-1] >= 5 ? 'high' : 'low';
      const curr = recent[i] >= 5 ? 'high' : 'low';
      if (prev !== curr) alternations++;
    }

    const confidence = alternations / (recent.length - 1);
    return { confidence, strength: confidence };
  }

  /**
   * Check for repeating sequences
   */
  checkRepeatingPattern(digits) {
    const recent = digits.slice(-30);
    let maxRepeats = 0;

    // Check for 2-4 digit repeats
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= recent.length - len * 2; i++) {
        const seq1 = recent.slice(i, i + len);
        const seq2 = recent.slice(i + len, i + len * 2);
        if (this.arraysEqual(seq1, seq2)) {
          maxRepeats = Math.max(maxRepeats, len);
        }
      }
    }

    const confidence = maxRepeats > 0 ? Math.min(1, maxRepeats / 4) : 0;
    return { confidence, length: maxRepeats };
  }

  /**
   * Check for trending patterns
   */
  checkTrendingPattern(digits) {
    const recent = digits.slice(-15);
    const diffs = [];

    for (let i = 1; i < recent.length; i++) {
      diffs.push(recent[i] - recent[i-1]);
    }

    const positiveDiffs = diffs.filter(d => d > 0).length;
    const negativeDiffs = diffs.filter(d => d < 0).length;
    const trend = Math.abs(positiveDiffs - negativeDiffs) / diffs.length;

    return { confidence: trend, direction: positiveDiffs > negativeDiffs ? 'up' : 'down' };
  }

  /**
   * Check for cyclic patterns
   */
  checkCyclicPattern(digits) {
    const recent = digits.slice(-50);
    let bestCycle = 0;
    let maxCorrelation = 0;

    // Test different cycle lengths
    for (let cycle = 2; cycle <= 10; cycle++) {
      if (recent.length < cycle * 3) continue;

      let correlation = 0;
      let count = 0;

      for (let i = 0; i < recent.length - cycle; i += cycle) {
        if (i + cycle < recent.length) {
          correlation += recent[i] === recent[i + cycle] ? 1 : 0;
          count++;
        }
      }

      const avgCorrelation = count > 0 ? correlation / count : 0;
      if (avgCorrelation > maxCorrelation) {
        maxCorrelation = avgCorrelation;
        bestCycle = cycle;
      }
    }

    return { confidence: maxCorrelation, cycle: bestCycle };
  }

  /**
   * Analyze volatility clusters in digit sequences
   */
  analyzeVolatilityClusters(digits) {
    if (digits.length < 20) return { confidence: 0, clusters: [] };

    const windowSize = 10;
    const clusters = [];
    let currentCluster = { start: 0, volatility: 0, digits: [] };

    for (let i = windowSize; i < digits.length; i++) {
      const window = digits.slice(i - windowSize, i);
      const changes = window.slice(1).reduce((sum, digit, idx) =>
        sum + Math.abs(digit - window[idx]), 0);

      const volatility = changes / (windowSize - 1);

      // Check if volatility significantly changed
      if (Math.abs(volatility - currentCluster.volatility) > 0.5) {
        if (currentCluster.digits.length > 0) {
          clusters.push(currentCluster);
        }
        currentCluster = {
          start: i - windowSize,
          volatility,
          digits: [...window]
        };
      } else {
        currentCluster.volatility = (currentCluster.volatility + volatility) / 2;
        currentCluster.digits = [...window];
      }
    }

    if (currentCluster.digits.length > 0) {
      clusters.push(currentCluster);
    }

    // Find high volatility clusters (potential breakout signals)
    const highVolClusters = clusters.filter(c => c.volatility > 1.5);

    return {
      confidence: highVolClusters.length > 0 ? 0.8 : 0.2,
      clusters: highVolClusters,
      avgVolatility: clusters.reduce((sum, c) => sum + c.volatility, 0) / clusters.length
    };
  }

  /**
   * Detect momentum shifts in digit sequences
   */
  detectMomentumShifts(digits) {
    if (digits.length < 15) return { confidence: 0, shifts: [] };

    const shifts = [];
    const windowSize = 5;

    for (let i = windowSize * 2; i < digits.length; i++) {
      const prevWindow = digits.slice(i - windowSize * 2, i - windowSize);
      const currWindow = digits.slice(i - windowSize, i);

      const prevTrend = this.calculateTrendDirection(prevWindow);
      const currTrend = this.calculateTrendDirection(currWindow);

      // Detect trend changes
      if (Math.abs(prevTrend - currTrend) > 0.7) {
        shifts.push({
          position: i,
          fromTrend: prevTrend,
          toTrend: currTrend,
          magnitude: Math.abs(prevTrend - currTrend)
        });
      }
    }

    const significantShifts = shifts.filter(s => s.magnitude > 0.8);

    return {
      confidence: significantShifts.length > 0 ? 0.75 : 0.1,
      shifts: significantShifts,
      totalShifts: shifts.length
    };
  }

  /**
   * Check for mean reversion opportunities
   */
  checkMeanReversion(digits) {
    if (digits.length < 30) return { confidence: 0, signals: [] };

    const recent = digits.slice(-20);
    const longTerm = digits.slice(-100);
    const shortMean = ss.mean(recent);
    const longMean = ss.mean(longTerm);
    const shortStd = ss.standardDeviation(recent);

    const deviation = (shortMean - longMean) / (shortStd || 1);
    const signals = [];

    // Mean reversion signal when deviation is extreme
    if (Math.abs(deviation) > 2.0) {
      signals.push({
        type: deviation > 0 ? 'revert_down' : 'revert_up',
        deviation: Math.abs(deviation),
        confidence: Math.min(Math.abs(deviation) / 4, 1.0)
      });
    }

    return {
      confidence: signals.length > 0 ? signals[0].confidence : 0,
      signals,
      deviation
    };
  }

  /**
   * Detect breakout patterns in digit sequences
   */
  detectBreakoutPatterns(digits) {
    if (digits.length < 30) return { confidence: 0, breakouts: [] };

    const breakouts = [];
    const lookback = 20;

    for (let i = lookback; i < digits.length; i++) {
      const recent = digits.slice(i - lookback, i);
      const current = digits[i];

      const maxRecent = Math.max(...recent);
      const minRecent = Math.min(...recent);

      // Check for breakout above resistance
      if (current > maxRecent) {
        breakouts.push({
          type: 'bullish_breakout',
          level: maxRecent,
          breakoutValue: current,
          strength: (current - maxRecent) / (ss.standardDeviation(recent) || 1)
        });
      }
      // Check for breakdown below support
      else if (current < minRecent) {
        breakouts.push({
          type: 'bearish_breakdown',
          level: minRecent,
          breakoutValue: current,
          strength: (minRecent - current) / (ss.standardDeviation(recent) || 1)
        });
      }
    }

    const strongBreakouts = breakouts.filter(b => b.strength > 1.5);

    return {
      confidence: strongBreakouts.length > 0 ? 0.85 : 0.15,
      breakouts: strongBreakouts
    };
  }

  /**
   * Analyze fractal patterns (self-similar patterns at different scales)
   */
  analyzeFractalPatterns(digits) {
    if (digits.length < 60) return { confidence: 0, patterns: [] };

    const patterns = [];
    const scales = [5, 10, 20]; // Different scales to analyze

    for (const scale of scales) {
      if (digits.length < scale * 3) continue;

      const segments = [];
      for (let i = 0; i <= digits.length - scale; i += scale) {
        segments.push(digits.slice(i, i + scale));
      }

      // Find similar patterns across segments
      for (let i = 0; i < segments.length - 1; i++) {
        for (let j = i + 1; j < segments.length; j++) {
          const similarity = this.calculateSequenceSimilarity(segments[i], segments[j]);
          if (similarity > 0.8) {
            patterns.push({
              scale,
              segment1: i,
              segment2: j,
              similarity,
              pattern: segments[i]
            });
          }
        }
      }
    }

    return {
      confidence: patterns.length > 0 ? 0.7 : 0.1,
      patterns: patterns.slice(0, 5) // Top 5 patterns
    };
  }

  /**
   * Analyze cross-timeframe signals for stronger predictions
   */
  analyzeCrossTimeframeSignals(patternAnalysis) {
    const signals = {
      alignment: 0, // How well patterns align across timeframes
      strength: 0,  // Overall signal strength
      direction: null, // bullish/bearish/neutral
      consistency: 0 // How consistent signals are
    };

    const timeframes = Object.keys(patternAnalysis);
    if (timeframes.length < 2) return signals;

    // Check if patterns align across timeframes
    const directions = timeframes.map(tf => {
      const patterns = patternAnalysis[tf];
      return this.extractPatternDirection(patterns);
    });

    // Calculate alignment score
    const consistentDirections = directions.filter((dir, idx) =>
      idx === 0 || dir === directions[0]
    ).length;

    signals.alignment = consistentDirections / timeframes.length;
    signals.consistency = signals.alignment;
    signals.direction = directions[0] !== 'neutral' && signals.alignment > 0.6 ? directions[0] : 'neutral';

    // Calculate strength based on pattern confidence across timeframes
    const avgConfidence = timeframes.reduce((sum, tf) => {
      const bestPattern = this.findBestPattern(patternAnalysis[tf]);
      return sum + (bestPattern ? bestPattern.confidence : 0);
    }, 0) / timeframes.length;

    signals.strength = avgConfidence * signals.alignment;

    return signals;
  }

  /**
   * Find the strongest patterns across all timeframes
   */
  findStrongestPatterns(patternAnalysis, crossTimeframeSignals) {
    const allPatterns = [];

    for (const [timeframe, patterns] of Object.entries(patternAnalysis)) {
      for (const [patternType, patternData] of Object.entries(patterns)) {
        if (patternData.confidence > 0.5) {
          allPatterns.push({
            timeframe,
            type: patternType,
            ...patternData,
            weightedConfidence: patternData.confidence * (timeframe === '1min' ? 1.0 :
                                 timeframe === '5min' ? 1.2 : 1.1) // Weight shorter timeframes higher
          });
        }
      }
    }

    // Sort by weighted confidence
    allPatterns.sort((a, b) => b.weightedConfidence - a.weightedConfidence);

    return {
      primary: allPatterns[0] || null,
      secondary: allPatterns[1] || null,
      tertiary: allPatterns[2] || null,
      all: allPatterns.slice(0, 5),
      overallConfidence: crossTimeframeSignals.strength,
      direction: crossTimeframeSignals.direction
    };
  }

  /**
   * Generate trading recommendation based on pattern analysis
   */
  generateTradingRecommendation(bestPatterns) {
    if (!bestPatterns.primary || bestPatterns.overallConfidence < 0.6) {
      return { action: 'hold', confidence: 0, reason: 'Insufficient pattern strength' };
    }

    const primary = bestPatterns.primary;
    let action = 'hold';
    let targetDigit = null;
    let confidence = bestPatterns.overallConfidence;

    switch (primary.type) {
      case 'trending':
        if (primary.direction === 'up') {
          action = 'bias_high';
          targetDigit = Math.max(...primary.recent.slice(-3));
        } else if (primary.direction === 'down') {
          action = 'bias_low';
          targetDigit = Math.min(...primary.recent.slice(-3));
        }
        break;

      case 'cyclic':
        if (primary.cycle > 0) {
          const cyclePos = primary.recent.length % primary.cycle;
          const cycleHistory = [];
          for (let i = cyclePos; i < primary.recent.length; i += primary.cycle) {
            cycleHistory.push(primary.recent[i]);
          }
          if (cycleHistory.length > 0) {
            targetDigit = ss.mode(cycleHistory);
            action = 'cycle_prediction';
          }
        }
        break;

      case 'breakout':
        if (primary.breakouts && primary.breakouts.length > 0) {
          const latest = primary.breakouts[primary.breakouts.length - 1];
          if (latest.type === 'bullish_breakout') {
            action = 'momentum_up';
            targetDigit = Math.max(5, Math.min(9, Math.round(latest.breakoutValue)));
          } else {
            action = 'momentum_down';
            targetDigit = Math.max(0, Math.min(4, Math.round(latest.breakoutValue)));
          }
        }
        break;

      case 'meanReversion':
        if (primary.signals && primary.signals.length > 0) {
          const signal = primary.signals[0];
          if (signal.type === 'revert_down') {
            action = 'revert_down';
            targetDigit = Math.max(0, Math.min(4, Math.round(ss.mean(primary.recent.slice(-10)))));
          } else {
            action = 'revert_up';
            targetDigit = Math.max(5, Math.min(9, Math.round(ss.mean(primary.recent.slice(-10)))));
          }
        }
        break;
    }

    return {
      action,
      targetDigit,
      confidence,
      pattern: primary.type,
      timeframe: primary.timeframe,
      reason: `${primary.type} pattern detected on ${primary.timeframe} timeframe`
    };
  }

  // Helper methods
  calculateTrendDirection(digits) {
    if (digits.length < 3) return 0;
    const diffs = digits.slice(1).map((d, i) => d - digits[i]);
    return diffs.reduce((sum, diff) => sum + diff, 0) / diffs.length;
  }

  calculateSequenceSimilarity(seq1, seq2) {
    if (seq1.length !== seq2.length) return 0;
    let matches = 0;
    for (let i = 0; i < seq1.length; i++) {
      if (seq1[i] === seq2[i]) matches++;
    }
    return matches / seq1.length;
  }

  extractPatternDirection(patterns) {
    // Extract bullish/bearish/neutral direction from patterns
    const trending = patterns.trending;
    if (trending && trending.confidence > 0.6) {
      return trending.direction === 'up' ? 'bullish' : 'bearish';
    }

    const breakout = patterns.breakout;
    if (breakout && breakout.confidence > 0.7) {
      const latest = breakout.breakouts[breakout.breakouts.length - 1];
      return latest.type === 'bullish_breakout' ? 'bullish' : 'bearish';
    }

    return 'neutral';
  }

  findBestPattern(patterns) {
    let best = null;
    let maxConf = 0;

    for (const [type, data] of Object.entries(patterns)) {
      if (data.confidence > maxConf) {
        maxConf = data.confidence;
        best = { type, ...data };
      }
    }

    return best;
  }

  /**
   * Calculate transition probabilities for Markov chain
   * @param {Array<number>} digits - Array of last digits
   * @returns {Object} Transition matrix
   */
  calculateTransitionMatrix(digits) {
    const matrix = Array(10).fill().map(() => Array(10).fill(0));
    const counts = Array(10).fill(0);

    for (let i = 1; i < digits.length; i++) {
      const from = digits[i-1];
      const to = digits[i];
      matrix[from][to]++;
      counts[from]++;
    }

    // Convert to probabilities
    for (let i = 0; i < 10; i++) {
      if (counts[i] > 0) {
        for (let j = 0; j < 10; j++) {
          matrix[i][j] /= counts[i];
        }
      }
    }

    return matrix;
  }

  /**
   * Predict next digit using time-series analysis
   * @param {Array<number>} digits - Historical digits
   * @param {number} steps - Steps ahead to predict
   * @returns {Object} Prediction results
   */
  predictTimeSeries(digits, steps = 1) {
    if (digits.length < 10) {
      return { predictions: [], confidence: 0 };
    }

    const recent = digits.slice(-50);
    const patterns = this.detectPatterns(recent);

    if (patterns.hasPattern) {
      return this.predictFromPattern(recent, patterns.pattern, steps);
    }

    // Fallback to frequency analysis
    const freq = this.calculateFrequencies(recent);
    const predictions = [];

    for (let i = 0; i < steps; i++) {
      const nextDigit = this.predictNextFromFrequency(freq);
      predictions.push(nextDigit);
      // Update frequency for next prediction
      freq[nextDigit] = (freq[nextDigit] || 0) + 1;
    }

    return {
      predictions,
      confidence: 0.6, // Moderate confidence for frequency-based
      method: 'frequency'
    };
  }

  /**
   * Predict using detected pattern
   */
  predictFromPattern(digits, pattern, steps) {
    const predictions = [];

    switch (pattern.type) {
      case 'alternating':
        const last = digits[digits.length - 1];
        const next = last >= 5 ? Math.floor(Math.random() * 5) : 5 + Math.floor(Math.random() * 5);
        predictions.push(next);
        break;

      case 'repeating':
        if (pattern.length > 0) {
          const sequence = digits.slice(-pattern.length);
          predictions.push(sequence[0]); // Next in sequence
        }
        break;

      case 'trending':
        const trend = pattern.direction === 'up' ? 1 : -1;
        const lastDigit = digits[digits.length - 1];
        const nextTrend = Math.max(0, Math.min(9, lastDigit + trend));
        predictions.push(next);
        break;

      case 'cyclic':
        if (pattern.cycle > 0) {
          const pos = digits.length % pattern.cycle;
          const cycleStart = digits.length - pos;
          if (cycleStart >= 0 && cycleStart < digits.length) {
            predictions.push(digits[cycleStart]);
          }
        }
        break;
    }

    return {
      predictions,
      confidence: pattern.confidence,
      method: pattern.type
    };
  }

  /**
   * Calculate digit frequencies
   */
  calculateFrequencies(digits) {
    const freq = Array(10).fill(0);
    digits.forEach(digit => freq[digit]++);
    return freq;
  }

  /**
   * Predict next digit from frequency
   */
  predictNextFromFrequency(freq) {
    let maxFreq = 0;
    let predicted = 0;

    for (let i = 0; i < 10; i++) {
      if (freq[i] > maxFreq) {
        maxFreq = freq[i];
        predicted = i;
      }
    }

    return predicted;
  }

  /**
   * Calculate sample correlation between two arrays
   * @param {Array<number>} array1 - First array of numbers
   * @param {Array<number>} array2 - Second array of numbers
   * @returns {number} Sample correlation coefficient
   */
  sampleCorrelation(array1, array2) {
    if (!array1 || !array2 || array1.length !== array2.length || array1.length < 2) {
      return 0;
    }

    try {
      return ss.sampleCorrelation(array1, array2);
    } catch (error) {
      console.error('Error calculating sample correlation:', error);
      return 0;
    }
  }

  /**
   * Calculate statistical measures
   */
  calculateStats(digits) {
    if (digits.length === 0) return {};

    return {
      mean: ss.mean(digits),
      median: ss.median(digits),
      mode: ss.mode(digits),
      variance: ss.variance(digits),
      standardDeviation: ss.standardDeviation(digits),
      skewness: this.calculateSkewness(digits),
      kurtosis: this.calculateKurtosis(digits)
    };
  }

  /**
   * Calculate skewness
   */
  calculateSkewness(digits) {
    const n = digits.length;
    if (n < 3) return 0;

    const mean = ss.mean(digits);
    const std = ss.standardDeviation(digits);

    let sum = 0;
    digits.forEach(digit => {
      sum += Math.pow((digit - mean) / std, 3);
    });

    return sum / n;
  }

  /**
   * Calculate kurtosis
   */
  calculateKurtosis(digits) {
    const n = digits.length;
    if (n < 4) return 0;

    const mean = ss.mean(digits);
    const std = ss.standardDeviation(digits);

    let sum = 0;
    digits.forEach(digit => {
      sum += Math.pow((digit - mean) / std, 4);
    });

    return (sum / n) - 3;
  }

  /**
   * Utility function to check array equality
   */
  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    return a.every((val, index) => val === b[index]);
  }

  /**
   * Calculate mean of array
   * @param {Array<number>} array - Array of numbers
   * @returns {number} Mean value
   */
  mean(array) {
    if (!array || array.length === 0) return 0;
    try {
      return ss.mean(array);
    } catch (error) {
      console.error('Error calculating mean:', error);
      return 0;
    }
  }

  /**
   * Calculate standard deviation of array
   * @param {Array<number>} array - Array of numbers
   * @returns {number} Standard deviation
   */
  standardDeviation(array) {
    if (!array || array.length < 2) return 0;
    try {
      return ss.standardDeviation(array);
    } catch (error) {
      console.error('Error calculating standard deviation:', error);
      return 0;
    }
  }

  /**
   * Detect market regime (trend vs range)
   * @param {Array<number>} digits - Array of last digits
   * @param {number} window - Analysis window size
   * @returns {Object} Market regime analysis
   */
  detectMarketRegime(digits, window = 100) {
    if (digits.length < window) {
      return { regime: 'unknown', confidence: 0 };
    }

    const recent = digits.slice(-window);

    // Calculate trend strength using linear regression
    const x = Array.from({ length: recent.length }, (_, i) => i);
    const regression = ss.linearRegression(x.map((val, idx) => [val, recent[idx]]));
    const slope = regression.m;
    const rSquared = this.calculateRSquared(recent, x, regression);

    // Calculate volatility (standard deviation)
    const volatility = ss.standardDeviation(recent);

    // Calculate average range (high - low in windows)
    const ranges = [];
    for (let i = 0; i < recent.length - 10; i += 10) {
      const slice = recent.slice(i, i + 10);
      ranges.push(Math.max(...slice) - Math.min(...slice));
    }
    const avgRange = ranges.length > 0 ? ss.mean(ranges) : 0;

    // Determine regime based on slope and volatility
    let regime = 'sideways';
    let confidence = 0;

    // Strong trend: high slope and high R-squared
    if (Math.abs(slope) > 0.01 && rSquared > 0.3) {
      regime = slope > 0 ? 'uptrend' : 'downtrend';
      confidence = Math.min(1.0, rSquared * 2);
    }
    // Ranging market: low slope, moderate volatility
    else if (volatility > 1.5 && avgRange > 3) {
      regime = 'ranging';
      confidence = Math.min(1.0, volatility / 3);
    }

    return {
      regime,
      confidence,
      slope,
      rSquared,
      volatility,
      avgRange,
      trendStrength: Math.abs(slope) * rSquared
    };
  }

  /**
   * Advanced Market Regime Detection (variance, entropy, runs)
   * @param {Array<number>} digits - Array of last digits
   * @param {number} window - Analysis window size
   * @returns {Object} Comprehensive regime analysis
   */
  detectAdvancedMarketRegime(digits, window = 200) {
    if (digits.length < window) {
      return { regime: 'unknown', confidence: 0, metrics: {} };
    }

    const recent = digits.slice(-window);

    // 1. Calculate digit variance (low variance = stable/bias)
    const digitVariance = ss.variance(recent);
    const digitStd = Math.sqrt(digitVariance);

    // 2. Calculate entropy (low entropy = biased market)
    const entropy = this.calculateShannonEntropy(recent);

    // 3. Calculate runs-based patterns (streak detection)
    const runsAnalysis = this.analyzeRunsPatterns(recent);

    // 4. Additional metrics
    const frequencyDistribution = this.calculateDigitDistribution(recent);
    const concentrationIndex = this.calculateConcentrationIndex(frequencyDistribution);

    // Determine regime based on metrics
    let regime = 'unknown';
    let confidence = 0;
    let tradingAllowed = false;

    // Stable digits bias (good for trading)
    if (digitVariance < 6.0 && entropy < 3.0 && runsAnalysis.longestRun < 8) {
      regime = 'stable_bias';
      confidence = Math.min(1.0, (1 - digitVariance/8) * (1 - entropy/3.3) * 0.9);
      tradingAllowed = true;
    }
    // Chaotic/noisy digits (AVOID trading)
    else if (digitVariance > 8.0 || entropy > 3.2 || runsAnalysis.longestRun > 12) {
      regime = 'chaotic_noisy';
      confidence = Math.min(1.0, (digitVariance/10) * (entropy/3.3) * 0.8);
      tradingAllowed = false;
    }
    // Directional drift
    else if (Math.abs(this.calculateTrendDirection(recent)) > 0.02) {
      regime = 'directional_drift';
      confidence = Math.min(1.0, Math.abs(this.calculateTrendDirection(recent)) * 50);
      tradingAllowed = true;
    }
    // Random spikes
    else if (runsAnalysis.spikeCount > window * 0.1) {
      regime = 'random_spikes';
      confidence = Math.min(1.0, runsAnalysis.spikeCount / (window * 0.2));
      tradingAllowed = false;
    }

    return {
      regime,
      confidence,
      tradingAllowed,
      metrics: {
        digitVariance,
        digitStd,
        entropy,
        runsAnalysis,
        concentrationIndex,
        frequencyDistribution
      },
      analysis: {
        stability: 1 - (digitVariance / 10), // 0-1 scale
        predictability: 1 - (entropy / 3.3), // 0-1 scale
        biasStrength: concentrationIndex
      }
    };
  }

  /**
   * Calculate Shannon entropy for digit distribution
   */
  calculateShannonEntropy(digits) {
    const freq = Array(10).fill(0);
    digits.forEach(digit => freq[digit]++);

    let entropy = 0;
    const n = digits.length;

    for (let i = 0; i < 10; i++) {
      if (freq[i] > 0) {
        const p = freq[i] / n;
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  /**
   * Analyze runs patterns (consecutive same digits)
   */
  analyzeRunsPatterns(digits) {
    if (digits.length < 2) return { longestRun: 0, avgRun: 0, spikeCount: 0 };

    let currentRun = 1;
    let longestRun = 1;
    let totalRuns = 0;
    let spikeCount = 0;

    for (let i = 1; i < digits.length; i++) {
      if (digits[i] === digits[i-1]) {
        currentRun++;
        longestRun = Math.max(longestRun, currentRun);
      } else {
        totalRuns++;
        currentRun = 1;
      }

      // Count spikes (sudden changes > 4)
      if (Math.abs(digits[i] - digits[i-1]) > 4) {
        spikeCount++;
      }
    }

    return {
      longestRun,
      avgRun: digits.length / (totalRuns + 1),
      spikeCount,
      totalRuns
    };
  }

  /**
   * Calculate digit distribution
   */
  calculateDigitDistribution(digits) {
    const distribution = Array(10).fill(0);
    digits.forEach(digit => distribution[digit]++);
    return distribution.map(count => count / digits.length);
  }

  /**
   * Calculate concentration index (how biased the distribution is)
   */
  calculateConcentrationIndex(distribution) {
    const maxProb = Math.max(...distribution);
    const uniformProb = 1/10; // 0.1
    return (maxProb - uniformProb) / (1 - uniformProb); // 0-1 scale
  }

  /**
   * Calculate R-squared for regression
   */
  calculateRSquared(y, x, regression) {
    const yMean = ss.mean(y);
    const totalSumSquares = y.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
    const residualSumSquares = y.reduce((sum, val, idx) => {
      const predicted = regression.m * x[idx] + regression.b;
      return sum + Math.pow(val - predicted, 2);
    }, 0);

    return totalSumSquares > 0 ? 1 - (residualSumSquares / totalSumSquares) : 0;
  }

  /**
   * Analyze market microstructure
   * @param {Array<Object>} ticks - Array of tick data
   * @returns {Object} Microstructure analysis
   */
  analyzeMarketMicrostructure(ticks) {
    if (!ticks || ticks.length < 50) {
      return { analysis: 'insufficient_data' };
    }

    // Calculate bid-ask spread (simplified using quote changes)
    const quoteChanges = [];
    for (let i = 1; i < ticks.length; i++) {
      quoteChanges.push(Math.abs(ticks[i].quote - ticks[i-1].quote));
    }

    const avgSpread = ss.mean(quoteChanges);
    const spreadVolatility = ss.standardDeviation(quoteChanges);

    // Calculate order flow (simplified using digit changes)
    const digitChanges = [];
    for (let i = 1; i < ticks.length; i++) {
      digitChanges.push(ticks[i].last_digit - ticks[i-1].last_digit);
    }

    const buyPressure = digitChanges.filter(change => change > 0).length / digitChanges.length;
    const sellPressure = digitChanges.filter(change => change < 0).length / digitChanges.length;

    return {
      avgSpread,
      spreadVolatility,
      buyPressure,
      sellPressure,
      orderFlow: buyPressure - sellPressure,
      marketEfficiency: spreadVolatility > avgSpread * 2 ? 'inefficient' : 'efficient'
    };
  }

  /**
   * Bias Exploitation Engine - Track digit frequencies and calculate bias strength
   * @param {Array<number>} digits - Array of last digits
   * @param {number} window - Analysis window size
   * @returns {Object} Bias analysis with strength scores and recommendations
   */
  analyzeDigitBias(digits, window = 500) {
    if (digits.length < window) {
      return { biasStrength: 0, recommendedDigits: [], confidence: 0 };
    }

    const recent = digits.slice(-window);

    // Calculate frequency of each digit (0-9)
    const frequencies = Array(10).fill(0);
    recent.forEach(digit => frequencies[digit]++);

    // Calculate probabilities
    const probabilities = frequencies.map(freq => freq / window);

    // Calculate bias strength using concentration index
    const maxProb = Math.max(...probabilities);
    const uniformProb = 1/10; // 0.1 for uniform distribution
    const concentrationIndex = (maxProb - uniformProb) / (1 - uniformProb);

    // Find digits with significant bias (above threshold)
    const threshold = uniformProb + (concentrationIndex * 0.3); // Dynamic threshold
    const biasedDigits = [];
    const strengthScores = [];

    for (let i = 0; i < 10; i++) {
      if (probabilities[i] > threshold) {
        biasedDigits.push(i);
        strengthScores.push({
          digit: i,
          probability: probabilities[i],
          strength: (probabilities[i] - uniformProb) / (maxProb - uniformProb),
          confidence: Math.min(1.0, (probabilities[i] - uniformProb) * 10)
        });
      }
    }

    // Sort by strength
    strengthScores.sort((a, b) => b.strength - a.strength);

    // Calculate weighted moving average for trend analysis
    const wmaPeriod = 50;
    const weights = [];
    for (let i = 1; i <= wmaPeriod; i++) {
      weights.push(i);
    }
    const weightSum = weights.reduce((a, b) => a + b, 0);

    const wmaFrequencies = Array(10).fill(0);
    const recentWindow = recent.slice(-wmaPeriod);

    for (let i = 0; i < recentWindow.length; i++) {
      const weight = weights[i];
      wmaFrequencies[recentWindow[i]] += weight;
    }

    const wmaProbabilities = wmaFrequencies.map(freq => freq / weightSum);

    // Calculate trend direction for biased digits
    const trendAnalysis = this.calculateBiasTrends(recent, biasedDigits, 20);

    return {
      biasStrength: concentrationIndex,
      concentrationIndex,
      recommendedDigits: strengthScores.slice(0, 3).map(s => s.digit),
      strengthScores,
      frequencies,
      probabilities,
      wmaProbabilities,
      trendAnalysis,
      confidence: concentrationIndex > 0.3 ? Math.min(1.0, concentrationIndex * 2) : 0,
      tradingSignal: this.generateBiasTradingSignal(strengthScores, trendAnalysis)
    };
  }

  /**
   * Calculate bias trends for specific digits
   */
  calculateBiasTrends(digits, targetDigits, windowSize = 20) {
    const trends = {};

    targetDigits.forEach(digit => {
      const positions = [];
      for (let i = 0; i < digits.length; i++) {
        if (digits[i] === digit) positions.push(i);
      }

      if (positions.length < 3) {
        trends[digit] = { trend: 'insufficient_data', strength: 0 };
        return;
      }

      // Calculate intervals between occurrences
      const intervals = [];
      for (let i = 1; i < positions.length; i++) {
        intervals.push(positions[i] - positions[i-1]);
      }

      // Check if intervals are decreasing (increasing frequency)
      const recentIntervals = intervals.slice(-Math.min(5, intervals.length));
      const olderIntervals = intervals.slice(-Math.min(10, intervals.length), -5);

      if (recentIntervals.length < 3 || olderIntervals.length < 3) {
        trends[digit] = { trend: 'stable', strength: 0.5 };
        return;
      }

      const recentAvg = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
      const olderAvg = olderIntervals.reduce((a, b) => a + b, 0) / olderIntervals.length;

      const trendRatio = olderAvg / recentAvg; // > 1 means increasing frequency

      if (trendRatio > 1.2) {
        trends[digit] = { trend: 'increasing', strength: Math.min(1.0, trendRatio - 1) };
      } else if (trendRatio < 0.8) {
        trends[digit] = { trend: 'decreasing', strength: Math.min(1.0, 1 - trendRatio) };
      } else {
        trends[digit] = { trend: 'stable', strength: 0.5 };
      }
    });

    return trends;
  }

  /**
   * Generate trading signal based on bias analysis
   */
  generateBiasTradingSignal(strengthScores, trendAnalysis) {
    if (strengthScores.length === 0) {
      return { signal: 'no_bias', confidence: 0, reason: 'No significant digit bias detected' };
    }

    const topBias = strengthScores[0];
    const trend = trendAnalysis[topBias.digit];

    if (topBias.confidence < 0.6) {
      return { signal: 'weak_bias', confidence: topBias.confidence, reason: 'Bias strength too weak for trading' };
    }

    if (trend && trend.trend === 'increasing') {
      return {
        signal: 'strong_bias',
        confidence: Math.min(1.0, topBias.confidence * trend.strength),
        targetDigit: topBias.digit,
        reason: `Strong bias toward digit ${topBias.digit} with increasing trend`
      };
    }

    return {
      signal: 'moderate_bias',
      confidence: topBias.confidence * 0.8,
      targetDigit: topBias.digit,
      reason: `Moderate bias toward digit ${topBias.digit}`
    };
  }

  /**
   * Probability Fusion Engine - Calculate multiple probability signals
   * @param {Array<number>} digits - Array of last digits
   * @param {Object} context - Additional context (ML predictions, etc.)
   * @returns {Object} Multiple probability signals for fusion
   */
  calculateMultipleProbabilitySignals(digits, context = {}) {
    const signals = {};
    const window = Math.min(500, digits.length);

    if (digits.length < 50) {
      return { signals: {}, fusion: { probability: 0, confidence: 0 } };
    }

    const recent = digits.slice(-window);

    // 1. Digit frequency probability
    signals.frequency = this.calculateFrequencyProbability(recent);

    // 2. ML model probability (if available)
    signals.ml = context.mlPrediction ? {
      probability: context.mlPrediction.probability / 100,
      confidence: context.mlPrediction.confidence,
      method: 'ml_model'
    } : null;

    // 3. Volatility bias signal
    signals.volatilityBias = this.calculateVolatilityBiasSignal(recent);

    // 4. Trend persistence signal
    signals.trendPersistence = this.calculateTrendPersistenceSignal(recent);

    // 5. Anti-noise filter signal
    signals.antiNoise = this.calculateAntiNoiseSignal(recent);

    // 6. Run-length bias signal
    signals.runLength = this.calculateRunLengthBiasSignal(recent);

    // 7. Pattern-based probability
    signals.pattern = this.calculatePatternProbabilitySignal(recent);

    // Filter out null signals and calculate fusion
    const validSignals = Object.entries(signals)
      .filter(([key, signal]) => signal !== null)
      .reduce((obj, [key, signal]) => ({ ...obj, [key]: signal }), {});

    const fusion = this.fuseProbabilitySignals(validSignals);

    return {
      signals: validSignals,
      fusion,
      signalCount: Object.keys(validSignals).length
    };
  }

  /**
   * Calculate frequency-based probability
   */
  calculateFrequencyProbability(digits) {
    const freq = Array(10).fill(0);
    digits.forEach(digit => freq[digit]++);

    const total = digits.length;
    const probabilities = freq.map(f => f / total);

    const maxProb = Math.max(...probabilities);
    const predictedDigit = probabilities.indexOf(maxProb);

    return {
      probabilities,
      predictedDigit,
      probability: maxProb,
      confidence: maxProb > 0.15 ? Math.min(1.0, (maxProb - 0.1) * 5) : 0,
      method: 'frequency'
    };
  }

  /**
   * Calculate volatility bias signal
   */
  calculateVolatilityBiasSignal(digits) {
    if (digits.length < 20) return null;

    // Calculate digit changes volatility
    const changes = [];
    for (let i = 1; i < digits.length; i++) {
      changes.push(Math.abs(digits[i] - digits[i-1]));
    }

    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    const volatility = ss.standardDeviation(changes);

    // High volatility suggests less predictable digits
    const predictability = Math.max(0, 1 - volatility / 3);

    return {
      volatility,
      avgChange,
      predictability,
      probability: predictability,
      confidence: Math.min(1.0, predictability * 2),
      method: 'volatility_bias'
    };
  }

  /**
   * Calculate trend persistence signal
   */
  calculateTrendPersistenceSignal(digits) {
    if (digits.length < 30) return null;

    // Analyze recent trend direction
    const recent = digits.slice(-20);
    const directions = [];

    for (let i = 1; i < recent.length; i++) {
      const change = recent[i] - recent[i-1];
      directions.push(change > 0 ? 1 : change < 0 ? -1 : 0);
    }

    // Calculate trend persistence (consecutive same directions)
    let persistence = 0;
    let currentStreak = 0;
    let lastDirection = 0;

    for (const direction of directions) {
      if (direction === lastDirection && direction !== 0) {
        currentStreak++;
      } else {
        persistence += currentStreak;
        currentStreak = direction !== 0 ? 1 : 0;
      }
      lastDirection = direction;
    }
    persistence += currentStreak;

    const persistenceRatio = persistence / directions.length;

    return {
      persistenceRatio,
      totalDirections: directions.length,
      probability: persistenceRatio,
      confidence: Math.min(1.0, persistenceRatio * 3),
      method: 'trend_persistence'
    };
  }

  /**
   * Calculate anti-noise filter signal
   */
  calculateAntiNoiseSignal(digits) {
    if (digits.length < 50) return null;

    // Detect noise patterns (random spikes, outliers)
    const changes = [];
    for (let i = 1; i < digits.length; i++) {
      changes.push(Math.abs(digits[i] - digits[i-1]));
    }

    const meanChange = ss.mean(changes);
    const stdChange = ss.standardDeviation(changes);

    // Count outliers (changes > 2 standard deviations)
    const outliers = changes.filter(change => change > meanChange + 2 * stdChange).length;
    const outlierRatio = outliers / changes.length;

    // Low outlier ratio = less noise = more predictable
    const signalStrength = Math.max(0, 1 - outlierRatio * 5);

    return {
      outlierRatio,
      meanChange,
      stdChange,
      probability: signalStrength,
      confidence: Math.min(1.0, signalStrength * 2),
      method: 'anti_noise'
    };
  }

  /**
   * Calculate run-length bias signal
   */
  calculateRunLengthBiasSignal(digits) {
    if (digits.length < 30) return null;

    // Analyze run lengths (consecutive same digits)
    const runs = [];
    let currentRun = 1;

    for (let i = 1; i < digits.length; i++) {
      if (digits[i] === digits[i-1]) {
        currentRun++;
      } else {
        runs.push(currentRun);
        currentRun = 1;
      }
    }
    runs.push(currentRun);

    // Calculate run length statistics
    const avgRunLength = ss.mean(runs);
    const runVariance = ss.variance(runs);

    // Lower variance in run lengths suggests more predictable patterns
    const predictability = Math.max(0, 1 - runVariance / 4);

    return {
      avgRunLength,
      runVariance,
      totalRuns: runs.length,
      probability: predictability,
      confidence: Math.min(1.0, predictability * 2),
      method: 'run_length_bias'
    };
  }

  /**
   * Calculate pattern-based probability signal
   */
  calculatePatternProbabilitySignal(digits) {
    if (digits.length < 30) return null;

    // Use existing pattern detection
    const patterns = this.detectAdvancedPatterns(digits);

    if (!patterns.hasPattern) {
      return {
        probability: 0.5,
        confidence: 0,
        method: 'pattern_none'
      };
    }

    return {
      probability: patterns.confidence,
      confidence: patterns.confidence,
      patternType: patterns.bestPatterns.primary?.type || 'unknown',
      method: 'pattern_based'
    };
  }

  /**
   * Fuse multiple probability signals into final prediction
   */
  fuseProbabilitySignals(signals) {
    const signalEntries = Object.entries(signals);
    if (signalEntries.length === 0) {
      return { probability: 0, confidence: 0, signalsUsed: 0 };
    }

    // Weight different signals
    const weights = {
      frequency: 0.25,
      ml: 0.30,
      volatilityBias: 0.15,
      trendPersistence: 0.10,
      antiNoise: 0.10,
      runLength: 0.05,
      pattern: 0.05
    };

    let weightedSum = 0;
    let totalWeight = 0;
    let confidenceSum = 0;

    signalEntries.forEach(([key, signal]) => {
      const weight = weights[key] || 0.1;
      weightedSum += signal.probability * weight;
      totalWeight += weight;
      confidenceSum += signal.confidence * weight;
    });

    const finalProbability = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const finalConfidence = totalWeight > 0 ? confidenceSum / totalWeight : 0;

    return {
      probability: finalProbability,
      confidence: finalConfidence,
      signalsUsed: signalEntries.length,
      method: 'fusion'
    };
  }

  /**
   * Anti-Noise Trading Filter - Comprehensive noise detection
   * @param {Array<number>} digits - Array of last digits
   * @param {number} window - Analysis window size
   * @returns {Object} Noise analysis and filtering recommendations
   */
  detectAndFilterNoise(digits, window = 100) {
    if (digits.length < window) {
      return { noiseLevel: 'unknown', shouldTrade: false, metrics: {} };
    }

    const recent = digits.slice(-window);

    // Multiple noise detection methods
    const metrics = {
      outlierRatio: this.calculateOutlierRatio(recent),
      volatilitySpikes: this.detectVolatilitySpikes(recent),
      randomWalkIndex: this.calculateRandomWalkIndex(recent),
      entropy: this.calculateShannonEntropy(recent),
      patternConsistency: this.measurePatternConsistency(recent),
      feedStability: this.assessFeedStability(recent)
    };

    // Calculate overall noise score (0-1, higher = more noisy)
    const noiseScore = this.calculateOverallNoiseScore(metrics);

    // Determine noise level and trading recommendation
    let noiseLevel = 'low';
    let shouldTrade = true;
    let reason = '';

    if (noiseScore > 0.8) {
      noiseLevel = 'extreme';
      shouldTrade = false;
      reason = 'Extreme noise detected - market too chaotic';
    } else if (noiseScore > 0.6) {
      noiseLevel = 'high';
      shouldTrade = false;
      reason = 'High noise levels - avoid trading';
    } else if (noiseScore > 0.4) {
      noiseLevel = 'moderate';
      shouldTrade = true;
      reason = 'Moderate noise - trade with caution';
    } else {
      noiseLevel = 'low';
      shouldTrade = true;
      reason = 'Low noise - good trading conditions';
    }

    return {
      noiseLevel,
      shouldTrade,
      noiseScore,
      reason,
      metrics,
      analysis: {
        isStable: noiseScore < 0.4,
        isChaotic: noiseScore > 0.6,
        confidence: 1 - noiseScore
      }
    };
  }

  /**
   * Calculate outlier ratio in digit sequence
   */
  calculateOutlierRatio(digits) {
    if (digits.length < 20) return 0;

    const freq = Array(10).fill(0);
    digits.forEach(d => freq[d]++);

    const expectedFreq = digits.length / 10;
    const outliers = freq.filter(f => Math.abs(f - expectedFreq) > expectedFreq * 0.8).length;

    return outliers / 10; // Ratio of outlier digits
  }

  /**
   * Detect volatility spikes
   */
  detectVolatilitySpikes(digits) {
    if (digits.length < 20) return { count: 0, ratio: 0 };

    const changes = [];
    for (let i = 1; i < digits.length; i++) {
      changes.push(Math.abs(digits[i] - digits[i-1]));
    }

    const meanChange = ss.mean(changes);
    const stdChange = ss.standardDeviation(changes);

    const spikes = changes.filter(change => change > meanChange + 2 * stdChange).length;
    const spikeRatio = spikes / changes.length;

    return { count: spikes, ratio: spikeRatio, threshold: meanChange + 2 * stdChange };
  }

  /**
   * Calculate random walk index (how random the sequence is)
   */
  calculateRandomWalkIndex(digits) {
    if (digits.length < 30) return 0.5;

    // Compare actual sequence to random sequence properties
    const actualEntropy = this.calculateShannonEntropy(digits);
    const maxEntropy = Math.log2(10); // For 10 possible digits

    // Calculate autocorrelation (random walks have low autocorrelation)
    const autocorr = Math.abs(this.calculateAutocorrelation(digits, 1));

    // Calculate run length variance (random sequences have more uniform runs)
    const runs = this.analyzeRunsPatterns(digits);
    const runVariance = runs.avgRun > 0 ? Math.abs(runs.avgRun - 1.1) / 2 : 0; // Expected run length for random is ~1.1

    // Combine metrics
    const entropyRatio = actualEntropy / maxEntropy;
    const randomWalkIndex = (entropyRatio + (1 - autocorr) + (1 - runVariance)) / 3;

    return Math.max(0, Math.min(1, randomWalkIndex));
  }

  /**
   * Measure pattern consistency
   */
  measurePatternConsistency(digits) {
    if (digits.length < 50) return 0;

    // Check consistency of digit frequencies over time windows
    const windowSize = 25;
    const windows = [];

    for (let i = 0; i <= digits.length - windowSize; i += windowSize) {
      const window = digits.slice(i, i + windowSize);
      const freq = Array(10).fill(0);
      window.forEach(d => freq[d]++);
      windows.push(freq.map(f => f / windowSize));
    }

    if (windows.length < 2) return 0.5;

    // Calculate consistency between windows
    let totalDifference = 0;
    for (let i = 1; i < windows.length; i++) {
      for (let d = 0; d < 10; d++) {
        totalDifference += Math.abs(windows[i][d] - windows[i-1][d]);
      }
    }

    const avgDifference = totalDifference / ((windows.length - 1) * 10);
    const consistency = Math.max(0, 1 - avgDifference * 5); // Scale to 0-1

    return consistency;
  }

  /**
   * Assess feed stability (detect data feed issues)
   */
  assessFeedStability(digits) {
    if (digits.length < 20) return { stability: 0.5, issues: [] };

    const issues = [];

    // Check for repeated digits (possible feed freeze)
    let repeats = 0;
    for (let i = 1; i < digits.length; i++) {
      if (digits[i] === digits[i-1]) repeats++;
    }
    const repeatRatio = repeats / (digits.length - 1);

    if (repeatRatio > 0.3) {
      issues.push('high_repeat_ratio');
    }

    // Check for unusual digit distributions
    const freq = Array(10).fill(0);
    digits.forEach(d => freq[d]++);
    const maxFreq = Math.max(...freq);
    const distributionSkew = maxFreq / (digits.length / 10);

    if (distributionSkew > 3) {
      issues.push('skewed_distribution');
    }

    // Calculate stability score
    const stability = issues.length === 0 ? 0.9 :
                     issues.length === 1 ? 0.7 : 0.4;

    return { stability, issues, repeatRatio, distributionSkew };
  }

  /**
   * Calculate overall noise score from all metrics
   */
  calculateOverallNoiseScore(metrics) {
    const weights = {
      outlierRatio: 0.2,
      volatilitySpikes: 0.25,
      randomWalkIndex: 0.2,
      entropy: 0.15,
      patternConsistency: 0.1,
      feedStability: 0.1
    };

    // Normalize entropy (higher entropy = more noise)
    const normalizedEntropy = metrics.entropy / Math.log2(10);

    // Invert pattern consistency (lower consistency = more noise)
    const noiseFromConsistency = 1 - metrics.patternConsistency;

    // Invert feed stability (lower stability = more noise)
    const noiseFromStability = 1 - metrics.feedStability.stability;

    const score = (
      metrics.outlierRatio * weights.outlierRatio +
      metrics.volatilitySpikes.ratio * weights.volatilitySpikes +
      metrics.randomWalkIndex * weights.randomWalkIndex +
      normalizedEntropy * weights.entropy +
      noiseFromConsistency * weights.patternConsistency +
      noiseFromStability * weights.feedStability
    );

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = new StatsAnalyzer();
