// Configuration constants for the Deriv Last Digit Bot
// This file centralizes all magic numbers and configuration values

module.exports = {
  // Deriv API settings
  DERIV_APP_ID: process.env.DERIV_APP_ID || '1089',
  DERIV_WEBSOCKET_URL: 'wss://ws.derivws.com/websockets/v3',

  // Demo account settings
  DEMO_API_TOKEN: process.env.DEMO_API_TOKEN || '',
  LIVE_API_TOKEN: process.env.LIVE_API_TOKEN || '',

  // Trading settings - Volatility Indices (1s)
  DEFAULT_SYMBOLS: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'], // 10, 25, 50, 75, 100 index (1s)
  MIN_SAMPLES_REQUIRED: 10000, // Minimum 10K samples for statistical significance (p < 0.05)
  MIN_PROBABILITY_THRESHOLD: 55, // 55% minimum probability for edge (above random 50%)
  MAX_CONCURRENT_TRADES: 1, // Reduced for safer trading
  TRADE_COOLDOWN_MS: 10000, // Increased cooldown for safety

  // Risk management - More permissive for opportunities
  RISK_PER_TRADE: 0.05, // 5% risk per trade (increased for more opportunities)
  MAX_DRAWDOWN: 0.25, // 25% max drawdown (more tolerance)
  MAX_DAILY_LOSS: 0.15, // 15% max daily loss (more tolerance)
  MAX_CONSECUTIVE_LOSSES: 8, // Allow more losses before stopping

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

  // Loss cooldown settings
  LOSS_COOLDOWN_MS: 30000, // 30 seconds cooldown after a loss

  // Stop-loss settings
  STOP_LOSS_ENABLED: true,
  MAX_CONSECUTIVE_LOSSES_STOP: 5, // Stop trading after 5 consecutive losses
  MAX_DAILY_LOSS_STOP: 0.10, // Stop trading after 10% daily loss

  // Execution delay settings
  EXECUTION_DELAY_ENABLED: true,
  EXECUTION_DELAY_MS: 500, // 500ms delay before execution to avoid bad ticks

  // Martingale settings
  MARTINGALE_ENABLED: false, // Disabled by default for safety
  MARTINGALE_MULTIPLIER: 2.0, // Double stake after loss
  MARTINGALE_MAX_LEVELS: 3, // Maximum 3 levels of martingale

  // Simulation settings
  SIMULATION_MODE: false, // Enable simulation mode
  SIMULATION_BALANCE: 1000, // Starting balance for simulation

  // Rate limiting settings
  RATE_LIMIT_ENABLED: true,
  MAX_REQUESTS_PER_MINUTE: 30, // Deriv API rate limit
  MAX_REQUESTS_PER_HOUR: 100,

  // Retry settings
  RETRY_ENABLED: true,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000, // Base delay between retries

  // Backtesting settings
  DEFAULT_BACKTEST_TRADES: 100,
  BACKTEST_FOLDS: 5,

  // UI settings
  UI_POLL_INTERVAL_MS: 15000,
  UI_SAMPLE_MS: 1000,
  UI_DISPLAY_MS: 7000,

  // Trading parameters
  PAYOUT_MULTIPLIER: 9.0, // 9x payout for DIGITMATCH (when digit matches exactly)
  KELLY_FRACTION: 0.5, // Half Kelly for conservatism
  MAX_STAKE_MULTIPLIER: 0.1, // Max 10% of balance
  MAX_STAKE: 100.0, // Maximum stake amount in USD

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