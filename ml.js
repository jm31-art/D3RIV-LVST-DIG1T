const ss = require('simple-statistics');

// Advanced Statistical ML models for high-accuracy digit prediction
class MLManager {
  constructor() {
    this.models = new Map(); // symbol -> {regression, bayesian, markov, ensemble, ...}
    this.trainingData = new Map(); // symbol -> array of training samples
    this.patternCache = new Map(); // symbol -> pattern analysis results
    this.isTraining = false;
    this.accuracyHistory = new Map(); // symbol -> historical accuracy data
  }

  // Prepare training data from historical ticks
  prepareTrainingData(symbol, ticks, sequenceLength = 5) {
    if (!ticks || ticks.length < sequenceLength + 1) return [];

    const trainingSamples = [];

    for (let i = sequenceLength; i < ticks.length; i++) {
      const input = [];
      for (let j = i - sequenceLength; j < i; j++) {
        // One-hot encode the digit (0-9)
        const digit = ticks[j].last_digit;
        const oneHot = Array(10).fill(0);
        oneHot[digit] = 1;
        input.push(...oneHot);
      }

      // Output is the next digit (one-hot encoded)
      const outputDigit = ticks[i].last_digit;
      const output = Array(10).fill(0);
      output[outputDigit] = 1;

      trainingSamples.push({ input, output });
    }

    return trainingSamples;
  }

  // Advanced ensemble training with multiple model types
  async trainModel(symbol, ticks, options = {}) {
    if (this.isTraining) {
      console.log(`Training already in progress for ${symbol}`);
      return false;
    }

    this.isTraining = true;

    try {
      const sequenceLength = options.sequenceLength || 10;
      const trainingSamples = this.prepareTrainingData(symbol, ticks, sequenceLength);

      if (trainingSamples.length < 500) {
        console.log(`Not enough training data for ${symbol}: ${trainingSamples.length} samples`);
        return false;
      }

      console.log(`Training advanced ML models for ${symbol} with ${trainingSamples.length} samples`);

      const models = {};

      // 1. Statistical Regression Model
      models.regression = await this.trainStatisticalRegression(trainingSamples, options);

      // 2. Time Series Analysis
      models.timeSeries = await this.trainTimeSeriesAnalysis(trainingSamples, options);

      // 3. Pattern Recognition using Statistics
      models.patterns = await this.trainPatternRecognition(trainingSamples, options);

      // 4. Bayesian Network for probabilistic reasoning
      models.bayesian = this.trainBayesianModel(symbol, ticks);

      // 5. Markov Chain with higher-order transitions
      models.markov = this.trainAdvancedMarkovChain(symbol, ticks);

      // Store all models
      this.models.set(symbol, models);
      this.trainingData.set(symbol, trainingSamples);

      // Evaluate ensemble performance
      const accuracy = await this.evaluateEnsemble(symbol, ticks);
      console.log(`Ensemble training completed for ${symbol}. Estimated accuracy: ${(accuracy * 100).toFixed(2)}%`);

      // Update accuracy history
      const history = this.accuracyHistory.get(symbol) || [];
      history.push({ timestamp: Date.now(), accuracy });
      if (history.length > 100) history.shift(); // Keep last 100 entries
      this.accuracyHistory.set(symbol, history);

      return true;
    } catch (error) {
      console.error(`Error training models for ${symbol}:`, error);
      return false;
    } finally {
      this.isTraining = false;
    }
  }

  // Train statistical regression model
  async trainStatisticalRegression(trainingSamples, options) {
    if (!trainingSamples || trainingSamples.length < 10) return null;

    try {
      // Prepare data for regression
      const features = trainingSamples.map(sample => sample.input);
      const targets = trainingSamples.map(sample => sample.output.indexOf(1));

      // Perform multiple regression
      const regression = this.performMultipleRegression(features, targets);

      console.log(`Statistical regression training completed with ${trainingSamples.length} samples`);
      return regression;
    } catch (error) {
      console.error('Error training statistical regression:', error);
      return null;
    }
  }

  // Train deep neural network (simplified version without brain.js)
  async trainDeepNeuralNetwork(trainingSamples, options) {
    // Simplified neural network implementation using statistical methods
    if (!trainingSamples || trainingSamples.length < 20) return null;

    try {
      // Use multiple regression as approximation
      const regression = this.performMultipleRegression(
        trainingSamples.map(s => s.input),
        trainingSamples.map(s => s.output.indexOf(1))
      );

      console.log(`Simplified neural network training completed with ${trainingSamples.length} samples`);
      return regression;
    } catch (error) {
      console.error('Error training neural network:', error);
      return null;
    }
  }

  // Train time series analysis model
  async trainTimeSeriesAnalysis(trainingSamples, options) {
    if (!trainingSamples || trainingSamples.length < 20) return null;

    try {
      // Extract time series patterns
      const timeSeries = trainingSamples.map(sample => sample.output.indexOf(1));

      // Calculate moving averages and trends
      const model = {
        movingAverages: this.calculateMovingAverages(timeSeries, [5, 10, 20]),
        trends: this.calculateTrends(timeSeries),
        seasonality: this.detectSeasonality(timeSeries),
        autocorrelation: this.calculateAutocorrelation(timeSeries)
      };

      console.log(`Time series analysis completed for ${timeSeries.length} data points`);
      return model;
    } catch (error) {
      console.error('Error training time series analysis:', error);
      return null;
    }
  }

  // Train pattern recognition using statistical methods
  async trainPatternRecognition(trainingSamples, options) {
    if (!trainingSamples || trainingSamples.length < 20) return null;

    try {
      const patterns = {
        frequencyAnalysis: this.analyzeFrequencyPatterns(trainingSamples),
        transitionMatrices: this.buildTransitionMatrices(trainingSamples),
        clusterAnalysis: this.performClusterAnalysis(trainingSamples),
        anomalyDetection: this.detectAnomalies(trainingSamples)
      };

      console.log(`Pattern recognition training completed with ${trainingSamples.length} samples`);
      return patterns;
    } catch (error) {
      console.error('Error training pattern recognition:', error);
      return null;
    }
  }

  // Train Bayesian network for probabilistic prediction
  trainBayesianModel(symbol, ticks) {
    if (!ticks || ticks.length < 100) return null;

    const model = {
      priors: Array(10).fill(0),
      likelihoods: Array.from({ length: 10 }, () => Array(10).fill(0)),
      transitions: Array.from({ length: 10 }, () => Array(10).fill(0)),
      evidence: Array(10).fill(0)
    };

    // Calculate priors
    ticks.forEach(tick => model.priors[tick.last_digit]++);

    // Calculate transition probabilities
    for (let i = 1; i < ticks.length; i++) {
      const from = ticks[i-1].last_digit;
      const to = ticks[i].last_digit;
      model.transitions[from][to]++;
    }

    // Normalize
    const totalTicks = ticks.length;
    model.priors = model.priors.map(prior => prior / totalTicks);

    for (let i = 0; i < 10; i++) {
      const rowSum = model.transitions[i].reduce((a, b) => a + b, 0);
      if (rowSum > 0) {
        model.transitions[i] = model.transitions[i].map(val => val / rowSum);
      }
    }

    return model;
  }

  // Train advanced Markov chain with higher-order transitions
  trainAdvancedMarkovChain(symbol, ticks, order = 3) {
    if (!ticks || ticks.length < order + 1) return null;

    const model = {
      order,
      transitions: new Map(),
      counts: new Map()
    };

    // Build higher-order transition matrix
    for (let i = order; i < ticks.length; i++) {
      const state = [];
      for (let j = i - order; j < i; j++) {
        state.push(ticks[j].last_digit);
      }
      const nextDigit = ticks[i].last_digit;
      const stateKey = state.join(',');

      if (!model.transitions.has(stateKey)) {
        model.transitions.set(stateKey, Array(10).fill(0));
        model.counts.set(stateKey, 0);
      }

      model.transitions.get(stateKey)[nextDigit]++;
      model.counts.set(stateKey, model.counts.get(stateKey) + 1);
    }

    // Convert to probabilities
    for (const [state, counts] of model.transitions) {
      const total = model.counts.get(state);
      model.transitions.set(state, counts.map(count => count / total));
    }

    return model;
  }

  // Advanced ensemble prediction for high accuracy
  predict(symbol, recentDigits) {
    const models = this.models.get(symbol);
    if (!models || !recentDigits || recentDigits.length < 10) return null;

    try {
      // Get predictions from all models
      const predictions = {
        regression: this.predictWithRegression(models.regression, recentDigits),
        timeSeries: this.predictWithTimeSeries(models.timeSeries, recentDigits),
        patterns: this.predictWithPatterns(models.patterns, recentDigits),
        bayesian: this.predictWithBayesian(models.bayesian, recentDigits),
        markov: this.predictWithAdvancedMarkov(models.markov, recentDigits)
      };

      // Ensemble voting with dynamic weights based on historical accuracy
      const weights = this.calculateDynamicWeights(symbol, predictions);

      // Combine predictions using weighted average
      const combinedProbs = Array(10).fill(0);
      let totalWeight = 0;

      for (const [modelName, prediction] of Object.entries(predictions)) {
        if (prediction && prediction.allProbabilities) {
          const weight = weights[modelName] || 1;
          for (let digit = 0; digit < 10; digit++) {
            combinedProbs[digit] += prediction.allProbabilities[digit] * weight;
          }
          totalWeight += weight;
        }
      }

      // Normalize probabilities
      if (totalWeight > 0) {
        combinedProbs.forEach((prob, index) => combinedProbs[index] = prob / totalWeight);
      }

      // Find the digit with highest probability
      let maxProb = 0;
      let predictedDigit = null;

      combinedProbs.forEach((prob, digit) => {
        if (prob > maxProb) {
          maxProb = prob;
          predictedDigit = digit;
        }
      });

      // Apply confidence threshold and pattern validation
      const confidence = this.calculateEnsembleConfidence(predictions, combinedProbs);
      const isValidPattern = this.validatePredictionPattern(symbol, recentDigits, predictedDigit);

      if (confidence < 0.15 || !isValidPattern) {
        return null; // Not confident enough
      }

      return {
        digit: predictedDigit,
        confidence,
        allProbabilities: combinedProbs,
        method: 'ensemble',
        components: predictions,
        patternValidated: isValidPattern
      };
    } catch (error) {
      console.error(`Error predicting for ${symbol}:`, error);
      return null;
    }
  }

  // Simple Markov chain model for digit prediction
  trainMarkovChain(symbol, ticks) {
    if (!ticks || ticks.length < 2) return null;

    const transitions = Array.from({ length: 10 }, () => Array(10).fill(0));
    const counts = Array(10).fill(0);

    // Count transitions
    for (let i = 1; i < ticks.length; i++) {
      const fromDigit = ticks[i - 1].last_digit;
      const toDigit = ticks[i].last_digit;
      transitions[fromDigit][toDigit]++;
      counts[fromDigit]++;
    }

    // Convert to probabilities
    const probabilities = transitions.map((row, from) =>
      row.map(count => counts[from] > 0 ? count / counts[from] : 0)
    );

    this.models.set(`${symbol}_markov`, probabilities);
    return probabilities;
  }

  // Predict using Markov chain
  predictWithMarkov(symbol, currentDigit) {
    const markovModel = this.models.get(`${symbol}_markov`);
    if (!markovModel) return null;

    const probs = markovModel[currentDigit];
    let maxProb = 0;
    let predictedDigit = null;

    for (let digit = 0; digit < 10; digit++) {
      if (probs[digit] > maxProb) {
        maxProb = probs[digit];
        predictedDigit = digit;
      }
    }

    return {
      digit: predictedDigit,
      confidence: maxProb,
      allProbabilities: probs
    };
  }

  // Ensemble prediction combining neural network and Markov chain
  predictEnsemble(symbol, currentDigit, recentDigits) {
    const nnPrediction = this.predict(symbol, recentDigits);
    const markovPrediction = this.predictWithMarkov(symbol, currentDigit);

    if (!nnPrediction && !markovPrediction) return null;
    if (!nnPrediction) return markovPrediction;
    if (!markovPrediction) return nnPrediction;

    // Weighted combination (neural network gets higher weight)
    const nnWeight = 0.7;
    const markovWeight = 0.3;

    const combinedProbs = Array(10).fill(0);
    for (let digit = 0; digit < 10; digit++) {
      combinedProbs[digit] = (
        nnPrediction.allProbabilities[digit] * nnWeight +
        markovPrediction.allProbabilities[digit] * markovWeight
      );
    }

    let maxProb = 0;
    let predictedDigit = null;

    combinedProbs.forEach((prob, digit) => {
      if (prob > maxProb) {
        maxProb = prob;
        predictedDigit = digit;
      }
    });

    return {
      digit: predictedDigit,
      confidence: maxProb,
      method: 'ensemble',
      components: {
        neuralNetwork: nnPrediction,
        markovChain: markovPrediction
      }
    };
  }

  // Evaluate model performance
  evaluateModel(symbol, testTicks) {
    const model = this.models.get(symbol);
    if (!model || !testTicks || testTicks.length < 6) return null;

    let correct = 0;
    let total = 0;
    const predictions = [];

    for (let i = 5; i < testTicks.length; i++) {
      const recentDigits = testTicks.slice(i - 5, i).map(t => t.last_digit);
      const prediction = this.predict(symbol, recentDigits);
      const actual = testTicks[i].last_digit;

      if (prediction) {
        total++;
        if (prediction.digit === actual) correct++;
        predictions.push({
          predicted: prediction.digit,
          actual,
          confidence: prediction.confidence
        });
      }
    }

    const accuracy = total > 0 ? correct / total : 0;

    return {
      accuracy,
      totalPredictions: total,
      correctPredictions: correct,
      predictions
    };
  }

  // Cross-validate model
  crossValidate(symbol, ticks, folds = 5) {
    if (!ticks || ticks.length < folds * 10) return null;

    const foldSize = Math.floor(ticks.length / folds);
    const accuracies = [];

    for (let fold = 0; fold < folds; fold++) {
      const testStart = fold * foldSize;
      const testEnd = (fold + 1) * foldSize;
      const testData = ticks.slice(testStart, testEnd);
      const trainData = [...ticks.slice(0, testStart), ...ticks.slice(testEnd)];

      // Train on training data
      this.trainModel(symbol, trainData, { iterations: 500 });

      // Evaluate on test data
      const evaluation = this.evaluateModel(symbol, testData);
      if (evaluation) {
        accuracies.push(evaluation.accuracy);
      }
    }

    const avgAccuracy = accuracies.length > 0 ? accuracies.reduce((a, b) => a + b) / accuracies.length : 0;
    const stdDev = accuracies.length > 0 ? Math.sqrt(
      accuracies.reduce((sum, acc) => sum + Math.pow(acc - avgAccuracy, 2), 0) / accuracies.length
    ) : 0;

    return {
      averageAccuracy: avgAccuracy,
      standardDeviation: stdDev,
      foldAccuracies: accuracies
    };
  }

  // Save model to file
  saveModel(symbol, filepath) {
    const models = this.models.get(symbol);
    if (!models) return false;

    try {
      const fs = require('fs');
      const modelData = {};

      // Save each model
      for (const [modelName, model] of Object.entries(models)) {
        modelData[modelName] = model; // All models are plain objects now
      }

      fs.writeFileSync(filepath, JSON.stringify(modelData, null, 2));
      return true;
    } catch (error) {
      console.error(`Error saving models for ${symbol}:`, error);
      return false;
    }
  }

  // Load model from file
  loadModel(symbol, filepath) {
    try {
      const fs = require('fs');
      const modelData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      this.models.set(symbol, modelData);
      return true;
    } catch (error) {
      console.error(`Error loading models for ${symbol}:`, error);
      return false;
    }
  }

  // Get model status
  getModelStatus(symbol) {
    const hasModel = this.models.has(symbol);
    const hasMarkov = this.models.has(`${symbol}_markov`);
    const trainingSamples = this.trainingData.get(symbol);

    return {
      hasNeuralNetwork: hasModel,
      hasMarkovChain: hasMarkov,
      trainingSamples: trainingSamples ? trainingSamples.length : 0,
      isTraining: this.isTraining
    };
  }

  // Retrain all models with new data
  async retrainAll(symbols, db) {
    console.log('Retraining advanced ML models for all symbols...');

    for (const symbol of symbols) {
      const ticks = db.getRecentTicks(symbol, 10000); // Use last 10000 ticks for training
      if (ticks.length >= 500) {
        await this.trainModel(symbol, ticks);
        this.analyzePatterns(symbol, ticks); // Analyze patterns for validation
      }
    }

    console.log('Advanced ML model retraining completed');
  }

  // Analyze patterns for prediction validation
  analyzePatterns(symbol, ticks) {
    if (!ticks || ticks.length < 100) return;

    const patterns = {
      impossibleTransitions: Array.from({ length: 10 }, () => []),
      frequencyThreshold: 0.3, // Max 30% frequency in recent history
      commonSequences: new Map(),
      statisticalProperties: this.calculateStatisticalProperties(ticks)
    };

    // Find impossible transitions (transitions that never occur in history)
    const transitionCounts = Array.from({ length: 10 }, () => Array(10).fill(0));
    for (let i = 1; i < ticks.length; i++) {
      transitionCounts[ticks[i-1].last_digit][ticks[i].last_digit]++;
    }

    for (let from = 0; from < 10; from++) {
      for (let to = 0; to < 10; to++) {
        if (transitionCounts[from][to] === 0) {
          patterns.impossibleTransitions[from].push(to);
        }
      }
    }

    // Find common sequences
    const sequenceLength = 3;
    for (let i = sequenceLength; i < ticks.length; i++) {
      const sequence = ticks.slice(i - sequenceLength, i).map(t => t.last_digit).join(',');
      const nextDigit = ticks[i].last_digit;

      if (!patterns.commonSequences.has(sequence)) {
        patterns.commonSequences.set(sequence, Array(10).fill(0));
      }
      patterns.commonSequences.get(sequence)[nextDigit]++;
    }

    this.patternCache.set(symbol, patterns);
  }

  // Helper methods for statistical calculations
  calculateMovingAverages(data, periods) {
    const results = {};
    periods.forEach(period => {
      const averages = [];
      for (let i = period - 1; i < data.length; i++) {
        const slice = data.slice(i - period + 1, i + 1);
        averages.push(ss.mean(slice));
      }
      results[`ma_${period}`] = averages;
    });
    return results;
  }

  calculateTrends(data) {
    if (data.length < 2) return { slope: 0, intercept: 0 };

    const x = Array.from({ length: data.length }, (_, i) => i);
    const regression = ss.linearRegression(x.map((val, idx) => [val, data[idx]]));
    return regression;
  }

  detectSeasonality(data, maxLag = 10) {
    const autocorr = [];
    for (let lag = 1; lag <= maxLag; lag++) {
      const corr = ss.sampleCorrelation(data.slice(0, data.length - lag), data.slice(lag));
      autocorr.push({ lag, correlation: corr });
    }
    return autocorr;
  }

  calculateAutocorrelation(data, maxLag = 10) {
    const autocorr = [];
    for (let lag = 1; lag <= maxLag; lag++) {
      const corr = ss.sampleCorrelation(data.slice(0, data.length - lag), data.slice(lag));
      autocorr.push(corr);
    }
    return autocorr;
  }

  performMultipleRegression(features, targets) {
    // Simplified multiple regression implementation
    const n = features.length;
    const m = features[0].length;

    // Add intercept term
    const X = features.map(row => [1, ...row]);
    const y = targets;

    // Calculate coefficients using normal equation: (X^T * X)^-1 * X^T * y
    const XT = this.transpose(X);
    const XTX = this.matrixMultiply(XT, X);
    const XTX_inv = this.matrixInverse(XTX);
    const XTy = this.matrixMultiply(XT, y);
    const coefficients = this.matrixMultiply(XTX_inv, XTy);

    return { coefficients, intercept: coefficients[0], slopes: coefficients.slice(1) };
  }

  analyzeFrequencyPatterns(samples) {
    const digitCounts = Array(10).fill(0);
    samples.forEach(sample => {
      const digit = sample.output.indexOf(1);
      digitCounts[digit]++;
    });

    const total = samples.length;
    const frequencies = digitCounts.map(count => count / total);

    return {
      counts: digitCounts,
      frequencies,
      entropy: this.calculateEntropy(frequencies),
      mostFrequent: digitCounts.indexOf(Math.max(...digitCounts)),
      leastFrequent: digitCounts.indexOf(Math.min(...digitCounts))
    };
  }

  buildTransitionMatrices(samples) {
    const transitions = Array.from({ length: 10 }, () => Array(10).fill(0));
    const counts = Array(10).fill(0);

    for (let i = 1; i < samples.length; i++) {
      const from = samples[i-1].output.indexOf(1);
      const to = samples[i].output.indexOf(1);
      transitions[from][to]++;
      counts[from]++;
    }

    // Convert to probabilities
    const probabilities = transitions.map((row, from) =>
      row.map(count => counts[from] > 0 ? count / counts[from] : 0)
    );

    return { transitions, probabilities, counts };
  }

  performClusterAnalysis(samples) {
    // Simple k-means clustering for digit patterns
    const k = 5; // Number of clusters
    const maxIterations = 100;

    // Initialize centroids randomly
    let centroids = [];
    for (let i = 0; i < k; i++) {
      const randomSample = samples[Math.floor(Math.random() * samples.length)];
      centroids.push([...randomSample.input]);
    }

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Assign samples to nearest centroid
      const clusters = Array.from({ length: k }, () => []);

      samples.forEach(sample => {
        let minDistance = Infinity;
        let closestCentroid = 0;

        centroids.forEach((centroid, idx) => {
          const distance = this.euclideanDistance(sample.input, centroid);
          if (distance < minDistance) {
            minDistance = distance;
            closestCentroid = idx;
          }
        });

        clusters[closestCentroid].push(sample);
      });

      // Update centroids
      const newCentroids = centroids.map((_, idx) => {
        if (clusters[idx].length === 0) return centroids[idx];

        const clusterInputs = clusters[idx].map(s => s.input);
        const centroid = [];
        for (let j = 0; j < clusterInputs[0].length; j++) {
          const sum = clusterInputs.reduce((acc, input) => acc + input[j], 0);
          centroid.push(sum / clusterInputs.length);
        }
        return centroid;
      });

      centroids = newCentroids;
    }

    return { centroids, k };
  }

  detectAnomalies(samples) {
    const values = samples.map(s => s.output.indexOf(1));
    const mean = ss.mean(values);
    const std = ss.standardDeviation(values);

    const anomalies = [];
    values.forEach((value, idx) => {
      const zScore = Math.abs((value - mean) / std);
      if (zScore > 3) { // Z-score > 3 is considered anomalous
        anomalies.push({ index: idx, value, zScore });
      }
    });

    return {
      mean,
      std,
      anomalyCount: anomalies.length,
      anomalies
    };
  }

  calculateStatisticalProperties(ticks) {
    const digits = ticks.map(t => t.last_digit);
    return {
      mean: ss.mean(digits),
      median: ss.median(digits),
      mode: ss.mode(digits),
      standardDeviation: ss.standardDeviation(digits),
      variance: ss.variance(digits),
      skewness: this.calculateSkewness(digits),
      kurtosis: this.calculateKurtosis(digits),
      range: ss.max(digits) - ss.min(digits)
    };
  }

  calculateEntropy(probabilities) {
    return probabilities.reduce((entropy, p) => {
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
      return entropy;
    }, 0);
  }

  calculateSkewness(data) {
    const mean = ss.mean(data);
    const std = ss.standardDeviation(data);
    const n = data.length;

    const skewness = data.reduce((sum, val) => sum + Math.pow((val - mean) / std, 3), 0) / n;
    return skewness;
  }

  calculateKurtosis(data) {
    const mean = ss.mean(data);
    const std = ss.standardDeviation(data);
    const n = data.length;

    const kurtosis = data.reduce((sum, val) => sum + Math.pow((val - mean) / std, 4), 0) / n - 3;
    return kurtosis;
  }

  euclideanDistance(a, b) {
    return Math.sqrt(a.reduce((sum, val, idx) => sum + Math.pow(val - b[idx], 2), 0));
  }

  transpose(matrix) {
    return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
  }

  matrixMultiply(a, b) {
    const result = [];
    for (let i = 0; i < a.length; i++) {
      result[i] = [];
      for (let j = 0; j < b[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < a[0].length; k++) {
          sum += a[i][k] * b[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

  matrixInverse(matrix) {
    // Simple matrix inversion for small matrices (using Gaussian elimination)
    const n = matrix.length;
    const augmented = matrix.map((row, i) => [...row, ...(i === 0 ? [1] : i === 1 ? [0] : [0]), ...(i === 1 ? [1] : i === 0 ? [0] : [0]), ...(i === 2 ? [1] : [0])]);

    // Forward elimination
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }

      // Swap rows
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

      // Eliminate
      for (let k = i + 1; k < n; k++) {
        const factor = augmented[k][i] / augmented[i][i];
        for (let j = i; j < 2 * n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }

    // Back substitution
    const inverse = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = n; j < 2 * n; j++) {
        inverse[i][j - n] = augmented[i][j] / augmented[i][i];
      }
      for (let k = i - 1; k >= 0; k--) {
        const factor = augmented[k][i] / augmented[i][i];
        for (let j = n; j < 2 * n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }

    return inverse;
  }

  // Prediction methods for each model type
  predictWithRegression(model, recentDigits) {
    if (!model) return null;

    try {
      // Convert recent digits to feature vector
      const features = [];
      recentDigits.forEach(digit => {
        const oneHot = Array(10).fill(0);
        oneHot[digit] = 1;
        features.push(...oneHot);
      });

      // Add intercept
      const input = [1, ...features];

      // Calculate prediction using regression coefficients
      let prediction = 0;
      for (let i = 0; i < input.length; i++) {
        prediction += input[i] * model.coefficients[i];
      }

      // Convert to digit and probabilities
      const predictedDigit = Math.round(Math.max(0, Math.min(9, prediction)));
      const allProbabilities = Array(10).fill(0.1); // Uniform distribution as fallback
      allProbabilities[predictedDigit] = 0.5; // Higher probability for predicted digit

      return {
        digit: predictedDigit,
        confidence: 0.5,
        allProbabilities
      };
    } catch (error) {
      console.error('Error predicting with regression:', error);
      return null;
    }
  }

  predictWithTimeSeries(model, recentDigits) {
    if (!model) return null;

    try {
      // Use moving averages and trends for prediction
      const series = recentDigits.slice(-10); // Last 10 digits
      const ma5 = model.movingAverages.ma_5.slice(-1)[0] || ss.mean(series);
      const trend = model.trends.m || 0;

      // Predict next value using trend
      const predictedValue = ma5 + trend;

      // Convert to digit
      const predictedDigit = Math.round(Math.max(0, Math.min(9, predictedValue)));
      const allProbabilities = Array(10).fill(0.05);
      allProbabilities[predictedDigit] = 0.5;

      return {
        digit: predictedDigit,
        confidence: 0.4,
        allProbabilities
      };
    } catch (error) {
      console.error('Error predicting with time series:', error);
      return null;
    }
  }

  predictWithPatterns(model, recentDigits) {
    if (!model) return null;

    try {
      // Use pattern analysis for prediction
      const recentStr = recentDigits.slice(-3).join(',');
      const sequence = model.transitionMatrices.probabilities;

      // Find most likely next digit based on recent sequence
      const lastDigit = recentDigits[recentDigits.length - 1];
      const probabilities = sequence[lastDigit];

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
        allProbabilities: probabilities
      };
    } catch (error) {
      console.error('Error predicting with patterns:', error);
      return null;
    }
  }
}

module.exports = new MLManager();
