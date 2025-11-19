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
   * Detect patterns in digit sequences
   * @param {Array<number>} digits - Array of last digits
   * @returns {Object} Pattern analysis results
   */
  detectPatterns(digits) {
    if (digits.length < 20) {
      return { hasPattern: false, pattern: null, confidence: 0 };
    }

    const patterns = {
      alternating: this.checkAlternatingPattern(digits),
      repeating: this.checkRepeatingPattern(digits),
      trending: this.checkTrendingPattern(digits),
      cyclic: this.checkCyclicPattern(digits)
    };

    // Find the strongest pattern
    let bestPattern = null;
    let maxConfidence = 0;

    for (const [type, result] of Object.entries(patterns)) {
      if (result.confidence > maxConfidence) {
        maxConfidence = result.confidence;
        bestPattern = { type, ...result };
      }
    }

    return {
      hasPattern: maxConfidence > 0.7,
      pattern: bestPattern,
      confidence: maxConfidence
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
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = new StatsAnalyzer();
