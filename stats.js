const ss = require('simple-statistics');

/**
 * Statistical analysis and time-series processing for digit prediction
 */
class StatsAnalyzer {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Calculate autocorrelation for digit sequences
   * @param {Array<number>} digits - Array of last digits
   * @param {number} lag - Lag for autocorrelation
   * @returns {number} Autocorrelation coefficient
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
   * Multi-timeframe pattern recognition for advanced digit prediction
   * @param {Array<number>} digits - Array of last digits
   * @param {Object} options - Analysis options
   * @returns {Object} Comprehensive pattern analysis across timeframes
   */
  detectAdvancedPatterns(digits, options = {}) {
    if (digits.length < 50) {
      return { hasPattern: false, patterns: {}, confidence: 0 };
    }

    // Analyze multiple timeframes
    const timeframes = {
      '1min': digits.slice(-60),    // ~1 minute (60 ticks)
      '5min': digits.slice(-300),   // ~5 minutes (300 ticks)
      '15min': digits.slice(-900)   // ~15 minutes (900 ticks)
    };

    const patternAnalysis = {};

    for (const [timeframe, data] of Object.entries(timeframes)) {
      if (data.length >= 20) {
        patternAnalysis[timeframe] = {
          alternating: this.checkAlternatingPattern(data),
          repeating: this.checkRepeatingPattern(data),
          trending: this.checkTrendingPattern(data),
          cyclic: this.checkCyclicPattern(data),
          volatility: this.analyzeVolatilityClusters(data),
          momentum: this.detectMomentumShifts(data),
          meanReversion: this.checkMeanReversion(data),
          breakout: this.detectBreakoutPatterns(data),
          fractal: this.analyzeFractalPatterns(data)
        };
      }
    }

    // Cross-timeframe analysis
    const crossTimeframeSignals = this.analyzeCrossTimeframeSignals(patternAnalysis);

    // Find the strongest overall pattern
    const bestPatterns = this.findStrongestPatterns(patternAnalysis, crossTimeframeSignals);

    return {
      hasPattern: bestPatterns.overallConfidence > 0.6,
      patterns: patternAnalysis,
      crossTimeframeSignals,
      bestPatterns,
      confidence: bestPatterns.overallConfidence,
      recommendedAction: this.generateTradingRecommendation(bestPatterns)
    };
  }

  /**
   * Legacy method for backward compatibility
   */
  detectPatterns(digits) {
    const advanced = this.detectAdvancedPatterns(digits);
    return {
      hasPattern: advanced.hasPattern,
      pattern: advanced.bestPatterns.primary,
      confidence: advanced.confidence
    };
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
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = new StatsAnalyzer();
