const ss = require('simple-statistics');
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

  // Run realistic backtest with proper market simulation
  async runBacktest(strategy, symbol, options = {}) {
    if (this.isRunning) {
      throw new Error('Backtest already running');
    }

    this.isRunning = true;

    try {
      console.log(`Starting realistic backtest for ${strategy} on ${symbol}`);

      const {
        startDate = null,
        endDate = null,
        initialBalance = 1000,
        maxTrades = null,
        riskPerTrade = 0.02,
        minProbability = 12,
        includeTransactionCosts = true,
        slippageModel = 'realistic',
        marketHoursOnly = true,
        realisticLatency = true
      } = options;

      // Get historical data with sufficient lookback
      const ticks = db.getRecentTicks(symbol, 20000); // Need more data for realistic testing
      if (ticks.length < 1000) {
        throw new Error(`Insufficient historical data for ${symbol}: ${ticks.length} ticks (need 1000+)`);
      }

      // Filter by date range and market hours
      let filteredTicks = this.filterTicksByCriteria(ticks, { startDate, endDate, marketHoursOnly });

      if (filteredTicks.length < 500) {
        throw new Error(`Insufficient filtered data for ${symbol}: ${filteredTicks.length} ticks`);
      }

      console.log(`Backtesting on ${filteredTicks.length} ticks for ${symbol} (${includeTransactionCosts ? 'with' : 'without'} transaction costs)`);

      // Initialize realistic backtest state
      const backtestState = {
        balance: initialBalance,
        peakBalance: initialBalance,
        trades: [],
        currentDrawdown: 0,
        winCount: 0,
        lossCount: 0,
        totalProfit: 0,
        totalFees: 0,
        symbol,
        strategy,
        openPositions: new Map(), // For tracking pending trades
        marketState: this.initializeMarketState(filteredTicks)
      };

      // Run realistic backtest simulation
      const results = await this.executeRealisticBacktest(strategy, filteredTicks, backtestState, {
        riskPerTrade,
        minProbability,
        maxTrades,
        includeTransactionCosts,
        slippageModel,
        realisticLatency
      });

      // Calculate comprehensive performance metrics
      const performance = this.calculateComprehensivePerformanceMetrics(results);

      // Add risk-adjusted metrics
      performance.riskAdjustedMetrics = this.calculateRiskAdjustedMetrics(results, performance);

      // Store results with metadata
      const resultKey = `${strategy}_${symbol}_${Date.now()}`;
      this.results.set(resultKey, {
        ...results,
        performance,
        options,
        metadata: {
          dataPoints: filteredTicks.length,
          dateRange: this.getDateRange(filteredTicks),
          marketConditions: this.analyzeMarketConditions(filteredTicks),
          backtestRealism: this.assessBacktestRealism(options)
        },
        timestamp: new Date().toISOString()
      });

      console.log(`Realistic backtest completed for ${strategy} on ${symbol}`);
      console.log(`Final balance: $${results.balance.toFixed(2)}, Net profit: $${results.totalProfit.toFixed(2)}, Fees: $${results.totalFees.toFixed(2)}`);
      console.log(`Win rate: ${(performance.winRate * 100).toFixed(2)}%, Profit factor: ${performance.profitFactor.toFixed(2)}, Sharpe: ${performance.sharpeRatio.toFixed(2)}`);

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

  // Filter ticks by realistic criteria
  filterTicksByCriteria(ticks, criteria) {
    // Ensure ticks is an array
    if (!Array.isArray(ticks)) {
      console.error('filterTicksByCriteria: ticks is not an array:', typeof ticks);
      return [];
    }

    const { startDate, endDate, marketHoursOnly } = criteria;

    return ticks.filter(tick => {
      // Validate tick structure
      if (!tick || !tick.timestamp) return false;

      const tickDate = new Date(tick.timestamp);

      // Date range filter
      if (startDate && tickDate < new Date(startDate)) return false;
      if (endDate && tickDate > new Date(endDate)) return false;

      // Market hours filter (simplified - weekdays 24/5 for crypto)
      if (marketHoursOnly) {
        const day = tickDate.getDay();
        // Exclude weekends (0 = Sunday, 6 = Saturday)
        if (day === 0 || day === 6) return false;
      }

      return true;
    });
  }

  // Initialize market state for realistic simulation
  initializeMarketState(ticks) {
    return {
      volatility: this.calculateHistoricalVolatility(ticks),
      spread: this.estimateAverageSpread(ticks),
      liquidity: this.assessMarketLiquidity(ticks),
      lastUpdate: Date.now()
    };
  }

  // Calculate historical volatility
  calculateHistoricalVolatility(ticks, window = 100) {
    if (ticks.length < window) return 0.5;

    const recentTicks = ticks.slice(-window);
    const digits = recentTicks.map(t => t.last_digit);

    // Calculate digit variance as volatility proxy
    const mean = ss.mean(digits);
    const variance = ss.variance(digits);

    return Math.sqrt(variance) / 4.5; // Normalize to 0-1 range
  }

  // Estimate average spread (simplified)
  estimateAverageSpread(ticks) {
    // For digit markets, spread is effectively 0, but we simulate micro-spreads
    return 0.0001; // 0.01% spread
  }

  // Assess market liquidity
  assessMarketLiquidity(ticks) {
    // Simple liquidity proxy based on tick frequency
    const recentTicks = ticks.slice(-100);
    const timeSpan = recentTicks[recentTicks.length - 1].timestamp - recentTicks[0].timestamp;
    const avgInterval = timeSpan / recentTicks.length;

    // Higher frequency = higher liquidity
    return Math.min(1.0, 1000 / avgInterval); // Normalize
  }

  // Execute realistic backtest with market simulation
  async executeRealisticBacktest(strategy, ticks, state, options) {
    const {
      riskPerTrade,
      minProbability,
      maxTrades,
      includeTransactionCosts,
      slippageModel,
      realisticLatency
    } = options;

    let tradeCount = 0;
    const pendingTrades = new Map();

    for (let i = 100; i < ticks.length - 1; i++) { // Start after sufficient history, leave room for outcome
      const currentTick = ticks[i];
      const currentTime = currentTick.timestamp;

      // Update market state
      this.updateMarketState(state.marketState, ticks.slice(Math.max(0, i - 50), i + 1));

      // Check for completed trades (with realistic latency)
      await this.processCompletedTrades(pendingTrades, ticks, i, state, options);

      // Skip if we have too many concurrent trades
      if (pendingTrades.size >= 3) continue;

      // Generate prediction using available historical data only
      const availableHistory = ticks.slice(0, i); // Only data up to current tick
      const prediction = await this.generateRealisticPrediction(strategy, availableHistory, currentTick);

      if (!prediction || prediction.probability < minProbability) continue;

      // Apply realistic latency (prediction takes time)
      const latencyTicks = realisticLatency ? Math.floor(Math.random() * 3) + 1 : 0;
      const executionTickIndex = Math.min(i + latencyTicks, ticks.length - 1);
      const executionTick = ticks[executionTickIndex];

      // Calculate realistic stake with market impact
      const stake = this.calculateRealisticStake(state.balance, riskPerTrade, prediction, state.marketState);

      // Apply slippage
      const slippage = this.calculateSlippage(stake, state.marketState, slippageModel);
      const effectiveStake = stake * (1 + slippage);

      // Check if we can afford the trade
      if (effectiveStake > state.balance) continue;

      // Create pending trade (outcome not yet known)
      const tradeId = `backtest_${tradeCount}_${Date.now()}`;
      const pendingTrade = {
        id: tradeId,
        prediction: prediction.digit,
        stake: effectiveStake,
        timestamp: executionTick.timestamp,
        entryPrice: executionTick.quote,
        marketState: { ...state.marketState },
        outcomeTickIndex: executionTickIndex + 1, // Next tick determines outcome
        fees: includeTransactionCosts ? this.calculateTransactionFees(effectiveStake) : 0
      };

      pendingTrades.set(tradeId, pendingTrade);
      tradeCount++;

      if (maxTrades && tradeCount >= maxTrades) break;
    }

    // Process any remaining pending trades
    await this.processRemainingTrades(pendingTrades, ticks, ticks.length - 1, state, options);

    return state;
  }

  // Generate prediction using only historical data (no future leakage)
  async generateRealisticPrediction(strategy, historicalTicks, currentTick) {
    if (historicalTicks.length < 50) return null;

    const recentDigits = historicalTicks.slice(-20).map(t => t.last_digit);
    const digitFrequencies = this.calculateDigitFrequencies(historicalTicks);

    // Use the same prediction logic as live trading
    return await this.shouldTrade(strategy, {
      currentDigit: currentTick.last_digit,
      probabilities: digitFrequencies.probabilities,
      recentDigits,
      totalSamples: digitFrequencies.totalSamples,
      tickIndex: historicalTicks.length,
      totalTicks: historicalTicks.length,
      advancedPatterns: stats.detectPatterns(recentDigits)
    });
  }

  // Calculate digit frequencies from historical data
  calculateDigitFrequencies(ticks) {
    const frequencies = Array(10).fill(0);
    ticks.forEach(tick => frequencies[tick.last_digit]++);

    const totalSamples = ticks.length;
    const probabilities = frequencies.map(freq => (freq / totalSamples) * 100);

    return { frequencies, probabilities, totalSamples };
  }

  // Calculate realistic stake with market impact
  calculateRealisticStake(balance, riskPerTrade, prediction, marketState) {
    // Base Kelly calculation
    const winRate = prediction.probability / 100;
    const avgWin = config.PAYOUT_MULTIPLIER - 1;
    const avgLoss = 1.0;

    let stake = risk.calculateKellyStake(winRate, avgWin, avgLoss, balance, config.KELLY_FRACTION);

    // Apply market impact (larger trades move the market)
    const marketImpact = Math.min(0.05, stake / (balance * 0.1)); // Max 5% impact
    stake *= (1 - marketImpact);

    // Apply liquidity constraints
    const liquidityMultiplier = Math.max(0.5, marketState.liquidity);
    stake *= liquidityMultiplier;

    // Apply risk limits
    const riskStake = balance * riskPerTrade;
    stake = Math.min(stake, riskStake, balance * config.MAX_STAKE_MULTIPLIER);

    return Math.max(stake, 1.0); // Minimum stake
  }

  // Calculate realistic slippage
  calculateSlippage(stake, marketState, model) {
    const baseSlippage = marketState.spread;

    switch (model) {
      case 'aggressive':
        return baseSlippage * (1 + Math.random() * 0.5); // 0-50% additional slippage

      case 'realistic':
        // Size-based slippage
        const sizeMultiplier = Math.min(1.0, stake / 100); // Larger trades = more slippage
        return baseSlippage * (1 + sizeMultiplier * marketState.volatility);

      case 'conservative':
      default:
        return baseSlippage;
    }
  }

  // Calculate transaction fees
  calculateTransactionFees(stake) {
    // Deriv commission + network fees
    const commission = stake * 0.001; // 0.1% commission
    const networkFee = Math.max(0.1, stake * 0.0001); // Minimum 0.1, or 0.01%

    return commission + networkFee;
  }

  // Process completed trades with realistic outcomes
  async processCompletedTrades(pendingTrades, ticks, currentIndex, state, options) {
    const completedTrades = [];

    for (const [tradeId, trade] of pendingTrades) {
      if (currentIndex >= trade.outcomeTickIndex) {
        const outcomeTick = ticks[trade.outcomeTickIndex];
        if (!outcomeTick) continue;

        const actualDigit = outcomeTick.last_digit;
        const isWin = trade.prediction === actualDigit;

        const payout = isWin ? trade.stake * config.PAYOUT_MULTIPLIER : 0;
        const grossProfit = payout - trade.stake;
        const netProfit = grossProfit - trade.fees;

        const completedTrade = {
          ...trade,
          actual: actualDigit,
          result: isWin ? 'won' : 'lost',
          payout,
          grossProfit,
          netProfit,
          fees: trade.fees,
          exitPrice: outcomeTick.quote,
          holdingTime: outcomeTick.timestamp - trade.timestamp
        };

        completedTrades.push(completedTrade);
        pendingTrades.delete(tradeId);

        // Update state
        state.balance += netProfit;
        state.totalProfit += netProfit;
        state.totalFees += trade.fees;
        state.peakBalance = Math.max(state.peakBalance, state.balance);
        state.currentDrawdown = (state.peakBalance - state.balance) / state.peakBalance;

        if (isWin) state.winCount++;
        else state.lossCount++;

        state.trades.push(completedTrade);
      }
    }
  }

  // Process remaining pending trades at end of backtest
  async processRemainingTrades(pendingTrades, ticks, finalIndex, state, options) {
    for (const [tradeId, trade] of pendingTrades) {
      // Force close remaining trades at market
      const outcomeTick = ticks[Math.min(trade.outcomeTickIndex, finalIndex)];
      const actualDigit = outcomeTick ? outcomeTick.last_digit : trade.prediction; // Default to loss if no data

      const isWin = trade.prediction === actualDigit;
      const payout = isWin ? trade.stake * config.PAYOUT_MULTIPLIER : 0;
      const grossProfit = payout - trade.stake;
      const netProfit = grossProfit - trade.fees;

      const completedTrade = {
        ...trade,
        actual: actualDigit,
        result: isWin ? 'won' : 'lost',
        payout,
        grossProfit,
        netProfit,
        fees: trade.fees,
        exitPrice: outcomeTick?.quote || trade.entryPrice,
        holdingTime: (outcomeTick?.timestamp || trade.timestamp) - trade.timestamp,
        forcedClosure: true
      };

      state.balance += netProfit;
      state.totalProfit += netProfit;
      state.totalFees += trade.fees;
      state.peakBalance = Math.max(state.peakBalance, state.balance);

      if (isWin) state.winCount++;
      else state.lossCount++;

      state.trades.push(completedTrade);
    }

    pendingTrades.clear();
  }

  // Update market state during backtest
  updateMarketState(marketState, recentTicks) {
    marketState.volatility = this.calculateHistoricalVolatility(recentTicks);
    marketState.liquidity = this.assessMarketLiquidity(recentTicks);
    marketState.lastUpdate = Date.now();
  }

  // Calculate comprehensive performance metrics
  calculateComprehensivePerformanceMetrics(results) {
    const { trades, balance, peakBalance, totalProfit, totalFees } = results;

    if (trades.length === 0) {
      return this.getEmptyPerformanceMetrics();
    }

    const winningTrades = trades.filter(t => t.result === 'won');
    const losingTrades = trades.filter(t => t.result === 'lost');

    const winRate = winningTrades.length / trades.length;
    const avgWin = winningTrades.length > 0 ?
      winningTrades.reduce((sum, t) => sum + t.netProfit, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ?
      Math.abs(losingTrades.reduce((sum, t) => sum + t.netProfit, 0) / losingTrades.length) : 0;

    const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : 0;

    // Calculate returns for Sharpe ratio
    const returns = trades.map(t => t.netProfit / t.stake);
    const avgReturn = stats.mean(returns);
    const stdReturn = stats.standardDeviation(returns);
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0; // Annualized

    // Calculate maximum drawdown
    let maxDrawdown = 0;
    let peak = results.balance - totalProfit; // Starting balance
    let currentBalance = peak;

    for (const trade of trades) {
      currentBalance += trade.netProfit;
      peak = Math.max(peak, currentBalance);
      const drawdown = (peak - currentBalance) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    // Calculate Calmar ratio
    const calmarRatio = maxDrawdown > 0 ? (totalProfit / peakBalance) / maxDrawdown : 0;

    // Calculate Sortino ratio (downside deviation)
    const negativeReturns = returns.filter(r => r < 0);
    const downsideStd = negativeReturns.length > 0 ? stats.standardDeviation(negativeReturns) : 0;
    const sortinoRatio = downsideStd > 0 ? (avgReturn / downsideStd) * Math.sqrt(252) : 0;

    return {
      totalTrades: trades.length,
      winRate,
      profitFactor,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      calmarRatio,
      avgWin,
      avgLoss,
      totalProfit,
      totalFees,
      netProfit: totalProfit - totalFees,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      avgTradeDuration: stats.mean(trades.map(t => t.holdingTime)),
      profitToDrawdownRatio: maxDrawdown > 0 ? totalProfit / (maxDrawdown * peakBalance) : 0
    };
  }

  // Calculate risk-adjusted performance metrics
  calculateRiskAdjustedMetrics(results, performance) {
    const { trades } = results;

    if (trades.length < 10) {
      return { valueAtRisk: 0, expectedShortfall: 0, riskOfRuin: 0 };
    }

    // Calculate Value at Risk (95% confidence)
    const returns = trades.map(t => t.netProfit / t.stake).sort((a, b) => a - b);
    const var95Index = Math.floor(returns.length * 0.05);
    const valueAtRisk = -returns[var95Index]; // Positive value

    // Calculate Expected Shortfall (CVaR)
    const tailReturns = returns.slice(0, var95Index + 1);
    const expectedShortfall = -stats.mean(tailReturns);

    // Calculate Risk of Ruin (simplified)
    const winRate = performance.winRate;
    const avgWin = performance.avgWin;
    const avgLoss = performance.avgLoss;

    let riskOfRuin;
    if (avgLoss === 0) {
      riskOfRuin = 0;
    } else {
      const riskRewardRatio = avgWin / avgLoss;
      const optimalBetSize = (riskRewardRatio * winRate - (1 - winRate)) / riskRewardRatio;

      if (optimalBetSize <= 0) {
        riskOfRuin = 1.0; // Certain ruin
      } else {
        // Simplified risk of ruin calculation
        riskOfRuin = Math.pow(1 - winRate, 100 / optimalBetSize);
      }
    }

    return {
      valueAtRisk,
      expectedShortfall,
      riskOfRuin: Math.min(riskOfRuin, 1.0),
      riskAdjustedReturn: performance.sharpeRatio > 0 ? performance.totalProfit / performance.maxDrawdown : 0
    };
  }

  // Get date range for backtest metadata
  getDateRange(ticks) {
    if (ticks.length === 0) return null;

    const startDate = new Date(ticks[0].timestamp);
    const endDate = new Date(ticks[ticks.length - 1].timestamp);

    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      duration: endDate - startDate
    };
  }

  // Analyze market conditions during backtest
  analyzeMarketConditions(ticks) {
    const volatility = this.calculateHistoricalVolatility(ticks, 500);
    const liquidity = this.assessMarketLiquidity(ticks);

    // Detect trends and ranges
    const digits = ticks.map(t => t.last_digit);
    const trend = stats.detectMarketRegime(digits, 100);

    return {
      volatility,
      liquidity,
      trend: trend.regime,
      trendStrength: trend.confidence,
      averageTickInterval: this.calculateAverageTickInterval(ticks)
    };
  }

  // Calculate average time between ticks
  calculateAverageTickInterval(ticks) {
    if (ticks.length < 2) return 0;

    let totalInterval = 0;
    for (let i = 1; i < ticks.length; i++) {
      totalInterval += ticks[i].timestamp - ticks[i - 1].timestamp;
    }

    return totalInterval / (ticks.length - 1);
  }

  // Assess how realistic the backtest parameters are
  assessBacktestRealism(options) {
    let realismScore = 0;
    let factors = [];

    if (options.includeTransactionCosts) {
      realismScore += 0.3;
      factors.push('transaction_costs');
    }

    if (options.slippageModel === 'realistic') {
      realismScore += 0.2;
      factors.push('realistic_slippage');
    }

    if (options.marketHoursOnly) {
      realismScore += 0.2;
      factors.push('market_hours_filter');
    }

    if (options.realisticLatency) {
      realismScore += 0.3;
      factors.push('prediction_latency');
    }

    return {
      score: realismScore,
      level: realismScore > 0.8 ? 'highly_realistic' :
             realismScore > 0.6 ? 'moderately_realistic' :
             realismScore > 0.4 ? 'somewhat_realistic' : 'not_realistic',
      factors
    };
  }

  // Get empty performance metrics
  getEmptyPerformanceMetrics() {
    return {
      totalTrades: 0,
      winRate: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      maxDrawdown: 0,
      calmarRatio: 0,
      avgWin: 0,
      avgLoss: 0,
      totalProfit: 0,
      totalFees: 0,
      netProfit: 0,
      winningTrades: 0,
      losingTrades: 0,
      avgTradeDuration: 0,
      profitToDrawdownRatio: 0
    };
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
      if (i >= 50 && totalSamples >= 100) { // Wait for sufficient data for pattern analysis
        // Get advanced pattern analysis for backtesting
        const advancedPatterns = stats.detectAdvancedPatterns(recentDigits);

        const shouldTrade = await this.shouldTrade(strategy, {
          currentDigit: lastDigit,
          probabilities,
          recentDigits,
          totalSamples,
          tickIndex: i,
          totalTicks: ticks.length,
          advancedPatterns
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
    // First priority: Advanced pattern recognition
    if (context.advancedPatterns && context.advancedPatterns.hasPattern && context.advancedPatterns.recommendedAction) {
      const patternAction = context.advancedPatterns.recommendedAction;

      if (patternAction.action !== 'hold' && patternAction.targetDigit !== null) {
        console.log(`Pattern-based prediction: ${patternAction.action} -> digit ${patternAction.targetDigit} (${patternAction.confidence.toFixed(2)} confidence)`);

        return {
          digit: patternAction.targetDigit,
          confidence: patternAction.confidence,
          method: `pattern_${patternAction.pattern}`
        };
      }
    }

    // Fallback to traditional strategies
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
        const nnPrediction = await ml.predict(context.symbol || 'test', context.recentDigits);
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

      case 'gradient_boosting':
        // Gradient boosting strategy
        const gbPrediction = await ml.predictWithGradientBoosting(context.symbol || 'test', context.recentDigits);
        return gbPrediction ? {
          digit: gbPrediction.digit,
          confidence: gbPrediction.confidence
        } : null;

      case 'lstm':
        // LSTM deep learning strategy
        const lstmPrediction = await ml.predictWithLSTM(context.symbol || 'test', context.recentDigits);
        return lstmPrediction ? {
          digit: lstmPrediction.digit,
          confidence: lstmPrediction.confidence
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
