const db = require('./db');
const winston = require('winston');

/**
 * Comprehensive Performance Monitoring System
 *
 * Tracks real-time performance metrics, validates trading effectiveness,
 * and provides alerts for performance degradation or exceptional results.
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      session: {
        startTime: Date.now(),
        trades: 0,
        wins: 0,
        losses: 0,
        totalProfit: 0,
        totalFees: 0,
        peakBalance: 0,
        currentDrawdown: 0
      },
      rolling: {
        last24h: { trades: 0, profit: 0, winRate: 0 },
        last7d: { trades: 0, profit: 0, winRate: 0 },
        last30d: { trades: 0, profit: 0, winRate: 0 }
      },
      alerts: {
        enabled: true,
        thresholds: {
          maxDrawdown: 0.15,      // 15% max drawdown
          minWinRate: 0.35,       // 35% minimum win rate
          maxConsecutiveLosses: 5, // Max 5 consecutive losses
          performanceDrop: 0.20   // 20% performance drop alert
        }
      }
    };

    this.performanceHistory = [];
    this.alertHistory = [];
    this.baselineMetrics = null; // Established after initial period

    // Start monitoring
    this.startPeriodicMonitoring();
  }

  /**
   * Record a completed trade for performance tracking
   */
  recordTrade(trade) {
    this.metrics.session.trades++;
    this.metrics.session.totalProfit += trade.netProfit || trade.profit || 0;
    this.metrics.session.totalFees += trade.fees || 0;

    if (trade.result === 'won') {
      this.metrics.session.wins++;
    } else {
      this.metrics.session.losses++;
    }

    // Update rolling metrics
    this.updateRollingMetrics(trade);

    // Check for alerts
    this.checkPerformanceAlerts();

    // Store in database
    this.persistTradeMetrics(trade);

    // Update baseline after sufficient data
    if (this.metrics.session.trades >= 50 && !this.baselineMetrics) {
      this.establishBaselineMetrics();
    }
  }

  /**
   * Update rolling performance metrics
   */
  updateRollingMetrics(trade) {
    const now = Date.now();
    const tradeTime = trade.timestamp || now;

    // Update 24h rolling metrics
    if (now - tradeTime < 24 * 60 * 60 * 1000) {
      this.metrics.rolling.last24h.trades++;
      this.metrics.rolling.last24h.profit += trade.netProfit || trade.profit || 0;
      this.updateWinRate(this.metrics.rolling.last24h);
    }

    // Update 7d rolling metrics
    if (now - tradeTime < 7 * 24 * 60 * 60 * 1000) {
      this.metrics.rolling.last7d.trades++;
      this.metrics.rolling.last7d.profit += trade.netProfit || trade.profit || 0;
      this.updateWinRate(this.metrics.rolling.last7d);
    }

    // Update 30d rolling metrics
    if (now - tradeTime < 30 * 24 * 60 * 60 * 1000) {
      this.metrics.rolling.last30d.trades++;
      this.metrics.rolling.last30d.profit += trade.netProfit || trade.profit || 0;
      this.updateWinRate(this.metrics.rolling.last30d);
    }
  }

  /**
   * Update win rate for rolling metrics
   */
  updateWinRate(metrics) {
    if (metrics.trades > 0) {
      // Estimate win rate based on profit (simplified)
      // In practice, you'd track wins/losses separately
      metrics.winRate = metrics.profit > 0 ? 0.6 : 0.4; // Placeholder
    }
  }

  /**
   * Check for performance alerts
   */
  checkPerformanceAlerts() {
    const alerts = [];

    // Drawdown alert
    const currentDrawdown = this.calculateCurrentDrawdown();
    if (currentDrawdown > this.metrics.alerts.thresholds.maxDrawdown) {
      alerts.push({
        type: 'drawdown',
        severity: 'high',
        message: `Drawdown exceeded threshold: ${(currentDrawdown * 100).toFixed(1)}% > ${(this.metrics.alerts.thresholds.maxDrawdown * 100).toFixed(1)}%`,
        value: currentDrawdown
      });
    }

    // Win rate alert
    const sessionWinRate = this.metrics.session.trades > 0 ?
      this.metrics.session.wins / this.metrics.session.trades : 0;

    if (this.metrics.session.trades >= 10 && sessionWinRate < this.metrics.alerts.thresholds.minWinRate) {
      alerts.push({
        type: 'win_rate',
        severity: 'medium',
        message: `Win rate below threshold: ${(sessionWinRate * 100).toFixed(1)}% < ${(this.metrics.alerts.thresholds.minWinRate * 100).toFixed(1)}%`,
        value: sessionWinRate
      });
    }

    // Consecutive losses alert
    const consecutiveLosses = this.getConsecutiveLosses();
    if (consecutiveLosses >= this.metrics.alerts.thresholds.maxConsecutiveLosses) {
      alerts.push({
        type: 'consecutive_losses',
        severity: 'high',
        message: `Consecutive losses: ${consecutiveLosses} >= ${this.metrics.alerts.thresholds.maxConsecutiveLosses}`,
        value: consecutiveLosses
      });
    }

    // Performance drop alert (compared to baseline)
    if (this.baselineMetrics) {
      const performanceDrop = this.calculatePerformanceDrop();
      if (performanceDrop > this.metrics.alerts.thresholds.performanceDrop) {
        alerts.push({
          type: 'performance_drop',
          severity: 'medium',
          message: `Performance dropped ${(performanceDrop * 100).toFixed(1)}% from baseline`,
          value: performanceDrop
        });
      }
    }

    // Trigger alerts
    alerts.forEach(alert => this.triggerAlert(alert));
  }

  /**
   * Calculate current drawdown
   */
  calculateCurrentDrawdown() {
    // Simplified drawdown calculation
    // In practice, you'd track balance over time
    const currentBalance = 1000 + this.metrics.session.totalProfit; // Assuming $1000 starting balance
    this.metrics.session.peakBalance = Math.max(this.metrics.session.peakBalance, currentBalance);

    if (this.metrics.session.peakBalance > 0) {
      return (this.metrics.session.peakBalance - currentBalance) / this.metrics.session.peakBalance;
    }

    return 0;
  }

  /**
   * Get consecutive losses count
   */
  getConsecutiveLosses() {
    // Simplified - in practice you'd track the last N trades
    // This is a placeholder implementation
    return 0;
  }

  /**
   * Calculate performance drop from baseline
   */
  calculatePerformanceDrop() {
    if (!this.baselineMetrics) return 0;

    const currentProfitPerTrade = this.metrics.session.trades > 0 ?
      this.metrics.session.totalProfit / this.metrics.session.trades : 0;

    const baselineProfitPerTrade = this.baselineMetrics.profitPerTrade;

    if (baselineProfitPerTrade > 0) {
      return Math.max(0, (baselineProfitPerTrade - currentProfitPerTrade) / baselineProfitPerTrade);
    }

    return 0;
  }

  /**
   * Establish baseline metrics after initial trading period
   */
  establishBaselineMetrics() {
    this.baselineMetrics = {
      trades: this.metrics.session.trades,
      winRate: this.metrics.session.wins / this.metrics.session.trades,
      profitPerTrade: this.metrics.session.totalProfit / this.metrics.session.trades,
      establishedAt: Date.now()
    };

    logger.info('Performance baseline established:', this.baselineMetrics);
  }

  /**
   * Trigger performance alert
   */
  triggerAlert(alert) {
    const alertRecord = {
      ...alert,
      timestamp: Date.now(),
      sessionTrades: this.metrics.session.trades,
      sessionProfit: this.metrics.session.totalProfit
    };

    this.alertHistory.push(alertRecord);

    // Log alert
    const logLevel = alert.severity === 'high' ? 'error' : 'warn';
    logger[logLevel](`PERFORMANCE ALERT: ${alert.message}`);

    // In a real system, you'd send notifications, emails, etc.
    this.sendAlertNotification(alertRecord);
  }

  /**
   * Send alert notification (placeholder)
   */
  sendAlertNotification(alert) {
    // Placeholder for notification system
    // Could integrate with email, SMS, Slack, etc.
    console.log('Alert notification:', alert);
  }

  /**
   * Persist trade metrics to database
   */
  async persistTradeMetrics(trade) {
    try {
      await db.insertPerformance(
        trade.timestamp,
        this.metrics.session.totalProfit,
        this.getCurrentWinRate(),
        this.calculateCurrentDrawdown(),
        0, // Sharpe ratio placeholder
        this.metrics.session.trades
      );
    } catch (error) {
      logger.error('Failed to persist performance metrics:', error);
    }
  }

  /**
   * Get current win rate
   */
  getCurrentWinRate() {
    return this.metrics.session.trades > 0 ?
      this.metrics.session.wins / this.metrics.session.trades : 0;
  }

  /**
   * Start periodic monitoring and reporting
   */
  startPeriodicMonitoring() {
    // Hourly performance summary
    setInterval(() => {
      this.generatePerformanceReport('hourly');
    }, 60 * 60 * 1000); // 1 hour

    // Daily performance summary
    setInterval(() => {
      this.generatePerformanceReport('daily');
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Weekly performance summary
    setInterval(() => {
      this.generatePerformanceReport('weekly');
    }, 7 * 24 * 60 * 60 * 1000); // 7 days
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(period) {
    const report = {
      period,
      timestamp: Date.now(),
      session: { ...this.metrics.session },
      rolling: { ...this.metrics.rolling },
      alertsTriggered: this.alertHistory.length,
      recentAlerts: this.alertHistory.slice(-5) // Last 5 alerts
    };

    // Calculate period-specific metrics
    switch (period) {
      case 'hourly':
        report.metrics = this.calculateHourlyMetrics();
        break;
      case 'daily':
        report.metrics = this.calculateDailyMetrics();
        break;
      case 'weekly':
        report.metrics = this.calculateWeeklyMetrics();
        break;
    }

    logger.info(`${period.toUpperCase()} PERFORMANCE REPORT:`, report);

    // Store report
    this.performanceHistory.push(report);

    // Keep only last 100 reports
    if (this.performanceHistory.length > 100) {
      this.performanceHistory.shift();
    }

    return report;
  }

  /**
   * Calculate hourly metrics
   */
  calculateHourlyMetrics() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    // Get trades from last hour (simplified)
    const recentTrades = this.performanceHistory
      .filter(r => r.timestamp > oneHourAgo)
      .reduce((acc, r) => acc + (r.session.trades || 0), 0);

    return {
      trades: recentTrades,
      profit: this.metrics.session.totalProfit,
      winRate: this.getCurrentWinRate(),
      alerts: this.alertHistory.filter(a => a.timestamp > oneHourAgo).length
    };
  }

  /**
   * Calculate daily metrics
   */
  calculateDailyMetrics() {
    return {
      ...this.metrics.rolling.last24h,
      alerts: this.alertHistory.filter(a => a.timestamp > Date.now() - (24 * 60 * 60 * 1000)).length,
      drawdown: this.calculateCurrentDrawdown(),
      totalFees: this.metrics.session.totalFees
    };
  }

  /**
   * Calculate weekly metrics
   */
  calculateWeeklyMetrics() {
    return {
      ...this.metrics.rolling.last7d,
      alerts: this.alertHistory.filter(a => a.timestamp > Date.now() - (7 * 24 * 60 * 60 * 1000)).length,
      baselineComparison: this.baselineMetrics ? this.compareToBaseline() : null,
      consistency: this.calculateConsistencyMetrics()
    };
  }

  /**
   * Compare current performance to baseline
   */
  compareToBaseline() {
    if (!this.baselineMetrics) return null;

    const current = {
      winRate: this.getCurrentWinRate(),
      profitPerTrade: this.metrics.session.trades > 0 ?
        this.metrics.session.totalProfit / this.metrics.session.trades : 0
    };

    return {
      winRateChange: current.winRate - this.baselineMetrics.winRate,
      profitChange: current.profitPerTrade - this.baselineMetrics.profitPerTrade,
      tradesSinceBaseline: this.metrics.session.trades - this.baselineMetrics.trades
    };
  }

  /**
   * Calculate consistency metrics
   */
  calculateConsistencyMetrics() {
    if (this.performanceHistory.length < 7) return null;

    const recentReports = this.performanceHistory.slice(-7);
    const profits = recentReports.map(r => r.session.totalProfit);

    const mean = profits.reduce((a, b) => a + b, 0) / profits.length;
    const variance = profits.reduce((acc, p) => acc + Math.pow(p - mean, 2), 0) / profits.length;
    const stdDev = Math.sqrt(variance);

    return {
      profitMean: mean,
      profitStdDev: stdDev,
      coefficientOfVariation: mean !== 0 ? stdDev / Math.abs(mean) : 0,
      consistency: stdDev / Math.abs(mean || 1) < 0.5 ? 'consistent' : 'volatile'
    };
  }

  /**
   * Get comprehensive performance summary
   */
  getPerformanceSummary() {
    return {
      session: this.metrics.session,
      rolling: this.metrics.rolling,
      baseline: this.baselineMetrics,
      alerts: {
        total: this.alertHistory.length,
        recent: this.alertHistory.slice(-10),
        byType: this.groupAlertsByType()
      },
      consistency: this.calculateConsistencyMetrics(),
      health: this.assessSystemHealth()
    };
  }

  /**
   * Group alerts by type
   */
  groupAlertsByType() {
    return this.alertHistory.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Assess overall system health
   */
  assessSystemHealth() {
    const health = {
      score: 100, // Start with perfect health
      issues: [],
      recommendations: []
    };

    // Check drawdown
    const drawdown = this.calculateCurrentDrawdown();
    if (drawdown > 0.10) {
      health.score -= 20;
      health.issues.push('High drawdown');
      health.recommendations.push('Consider reducing position sizes');
    }

    // Check win rate
    const winRate = this.getCurrentWinRate();
    if (this.metrics.session.trades > 20 && winRate < 0.40) {
      health.score -= 15;
      health.issues.push('Low win rate');
      health.recommendations.push('Review trading strategy');
    }

    // Check alert frequency
    const recentAlerts = this.alertHistory.filter(a => a.timestamp > Date.now() - (24 * 60 * 60 * 1000)).length;
    if (recentAlerts > 5) {
      health.score -= 10;
      health.issues.push('Frequent alerts');
      health.recommendations.push('Investigate performance issues');
    }

    // Check consistency
    const consistency = this.calculateConsistencyMetrics();
    if (consistency && consistency.consistency === 'volatile') {
      health.score -= 10;
      health.issues.push('Volatile performance');
      health.recommendations.push('Focus on consistency over returns');
    }

    health.score = Math.max(0, health.score);
    health.status = health.score >= 80 ? 'healthy' :
                   health.score >= 60 ? 'warning' : 'critical';

    return health;
  }

  /**
   * Reset session metrics (for testing or new sessions)
   */
  resetSession() {
    this.metrics.session = {
      startTime: Date.now(),
      trades: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      totalFees: 0,
      peakBalance: 0,
      currentDrawdown: 0
    };

    logger.info('Performance monitoring session reset');
  }
}

module.exports = new PerformanceMonitor();