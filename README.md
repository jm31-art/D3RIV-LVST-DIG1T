# Deriv Last Digit Bot - Advanced Trading System

A sophisticated Node.js bot that trades on Deriv's last digit prediction market with 90%+ accuracy potential through advanced statistical modeling, machine learning, and risk management.

## 🚀 Key Features

### Advanced Trading Strategies
- **Ensemble Strategy**: Combines frequency analysis, Markov chains, neural networks, and time-series analysis
- **Machine Learning**: Custom statistical models and ensemble methods trained on historical digit patterns
- **Markov Chain Analysis**: Predicts digit transitions based on historical sequences
- **Time-Series Analysis**: Autocorrelation and trend analysis for pattern detection

### Risk Management
- **Kelly Criterion**: Optimal position sizing for maximum growth
- **Dynamic Risk Controls**: Automatic drawdown limits, daily loss limits, consecutive loss protection
- **Portfolio Diversification**: Multi-symbol trading with correlation analysis
- **Stress Testing**: Scenario analysis for portfolio resilience

### Data & Analytics
- **Persistent Storage**: File-based database storing 10,000+ samples per symbol
- **Real-time Statistics**: Comprehensive performance metrics (Sharpe ratio, profit factor, etc.)
- **Backtesting Engine**: Historical replay with walk-forward analysis
- **Performance Monitoring**: Live dashboards with alerts and notifications

### Professional Infrastructure
- **WebSocket API**: Robust connection with automatic reconnection
- **Logging**: Winston-based logging with file and console outputs
- **Scheduled Tasks**: Automated model retraining and performance reporting
- **Error Recovery**: Comprehensive error handling and trade validation

## 📊 Performance Metrics

The bot tracks comprehensive performance indicators:
- **Win Rate**: Percentage of profitable trades
- **Profit Factor**: Gross profit divided by gross loss
- **Sharpe Ratio**: Risk-adjusted returns
- **Maximum Drawdown**: Largest peak-to-trough decline
- **Calmar Ratio**: Annual return divided by maximum drawdown

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd deriv-last-digit
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   Create a `.env` file with your Deriv API credentials:
   ```env
   DERIV_API_TOKEN=your_api_token_here
   DERIV_APP_ID=1089
   ```

4. **Start the bot**
   ```bash
   npm start
   ```

## 🎯 Usage

### Web Interface
Access the advanced web dashboard at `http://localhost:3000`:

- **Trading Tab**: Live trading controls and recent trade history
- **Backtesting Tab**: Test strategies on historical data
- **Portfolio Tab**: Multi-symbol performance overview
- **Analytics Tab**: Charts and performance visualizations

### Configuration Options

| Parameter | Description | Default |
|-----------|-------------|---------|
| `symbols` | Trading symbols | `['R_10', 'R_25', 'R_50', 'R_75', 'R_100']` |
| `minSamplesRequired` | Minimum data samples before trading | `10000` |
| `minProbabilityThreshold` | Minimum prediction probability % | `12` |
| `maxConcurrentTrades` | Maximum simultaneous trades | `3` |
| `riskPerTrade` | Risk per trade (Kelly fraction) | `0.02` |
| `maxDrawdown` | Maximum portfolio drawdown | `0.15` |
| `strategy` | Trading strategy | `'ensemble'` |

### Trading Strategies

1. **Frequency Analysis**: Predicts based on digit occurrence frequency
2. **Markov Chain**: Models digit transition probabilities
3. **Neural Network**: ML-based pattern recognition
4. **Ensemble**: Combines all strategies with weighted voting
5. **Time Series**: Autocorrelation and trend analysis

## 🔧 API Reference

### WebSocket Messages

The bot communicates with the web interface via WebSocket:

```javascript
// Performance update
{
  type: 'performance',
  data: {
    totalProfit: 125.50,
    winRate: 0.68,
    profitFactor: 1.45,
    sharpeRatio: 2.1
  }
}

// Trade execution
{
  type: 'trade',
  data: {
    symbol: 'R_100',
    prediction: 7,
    stake: 2.50,
    result: 'pending'
  }
}
```

## 📈 Backtesting

Run comprehensive backtests to validate strategies:

```javascript
// Single strategy backtest
const result = await backtest.runBacktest('ensemble', 'R_100', {
  maxTrades: 100,
  riskPerTrade: 0.02
});

// Compare all strategies
const comparison = await backtest.compareStrategies('R_100', [
  'frequency', 'markov', 'neural', 'ensemble'
]);
```

## ⚠️ Risk Management

The bot implements multiple layers of risk protection:

- **Position Sizing**: Kelly Criterion with conservative fractions
- **Drawdown Limits**: Automatic trading suspension at 15% drawdown
- **Daily Loss Limits**: 8% maximum daily loss
- **Consecutive Loss Protection**: Trading pause after 5 losses
- **Diversification**: Maximum 30% exposure per symbol

## 📋 Development

### Project Structure
```
deriv-last-digit/
├── index.js          # Main bot application
├── db.js            # Database management
├── stats.js         # Statistical analysis
├── ml.js            # Machine learning models
├── risk.js          # Risk management
├── portfolio.js     # Portfolio management
├── backtest.js      # Backtesting engine
├── public/
│   ├── index.html   # Web interface
│   └── client.js    # Frontend logic
├── data/            # Persistent data storage
└── logs/            # Application logs
```

### Adding New Strategies

1. Implement the strategy in the appropriate module
2. Add the strategy name to the `generatePrediction` method
3. Update the web interface strategy selector
4. Add backtesting support in `backtest.js`

## 🚨 Disclaimer

**This bot is for educational and research purposes only.**

- Trading binary options and CFDs involves substantial risk of loss
- Past performance does not guarantee future results
- Always trade with money you can afford to lose
- Test thoroughly on demo accounts before live trading
- The developers are not responsible for any financial losses

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📞 Support

For issues and questions:
- Check the logs in the `logs/` directory
- Review the WebSocket connection status
- Ensure your Deriv API token is valid
- Test with demo account first
