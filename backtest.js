const db = require('./db');
const stats = require('./stats');
const ml = require('./ml');
const risk = require('./risk');
const portfolio = require('./portfolio');
const config = require('./config');

class BacktestEngine {
  constructor() {
    this.results = new Map(); // strategy -> results
    this.isRunning = false;
  }

  // Run backtest for a specific strategy
  async runBacktest(strategy, symbol, options = {}) {
    if (this.isRunning) {
      throw new Error('Backtest already running');
    }

    this.isRunning = true;

    try {
      console.log(`Starting backtest for ${strategy} on ${symbol}`);

      const {
        startDate = null,
        endDate = null,
        initialBalance = 1000,
        maxTrades = null,
        riskPerTrade = 0.02,
        minProbability = 12
      } = options;

      // Get historical data
      const ticks = db.getRecentTicks(symbol, 10000);
      if (ticks.length < 100) {
        throw new Error(`Insufficient historical data for ${symbol}: ${ticks.length} ticks`);
      }

      // Filter by date range if specified
      let filteredTicks = ticks;
      if (startDate || endDate) {
        filteredTicks = ticks.filter(tick => {
          const tickDate = new Date(tick.timestamp);
          if (startDate && tickDate < new Date(startDate)) return false;
          if (endDate && tickDate > new Date(endDate)) return false;
          return true;
        });
      }

      console.log(`Backtesting on ${filteredTicks.length} ticks for ${symbol}`);

      // Initialize backtest state
      const backtestState = {
        balance: initialBalance,
        peakBalance: initialBalance,
        trades: [],
        currentDrawdown: 0,
        winCount: 0,
        lossCount: 0,
        totalProfit: 0,
        symbol,
        strategy
      };

      // Run the backtest based on strategy
      const results = await this.executeStrategy(strategy, filteredTicks, backtestState, {
        riskPerTrade,
        minProbability,
        maxTrades
      });

      // Calculate performance metrics
      const performance = this.calculatePerformanceMetrics(results);

      // Store results
      const resultKey = `${strategy}_${symbol}_${Date.now()}`;
      this.results.set(resultKey, {
        ...results,
        performance,
        options,
        timestamp: new Date().toISOString()
      });

      console.log(`Backtest completed for ${strategy} on ${symbol}`);
      console.log(`Final balance: $${results.balance.toFixed(2)}, Profit: $${results.totalProfit.toFixed(2)}`);
      console.log(`Win rate: ${(performance.winRate * 100).toFixed(2)}%, Profit factor: ${performance.profitFactor.toFixed(2)}`);

      return {
        key: resultKey,
        ...results,
        performance
      };

    } catch (error) {
      console.error(`Backtest error for ${strategy} on ${symbol}:`, error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // Execute specific trading strategy
  async executeStrategy(strategy, ticks, state, options) {
    const { riskPerTrade, minProbability, maxTrades } = options;

    // Prepare data for strategy
    let digitFrequencies = {};
    let recentDigits = [];
    let tradeCount = 0;

    for (let i = 0; i < ticks.length; i++) {
      const tick = ticks[i];
      const lastDigit = tick.last_digit;

      // Update digit frequencies
      digitFrequencies[lastDigit] = (digitFrequencies[lastDigit] || 0) + 1;
      recentDigits.push(lastDigit);
      if (recentDigits.length > 10) recentDigits.shift();

      // Calculate probabilities
      const totalSamples = Object.values(digitFrequencies).reduce((sum, count) => sum + count, 0);
      const probabilities = {};
      for (let digit = 0; digit <= 9; digit++) {
        probabilities[digit] = totalSamples > 0 ? (digitFrequencies[digit] || 0) / totalSamples * 100 : 0;
      }

      // Check if we should trade based on strategy
      if (i >= 10 && totalSamples >= 100) { // Wait for sufficient data
        const shouldTrade = await this.shouldTrade(strategy, {
          currentDigit: lastDigit,
          probabilities,
          recentDigits,
          totalSamples,
          tickIndex: i,
          totalTicks: ticks.length
        });

        if (shouldTrade && shouldTrade.digit !== null) {
          // Check probability threshold
          if (probabilities[shouldTrade.digit] >= minProbability) {
            // Calculate stake size
            const stake = this.calculateBacktestStake(state.balance, riskPerTrade, shouldTrade.digit, probabilities);

            // Simulate trade (predict next tick's digit)
            const nextTick = ticks[i + 1];
            if (nextTick) {
              const actualNextDigit = nextTick.last_digit;
              const isWin = shouldTrade.digit === actualNextDigit;
              const payout = isWin ? stake * config.PAYOUT_MULTIPLIER : 0;
              const profit = payout - stake;

              // Record trade
              const trade = {
                timestamp: tick.timestamp,
                prediction: shouldTrade.digit,
                actual: actualNextDigit,
                stake,
                result: isWin ? 'won' : 'lost',
                payout,
                profit,
                probability: probabilities[shouldTrade.digit],
                confidence: shouldTrade.confidence || 0
              };

              state.trades.push(trade);
              state.balance += profit;
              state.totalProfit += profit;
              state.peakBalance = Math.max(state.peakBalance, state.balance);
              state.currentDrawdown = (state.peakBalance - state.balance) / state.peakBalance;

              if (isWin) state.winCount++;
              else state.lossCount++;

              tradeCount++;
              if (maxTrades && tradeCount >= maxTrades) break;
            }
          }
        }
      }
    }

    return state;
  }

  // Determine if strategy should trade
  async shouldTrade(strategy, context) {
    switch (strategy) {
      case 'frequency':
        // Simple frequency-based strategy
        const maxProb = Math.max(...Object.values(context.probabilities));
        const predictedDigit = Object.keys(context.probabilities).find(
          digit => context.probabilities[digit] === maxProb
        );
        return {
          digit: parseInt(predictedDigit),
          confidence: maxProb / 100
        };

      case 'markov':
        // Markov chain strategy
        const markovPrediction = ml.predictWithMarkov(context.symbol || 'test', context.currentDigit);
        return markovPrediction ? {
          digit: markovPrediction.digit,
          confidence: markovPrediction.confidence
        } : null;

      case 'neural':
        // Neural network strategy
        const nnPrediction = ml.predict(context.symbol || 'test', context.recentDigits);
        return nnPrediction ? {
          digit: nnPrediction.digit,
          confidence: nnPrediction.confidence
        } : null;

      case 'ensemble':
        // Ensemble strategy
        const ensemblePrediction = ml.predictEnsemble(context.symbol || 'test', context.currentDigit, context.recentDigits);
        return ensemblePrediction ? {
          digit: ensemblePrediction.digit,
          confidence: ensemblePrediction.confidence
        } : null;

      case 'time_series':
        // Time series analysis strategy
        const tsPrediction = this.predictWithTimeSeries(context.recentDigits);
        return tsPrediction ? {
          digit: tsPrediction.digit,
          confidence: tsPrediction.confidence
        } : null;

      default:
        return null;
    }
  }

  // Calculate stake size for backtest
  calculateBacktestStake(balance, riskPerTrade, predictedDigit, probabilities) {
    // Use Kelly criterion for position sizing
    const winRate = probabilities[predictedDigit] / 100;
    const avgWin = config.PAYOUT_MULTIPLIER - 1; // Net payout
    const avgLoss = 1.0; // Lose stake on loss

    const kellyStake = risk.calculateKellyStake(winRate, avgWin, avgLoss, balance, config.KELLY_FRACTION);
    const riskStake = balance * riskPerTrade;

    return Math.min(kellyStake, riskStake, balance * config.MAX_STAKE_MULTIPLIER);
  }

  // Simple time series prediction using autocorrelation
  predictWithTimeSeries(recentDigits) {
    if (recentDigits.length < 5) return null;

    // Calculate autocorrelation with lag 1
    const series = recentDigits.slice(-10);
    const mean = stats.mean(series);
    const variance = stats.variance(series);

    if (variance === 0) return null;

    // Simple linear prediction based on trend
    const trend = series[series.length - 1] - series[series.length - 2];
    const predicted = Math.max(0, Math.min(9, series[series.length - 1] + trend));

    return {
      digit: Math.round(predicted),
      confidence: 0.5 // Placeholder confidence
    };
  }

  // Calculate comprehensive performance metrics
  calculatePerformanceMetrics(results) {
    const { trades, balance, peakBalance, totalProfit } = results;

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        avgWin: 0,
        avgLoss: 0,
        totalProfit: 0,
        calmarRatio: 0
      };
    }

    const winningTrades = trades.filter(t => t.result === 'won');
    const losingTrades = trades.filter(t => t.result === 'lost');

    const winRate = winningTrades.length / trades.length;
    const avgWin = winningTrades.length > 0 ?
      winningTrades.reduce((sum, t) => sum + t.profit, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ?
      Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0) / losingTrades.length) : 0;

    const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : 0;

    // Calculate Sharpe ratio
    const returns = trades.map(t => t.profit / t.stake);
    const avgReturn = stats.mean(returns);
    const stdReturn = stats.standardDeviation(returns);
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

    // Calculate Calmar ratio (annual return / max drawdown)
    const maxDrawdown = (peakBalance - Math.min(...trades.map((_, i) => {
      let runningBalance = results.balance - totalProfit;
      for (let j = 0; j <= i; j++) {
        runningBalance += trades[j].profit;
      }
      return runningBalance;
    }).concat(peakBalance))) / peakBalance;

    const calmarRatio = maxDrawdown > 0 ? (totalProfit / peakBalance) / maxDrawdown : 0;

    return {
      totalTrades: trades.length,
      winRate,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      avgWin,
      avgLoss,
      totalProfit,
      calmarRatio,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length
    };
  }

  // Compare multiple strategies
  async compareStrategies(symbol, strategies, options = {}) {
    const results = {};

    for (const strategy of strategies) {
      try {
        const result = await this.runBacktest(strategy, symbol, options);
        results[strategy] = result;
      } catch (error) {
        console.error(`Failed to backtest ${strategy}:`, error);
        results[strategy] = { error: error.message };
      }
    }

    // Generate comparison report
    const comparison = this.generateComparisonReport(results);
    return { results, comparison };
  }

  // Generate comparison report between strategies
  generateComparisonReport(results) {
    const validResults = Object.entries(results).filter(([_, result]) => !result.error);

    if (validResults.length === 0) return { error: 'No valid results to compare' };

    const metrics = ['totalProfit', 'winRate', 'profitFactor', 'sharpeRatio', 'maxDrawdown'];

    const comparison = {};

    for (const metric of metrics) {
      const values = validResults.map(([strategy, result]) => ({
        strategy,
        value: result.performance[metric]
      })).sort((a, b) => b.value - a.value);

      comparison[metric] = {
        best: values[0],
        worst: values[values.length - 1],
        average: stats.mean(values.map(v => v.value)),
        values
      };
    }

    return comparison;
  }

  // Walk-forward analysis to avoid overfitting
  async walkForwardAnalysis(strategy, symbol, options = {}) {
    const {
      trainWindow = 1000, // ticks for training
      testWindow = 200,   // ticks for testing
      stepSize = 100      // ticks to advance
    } = options;

    const ticks = db.getRecentTicks(symbol, 10000);
    if (ticks.length < trainWindow + testWindow) {
      throw new Error('Insufficient data for walk-forward analysis');
    }

    const results = [];
    let position = 0;

    while (position + trainWindow + testWindow <= ticks.length) {
      const trainData = ticks.slice(position, position + trainWindow);
      const testData = ticks.slice(position + trainWindow, position + trainWindow + testWindow);

      // Train model on training data
      await ml.trainModel(symbol, trainData, { iterations: 200 });

      // Test on test data
      const testResult = await this.runBacktest(strategy, symbol, {
        ...options,
        customTicks: testData
      });

      results.push({
        trainStart: position,
        trainEnd: position + trainWindow,
        testStart: position + trainWindow,
        testEnd: position + trainWindow + testWindow,
        performance: testResult.performance
      });

      position += stepSize;
    }

    // Calculate average performance across all windows
    const avgPerformance = {
      totalProfit: stats.mean(results.map(r => r.performance.totalProfit)),
      winRate: stats.mean(results.map(r => r.performance.winRate)),
      profitFactor: stats.mean(results.map(r => r.performance.profitFactor)),
      sharpeRatio: stats.mean(results.map(r => r.performance.sharpeRatio)),
      maxDrawdown: stats.mean(results.map(r => r.performance.maxDrawdown))
    };

    return {
      walkForwardResults: results,
      averagePerformance: avgPerformance,
      robustness: this.assessRobustness(results)
    };
  }

  // Assess strategy robustness
  assessRobustness(results) {
    if (results.length < 3) return { score: 0, assessment: 'insufficient data' };

    const profits = results.map(r => r.performance.totalProfit);
    const winRates = results.map(r => r.performance.winRate);

    const profitConsistency = 1 - (stats.standardDeviation(profits) / Math.abs(stats.mean(profits)));
    const winRateConsistency = 1 - stats.standardDeviation(winRates);

    const robustnessScore = (profitConsistency + winRateConsistency) / 2;

    let assessment;
    if (robustnessScore > 0.8) assessment = 'highly robust';
    else if (robustnessScore > 0.6) assessment = 'moderately robust';
    else if (robustnessScore > 0.4) assessment = 'somewhat robust';
    else assessment = 'not robust';

    return {
      score: robustnessScore,
      assessment,
      profitConsistency,
      winRateConsistency
    };
  }

  // Get backtest results
  getResults(key = null) {
    if (key) {
      return this.results.get(key);
    }
    return Object.fromEntries(this.results);
  }

  // Clear all results
  clearResults() {
    this.results.clear();
  }

  // Export results to JSON
  exportResults(filepath) {
    const fs = require('fs');
    const data = {
      timestamp: new Date().toISOString(),
      results: Object.fromEntries(this.results)
    };
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  }

  // Import results from JSON
  importResults(filepath) {
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(filepath));
    this.results = new Map(Object.entries(data.results));
  }
}

module.exports = new BacktestEngine();
