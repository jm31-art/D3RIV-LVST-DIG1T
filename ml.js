const tf = require('@tensorflow/tfjs-node');
const ss = require('simple-statistics');

/**
 * Advanced ML Manager for Digit Prediction
 *
 * This class implements sophisticated machine learning models including:
 * - LSTM Neural Networks for sequence prediction
 * - Gradient Boosting models
 * - Ensemble methods combining multiple approaches
 * - Real-time model training and validation
 */
class MLManager {
  constructor() {
    // Neural network models
    this.lstmModels = new Map(); // symbol -> LSTM model
    this.gradientBoostModels = new Map(); // symbol -> Gradient Boosting model

    // Traditional models (kept for comparison)
    this.frequencyModels = new Map(); // symbol -> digit frequency data
    this.transitionModels = new Map(); // symbol -> transition probabilities
    this.trendModels = new Map(); // symbol -> trend analysis data

    // Model metadata and performance
    this.modelMetadata = new Map(); // symbol -> model info
    this.modelAccuracy = new Map(); // symbol -> accuracy metrics
    this.trainingHistory = new Map(); // symbol -> training history

    this.isTraining = false;
    this.sequenceLength = 20; // Look back 20 ticks for prediction
  }

  /**
   * Train advanced ML models for a symbol
   */
  async trainModel(symbol, ticks) {
    if (this.isTraining) {
      console.log(`Training already in progress for ${symbol}`);
      return false;
    }

    this.isTraining = true;

    try {
      if (!ticks || ticks.length < 1000) {
        console.log(`Not enough data for ${symbol}: ${ticks.length} ticks (need 1000+)`);
        return false;
      }

      console.log(`Training advanced ML models for ${symbol} with ${ticks.length} ticks`);

      // Extract digits from ticks
      const digits = ticks.map(tick => tick.last_digit);

      // Train LSTM neural network
      await this.trainLSTMModel(symbol, digits);

      // Train Gradient Boosting model
      await this.trainGradientBoostingModel(symbol, digits);

      // Train traditional models for comparison
      this.trainFrequencyModel(symbol, digits);
      this.trainTransitionModel(symbol, digits);

      // Validate all models
      this.validateModels(symbol, digits);

      // Store model metadata
      this.modelMetadata.set(symbol, {
        lastTrained: Date.now(),
        dataPoints: ticks.length,
        sequenceLength: this.sequenceLength,
        models: ['lstm', 'gradientBoosting', 'frequency', 'markov']
      });

      console.log(`Advanced ML training completed for ${symbol}`);
      return true;

    } catch (error) {
      console.error(`Error training models for ${symbol}:`, error);
      return false;
    } finally {
      this.isTraining = false;
    }
  }

  /**
   * Train LSTM Neural Network for sequence prediction
   */
  async trainLSTMModel(symbol, digits) {
    try {
      console.log(`Training LSTM model for ${symbol}...`);

      // Prepare training data
      const { sequences, labels } = this.prepareTrainingData(digits);

      if (sequences.length < 100) {
        console.log(`Not enough training sequences for LSTM: ${sequences.length}`);
        return;
      }

      // Create LSTM model
      const model = tf.sequential();

      model.add(tf.layers.lstm({
        units: 50,
        inputShape: [this.sequenceLength, 1],
        returnSequences: false
      }));

      model.add(tf.layers.dense({ units: 25, activation: 'relu' }));
      model.add(tf.layers.dense({ units: 10, activation: 'softmax' }));

      model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });

      // Convert to tensors with memory management
      const xs = tf.tidy(() => tf.tensor3d(sequences));
      const ys = tf.tidy(() => tf.oneHot(labels, 10));

      try {
        // Train the model
        await model.fit(xs, ys, {
          epochs: 20,
          batchSize: 32,
          validationSplit: 0.2,
          callbacks: {
            onEpochEnd: (epoch, logs) => {
              if (epoch % 5 === 0) {
                console.log(`LSTM ${symbol} Epoch ${epoch}: loss=${logs.loss.toFixed(4)}, acc=${logs.acc.toFixed(4)}`);
              }
            }
          }
        });

        // Store the trained model
        this.lstmModels.set(symbol, model);

      } finally {
        // Clean up tensors
        xs.dispose();
        ys.dispose();
      }

      console.log(`LSTM model trained for ${symbol}`);

    } catch (error) {
      console.error(`Error training LSTM model for ${symbol}:`, error);
    }
  }

  /**
   * Train Gradient Boosting model (simplified implementation)
   */
  async trainGradientBoostingModel(symbol, digits) {
    try {
      console.log(`Training Gradient Boosting model for ${symbol}...`);

      // For now, implement a simplified gradient boosting approach
      // In production, you'd use a library like XGBoost
      const { sequences, labels } = this.prepareTrainingData(digits);

      if (sequences.length < 100) {
        console.log(`Not enough training sequences for Gradient Boosting: ${sequences.length}`);
        return;
      }

      // Simple ensemble of decision trees (placeholder for real gradient boosting)
      const model = {
        trees: [],
        featureImportance: new Array(this.sequenceLength).fill(0),
        trained: true
      };

      // Train multiple simple models
      for (let i = 0; i < 10; i++) {
        const tree = this.trainSimpleDecisionTree(sequences, labels);
        model.trees.push(tree);
      }

      this.gradientBoostModels.set(symbol, model);
      console.log(`Gradient Boosting model trained for ${symbol}`);

    } catch (error) {
      console.error(`Error training Gradient Boosting model for ${symbol}:`, error);
    }
  }

  /**
   * Prepare training data for ML models
   */
  prepareTrainingData(digits) {
    const sequences = [];
    const labels = [];

    for (let i = this.sequenceLength; i < digits.length; i++) {
      const sequence = digits.slice(i - this.sequenceLength, i);
      const label = digits[i];

      // For LSTM: reshape to [sequenceLength, 1] format
      sequences.push(sequence.map(d => [d]));
      labels.push(label);
    }

    return { sequences, labels };
  }

  /**
   * Train simple decision tree (placeholder for gradient boosting)
   */
  trainSimpleDecisionTree(sequences, labels) {
    // Simplified decision tree implementation
    // In production, use a proper ML library
    return {
      predict: (sequence) => {
        // Simple prediction based on most recent digit
        return sequence[sequence.length - 1];
      }
    };
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
   * Validate all trained models for a symbol
   */
  validateModels(symbol, digits) {
    try {
      const status = this.getModelStatus(symbol);

      // Basic validation - check if at least one model is trained
      const hasAnyModel = status.hasFrequencyModel || status.hasTransitionModel ||
                         this.lstmModels.has(symbol) || this.gradientBoostModels.has(symbol);

      if (!hasAnyModel) {
        console.warn(`No models trained for ${symbol}`);
        return false;
      }

      // Validate model accuracy if available
      if (status.accuracy) {
        const avgAccuracy = (status.accuracy.frequencyAccuracy +
                           status.accuracy.transitionAccuracy +
                           status.accuracy.trendAccuracy) / 3;

        if (avgAccuracy < 0.1) { // Very low accuracy threshold
          console.warn(`Low model accuracy for ${symbol}: ${(avgAccuracy * 100).toFixed(1)}%`);
        }
      }

      return true;

    } catch (error) {
      console.error(`Model validation error for ${symbol}:`, error);
      return false;
    }
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
   * Make prediction using advanced ML ensemble
   */
  async predict(symbol, recentDigits) {
    if (!recentDigits || recentDigits.length < this.sequenceLength) {
      return null;
    }

    try {
      const predictions = [];

      // Get LSTM prediction
      const lstmPred = await this.predictWithLSTM(symbol, recentDigits);
      if (lstmPred) predictions.push({ ...lstmPred, weight: 0.4 });

      // Get Gradient Boosting prediction
      const gbPred = this.predictWithGradientBoosting(symbol, recentDigits);
      if (gbPred) predictions.push({ ...gbPred, weight: 0.3 });

      // Get traditional model predictions
      const freqPred = this.predictWithFrequency(symbol, recentDigits);
      if (freqPred) predictions.push({ ...freqPred, weight: 0.15 });

      const markovPred = this.predictWithMarkov(symbol, recentDigits[recentDigits.length - 1]);
      if (markovPred) predictions.push({ ...markovPred, weight: 0.15 });

      if (predictions.length === 0) {
        return null;
      }

      // Ensemble voting with weighted probabilities
      const combinedProbs = Array(10).fill(0);
      let totalWeight = 0;

      predictions.forEach(pred => {
        if (pred.allProbabilities) {
          pred.allProbabilities.forEach((prob, digit) => {
            combinedProbs[digit] += prob * pred.weight;
          });
          totalWeight += pred.weight;
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

      // Calculate confidence based on probability spread and model agreement
      const sortedProbs = [...combinedProbs].sort((a, b) => b - a);
      const probSpread = sortedProbs[0] - sortedProbs[1];
      const modelAgreement = this.calculateModelAgreement(predictions, predictedDigit);

      const confidence = Math.min((probSpread * 2 + modelAgreement) / 2, 1);

      return {
        digit: predictedDigit,
        confidence: confidence,
        probability: maxProb,
        allProbabilities: combinedProbs,
        method: 'advanced_ensemble',
        components: {
          lstm: lstmPred,
          gradientBoosting: gbPred,
          frequency: freqPred,
          markov: markovPred
        }
      };

    } catch (error) {
      console.error(`Error predicting for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Predict using LSTM neural network
   */
  async predictWithLSTM(symbol, recentDigits) {
    let input = null;
    let prediction = null;

    try {
      const model = this.lstmModels.get(symbol);
      if (!model) return null;

      // Prepare input sequence
      const sequence = recentDigits.slice(-this.sequenceLength);
      if (sequence.length !== this.sequenceLength) return null;

      // Convert to tensor with proper memory management
      input = tf.tidy(() => {
        return tf.tensor3d([sequence.map(d => [d])]);
      });

      // Make prediction with memory management
      prediction = tf.tidy(() => {
        return model.predict(input);
      });

      const probabilities = await prediction.data();

      // Find best prediction
      let maxProb = 0;
      let predictedDigit = 0;
      probabilities.forEach((prob, digit) => {
        if (prob > maxProb) {
          maxProb = prob;
          predictedDigit = digit;
        }
      });

      return {
        digit: predictedDigit,
        confidence: maxProb,
        allProbabilities: Array.from(probabilities),
        method: 'lstm'
      };

    } catch (error) {
      console.error(`LSTM prediction error for ${symbol}:`, error);
      return null;
    } finally {
      // Ensure tensors are disposed even if error occurs
      if (input) {
        try { input.dispose(); } catch (e) { /* ignore */ }
      }
      if (prediction) {
        try { prediction.dispose(); } catch (e) { /* ignore */ }
      }
    }
  }

  /**
   * Predict using Gradient Boosting model
   */
  predictWithGradientBoosting(symbol, recentDigits) {
    try {
      const model = this.gradientBoostModels.get(symbol);
      if (!model || !model.trained) return null;

      // Simple ensemble prediction from decision trees
      const predictions = model.trees.map(tree => tree.predict(recentDigits));
      const digitCounts = Array(10).fill(0);

      predictions.forEach(pred => {
        digitCounts[pred] = (digitCounts[pred] || 0) + 1;
      });

      // Convert to probabilities
      const probabilities = digitCounts.map(count => count / predictions.length);

      let maxProb = 0;
      let predictedDigit = 0;
      probabilities.forEach((prob, digit) => {
        if (prob > maxProb) {
          maxProb = prob;
          predictedDigit = digit;
        }
      });

      return {
        digit: predictedDigit,
        confidence: maxProb,
        allProbabilities: probabilities,
        method: 'gradient_boosting'
      };

    } catch (error) {
      console.error(`Gradient Boosting prediction error for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Calculate agreement between different models
   */
  calculateModelAgreement(predictions, targetDigit) {
    const agreeingModels = predictions.filter(pred =>
      pred.digit === targetDigit && pred.confidence > 0.5
    ).length;

    return agreeingModels / predictions.length;
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
   * Predict using ensemble of all available models
   */
  predictEnsemble(symbol, currentDigit, recentDigits) {
    try {
      const predictions = [];

      // Get predictions from all available models
      const markovPred = this.predictWithMarkov(symbol, currentDigit);
      if (markovPred) predictions.push({ ...markovPred, weight: 0.4 });

      const trendPred = this.predictWithTrend(symbol, recentDigits);
      if (trendPred) predictions.push({ ...trendPred, weight: 0.3 });

      const freqPred = this.predictWithFrequency(symbol, recentDigits);
      if (freqPred) predictions.push({ ...freqPred, weight: 0.3 });

      if (predictions.length === 0) return null;

      // Simple ensemble: weighted voting
      const digitVotes = {};
      predictions.forEach(pred => {
        digitVotes[pred.digit] = (digitVotes[pred.digit] || 0) + pred.confidence * pred.weight;
      });

      const bestDigit = Object.keys(digitVotes).reduce((a, b) =>
        digitVotes[a] > digitVotes[b] ? a : b
      );

      const totalWeight = predictions.reduce((sum, pred) => sum + pred.weight, 0);
      const avgConfidence = predictions.reduce((sum, pred) => sum + pred.confidence * pred.weight, 0) / totalWeight;

      return {
        digit: parseInt(bestDigit),
        confidence: Math.min(avgConfidence, 1),
        method: 'ensemble'
      };

    } catch (error) {
      console.error(`Ensemble prediction error for ${symbol}:`, error);
      return null;
    }
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
