/**
 * NotificationState - Manages all notification tracking state
 * Replaces module-level state from handlers/notifications.ts with a proper class-based approach
 *
 * This class encapsulates all notification-related state including:
 * - Threshold notifications (premium and usage-based)
 * - Spending notifications
 * - Unpaid invoice notifications
 * - Smart usage monitoring state
 */

import { log } from '../utils/logger';

/**
 * Smart usage monitor state data structure
 */
export interface SmartUsageMonitorData {
  /** Timestamp of the last check */
  lastCheckTime: number;
  /** Usage percentage value from the last check */
  lastUsageValue: number;
  /** Total number of checks performed */
  checkCount: number;
  /** Timestamp of the last notification */
  lastNotificationTime: number;
}

/**
 * Initial state for smart usage monitor
 */
const INITIAL_SMART_USAGE_MONITOR_DATA: SmartUsageMonitorData = {
  lastCheckTime: 0,
  lastUsageValue: 0,
  checkCount: 0,
  lastNotificationTime: 0,
};

/**
 * NotificationState manages all notification tracking state
 * Provides thread-safe state management for preventing duplicate notifications
 */
export class NotificationState {
  /** Set of premium request thresholds that have been notified */
  private notifiedPremiumThresholds: Set<number>;

  /** Set of usage-based thresholds that have been notified */
  private notifiedUsageBasedThresholds: Set<number>;

  /** Set of spending multiples that have been notified */
  private notifiedSpendingThresholds: Set<number>;

  /** Flag indicating if a notification is currently being shown */
  private isNotificationInProgress: boolean;

  /** Flag indicating if unpaid invoice notification was shown this session */
  private unpaidInvoiceNotifiedThisSession: boolean;

  /** Flag for spending check initial run (to prime threshold tracking) */
  private isSpendingCheckInitialRun: boolean;

  /** Smart usage monitor state data */
  private smartUsageMonitorData: SmartUsageMonitorData;

  constructor() {
    this.notifiedPremiumThresholds = new Set<number>();
    this.notifiedUsageBasedThresholds = new Set<number>();
    this.notifiedSpendingThresholds = new Set<number>();
    this.isNotificationInProgress = false;
    this.unpaidInvoiceNotifiedThisSession = false;
    this.isSpendingCheckInitialRun = true;
    this.smartUsageMonitorData = { ...INITIAL_SMART_USAGE_MONITOR_DATA };
  }

  /**
   * Get the set of notified premium thresholds
   */
  get getNotifiedPremiumThresholds(): Set<number> {
    return this.notifiedPremiumThresholds;
  }

  /**
   * Get the set of notified usage-based thresholds
   */
  get getNotifiedUsageBasedThresholds(): Set<number> {
    return this.notifiedUsageBasedThresholds;
  }

  /**
   * Get the set of notified spending thresholds
   */
  get getNotifiedSpendingThresholds(): Set<number> {
    return this.notifiedSpendingThresholds;
  }

  /**
   * Check if a notification is currently in progress
   */
  get getIsNotificationInProgress(): boolean {
    return this.isNotificationInProgress;
  }

  /**
   * Check if unpaid invoice was notified this session
   */
  get getUnpaidInvoiceNotified(): boolean {
    return this.unpaidInvoiceNotifiedThisSession;
  }

  /**
   * Check if this is the initial run for spending checks
   */
  get getIsSpendingCheckInitialRun(): boolean {
    return this.isSpendingCheckInitialRun;
  }

  /**
   * Get the smart usage monitor data
   */
  get getSmartUsageMonitorData(): SmartUsageMonitorData {
    return this.smartUsageMonitorData;
  }

  /**
   * Check if a specific premium threshold has been notified
   * @param threshold - The threshold to check
   */
  hasPremiumThresholdBeenNotified(threshold: number): boolean {
    return this.notifiedPremiumThresholds.has(threshold);
  }

  /**
   * Mark a premium threshold as notified
   * @param threshold - The threshold to mark
   */
  markPremiumThresholdAsNotified(threshold: number): void {
    this.notifiedPremiumThresholds.add(threshold);
  }

  /**
   * Clear a premium threshold notification
   * @param threshold - The threshold to clear
   */
  clearPremiumThreshold(threshold: number): void {
    this.notifiedPremiumThresholds.delete(threshold);
  }

  /**
   * Check if a specific usage-based threshold has been notified
   * @param threshold - The threshold to check
   */
  hasUsageBasedThresholdBeenNotified(threshold: number): boolean {
    return this.notifiedUsageBasedThresholds.has(threshold);
  }

  /**
   * Mark a usage-based threshold as notified
   * @param threshold - The threshold to mark
   */
  markUsageBasedThresholdAsNotified(threshold: number): void {
    this.notifiedUsageBasedThresholds.add(threshold);
  }

  /**
   * Clear a usage-based threshold notification
   * @param threshold - The threshold to clear
   */
  clearUsageBasedThreshold(threshold: number): void {
    this.notifiedUsageBasedThresholds.delete(threshold);
  }

  /**
   * Check if a specific spending multiple has been notified
   * @param multiple - The spending multiple to check
   */
  hasSpendingThresholdBeenNotified(multiple: number): boolean {
    return this.notifiedSpendingThresholds.has(multiple);
  }

  /**
   * Mark a spending threshold multiple as notified
   * @param multiple - The spending multiple to mark
   */
  markSpendingThresholdAsNotified(multiple: number): void {
    this.notifiedSpendingThresholds.add(multiple);
  }

  /**
   * Get the last notified spending multiple
   */
  getLastNotifiedSpendingMultiple(): number {
    if (this.notifiedSpendingThresholds.size === 0) {
      return 0;
    }
    return Math.max(0, ...Array.from(this.notifiedSpendingThresholds));
  }

  /**
   * Begin a notification operation
   * Returns false if a notification is already in progress
   */
  beginNotification(): boolean {
    if (this.isNotificationInProgress) {
      return false;
    }
    this.isNotificationInProgress = true;
    return true;
  }

  /**
   * End a notification operation
   */
  endNotification(): void {
    this.isNotificationInProgress = false;
  }

  /**
   * Mark unpaid invoice as notified for this session
   */
  markUnpaidInvoiceAsNotified(): void {
    this.unpaidInvoiceNotifiedThisSession = true;
  }

  /**
   * Clear the spending check initial run flag
   * Call this after priming the spending thresholds
   */
  clearSpendingCheckInitialRun(): void {
    this.isSpendingCheckInitialRun = false;
  }

  /**
   * Get the next spending multiple to check
   */
  getNextSpendingMultiple(): number {
    const lastNotified = this.getLastNotifiedSpendingMultiple();
    return lastNotified + 1;
  }

  /**
   * Reset all notification state
   * Call this when extension is activated or configuration changes
   */
  reset(): void {
    this.notifiedPremiumThresholds.clear();
    this.notifiedUsageBasedThresholds.clear();
    this.notifiedSpendingThresholds.clear();
    this.isNotificationInProgress = false;
    this.unpaidInvoiceNotifiedThisSession = false;
    this.isSpendingCheckInitialRun = true;
    this.smartUsageMonitorData = { ...INITIAL_SMART_USAGE_MONITOR_DATA };
    log('[NotificationState] Reset all notification tracking');
  }

  // Smart usage monitor state management

  /**
   * Increment the smart usage monitor check count
   */
  incrementSmartUsageMonitorCheckCount(): number {
    this.smartUsageMonitorData.checkCount++;
    return this.smartUsageMonitorData.checkCount;
  }

  /**
   * Get the current smart usage monitor check count
   */
  getSmartUsageMonitorCheckCount(): number {
    return this.smartUsageMonitorData.checkCount;
  }

  /**
   * Update smart usage monitor data after a check
   * @param usagePercent - Current usage percentage
   * @param timestamp - Timestamp of the check
   */
  updateSmartUsageMonitorData(usagePercent: number, timestamp: number): void {
    this.smartUsageMonitorData.lastCheckTime = timestamp;
    this.smartUsageMonitorData.lastUsageValue = usagePercent;
  }

  /**
   * Check if enough time has passed since last notification to show another
   * @param currentTime - Current timestamp
   * @param cooldownMinutes - Minimum minutes between notifications (default: 10)
   */
  canShowSmartUsageNotification(currentTime: number, cooldownMinutes: number = 10): boolean {
    const timeSinceLastNotification = currentTime - this.smartUsageMonitorData.lastNotificationTime;
    return timeSinceLastNotification > cooldownMinutes * 60 * 1000;
  }

  /**
   * Record that a smart usage notification was shown
   * @param timestamp - Timestamp when notification was shown
   */
  recordSmartUsageNotification(timestamp: number): void {
    this.smartUsageMonitorData.lastNotificationTime = timestamp;
  }

  /**
   * Reset smart usage monitor state
   */
  resetSmartUsageMonitor(): void {
    this.smartUsageMonitorData = { ...INITIAL_SMART_USAGE_MONITOR_DATA };
    log('[NotificationState] Reset smart usage monitor state');
  }
}

/**
 * Factory function to create a new NotificationState instance
 * @returns A new NotificationState instance
 */
export function createNotificationState(): NotificationState {
  return new NotificationState();
}

/**
 * Singleton instance for backward compatibility with existing code
 * This can be removed once all code is refactored to use dependency injection
 */
let globalNotificationState: NotificationState | null = null;

/**
 * Get the global notification state instance
 * Creates one if it doesn't exist
 */
export function getGlobalNotificationState(): NotificationState {
  if (!globalNotificationState) {
    globalNotificationState = createNotificationState();
  }
  return globalNotificationState;
}

/**
 * Reset the global notification state
 */
export function resetGlobalNotificationState(): void {
  if (globalNotificationState) {
    globalNotificationState.reset();
  } else {
    globalNotificationState = createNotificationState();
  }
}
