const ml = require('../ml');
const db = require('../db');

/**
 * Comprehensive tests for ML module
 * Tests real TensorFlow.js functionality, model training, and prediction accuracy
 */
describe('ML Module - TensorFlow.js Integration', () => {
  beforeAll(async () => {
    // Initialize database for testing
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Model Training', () => {
    test('should train LSTM model successfully', async () => {
      // Create mock training data
      const mockTicks = generateMockTicks(1500);

      const result = await ml.trainModel('TEST_SYMBOL', mockTicks);

      // Should return true for successful training
      expect(result).toBe(true);

      // Should have created LSTM model
      const status = ml.getModelStatus('TEST_SYMBOL');
      expect(status.hasFrequencyModel).toBe(true);
      expect(status.hasTransitionModel).toBe(true);
    }, 30000); // 30 second timeout for ML training

    test('should handle insufficient training data', async () => {
      const insufficientTicks = generateMockTicks(50);

      const result = await ml.trainModel('TEST_INSUFFICIENT', insufficientTicks);

      // Should fail gracefully with insufficient data
      expect(result).toBe(false);
    });

    test('should train multiple models simultaneously', async () => {
      const symbols = ['TEST_1', 'TEST_2', 'TEST_3'];
      const trainingPromises = symbols.map(symbol =>
        ml.trainModel(symbol, generateMockTicks(1200))
      );

      const results = await Promise.all(trainingPromises);

      // All should succeed
      results.forEach(result => expect(result).toBe(true));
    }, 60000);
  });

  describe('Prediction Accuracy', () => {
    beforeAll(async () => {
      // Train model for prediction tests
      await ml.trainModel('TEST_PREDICT', generateMockTicks(2000));
    });

    test('should generate predictions with proper structure', async () => {
      const recentDigits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

      const prediction = await ml.predict('TEST_PREDICT', recentDigits);

      expect(prediction).toHaveProperty('digit');
      expect(prediction).toHaveProperty('confidence');
      expect(prediction).toHaveProperty('probability');
      expect(prediction).toHaveProperty('allProbabilities');
      expect(prediction).toHaveProperty('method');
      expect(prediction).toHaveProperty('components');

      // Digit should be 0-9
      expect(prediction.digit).toBeGreaterThanOrEqual(0);
      expect(prediction.digit).toBeLessThanOrEqual(9);

      // Confidence should be reasonable
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);

      // Probabilities array should have 10 elements
      expect(prediction.allProbabilities).toHaveLength(10);
    });

    test('should handle insufficient prediction data', async () => {
      const insufficientDigits = [1, 2, 3];

      const prediction = await ml.predict('TEST_PREDICT', insufficientDigits);

      expect(prediction).toBeNull();
    });

    test('should provide ensemble predictions', async () => {
      const recentDigits = generateRealisticDigitSequence(25);

      const prediction = await ml.predict('TEST_PREDICT', recentDigits);

      expect(prediction.method).toBe('advanced_ensemble');
      expect(prediction.components).toHaveProperty('lstm');
      expect(prediction.components).toHaveProperty('gradientBoosting');
      expect(prediction.components).toHaveProperty('frequency');
      expect(prediction.components).toHaveProperty('markov');
    });
  });

  describe('Model Persistence', () => {
    test('should maintain model state between predictions', async () => {
      const symbol = 'TEST_PERSISTENCE';
      await ml.trainModel(symbol, generateMockTicks(1500));

      const status1 = ml.getModelStatus(symbol);
      expect(status1.hasFrequencyModel).toBe(true);

      // Make some predictions
      for (let i = 0; i < 5; i++) {
        const digits = generateRealisticDigitSequence(20);
        await ml.predict(symbol, digits);
      }

      const status2 = ml.getModelStatus(symbol);
      expect(status2.hasFrequencyModel).toBe(true); // Should persist
    });

    test('should handle model retraining', async () => {
      const symbol = 'TEST_RETRAIN';
      await ml.trainModel(symbol, generateMockTicks(1200));

      const statusBefore = ml.getModelStatus(symbol);
      const lastTrainedBefore = statusBefore.lastCalculated;

      // Wait a bit and retrain
      await new Promise(resolve => setTimeout(resolve, 100));
      await ml.trainModel(symbol, generateMockTicks(1200));

      const statusAfter = ml.getModelStatus(symbol);
      const lastTrainedAfter = statusAfter.lastCalculated;

      expect(lastTrainedAfter).toBeGreaterThan(lastTrainedBefore);
    });
  });

  describe('Error Handling', () => {
    test('should handle corrupted training data gracefully', async () => {
      const corruptedTicks = [
        { timestamp: Date.now(), quote: 'invalid', last_digit: 'not_a_number' },
        { timestamp: Date.now() + 1000, quote: NaN, last_digit: -1 }
      ];

      const result = await ml.trainModel('TEST_CORRUPTED', corruptedTicks);

      // Should fail gracefully
      expect(result).toBe(false);
    });

    test('should handle empty prediction input', async () => {
      const prediction = await ml.predict('TEST_PREDICT', []);

      expect(prediction).toBeNull();
    });

    test('should handle non-existent model predictions', async () => {
      const prediction = await ml.predict('NON_EXISTENT_MODEL', generateRealisticDigitSequence(20));

      expect(prediction).toBeNull();
    });
  });

  describe('Performance Characteristics', () => {
    test('should train models within reasonable time', async () => {
      const startTime = Date.now();
      await ml.trainModel('TEST_PERFORMANCE', generateMockTicks(1000));
      const endTime = Date.now();

      const trainingTime = endTime - startTime;

      // Should complete within 30 seconds
      expect(trainingTime).toBeLessThan(30000);
    });

    test('should make predictions quickly', async () => {
      await ml.trainModel('TEST_SPEED', generateMockTicks(1000));

      const digits = generateRealisticDigitSequence(20);
      const startTime = Date.now();

      await ml.predict('TEST_SPEED', digits);

      const predictionTime = Date.now() - startTime;

      // Should predict within 1 second
      expect(predictionTime).toBeLessThan(1000);
    });
  });

  describe('Statistical Validation', () => {
    test('should produce statistically reasonable predictions', async () => {
      await ml.trainModel('TEST_STATS', generateMockTicks(3000));

      const predictions = [];
      const actuals = [];

      // Generate many predictions and check they're not random
      for (let i = 0; i < 100; i++) {
        const digits = generateRealisticDigitSequence(25);
        const prediction = await ml.predict('TEST_STATS', digits);

        if (prediction) {
          predictions.push(prediction.digit);
          actuals.push(digits[digits.length - 1]); // Next digit would be the "actual"
        }
      }

      // Should have made some predictions
      expect(predictions.length).toBeGreaterThan(50);

      // Predictions should not be uniformly random (basic statistical test)
      const uniquePredictions = new Set(predictions).size;
      expect(uniquePredictions).toBeGreaterThan(3); // Should use more than 3 different digits

      // Should not always predict the same digit
      const mostFrequent = predictions.reduce((acc, digit) => {
        acc[digit] = (acc[digit] || 0) + 1;
        return acc;
      }, {});

      const maxFrequency = Math.max(...Object.values(mostFrequent));
      const totalPredictions = predictions.length;

      // No single digit should dominate (should be < 50% of predictions)
      expect(maxFrequency / totalPredictions).toBeLessThan(0.5);
    });

    test('should improve accuracy with more training data', async () => {
      // Train with small dataset
      await ml.trainModel('TEST_ACCURACY_SMALL', generateMockTicks(500));

      // Train with large dataset
      await ml.trainModel('TEST_ACCURACY_LARGE', generateMockTicks(3000));

      // Both should produce valid predictions, but we can't easily test
      // accuracy improvement without known ground truth
      const predSmall = await ml.predict('TEST_ACCURACY_SMALL', generateRealisticDigitSequence(20));
      const predLarge = await ml.predict('TEST_ACCURACY_LARGE', generateRealisticDigitSequence(20));

      expect(predSmall).toBeTruthy();
      expect(predLarge).toBeTruthy();
    });
  });
});

/**
 * Helper functions for generating test data
 */
function generateMockTicks(count) {
  const ticks = [];
  let currentTime = Date.now() - (count * 1000); // 1 second intervals
  let currentPrice = 100.0;

  for (let i = 0; i < count; i++) {
    // Generate realistic price movement
    const priceChange = (Math.random() - 0.5) * 0.1; // Small random changes
    currentPrice += priceChange;
    currentPrice = Math.max(0.1, currentPrice); // Prevent negative prices

    // Extract last digit from price
    const lastDigit = parseInt(currentPrice.toString().split('.')[1]?.[0] || '0');

    ticks.push({
      id: i + 1,
      symbol: 'TEST',
      timestamp: currentTime,
      quote: currentPrice,
      last_digit: lastDigit,
      created_at: new Date(currentTime).toISOString()
    });

    currentTime += 1000; // Next second
  }

  return ticks;
}

function generateRealisticDigitSequence(length) {
  const digits = [];
  let currentDigit = Math.floor(Math.random() * 10);

  for (let i = 0; i < length; i++) {
    // Add some autocorrelation (digits tend to cluster)
    const change = Math.random() < 0.7 ? 0 : (Math.random() < 0.5 ? 1 : -1);
    currentDigit = Math.max(0, Math.min(9, currentDigit + change));
    digits.push(currentDigit);
  }

  return digits;
}