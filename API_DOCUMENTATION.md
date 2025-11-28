# Deriv Last Digit Bot - API Documentation

## Overview

This document provides comprehensive API documentation for all internal modules of the Deriv Last Digit Bot. The bot is a sophisticated trading system that uses advanced machine learning and risk management to trade last digit prediction contracts on the Deriv platform.

## Architecture

The bot follows a modular architecture with the following key components:

- **DerivBot** (`index.js`): Main orchestrator class
- **Database** (`db.js`): Data persistence and retrieval
- **Statistics** (`stats.js`): Statistical analysis and pattern detection
- **ML Manager** (`ml.js`): Machine learning models and predictions
- **Risk Manager** (`risk.js`): Risk management and position sizing
- **Portfolio Manager** (`portfolio.js`): Portfolio optimization and management
- **Sentiment Analyzer** (`sentiment.js`): News sentiment analysis
- **Backtest Engine** (`backtest.js`): Strategy backtesting and validation
- **Configuration** (`config.js`): Centralized configuration management

## Core Classes

### DerivBot Class

The main orchestrator that manages the complete trading lifecycle.

#### Constructor
```javascript
const bot = new DerivBot();
```

#### Key Methods

##### `connect()`
Establishes WebSocket connection to Deriv API.
```javascript
await bot.connect();
```

##### `startTrading()`
Begins automated trading operations.
```javascript
await bot.startTrading();
```

##### `evaluateTradingOpportunity(symbol)`
Evaluates if there's a profitable trading opportunity for a symbol.

**Parameters:**
- `symbol` (string): Trading symbol (e.g., 'R_10')

**Returns:** Object|null - Trading opportunity details or null

**Example:**
```javascript
const opportunity = await bot.evaluateTradingOpportunity('R_10');
if (opportunity) {
  console.log(`Trade opportunity: ${opportunity.symbol} -> ${opportunity.prediction}`);
}
```

##### `executeTrade(opportunity)`
Executes a trade based on the identified opportunity.

**Parameters:**
- `opportunity` (Object): Trading opportunity details
  - `symbol` (string): Trading symbol
  - `prediction` (number): Predicted digit (0-9)
  - `stake` (number): Position size in USD
  - `probability` (number): Prediction confidence (0-100)

**Example:**
```javascript
await bot.executeTrade({
  symbol: 'R_10',
  prediction: 7,
  stake: 10,
  probability: 65
});
```

##### `calculateStakeSize(symbol, prediction, probabilities)`
Calculates optimal position size using volatility-adjusted Kelly Criterion.

**Parameters:**
- `symbol` (string): Trading symbol
- `prediction` (Object): Prediction details
- `probabilities` (Array): Probability distribution for digits

**Returns:** number - Recommended stake size

### Database Manager

Handles all data persistence and retrieval operations.

#### Key Methods

##### `insertTick(symbol, timestamp, quote, lastDigit)`
Stores a new price tick in the database.

**Parameters:**
- `symbol` (string): Trading symbol
- `timestamp` (number): Unix timestamp
- `quote` (number): Price quote
- `lastDigit` (number): Last digit of price

##### `getRecentTicks(symbol, limit)`
Retrieves recent tick data for analysis.

**Parameters:**
- `symbol` (string): Trading symbol
- `limit` (number): Maximum number of ticks to retrieve

**Returns:** Array - Array of tick objects

##### `getDigitFrequencies(symbol)`
Gets frequency distribution of digits for a symbol.

**Parameters:**
- `symbol` (string): Trading symbol

**Returns:** Object
```javascript
{
  data: Array,      // Digit frequency counts
  totalSamples: number  // Total number of samples
}
```

### ML Manager

Advanced machine learning models for digit prediction.

#### Key Methods

##### `trainModel(symbol, ticks, options)`
Trains all ML models for a symbol.

**Parameters:**
- `symbol` (string): Trading symbol
- `ticks` (Array): Historical tick data
- `options` (Object): Training options
  - `sequenceLength` (number): Sequence length for training (default: 10)

**Returns:** boolean - Training success status

##### `predict(symbol, recentDigits)`
Generates ensemble prediction using all trained models.

**Parameters:**
- `symbol` (string): Trading symbol
- `recentDigits` (Array): Recent digit sequence

**Returns:** Object|null - Prediction result
```javascript
{
  digit: number,           // Predicted digit (0-9)
  confidence: number,      // Prediction confidence (0-1)
  allProbabilities: Array, // Probability distribution
  method: string,          // Prediction method ('ensemble')
  components: Object,      // Individual model predictions
  patternValidated: boolean // Pattern validation status
}
```

##### `evaluateModel(symbol, testTicks)`
Evaluates model performance on test data.

**Parameters:**
- `symbol` (string): Trading symbol
- `testTicks` (Array): Test data ticks

**Returns:** Object - Evaluation metrics
```javascript
{
  accuracy: number,        // Model accuracy (0-1)
  totalPredictions: number, // Total predictions made
  correctPredictions: number, // Correct predictions
  predictions: Array       // Detailed prediction results
}
```

### Risk Manager

Comprehensive risk management and position sizing.

#### Key Methods

##### `calculateKellyStake(winRate, avgWin, avgLoss, currentBalance, fraction)`
Calculates optimal stake size using Kelly Criterion.

**Parameters:**
- `winRate` (number): Historical win rate (0-1)
- `avgWin` (number): Average win payout ratio
- `avgLoss` (number): Average loss ratio (typically 1.0)
- `currentBalance` (number): Current account balance
- `fraction` (number): Kelly fraction to use (0-1)

**Returns:** number - Recommended stake size

##### `shouldStopTrading()`
Checks if trading should be stopped due to risk limits.

**Returns:** Object
```javascript
{
  stop: boolean,     // Whether to stop trading
  reason: string     // Reason for stopping ('max_drawdown', 'max_daily_loss', etc.)
}
```

##### `calculateVolatilityAdjustedPositionSize(symbol, currentBalance, baseRiskPerTrade, volatility)`
Calculates position size adjusted for market volatility.

**Parameters:**
- `symbol` (string): Trading symbol
- `currentBalance` (number): Current account balance
- `baseRiskPerTrade` (number): Base risk per trade (0-1)
- `volatility` (number): Market volatility measure

**Returns:** Object
```javascript
{
  positionSize: number,     // Recommended position size
  volatility: number,       // Calculated volatility
  volatilityMultiplier: number, // Volatility adjustment factor
  reasoning: Array         // Reasoning for the adjustment
}
```

##### `setPartialCloseRules(tradeId, config)`
Sets up partial position closing rules for profit-taking.

**Parameters:**
- `tradeId` (string): Unique trade identifier
- `config` (Object): Partial close configuration
  - `levels` (Array): Profit-taking levels

**Example:**
```javascript
risk.setPartialCloseRules('trade123', {
  levels: [
    { profitTarget: 0.5, closePercent: 0.5, description: '50% profit - close 50%' },
    { profitTarget: 1.0, closePercent: 0.3, description: '100% profit - close 30%' }
  ]
});
```

### Portfolio Manager

Portfolio optimization and multi-asset management.

#### Key Methods

##### `addPosition(symbol, position)`
Adds a new position to the portfolio.

**Parameters:**
- `symbol` (string): Trading symbol
- `position` (Object): Position details
  - `stake` (number): Position size
  - `prediction` (number): Predicted digit
  - `timestamp` (number): Position open timestamp

##### `getAllocation()`
Gets current portfolio allocation by symbol.

**Returns:** Object
```javascript
{
  allocation: Object,     // Symbol -> allocation percentage
  totalAllocated: number  // Total allocated capital
}
```

##### `assessPortfolioRisk()`
Performs comprehensive portfolio risk assessment.

**Returns:** Object
```javascript
{
  riskLevel: string,      // 'low', 'medium', 'high', 'extreme'
  riskScore: number,      // Numerical risk score
  issues: Array,          // Identified risk issues
  metrics: Object,        // Detailed risk metrics
  recommendations: Array  // Risk mitigation recommendations
}
```

##### `rebalancePortfolioRiskAdjusted(targetAllocations, riskConstraints)`
Rebalances portfolio with risk constraints.

**Parameters:**
- `targetAllocations` (Object): Target allocation by symbol
- `riskConstraints` (Object): Risk constraints to apply

**Returns:** Object - Rebalancing plan with adjustments

### Sentiment Analyzer

News sentiment analysis and market sentiment tracking.

#### Key Methods

##### `analyzeSentiment(text)`
Analyzes sentiment of text content.

**Parameters:**
- `text` (string): Text to analyze

**Returns:** Object
```javascript
{
  score: number,        // Sentiment score (-1 to 1)
  confidence: number,   // Analysis confidence (0-1)
  magnitude: number,    // Sentiment strength
  classification: string // 'positive', 'negative', 'neutral'
}
```

##### `analyzeNewsArticle(article, symbol)`
Analyzes a complete news article with market context.

**Parameters:**
- `article` (Object): News article data
  - `title` (string): Article title
  - `content` (string): Article content
  - `source` (string): News source
  - `publishedAt` (string): Publication timestamp
- `symbol` (string): Associated trading symbol

**Returns:** Object - Comprehensive sentiment analysis

##### `generateSentimentSignal(symbol)`
Generates trading signal based on sentiment analysis.

**Parameters:**
- `symbol` (string): Trading symbol

**Returns:** Object|null - Trading signal or null
```javascript
{
  signal: string,       // 'BUY' or 'SELL'
  strength: string,     // 'strong', 'moderate', 'weak'
  reason: string,       // Signal reasoning
  confidence: number    // Signal confidence (0-1)
}
```

### Backtest Engine

Strategy backtesting and validation.

#### Key Methods

##### `runBacktest(strategy, symbol, options)`
Runs a backtest for a specific strategy.

**Parameters:**
- `strategy` (string): Strategy to test ('frequency', 'markov', 'ensemble', etc.)
- `symbol` (string): Trading symbol
- `options` (Object): Backtest options
  - `startDate` (string): Start date for backtest
  - `endDate` (string): End date for backtest
  - `initialBalance` (number): Starting balance
  - `maxTrades` (number): Maximum trades to execute
  - `riskPerTrade` (number): Risk per trade percentage

**Returns:** Object - Backtest results with performance metrics

##### `compareStrategies(symbol, strategies, options)`
Compares multiple strategies on the same data.

**Parameters:**
- `symbol` (string): Trading symbol
- `strategies` (Array): Array of strategy names to compare
- `options` (Object): Comparison options

**Returns:** Object - Strategy comparison results

### Statistics Analyzer

Statistical analysis and pattern detection.

#### Key Methods

##### `calculateAutocorrelation(digits, lag)`
Calculates autocorrelation for digit sequences.

**Parameters:**
- `digits` (Array): Array of digits
- `lag` (number): Lag for autocorrelation

**Returns:** number - Autocorrelation coefficient (-1 to 1)

##### `detectPatterns(digits)`
Detects patterns in digit sequences.

**Parameters:**
- `digits` (Array): Array of digits

**Returns:** Object
```javascript
{
  hasPattern: boolean,   // Whether a pattern was detected
  pattern: Object,       // Pattern details
  confidence: number     // Pattern confidence (0-1)
}
```

##### `detectMarketRegime(digits, window)`
Detects current market regime (trending vs ranging).

**Parameters:**
- `digits` (Array): Array of digits
- `window` (number): Analysis window size

**Returns:** Object
```javascript
{
  regime: string,        // 'uptrend', 'downtrend', 'ranging', 'unknown'
  confidence: number,    // Regime confidence (0-1)
  slope: number,         // Trend slope
  rSquared: number,      // Trend strength (R²)
  volatility: number     // Market volatility
}
```

## Configuration

### Config Module (`config.js`)

Centralized configuration management with the following key settings:

```javascript
{
  // Trading symbols
  DEFAULT_SYMBOLS: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'],

  // Data requirements
  MIN_SAMPLES_REQUIRED: 10000,    // Minimum historical samples
  MIN_PROBABILITY_THRESHOLD: 50,  // Minimum prediction probability

  // Risk management
  RISK_PER_TRADE: 0.02,           // 2% risk per trade
  MAX_DRAWDOWN: 0.15,             // 15% max drawdown
  MAX_DAILY_LOSS: 0.08,           // 8% max daily loss

  // Trading parameters
  MAX_CONCURRENT_TRADES: 1,       // Maximum simultaneous trades
  TRADE_COOLDOWN_MS: 10000,       // 10 second cooldown between trades

  // ML settings
  DEFAULT_STRATEGY: 'ensemble',   // Default trading strategy

  // System settings
  WEB_SERVER_PORT: 3000,          // Web dashboard port
  DERIV_APP_ID: '1089'            // Deriv application ID
}
```

## Error Handling

All modules implement comprehensive error handling:

- **Network Errors**: Automatic reconnection for WebSocket failures
- **Data Errors**: Validation and fallback mechanisms for corrupted data
- **Model Errors**: Graceful degradation when ML models fail
- **Risk Errors**: Conservative fallbacks when risk calculations fail

## Performance Considerations

- **Memory Management**: Automatic cleanup of old data and caches
- **Async Operations**: Non-blocking I/O for all database and network operations
- **Caching**: In-memory caching for frequently accessed data
- **Batch Processing**: Efficient batch operations for large datasets

## Testing

The system includes comprehensive testing:

- **Unit Tests**: Individual module testing with Jest
- **Integration Tests**: End-to-end trading logic validation
- **Backtesting**: Historical strategy validation
- **Stress Testing**: Portfolio resilience testing

Run tests with:
```bash
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

## Monitoring and Logging

The system provides extensive monitoring:

- **Winston Logging**: Structured logging with multiple transports
- **Performance Metrics**: Real-time performance tracking
- **Risk Monitoring**: Continuous risk assessment
- **Web Dashboard**: Live monitoring interface

## Deployment

### Prerequisites
- Node.js 16+
- npm or yarn
- Deriv API account and token

### Installation
```bash
npm install
```

### Configuration
1. Copy `.env.example` to `.env`
2. Set your Deriv API token: `DERIV_API_TOKEN=your_token_here`
3. Configure other settings in `config.js` as needed

### Starting the Bot
```bash
npm start      # Production mode
npm run dev    # Development mode
```

### Web Dashboard
Access the web interface at `http://localhost:3000` for real-time monitoring and control.

## API Endpoints

The web dashboard provides the following API endpoints:

- `GET /status` - Bot status and performance metrics
- `POST /config` - Update bot configuration
- `POST /start` - Start trading operations
- `POST /stop` - Stop trading operations
- `POST /backtest` - Run strategy backtest
- `POST /retrain` - Retrain ML models

## Support and Maintenance

### Regular Maintenance Tasks
- **Model Retraining**: Daily ML model updates
- **Data Cleanup**: Weekly database optimization
- **Performance Review**: Monthly strategy evaluation
- **Risk Assessment**: Continuous portfolio monitoring

### Troubleshooting
- Check logs in the `logs/` directory
- Verify API token validity
- Ensure stable internet connection
- Monitor system resources

This documentation provides a comprehensive reference for developers working with or extending the Deriv Last Digit Bot system.