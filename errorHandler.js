const winston = require('winston');

/**
 * Comprehensive Error Handling Framework
 *
 * Provides structured error handling, recovery mechanisms, and monitoring
 * for the trading bot with different error types and severity levels.
 */
class ErrorHandler {
  constructor() {
    this.errorCounts = new Map();
    this.recoveryStrategies = new Map();
    this.circuitBreakers = new Map();

    this.setupRecoveryStrategies();
    this.setupCircuitBreakers();
  }

  /**
   * Handle an error with appropriate recovery strategy
   */
  async handleError(error, context = {}) {
    const errorType = this.classifyError(error);
    const severity = this.assessSeverity(error, context);

    // Log the error with structured information
    this.logError(error, errorType, severity, context);

    // Update error counts for circuit breaker
    this.updateErrorCounts(errorType);

    // Check circuit breaker
    if (this.isCircuitBreakerTripped(errorType)) {
      logger.error(`Circuit breaker tripped for ${errorType}. Entering recovery mode.`);
      return this.enterRecoveryMode(errorType);
    }

    // Attempt recovery
    const recoveryResult = await this.attemptRecovery(error, errorType, context);

    if (recoveryResult.success) {
      logger.info(`Error recovered successfully: ${errorType}`);
      return { handled: true, recovered: true };
    } else {
      logger.error(`Recovery failed for ${errorType}: ${recoveryResult.reason}`);
      return { handled: true, recovered: false, escalated: true };
    }
  }

  /**
   * Classify error type for appropriate handling
   */
  classifyError(error) {
    const message = error.message?.toLowerCase() || '';
    const code = error.code || '';

    // Network errors
    if (message.includes('timeout') || message.includes('network') || message.includes('connection')) {
      return 'network';
    }

    // API errors
    if (code === 'RateLimit' || message.includes('rate limit')) {
      return 'rate_limit';
    }
    if (code === 'InsufficientBalance' || message.includes('balance')) {
      return 'insufficient_balance';
    }
    if (code === 'AuthorizationRequired' || message.includes('auth')) {
      return 'authorization';
    }

    // Database errors
    if (message.includes('database') || message.includes('sqlite') || code.includes('SQLITE')) {
      return 'database';
    }

    // ML/Model errors
    if (message.includes('tensor') || message.includes('model') || message.includes('training')) {
      return 'ml_model';
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid')) {
      return 'validation';
    }

    // Default to unknown
    return 'unknown';
  }

  /**
   * Assess error severity
   */
  assessSeverity(error, context) {
    const errorType = this.classifyError(error);

    // Critical errors that require immediate attention
    if (errorType === 'insufficient_balance' || errorType === 'authorization') {
      return 'critical';
    }

    // High severity for trading errors
    if (context.operation === 'trade_execution' || context.operation === 'risk_check') {
      return 'high';
    }

    // Medium severity for recoverable errors
    if (errorType === 'network' || errorType === 'rate_limit') {
      return 'medium';
    }

    // Low severity for minor issues
    return 'low';
  }

  /**
   * Log error with structured information
   */
  logError(error, errorType, severity, context) {
    const logData = {
      errorType,
      severity,
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
      processInfo: {
        pid: process.pid,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      }
    };

    // Log based on severity
    switch (severity) {
      case 'critical':
        logger.error('CRITICAL ERROR:', logData);
        break;
      case 'high':
        logger.error('HIGH SEVERITY ERROR:', logData);
        break;
      case 'medium':
        logger.warn('MEDIUM SEVERITY ERROR:', logData);
        break;
      default:
        logger.info('LOW SEVERITY ERROR:', logData);
    }
  }

  /**
   * Setup recovery strategies for different error types
   */
  setupRecoveryStrategies() {
    this.recoveryStrategies.set('network', {
      strategy: 'retry',
      maxRetries: 3,
      backoffMs: 1000,
      action: async (error, context) => {
        // Attempt to reconnect to Deriv API
        if (context.bot && typeof context.bot.connect === 'function') {
          await context.bot.connect();
          return { success: true };
        }
        return { success: false, reason: 'No reconnection method available' };
      }
    });

    this.recoveryStrategies.set('rate_limit', {
      strategy: 'backoff',
      backoffMs: 60000, // 1 minute
      action: async (error, context) => {
        // Wait for rate limit to reset
        await new Promise(resolve => setTimeout(resolve, 60000));
        return { success: true };
      }
    });

    this.recoveryStrategies.set('database', {
      strategy: 'retry',
      maxRetries: 2,
      action: async (error, context) => {
        // Attempt database reconnection
        if (context.db && typeof context.db.initializeDatabase === 'function') {
          try {
            await context.db.initializeDatabase();
            return { success: true };
          } catch (dbError) {
            return { success: false, reason: `Database reconnection failed: ${dbError.message}` };
          }
        }
        return { success: false, reason: 'No database reconnection method available' };
      }
    });

    this.recoveryStrategies.set('ml_model', {
      strategy: 'fallback',
      action: async (error, context) => {
        // Fall back to statistical models
        logger.warn('ML model error, falling back to statistical prediction');
        return { success: true, fallback: 'statistical' };
      }
    });

    this.recoveryStrategies.set('authorization', {
      strategy: 'manual',
      action: async (error, context) => {
        // Stop trading and require manual intervention
        if (context.bot) {
          context.bot.tradingEnabled = false;
          logger.error('AUTHORIZATION ERROR: Trading stopped. Manual token update required.');
        }
        return { success: false, reason: 'Manual intervention required' };
      }
    });
  }

  /**
   * Setup circuit breakers to prevent cascading failures
   */
  setupCircuitBreakers() {
    this.circuitBreakers.set('network', {
      failureThreshold: 5,
      recoveryTimeoutMs: 300000, // 5 minutes
      failureCount: 0,
      lastFailureTime: 0,
      state: 'closed' // closed, open, half-open
    });

    this.circuitBreakers.set('database', {
      failureThreshold: 3,
      recoveryTimeoutMs: 60000, // 1 minute
      failureCount: 0,
      lastFailureTime: 0,
      state: 'closed'
    });

    this.circuitBreakers.set('api', {
      failureThreshold: 10,
      recoveryTimeoutMs: 120000, // 2 minutes
      failureCount: 0,
      lastFailureTime: 0,
      state: 'closed'
    });
  }

  /**
   * Attempt recovery based on error type
   */
  async attemptRecovery(error, errorType, context) {
    const strategy = this.recoveryStrategies.get(errorType);

    if (!strategy) {
      return { success: false, reason: `No recovery strategy for ${errorType}` };
    }

    try {
      const result = await strategy.action(error, context);
      return result;
    } catch (recoveryError) {
      return {
        success: false,
        reason: `Recovery action failed: ${recoveryError.message}`
      };
    }
  }

  /**
   * Update error counts for circuit breaker monitoring
   */
  updateErrorCounts(errorType) {
    const circuitBreaker = this.circuitBreakers.get(errorType);
    if (circuitBreaker) {
      circuitBreaker.failureCount++;
      circuitBreaker.lastFailureTime = Date.now();
    }
  }

  /**
   * Check if circuit breaker is tripped
   */
  isCircuitBreakerTripped(errorType) {
    const circuitBreaker = this.circuitBreakers.get(errorType);
    if (!circuitBreaker) return false;

    const now = Date.now();

    // If circuit breaker is open, check if recovery timeout has passed
    if (circuitBreaker.state === 'open') {
      if (now - circuitBreaker.lastFailureTime > circuitBreaker.recoveryTimeoutMs) {
        circuitBreaker.state = 'half-open';
        circuitBreaker.failureCount = 0;
        logger.info(`Circuit breaker for ${errorType} entering half-open state`);
        return false;
      }
      return true;
    }

    // Check if failure threshold is exceeded
    if (circuitBreaker.failureCount >= circuitBreaker.failureThreshold) {
      circuitBreaker.state = 'open';
      logger.error(`Circuit breaker tripped for ${errorType} (${circuitBreaker.failureCount} failures)`);
      return true;
    }

    return false;
  }

  /**
   * Enter recovery mode when circuit breaker is tripped
   */
  enterRecoveryMode(errorType) {
    logger.warn(`Entering recovery mode for ${errorType}`);

    // Implement recovery mode logic
    switch (errorType) {
      case 'network':
        // Reduce trading frequency, use cached data
        return { handled: true, recoveryMode: true, actions: ['reduce_frequency', 'use_cache'] };

      case 'database':
        // Switch to in-memory storage temporarily
        return { handled: true, recoveryMode: true, actions: ['memory_fallback', 'reduce_logging'] };

      case 'api':
        // Stop trading temporarily
        return { handled: true, recoveryMode: true, actions: ['stop_trading', 'notify_admin'] };

      default:
        return { handled: true, recoveryMode: true, actions: ['log_only'] };
    }
  }

  /**
   * Create error boundary wrapper for functions
   */
  createErrorBoundary(operationName) {
    return async (fn, context = {}) => {
      try {
        return await fn();
      } catch (error) {
        const result = await this.handleError(error, {
          operation: operationName,
          ...context
        });

        if (!result.recovered) {
          throw error; // Re-throw if recovery failed
        }

        return null; // Return null for recovered errors
      }
    };
  }

  /**
   * Get error statistics for monitoring
   */
  getErrorStats() {
    const stats = {};

    for (const [errorType, circuitBreaker] of this.circuitBreakers) {
      stats[errorType] = {
        failureCount: circuitBreaker.failureCount,
        state: circuitBreaker.state,
        lastFailureTime: circuitBreaker.lastFailureTime
      };
    }

    return stats;
  }

  /**
   * Reset circuit breaker (for manual recovery)
   */
  resetCircuitBreaker(errorType) {
    const circuitBreaker = this.circuitBreakers.get(errorType);
    if (circuitBreaker) {
      circuitBreaker.failureCount = 0;
      circuitBreaker.state = 'closed';
      circuitBreaker.lastFailureTime = 0;
      logger.info(`Circuit breaker reset for ${errorType}`);
    }
  }
}

module.exports = new ErrorHandler();