// Configuration constants for the Deriv Last Digit Bot
// This file centralizes all magic numbers and configuration values

module.exports = {
  // Deriv API settings
  DERIV_APP_ID: process.env.DERIV_APP_ID || '1089',
  DERIV_WEBSOCKET_URL: 'wss://ws.derivws.com/websockets/v3',

  // Trading settings - Volatility Indices (1s)
  DEFAULT_SYMBOLS: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'],
  MIN_SAMPLES_REQUIRED: 10, // Minimum samples before trading (very fast start)
  MIN_PROBABILITY_THRESHOLD: 12, // Lower threshold for testing (can be increased later)
  MAX_CONCURRENT_TRADES: 1, // Reduced for safer trading
  TRADE_COOLDOWN_MS: 10000, // Increased cooldown for safety

  // Risk management
  RISK_PER_TRADE: 0.02, // 2% risk per trade
  MAX_DRAWDOWN: 0.15, // 15% max drawdown
  MAX_DAILY_LOSS: 0.08, // 8% max daily loss
  MAX_CONSECUTIVE_LOSSES: 5,

  // ML settings
  ML_RETRAINING_INTERVAL_MS: 1800000, // 30 minutes for faster adaptation to 95%+ accuracy
  BACKTEST_INTERVAL_MS: 86400000, // Daily backtest

  // Strategy settings
  DEFAULT_STRATEGY: 'ensemble', // 'frequency', 'markov', 'neural', 'ensemble', 'time_series'
  USE_BACKTEST_VALIDATION: true,
  BACKTEST_WINDOW_TICKS: 1000, // ticks for backtest validation

  // Web server settings
  WEB_SERVER_PORT: process.env.PORT || 3000,

  // Database settings
  MAX_TICKS_PER_SYMBOL: 10000,
  DATA_RETENTION_DAYS: 30,

  // WebSocket settings
  WS_RECONNECT_DELAY_MS: 5000,
  WS_REQUEST_TIMEOUT_MS: 10000,

  // Backtesting settings
  DEFAULT_BACKTEST_TRADES: 100,
  BACKTEST_FOLDS: 5,

  // UI settings
  UI_POLL_INTERVAL_MS: 15000,
  UI_SAMPLE_MS: 1000,
  UI_DISPLAY_MS: 7000,

  // Trading parameters
  PAYOUT_MULTIPLIER: 1.8, // 80% payout on win
  KELLY_FRACTION: 0.5, // Half Kelly for conservatism
  MAX_STAKE_MULTIPLIER: 0.1, // Max 10% of balance

  // Statistical settings
  CONFIDENCE_THRESHOLD: 0.15,
  PATTERN_VALIDATION_THRESHOLD: 0.7,
  ANOMALY_ZSCORE_THRESHOLD: 3,

  // Performance tracking
  PERFORMANCE_REPORT_INTERVAL_HOURS: 4,
  DAILY_BACKTEST_HOUR: 2,
  DATABASE_CLEANUP_HOUR: 3,

  // File paths
  LOGS_DIR: 'logs',
  DATA_DIR: 'data',
  PUBLIC_DIR: 'public'
};