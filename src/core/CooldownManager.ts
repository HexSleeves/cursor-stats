/**
 * CooldownManager - Manages error cooldown state for the status bar
 * Replaces module-level state from cooldown.ts with a proper class-based approach
 *
 * This class encapsulates all cooldown-related state and provides methods to:
 * - Track consecutive API errors
 * - Manage cooldown periods after repeated failures
 * - Update the status bar with countdown during cooldown
 * - Handle window focus changes for polling control
 */

import * as vscode from 'vscode';
import { COOLDOWN_DEFAULTS } from '../constants/defaults';
import { log } from '../utils/logger';
import { t } from '../utils/i18n';

/**
 * Callback function type for stats refresh
 */
export type RefreshCallback = () => void | Promise<void>;

/**
 * CooldownManager manages error cooldown state and status bar updates
 * during API failure periods
 */
export class CooldownManager {
  /** Countdown update interval timer */
  private countdownInterval: NodeJS.Timeout | null = null;

  /** Normal refresh interval timer */
  private refreshInterval: NodeJS.Timeout | null = null;

  /** Timestamp when cooldown period started */
  private cooldownStartTime: number | null = null;

  /** Number of consecutive API errors encountered */
  private consecutiveErrorCount: number = 0;

  /** Whether the VS Code window is currently focused */
  private isWindowFocused: boolean = true;

  /** Reference to the status bar item */
  private statusBarItem: vscode.StatusBarItem;

  /** Function to get the refresh interval in milliseconds */
  private getRefreshIntervalMs: () => number;

  /** Callback function to trigger stats refresh */
  private refreshCallback: RefreshCallback;

  /**
   * Create a new CooldownManager
   *
   * @param statusBarItem - The VS Code status bar item to update
   * @param getRefreshIntervalMs - Function that returns the current refresh interval in ms
   * @param refreshCallback - Function to call when refreshing stats
   */
  constructor(
    statusBarItem: vscode.StatusBarItem,
    getRefreshIntervalMs: () => number,
    refreshCallback: RefreshCallback,
  ) {
    this.statusBarItem = statusBarItem;
    this.getRefreshIntervalMs = getRefreshIntervalMs;
    this.refreshCallback = refreshCallback;
  }

  /**
   * Get the current countdown interval timer
   */
  get getCountdownInterval(): NodeJS.Timeout | null {
    return this.countdownInterval;
  }

  /**
   * Get the current refresh interval timer
   */
  get getRefreshInterval(): NodeJS.Timeout | null {
    return this.refreshInterval;
  }

  /**
   * Get the timestamp when cooldown started
   */
  get getCooldownStartTime(): number | null {
    return this.cooldownStartTime;
  }

  /**
   * Get the current consecutive error count
   */
  get getConsecutiveErrorCount(): number {
    return this.consecutiveErrorCount;
  }

  /**
   * Get whether the window is currently focused
   */
  get getIsWindowFocused(): boolean {
    return this.isWindowFocused;
  }

  /**
   * Get the status bar item
   */
  get getStatusBarItem(): vscode.StatusBarItem {
    return this.statusBarItem;
  }

  /**
   * Increment the consecutive error count and return the new value
   */
  incrementErrorCount(): number {
    this.consecutiveErrorCount++;
    return this.consecutiveErrorCount;
  }

  /**
   * Reset the consecutive error count to zero
   */
  resetErrorCount(): void {
    this.consecutiveErrorCount = 0;
  }

  /**
   * Set the window focus state
   * @param focused - Whether the window is now focused
   */
  setWindowFocused(focused: boolean): void {
    this.isWindowFocused = focused;
  }

  /**
   * Update the status bar item reference
   * @param item - The new status bar item
   */
  setStatusBarItem(item: vscode.StatusBarItem): void {
    this.statusBarItem = item;
  }

  /**
   * Format remaining milliseconds as MM:SS
   * @param remainingMs - Remaining time in milliseconds
   * @returns Formatted time string (e.g., "09:45")
   */
  formatCountdown(remainingMs: number): string {
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Start the cooldown period due to consecutive errors
   * Stops refresh interval and starts countdown display
   */
  startCooldown(): void {
    // Clear any existing intervals
    this.clearAllIntervals();

    // Set cooldown start time
    this.cooldownStartTime = Date.now();

    log(`[Cooldown] Started cooldown period at ${new Date().toISOString()}`);

    // Start countdown display
    this.startCountdownDisplay();
  }

  /**
   * Start the countdown display on the status bar
   * Updates every second with remaining time
   */
  startCountdownDisplay(): void {
    // Clear existing countdown interval if any
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    const updateCountdown = () => {
      if (!this.cooldownStartTime) {
        return;
      }

      const now = Date.now();
      const elapsed = now - this.cooldownStartTime;
      const remaining = COOLDOWN_DEFAULTS.DURATION_MS - elapsed;

      if (remaining <= 0) {
        // Cooldown finished
        this.endCooldown();
        return;
      }

      // Update status bar with countdown
      this.statusBarItem.text = `$(warning) ${t('statusBar.apiUnavailable', {
        countdown: this.formatCountdown(remaining),
      })}`;
      this.statusBarItem.show();
      log(`[Cooldown] Updated countdown: ${this.formatCountdown(remaining)}`);
    };

    // Update immediately
    updateCountdown();

    // Then update every second
    this.countdownInterval = setInterval(
      updateCountdown,
      COOLDOWN_DEFAULTS.COUNTDOWN_UPDATE_INTERVAL_MS,
    );

    log(`[Cooldown] Started countdown timer at ${new Date().toISOString()}`);
  }

  /**
   * End the cooldown period and resume normal operation
   */
  private endCooldown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    this.cooldownStartTime = null;
    this.consecutiveErrorCount = 0;

    log('[Cooldown] Cooldown period ended');

    // Resume normal refresh interval
    this.startRefreshInterval();

    // Trigger immediate stats update
    this.refreshCallback();
  }

  /**
   * Start the normal refresh interval
   * Only starts if not in cooldown and window is focused
   */
  startRefreshInterval(): void {
    // Clear any existing interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Don't start interval if in cooldown or window not focused
    if (this.cooldownStartTime || !this.isWindowFocused) {
      log(
        `[Refresh] Refresh interval not started: ${this.cooldownStartTime ? 'in cooldown' : 'window not focused'}`,
      );
      return;
    }

    // Get the configured refresh interval
    const intervalMs = this.getRefreshIntervalMs();
    log(`[Refresh] Starting refresh interval: ${intervalMs}ms`);

    // Set up the interval
    this.refreshInterval = setInterval(async () => {
      if (!this.cooldownStartTime) {
        // Double-check we're not in cooldown
        await this.refreshCallback();
      }
    }, intervalMs);
  }

  /**
   * Stop the refresh interval without starting cooldown
   * Used when window loses focus
   */
  stopRefreshInterval(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      log('[Refresh] Refresh interval stopped');
    }
  }

  /**
   * Clear all running intervals (countdown and refresh)
   */
  clearAllIntervals(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Check if currently in cooldown mode
   */
  isInCooldown(): boolean {
    return this.cooldownStartTime !== null;
  }

  /**
   * Check if errors have reached the threshold for triggering cooldown
   */
  hasReachedErrorThreshold(): boolean {
    return this.consecutiveErrorCount >= COOLDOWN_DEFAULTS.ERROR_THRESHOLD;
  }

  /**
   * Reset the cooldown state (clear cooldown and error count)
   * Call this when API connection is restored
   */
  reset(): void {
    if (this.cooldownStartTime) {
      log('[Cooldown] Resetting cooldown state');
    }
    this.cooldownStartTime = null;
    this.consecutiveErrorCount = 0;
  }

  /**
   * Handle window focus change event
   * @param focused - Whether the window gained focus
   */
  onWindowFocusChanged(focused: boolean): void {
    this.isWindowFocused = focused;
    log(`[Window] Window focus changed: ${focused ? 'focused' : 'unfocused'}`);

    if (focused) {
      // Window gained focus
      if (this.cooldownStartTime) {
        log('[Window] Window focused during cooldown, restarting countdown display');
        this.startCountdownDisplay();
      } else {
        log('[Window] Window focused, starting refresh interval and updating stats');
        this.startRefreshInterval();
        this.refreshCallback();
      }
    } else {
      // Window lost focus - clear all intervals
      this.clearAllIntervals();
    }
  }

  /**
   * Dispose of all resources (clear intervals)
   * Call this when the extension is deactivated
   */
  dispose(): void {
    this.clearAllIntervals();
    log('[Cooldown] Disposed CooldownManager');
  }
}

/**
 * Factory function to create a CooldownManager with sensible defaults
 *
 * @param statusBarItem - The VS Code status bar item
 * @param getRefreshIntervalMs - Function to get refresh interval
 * @param refreshCallback - Function to call for refreshing stats
 * @returns Configured CooldownManager instance
 */
export function createCooldownManager(
  statusBarItem: vscode.StatusBarItem,
  getRefreshIntervalMs: () => number,
  refreshCallback: RefreshCallback,
): CooldownManager {
  return new CooldownManager(statusBarItem, getRefreshIntervalMs, refreshCallback);
}
