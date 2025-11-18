const brain = require('brain.js');

// Advanced Machine Learning models for high-accuracy digit prediction
class MLManager {
  constructor() {
    this.models = new Map(); // symbol -> {lstm, cnn, ensemble, ...}
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

      // 1. Deep Neural Network
      models.dnn = await this.trainDeepNeuralNetwork(trainingSamples, options);

      // 2. LSTM-style Recurrent Network (simplified)
      models.lstm = await this.trainLSTMNetwork(trainingSamples, options);

      // 3. Convolutional Neural Network for pattern recognition
      models.cnn = await this.trainConvolutionalNetwork(trainingSamples, options);

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

  // Train deep neural network
  async trainDeepNeuralNetwork(trainingSamples, options) {
    const net = new brain.NeuralNetwork({
      hiddenLayers: [64, 32, 16, 8], // Deeper network
      activation: 'leaky-relu',
      learningRate: 0.01,
      momentum: 0.9,
      dropout: 0.1,
      ...options
    });

    const trainingOptions = {
      iterations: 2000,
      errorThresh: 0.001,
      log: false,
      learningRate: (iteration) => 0.01 * Math.pow(0.99, iteration / 100), // Learning rate decay
      ...options.trainingOptions
    };

    const result = net.train(trainingSamples, trainingOptions);
    console.log(`DNN training completed. Error: ${result.error}, Iterations: ${result.iterations}`);
    return net;
  }

  // Train LSTM-style network (simplified implementation)
  async trainLSTMNetwork(trainingSamples, options) {
    // For brain.js, we'll use a recurrent network as approximation
    const net = new brain.recurrent.LSTMTimeStep({
      hiddenLayers: [32, 16],
      learningRate: 0.01,
      decayRate: 0.9,
      ...options
    });

    // Convert training data to time series format
    const timeSeriesData = trainingSamples.map(sample => ({
      input: sample.input,
      output: sample.output.indexOf(1) // Convert one-hot to digit
    }));

    const result = net.train(timeSeriesData, {
      iterations: 1000,
      errorThresh: 0.005,
      log: false
    });

    console.log(`LSTM training completed. Error: ${result.error}`);
    return net;
  }

  // Train convolutional network for pattern recognition
  async trainConvolutionalNetwork(trainingSamples, options) {
    // Brain.js doesn't have native CNN, so we'll use a specialized network
    const net = new brain.NeuralNetwork({
      hiddenLayers: [128, 64, 32],
      activation: 'relu',
      learningRate: 0.005,
      ...options
    });

    const result = net.train(trainingSamples, {
      iterations: 1500,
      errorThresh: 0.003,
      log: false
    });

    console.log(`CNN training completed. Error: ${result.error}`);
    return net;
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
        dnn: this.predictWithDNN(models.dnn, recentDigits),
        lstm: this.predictWithLSTM(models.lstm, recentDigits),
        cnn: this.predictWithCNN(models.cnn, recentDigits),
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
        if (model && typeof model.toJSON === 'function') {
          modelData[modelName] = model.toJSON();
        } else {
          modelData[modelName] = model; // For non-brain.js models
        }
      }

      fs.writeFileSync(filepath, JSON.stringify(modelData));
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
      const models = {};

      for (const [modelName, modelJson] of Object.entries(modelData)) {
        if (modelName === 'bayesian' || modelName === 'markov') {
          models[modelName] = modelJson; // Non-brain.js models
        } else {
          // Brain.js models
          const net = modelName.includes('lstm') ?
            new brain.recurrent.LSTMTimeStep() :
            new brain.NeuralNetwork();
          net.fromJSON(modelJson);
          models[modelName] = net;
        }
      }

      this.models.set(symbol, models);
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
      commonSequences: new Map()
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
}

module.exports = new MLManager();
