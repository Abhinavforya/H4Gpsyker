/**
 * memory.js
 * Tracks user interactions and preferences to continuously adapt the agent.
 * Updates taste model based on what the user engages with.
 */

class Memory {
  constructor() {
    this.logs = this.loadFromStorage() || [];
    this.sessionStart = Date.now();
  }

  /**
   * Log user interaction
   */
  logInteraction(event, data = {}) {
    const entry = {
      timestamp: Date.now(),
      event,
      data,
    };
    this.logs.push(entry);
    this.saveToStorage();
    return entry;
  }

  /**
   * Log when user renders with a specific mode
   */
  logModeUsage(mode, duration = 0) {
    this.logInteraction('modeUsed', {
      mode,
      duration, // milliseconds spent on this mode
    });
  }

  /**
   * Log when user exports/saves a visual
   */
  logExport(mode, metadata = {}) {
    this.logInteraction('visualExported', {
      mode,
      ...metadata,
    });
  }

  /**
   * Log color scheme preference
   */
  logColorSchemeUsage(scheme, mode = null) {
    this.logInteraction('colorSchemeUsed', {
      scheme,
      mode,
    });
  }

  /**
   * Get mode usage statistics
   */
  getModeStatistics() {
    const modeMap = {};

    this.logs
      .filter(log => log.event === 'modeUsed')
      .forEach(log => {
        const mode = log.data.mode;
        if (!modeMap[mode]) {
          modeMap[mode] = { count: 0, totalDuration: 0 };
        }
        modeMap[mode].count += 1;
        modeMap[mode].totalDuration += log.data.duration || 0;
      });

    return modeMap;
  }

  /**
   * Get most preferred mode
   */
  getPreferredMode() {
    const stats = this.getModeStatistics();
    if (Object.keys(stats).length === 0) return null;

    return Object.entries(stats).reduce((best, [mode, stats]) => {
      if (!best || stats.totalDuration > best.duration) {
        return { mode, duration: stats.totalDuration, count: stats.count };
      }
      return best;
    }, null);
  }

  /**
   * Get color scheme preferences
   */
  getColorSchemeStatistics() {
    const schemeMap = {};

    this.logs
      .filter(log => log.event === 'colorSchemeUsed')
      .forEach(log => {
        const scheme = log.data.scheme;
        schemeMap[scheme] = (schemeMap[scheme] || 0) + 1;
      });

    return schemeMap;
  }

  /**
   * Get export statistics
   */
  getExportStatistics() {
    const exports = this.logs.filter(log => log.event === 'visualExported');
    return {
      totalExports: exports.length,
      byMode: exports.reduce((acc, exp) => {
        const mode = exp.data.mode;
        acc[mode] = (acc[mode] || 0) + 1;
        return acc;
      }, {}),
    };
  }

  /**
   * Get total engagement time in session
   */
  getEngagementTime() {
    return Date.now() - this.sessionStart;
  }

  /**
   * Clear all logs (reset memory)
   */
  clearLogs() {
    this.logs = [];
    localStorage.removeItem('userMemoryLogs');
  }

  /**
   * Save logs to storage
   */
  saveToStorage() {
    try {
      localStorage.setItem('userMemoryLogs', JSON.stringify(this.logs));
    } catch (e) {
      console.error('Failed to save memory logs:', e);
    }
  }

  /**
   * Load logs from storage
   */
  loadFromStorage() {
    try {
      const stored = localStorage.getItem('userMemoryLogs');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.error('Failed to load memory logs:', e);
      return null;
    }
  }

  /**
   * Generate memory summary for agent adaptation
   */
  getSummary() {
    return {
      totalInteractions: this.logs.length,
      modeStats: this.getModeStatistics(),
      preferredMode: this.getPreferredMode(),
      colorSchemes: this.getColorSchemeStatistics(),
      exports: this.getExportStatistics(),
      engagementTime: this.getEngagementTime(),
    };
  }

  /**
   * Get logs from the last N hours
   */
  getRecentLogs(hoursAgo = 24) {
    const cutoff = Date.now() - hoursAgo * 60 * 60 * 1000;
    return this.logs.filter(log => log.timestamp > cutoff);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Memory;
}
