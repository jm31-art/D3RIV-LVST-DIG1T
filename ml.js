const ss = require('simple-statistics');

/**
 * Lightweight ML Manager for Digit Prediction
 *
 * This class implements simple but effective ML models specifically
 * designed for predicting the last digit of financial instruments.
 * Focuses on practical, fast models that work well for digit prediction.
 */
class MLManager {
  constructor() {
    // Frequency-based models (simple but effective)
    this.frequencyModels = new Map(); // symbol -> digit frequency data

    // Transition-based models (Markov chains)
    this.transitionModels = new Map(); // symbol -> transition probabilities

    // Trend-based models (simple pattern recognition)
    this.trendModels = new Map(); // symbol -> trend analysis

    // Model accuracy tracking
    this.modelAccuracy = new Map(); // symbol -> accuracy metrics

    this.isTraining = false;
  }

  /**
   * Train lightweight models for a symbol
   */
  async trainModel(symbol, ticks) {
    if (this.isTraining) {
      console.log(`Training already in progress for ${symbol}`);
      return false;
    }

    this.isTraining = true;

    try {
      if (!ticks || ticks.length < 100) {
        console.log(`Not enough data for ${symbol}: ${ticks.length} ticks`);
        return false;
      }

      console.log(`Training lightweight ML models for ${symbol} with ${ticks.length} ticks`);

      // Extract digits from ticks
      const digits = ticks.map(tick => tick.last_digit);

      // Train frequency model
      this.trainFrequencyModel(symbol, digits);

      // Train transition model
      this.trainTransitionModel(symbol, digits);

      // Train trend model
      this.trainTrendModel(symbol, digits);

      // Calculate model accuracy
      this.calculateModelAccuracy(symbol, digits);

      console.log(`Lightweight ML training completed for ${symbol}`);
      return true;

    } catch (error) {
      console.error(`Error training models for ${symbol}:`, error);
      return false;
    } finally {
      this.isTraining = false;
    }
  }

  /**
   * Train frequency-based model
   */
  trainFrequencyModel(symbol, digits) {
    const frequencies = Array(10).fill(0);
    const recentDigits = digits.slice(-1000); // Use last 1000 digits for training

    // Count frequency of each digit
    recentDigits.forEach(digit => {
      frequencies[digit]++;
    });

    // Convert to probabilities
    const total = recentDigits.length;
    const probabilities = frequencies.map(count => count / total);

    this.frequencyModels.set(symbol, {
      frequencies,
      probabilities,
      totalSamples: total,
      lastUpdated: Date.now()
    });
  }

  /**
   * Train transition-based model (simple Markov chain)
   */
  trainTransitionModel(symbol, digits) {
    const transitions = Array.from({ length: 10 }, () => Array(10).fill(0));
    const counts = Array(10).fill(0);

    // Count transitions between digits
    for (let i = 1; i < digits.length; i++) {
      const fromDigit = digits[i - 1];
      const toDigit = digits[i];
      transitions[fromDigit][toDigit]++;
      counts[fromDigit]++;
    }

    // Convert to probabilities
    const probabilities = transitions.map((row, from) =>
      row.map(count => counts[from] > 0 ? count / counts[from] : 0)
    );

    this.transitionModels.set(symbol, {
      transitions: probabilities,
      counts,
      lastUpdated: Date.now()
    });
  }

  /**
   * Train trend-based model (simple pattern recognition)
   */
  trainTrendModel(symbol, digits) {
    const recentDigits = digits.slice(-200); // Use last 200 digits

    // Calculate simple trend metrics
    const mean = ss.mean(recentDigits);
    const median = ss.median(recentDigits);
    const mode = ss.mode(recentDigits);
    const stdDev = ss.standardDeviation(recentDigits);

    // Calculate digit distribution bias
    const highDigits = recentDigits.filter(d => d >= 5).length;
    const lowDigits = recentDigits.filter(d => d < 5).length;
    const bias = (highDigits - lowDigits) / recentDigits.length;

    // Calculate recent trend (last 20 digits)
    const recentTrend = recentDigits.slice(-20);
    const trendDirection = recentTrend[recentTrend.length - 1] - recentTrend[0];

    this.trendModels.set(symbol, {
      mean,
      median,
      mode,
      stdDev,
      bias, // Positive = bias toward high digits, negative = bias toward low digits
      trendDirection,
      recentAverage: ss.mean(recentTrend),
      lastUpdated: Date.now()
    });
  }

  /**
   * Calculate model accuracy on historical data
   */
  calculateModelAccuracy(symbol, digits) {
    if (digits.length < 50) return;

    let frequencyCorrect = 0;
    let transitionCorrect = 0;
    let trendCorrect = 0;
    let totalPredictions = 0;

    // Test on last 100 predictions
    const testDigits = digits.slice(-100);

    for (let i = 10; i < testDigits.length; i++) {
      const recentDigits = testDigits.slice(i - 10, i);
      const actualNext = testDigits[i];

      // Test frequency model
      const freqPrediction = this.predictWithFrequency(symbol, recentDigits.slice(-1));
      if (freqPrediction && freqPrediction.digit === actualNext) {
        frequencyCorrect++;
      }

      // Test transition model
      const transPrediction = this.predictWithMarkov(symbol, recentDigits[recentDigits.length - 1]);
      if (transPrediction && transPrediction.digit === actualNext) {
        transitionCorrect++;
      }

      // Test trend model
      const trendPrediction = this.predictWithTrend(symbol, recentDigits);
      if (trendPrediction && trendPrediction.digit === actualNext) {
        trendCorrect++;
      }

      totalPredictions++;
    }

    this.modelAccuracy.set(symbol, {
      frequencyAccuracy: totalPredictions > 0 ? frequencyCorrect / totalPredictions : 0,
      transitionAccuracy: totalPredictions > 0 ? transitionCorrect / totalPredictions : 0,
      trendAccuracy: totalPredictions > 0 ? trendCorrect / totalPredictions : 0,
      totalPredictions,
      lastCalculated: Date.now()
    });
  }

  /**
   * Make prediction using ensemble of lightweight models
   */
  predict(symbol, recentDigits) {
    if (!recentDigits || recentDigits.length < 5) {
      return null;
    }

    try {
      // Get predictions from all models
      const frequencyPred = this.predictWithFrequency(symbol, recentDigits);
      const markovPred = this.predictWithMarkov(symbol, recentDigits[recentDigits.length - 1]);
      const trendPred = this.predictWithTrend(symbol, recentDigits);

      // Ensemble voting
      const predictions = [frequencyPred, markovPred, trendPred].filter(p => p !== null);

      if (predictions.length === 0) {
        return null;
      }

      // Simple ensemble: average probabilities and pick highest
      const combinedProbs = Array(10).fill(0);
      let totalWeight = 0;

      predictions.forEach(pred => {
        if (pred.allProbabilities) {
          const weight = pred.confidence || 0.5;
          pred.allProbabilities.forEach((prob, digit) => {
            combinedProbs[digit] += prob * weight;
          });
          totalWeight += weight;
        }
      });

      // Normalize probabilities
      if (totalWeight > 0) {
        combinedProbs.forEach((prob, index) => {
          combinedProbs[index] = prob / totalWeight;
        });
      }

      // Find digit with highest probability
      let maxProb = 0;
      let predictedDigit = 0;

      combinedProbs.forEach((prob, digit) => {
        if (prob > maxProb) {
          maxProb = prob;
          predictedDigit = digit;
        }
      });

      // Calculate confidence based on probability spread
      const sortedProbs = [...combinedProbs].sort((a, b) => b - a);
      const confidence = sortedProbs[0] - sortedProbs[1]; // Difference between top two probabilities

      return {
        digit: predictedDigit,
        confidence: Math.min(confidence * 2, 1), // Scale confidence
        allProbabilities: combinedProbs,
        method: 'lightweight_ensemble'
      };

    } catch (error) {
      console.error(`Error predicting for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Predict using frequency analysis
   */
  predictWithFrequency(symbol, recentDigits) {
    const model = this.frequencyModels.get(symbol);
    if (!model) return null;

    // Simple frequency-based prediction: pick the most frequent digit
    const maxFreq = Math.max(...model.probabilities);
    const predictedDigit = model.probabilities.indexOf(maxFreq);

    return {
      digit: predictedDigit,
      confidence: maxFreq,
      allProbabilities: [...model.probabilities]
    };
  }

  /**
   * Predict using Markov chain (transition probabilities)
   */
  predictWithMarkov(symbol, currentDigit) {
    const model = this.transitionModels.get(symbol);
    if (!model) return null;

    const probabilities = model.transitions[currentDigit];
    const maxProb = Math.max(...probabilities);
    const predictedDigit = probabilities.indexOf(maxProb);

    return {
      digit: predictedDigit,
      confidence: maxProb,
      allProbabilities: [...probabilities]
    };
  }

  /**
   * Predict using trend analysis
   */
  predictWithTrend(symbol, recentDigits) {
    const model = this.trendModels.get(symbol);
    if (!model) return null;

    // Simple trend-based prediction
    let predictedDigit;

    // If strong bias toward high/low digits, predict accordingly
    if (Math.abs(model.bias) > 0.2) {
      // Strong bias detected
      if (model.bias > 0) {
        // Bias toward high digits (5-9)
        predictedDigit = Math.floor(Math.random() * 5) + 5;
      } else {
        // Bias toward low digits (0-4)
        predictedDigit = Math.floor(Math.random() * 5);
      }
    } else {
      // No strong bias, use recent average as guide
      predictedDigit = Math.round(model.recentAverage);
      predictedDigit = Math.max(0, Math.min(9, predictedDigit));
    }

    // Create probability distribution centered on predicted digit
    const probabilities = Array(10).fill(0.05); // Base probability
    probabilities[predictedDigit] = 0.4; // Higher probability for predicted digit

    // Add some probability to adjacent digits
    const adjacent1 = (predictedDigit + 1) % 10;
    const adjacent2 = (predictedDigit - 1 + 10) % 10;
    probabilities[adjacent1] += 0.1;
    probabilities[adjacent2] += 0.1;

    return {
      digit: predictedDigit,
      confidence: 0.6, // Moderate confidence for trend-based predictions
      allProbabilities: probabilities
    };
  }

  /**
   * Get model status
   */
  getModelStatus(symbol) {
    const hasFrequency = this.frequencyModels.has(symbol);
    const hasTransition = this.transitionModels.has(symbol);
    const hasTrend = this.trendModels.has(symbol);
    const accuracy = this.modelAccuracy.get(symbol);

    return {
      hasFrequencyModel: hasFrequency,
      hasTransitionModel: hasTransition,
      hasTrendModel: hasTrend,
      accuracy: accuracy || null,
      isTraining: this.isTraining
    };
  }

  /**
   * Retrain all models
   */
  async retrainAll(symbols, db) {
    console.log('Retraining lightweight ML models for all symbols...');

    for (const symbol of symbols) {
      const ticks = db.getRecentTicks(symbol, 2000); // Use last 2000 ticks
      if (ticks.length >= 500) {
        await this.trainModel(symbol, ticks);
        console.log(`Retrained lightweight models for ${symbol}`);
      }
    }

    console.log('Lightweight ML model retraining completed');
  }
}

module.exports = new MLManager();
