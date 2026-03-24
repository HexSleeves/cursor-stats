/**
 * Cooldown utilities - Backward compatibility layer
 * This module now uses CooldownManager internally but exports the same interface
 * to maintain compatibility with existing code (especially extension.ts)
 */

import * as vscode from 'vscode';
import { CooldownManager, type RefreshCallback } from '../core/CooldownManager';
import { getGlobalExtensionState } from '../core/ExtensionState';

// Lazy-loaded CooldownManager instance
let _cooldownManager: CooldownManager | null = null;

/**
 * Get or create the CooldownManager instance
 * This is lazy-loaded to avoid circular dependency issues
 */
function getCooldownManager(): CooldownManager | null {
  return _cooldownManager;
}

/**
 * Initialize the CooldownManager with the required dependencies
 * Call this from extension.ts after setting up the status bar item
 */
export function initializeCooldown(
  statusBarItem: vscode.StatusBarItem,
  getRefreshIntervalMs: () => number,
  refreshCallback: RefreshCallback,
): void {
  const extensionState = getGlobalExtensionState();
  if (extensionState) {
    extensionState.setStatusBarItem(statusBarItem);
    _cooldownManager = extensionState.getCooldownManager;
    return;
  }

  _cooldownManager = new CooldownManager(statusBarItem, getRefreshIntervalMs, refreshCallback);
}

/**
 * Backward compatibility: Export the cooldown duration constant
 */
export const COOLDOWN_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Backward compatibility: Get the countdown interval timer
 */
export const getCountdownInterval = () => _cooldownManager?.getCountdownInterval ?? null;

/**
 * Backward compatibility: Get the refresh interval timer
 */
export const getRefreshInterval = () => _cooldownManager?.getRefreshInterval ?? null;

/**
 * Backward compatibility: Get the cooldown start time
 */
export const getCooldownStartTime = () => {
  const manager = getCooldownManager();
  if (manager) {
    return manager.getCooldownStartTime;
  }
  return null;
};

/**
 * Backward compatibility: Get the consecutive error count
 */
export const getConsecutiveErrorCount = () => {
  const manager = getCooldownManager();
  return manager?.getConsecutiveErrorCount ?? 0;
};

/**
 * Backward compatibility: Get window focus state
 */
export const getIsWindowFocused = () => {
  const manager = getCooldownManager();
  return manager?.getIsWindowFocused ?? true;
};

/**
 * Backward compatibility: Get the status bar item
 * Note: This now returns the item directly from CooldownManager
 */
export const getStatusBarItem = () => {
  const manager = getCooldownManager();
  return manager?.getStatusBarItem ?? null;
};

/**
 * Backward compatibility: Set window focus state
 */
export const setIsWindowFocused = (focused: boolean) => {
  const manager = getCooldownManager();
  if (manager) {
    manager.setWindowFocused(focused);
  }
};

/**
 * Backward compatibility: Set the status bar item
 */
export const setStatusBarItem = (item: vscode.StatusBarItem) => {
  const manager = getCooldownManager();
  if (manager) {
    manager.setStatusBarItem(item);
  }
};

/**
 * Backward compatibility: Set cooldown start time
 * Note: This starts the cooldown if a time is provided
 */
export const setCooldownStartTime = (time: number | null) => {
  const manager = getCooldownManager();
  if (manager) {
    if (time !== null && !manager.getCooldownStartTime) {
      // Starting a new cooldown period
      manager.startCooldown();
    } else if (time === null) {
      // Ending cooldown
      manager.reset();
    }
  }
};

/**
 * Backward compatibility: Set the consecutive error count
 */
export const setConsecutiveErrorCount = (count: number) => {
  const manager = getCooldownManager();
  if (manager) {
    // Reset and set to the new count
    manager.resetErrorCount();
    for (let i = 0; i < count; i++) {
      manager.incrementErrorCount();
    }
  }
};

/**
 * Backward compatibility: Increment consecutive error count
 */
export const incrementConsecutiveErrorCount = () => {
  const manager = getCooldownManager();
  return manager ? manager.incrementErrorCount() : 0;
};

/**
 * Backward compatibility: Reset consecutive error count
 */
export const resetConsecutiveErrorCount = () => {
  const manager = getCooldownManager();
  if (manager) {
    manager.resetErrorCount();
  }
};

/**
 * Format remaining milliseconds as MM:SS
 * @param remainingMs - Remaining time in milliseconds
 * @returns Formatted time string (e.g., "09:45")
 */
export function formatCountdown(remainingMs: number): string {
  const manager = getCooldownManager();
  if (manager) {
    return manager.formatCountdown(remainingMs);
  }
  // Fallback implementation
  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Start the countdown display
 * Backward compatibility - delegates to CooldownManager
 */
export function startCountdownDisplay() {
  const manager = getCooldownManager();
  if (manager) {
    manager.startCountdownDisplay();
  }
}

/**
 * Start the refresh interval
 * Backward compatibility - delegates to CooldownManager
 */
export function startRefreshInterval() {
  const manager = getCooldownManager();
  if (manager) {
    manager.startRefreshInterval();
  }
}

/**
 * Clear all intervals
 * Backward compatibility - delegates to CooldownManager
 */
export function clearAllIntervals() {
  const manager = getCooldownManager();
  if (manager) {
    manager.clearAllIntervals();
  }
}
