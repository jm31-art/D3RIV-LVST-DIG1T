const crypto = require('crypto');
const winston = require('winston');

/**
 * Security Module for Trading Bot
 *
 * Provides authentication, authorization, encryption, and security monitoring
 * to protect sensitive trading data and prevent unauthorized access.
 */
class SecurityManager {
  constructor() {
    this.sessions = new Map();
    this.failedAttempts = new Map();
    this.securityEvents = [];
    this.encryptionKey = this.generateEncryptionKey();

    // Security configuration
    this.config = {
      maxFailedAttempts: 5,
      lockoutDuration: 15 * 60 * 1000, // 15 minutes
      sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
      passwordMinLength: 12,
      requireSpecialChars: true,
      requireNumbers: true,
      enableEncryption: true
    };

    // Start security monitoring
    this.startSecurityMonitoring();
  }

  /**
   * Generate encryption key for sensitive data
   */
  generateEncryptionKey() {
    // In production, this should be loaded from environment or secure key store
    const key = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
    return crypto.scryptSync(key, 'salt', 32);
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(text) {
    if (!this.config.enableEncryption) return text;

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData) {
    if (!this.config.enableEncryption) return encryptedData;

    const { encrypted, iv, authTag } = encryptedData;

    const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Hash passwords securely
   */
  hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 64);

    return {
      hash: hash.toString('hex'),
      salt: salt.toString('hex')
    };
  }

  /**
   * Verify password against hash
   */
  verifyPassword(password, storedHash, storedSalt) {
    const hash = crypto.scryptSync(password, Buffer.from(storedSalt, 'hex'), 64);
    return crypto.timingSafeEqual(hash, Buffer.from(storedHash, 'hex'));
  }

  /**
   * Authenticate user/API key
   */
  authenticate(credentials) {
    const { apiKey, password, ip } = credentials;

    // Check for account lockout
    if (this.isAccountLocked(ip)) {
      this.logSecurityEvent('authentication_failed', {
        reason: 'account_locked',
        ip,
        attempts: this.failedAttempts.get(ip)
      });
      throw new Error('Account temporarily locked due to failed attempts');
    }

    // Validate API key format (basic validation)
    if (!apiKey || !this.isValidApiKeyFormat(apiKey)) {
      this.recordFailedAttempt(ip);
      throw new Error('Invalid API key format');
    }

    // In a real system, you'd validate against a user database
    // For now, we'll do basic validation
    const isValid = this.validateCredentials(apiKey, password);

    if (!isValid) {
      this.recordFailedAttempt(ip);
      this.logSecurityEvent('authentication_failed', {
        reason: 'invalid_credentials',
        ip
      });
      throw new Error('Invalid credentials');
    }

    // Create session
    const session = this.createSession(apiKey, ip);
    this.clearFailedAttempts(ip);

    this.logSecurityEvent('authentication_success', {
      sessionId: session.id,
      ip
    });

    return session;
  }

  /**
   * Validate API key format
   */
  isValidApiKeyFormat(apiKey) {
    // Deriv API keys are typically alphanumeric with specific patterns
    const apiKeyPattern = /^[a-zA-Z0-9]{20,}$/;
    return apiKeyPattern.test(apiKey);
  }

  /**
   * Validate credentials (placeholder - implement actual validation)
   */
  validateCredentials(apiKey, password) {
    // Placeholder validation
    // In production, validate against secure user database
    return apiKey && apiKey.length > 10;
  }

  /**
   * Create user session
   */
  createSession(apiKey, ip) {
    const session = {
      id: crypto.randomUUID(),
      apiKey: this.hashApiKey(apiKey), // Store hashed version
      ip,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      permissions: this.getPermissions(apiKey)
    };

    this.sessions.set(session.id, session);

    // Clean up expired sessions periodically
    this.cleanupExpiredSessions();

    return {
      sessionId: session.id,
      permissions: session.permissions,
      expiresAt: session.createdAt + this.config.sessionTimeout
    };
  }

  /**
   * Hash API key for storage
   */
  hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Get user permissions based on API key
   */
  getPermissions(apiKey) {
    // Placeholder permissions
    // In production, this would be role-based
    return {
      read: true,
      trade: true,
      admin: false
    };
  }

  /**
   * Authorize action based on session and permissions
   */
  authorize(sessionId, action, resource = null) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error('Invalid session');
    }

    // Check session expiry
    if (Date.now() - session.lastActivity > this.config.sessionTimeout) {
      this.sessions.delete(sessionId);
      throw new Error('Session expired');
    }

    // Update last activity
    session.lastActivity = Date.now();

    // Check permissions
    const permissions = session.permissions;

    switch (action) {
      case 'read':
        if (!permissions.read) throw new Error('Read permission denied');
        break;
      case 'trade':
        if (!permissions.trade) throw new Error('Trade permission denied');
        break;
      case 'admin':
        if (!permissions.admin) throw new Error('Admin permission denied');
        break;
      default:
        throw new Error('Unknown action');
    }

    // Log authorized action
    this.logSecurityEvent('authorization_success', {
      sessionId,
      action,
      resource
    });

    return true;
  }

  /**
   * Record failed authentication attempt
   */
  recordFailedAttempt(ip) {
    const attempts = this.failedAttempts.get(ip) || 0;
    this.failedAttempts.set(ip, attempts + 1);
  }

  /**
   * Clear failed attempts after successful login
   */
  clearFailedAttempts(ip) {
    this.failedAttempts.delete(ip);
  }

  /**
   * Check if account is locked due to failed attempts
   */
  isAccountLocked(ip) {
    const attempts = this.failedAttempts.get(ip) || 0;
    if (attempts >= this.config.maxFailedAttempts) {
      // Check if lockout period has passed
      const lastAttempt = this.getLastFailedAttemptTime(ip);
      if (Date.now() - lastAttempt < this.config.lockoutDuration) {
        return true;
      } else {
        // Lockout period expired, reset attempts
        this.failedAttempts.delete(ip);
        return false;
      }
    }
    return false;
  }

  /**
   * Get last failed attempt time (simplified)
   */
  getLastFailedAttemptTime(ip) {
    // In a real implementation, you'd store timestamps
    return Date.now() - (this.config.lockoutDuration / 2);
  }

  /**
   * Validate password strength
   */
  validatePasswordStrength(password) {
    const errors = [];

    if (password.length < this.config.passwordMinLength) {
      errors.push(`Password must be at least ${this.config.passwordMinLength} characters`);
    }

    if (this.config.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain special characters');
    }

    if (this.config.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain numbers');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitize input data to prevent injection attacks
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;

    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  /**
   * Rate limiting for API calls
   */
  checkRateLimit(identifier, action = 'api_call') {
    // Simple in-memory rate limiting
    // In production, use Redis or similar
    const key = `${identifier}_${action}`;
    const now = Date.now();
    const window = 60 * 1000; // 1 minute window
    const maxRequests = 100; // Max requests per minute

    if (!this.rateLimitCache) {
      this.rateLimitCache = new Map();
    }

    const userRequests = this.rateLimitCache.get(key) || [];
    const recentRequests = userRequests.filter(time => now - time < window);

    if (recentRequests.length >= maxRequests) {
      this.logSecurityEvent('rate_limit_exceeded', {
        identifier,
        action,
        requestCount: recentRequests.length
      });
      return false;
    }

    recentRequests.push(now);
    this.rateLimitCache.set(key, recentRequests);

    return true;
  }

  /**
   * Log security events
   */
  logSecurityEvent(eventType, details) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      details,
      severity: this.getEventSeverity(eventType)
    };

    this.securityEvents.push(event);

    // Keep only last 1000 events
    if (this.securityEvents.length > 1000) {
      this.securityEvents.shift();
    }

    // Log to Winston
    const logLevel = event.severity === 'high' ? 'error' :
                    event.severity === 'medium' ? 'warn' : 'info';

    logger[logLevel](`SECURITY EVENT: ${eventType}`, {
      ...details,
      severity: event.severity
    });

    // In production, you'd also send to SIEM system
  }

  /**
   * Get event severity
   */
  getEventSeverity(eventType) {
    const severityMap = {
      'authentication_failed': 'medium',
      'authorization_failed': 'high',
      'rate_limit_exceeded': 'low',
      'authentication_success': 'low',
      'authorization_success': 'low',
      'suspicious_activity': 'high',
      'data_breach_attempt': 'critical'
    };

    return severityMap[eventType] || 'low';
  }

  /**
   * Start security monitoring
   */
  startSecurityMonitoring() {
    // Clean up expired sessions every hour
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);

    // Clean up old failed attempts every 30 minutes
    setInterval(() => {
      this.cleanupOldFailedAttempts();
    }, 30 * 60 * 1000);

    // Security audit log every 24 hours
    setInterval(() => {
      this.generateSecurityAudit();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > this.config.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      this.sessions.delete(sessionId);
    });

    if (expiredSessions.length > 0) {
      logger.info(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * Clean up old failed attempts
   */
  cleanupOldFailedAttempts() {
    const cutoff = Date.now() - this.config.lockoutDuration;

    for (const [ip, attempts] of this.failedAttempts) {
      // Reset if lockout period has passed
      if (attempts >= this.config.maxFailedAttempts) {
        const lastAttempt = this.getLastFailedAttemptTime(ip);
        if (lastAttempt < cutoff) {
          this.failedAttempts.delete(ip);
        }
      }
    }
  }

  /**
   * Generate security audit report
   */
  generateSecurityAudit() {
    const audit = {
      timestamp: Date.now(),
      activeSessions: this.sessions.size,
      failedAttempts: Object.fromEntries(this.failedAttempts),
      recentEvents: this.securityEvents.slice(-50), // Last 50 events
      summary: {
        totalEvents: this.securityEvents.length,
        eventsByType: this.securityEvents.reduce((acc, event) => {
          acc[event.type] = (acc[event.type] || 0) + 1;
          return acc;
        }, {}),
        eventsBySeverity: this.securityEvents.reduce((acc, event) => {
          acc[event.severity] = (acc[event.severity] || 0) + 1;
          return acc;
        }, {})
      }
    };

    logger.info('SECURITY AUDIT REPORT:', audit);

    // In production, save to secure log file or send to monitoring system
  }

  /**
   * Get security status
   */
  getSecurityStatus() {
    return {
      activeSessions: this.sessions.size,
      lockedAccounts: Array.from(this.failedAttempts.entries())
        .filter(([ip, attempts]) => attempts >= this.config.maxFailedAttempts)
        .length,
      recentEvents: this.securityEvents.slice(-10),
      config: { ...this.config, encryptionKey: '[REDACTED]' }
    };
  }

  /**
   * Emergency security lockdown
   */
  emergencyLockdown(reason) {
    logger.error(`EMERGENCY SECURITY LOCKDOWN: ${reason}`);

    // Clear all sessions
    this.sessions.clear();

    // Lock all accounts temporarily
    // In production, you'd have more sophisticated lockdown procedures

    this.logSecurityEvent('emergency_lockdown', {
      reason,
      sessionsCleared: true,
      timestamp: Date.now()
    });
  }
}

module.exports = new SecurityManager();