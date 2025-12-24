/**
 * ExtensionState - Main state management for the cursor-stats extension
 * Provides centralized state management with proper lifecycle handling
 *
 * This class:
 * - Aggregates all extension state (cooldown, notifications, etc.)
 * - Provides proper disposal/cleanup on deactivation
 * - Enables dependency injection for better testing
 * - Maintains backward compatibility with existing code
 */

import * as vscode from 'vscode';
import { CooldownManager, createCooldownManager, RefreshCallback } from './CooldownManager';
import { NotificationState, createNotificationState } from './NotificationState';
import { log } from '../utils/logger';

/**
 * Extension configuration interface
 */
export interface ExtensionConfig {
  /** Refresh interval in milliseconds */
  refreshIntervalMs: number;
  /** Whether status bar colors are enabled */
  enableStatusBarColors: boolean;
  /** Whether alerts are enabled */
  enableAlerts: boolean;
  /** Currency code for display */
  currency: string;
  /** Display mode (classic or token) */
  displayMode: 'classic' | 'token';
  /** Whether to show today's usage in token mode */
  showTodayUsage?: boolean;
}

/**
 * ExtensionState aggregates all state management for the extension
 */
export class ExtensionState {
  /** VS Code extension context */
  private context: vscode.ExtensionContext;

  /** Status bar item */
  private statusBarItem: vscode.StatusBarItem;

  /** Cooldown manager for error handling */
  private cooldownManager: CooldownManager;

  /** Notification state manager */
  private notificationState: NotificationState;

  /** Last release check timestamp */
  private lastReleaseCheck: number;

  /** Whether the extension is currently active */
  private isActive: boolean;

  /**
   * Create a new ExtensionState instance
   *
   * @param context - VS Code extension context
   * @param statusBarItem - Status bar item to update
   * @param getRefreshIntervalMs - Function to get refresh interval
   * @param refreshCallback - Function to call for stats refresh
   */
  constructor(
    context: vscode.ExtensionContext,
    statusBarItem: vscode.StatusBarItem,
    getRefreshIntervalMs: () => number,
    refreshCallback: RefreshCallback,
  ) {
    this.context = context;
    this.statusBarItem = statusBarItem;
    this.lastReleaseCheck = 0;
    this.isActive = true;

    // Initialize cooldown manager
    this.cooldownManager = createCooldownManager(
      statusBarItem,
      getRefreshIntervalMs,
      refreshCallback,
    );

    // Initialize notification state
    this.notificationState = createNotificationState();

    log('[ExtensionState] Initialized extension state');
  }

  /**
   * Get the extension context
   */
  get getContext(): vscode.ExtensionContext {
    return this.context;
  }

  /**
   * Get the status bar item
   */
  get getStatusBarItem(): vscode.StatusBarItem {
    return this.statusBarItem;
  }

  /**
   * Get the cooldown manager
   */
  get getCooldownManager(): CooldownManager {
    return this.cooldownManager;
  }

  /**
   * Get the notification state
   */
  get getNotificationState(): NotificationState {
    return this.notificationState;
  }

  /**
   * Get the last release check timestamp
   */
  get getLastReleaseCheck(): number {
    return this.lastReleaseCheck;
  }

  /**
   * Set the last release check timestamp
   */
  setLastReleaseCheck(timestamp: number): void {
    this.lastReleaseCheck = timestamp;
  }

  /**
   * Check if the extension is currently active
   */
  get getIsActive(): boolean {
    return this.isActive;
  }

  /**
   * Update the status bar item reference
   * @param item - New status bar item
   */
  setStatusBarItem(item: vscode.StatusBarItem): void {
    this.statusBarItem = item;
    this.cooldownManager.setStatusBarItem(item);
  }

  /**
   * Get current extension configuration
   */
  getConfig(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration('cursorStats');
    return {
      refreshIntervalMs: Math.max(config.get<number>('refreshInterval', 30), 5) * 1000,
      enableStatusBarColors: config.get<boolean>('enableStatusBarColors', true),
      enableAlerts: config.get<boolean>('enableAlerts', true),
      currency: config.get<string>('currency', 'USD'),
      displayMode: config.get<string>('displayMode', 'classic') as 'classic' | 'token',
      showTodayUsage: config.get<boolean>('showTodayUsage', true),
    };
  }

  /**
   * Get a value from global state
   * @param key - State key
   * @param defaultValue - Default value if key doesn't exist
   */
  getGlobalState<T>(key: string, defaultValue?: T): T | undefined {
    if (defaultValue !== undefined) {
      return this.context.globalState.get<T>(key, defaultValue);
    }
    return this.context.globalState.get<T>(key);
  }

  /**
   * Set a value in global state
   * @param key - State key
   * @param value - Value to set
   */
  async setGlobalState<T>(key: string, value: T): Promise<void> {
    await this.context.globalState.update(key, value);
  }

  /**
   * Get a value from workspace state
   * @param key - State key
   * @param defaultValue - Default value if key doesn't exist
   */
  getWorkspaceState<T>(key: string, defaultValue?: T): T | undefined {
    if (defaultValue !== undefined) {
      return this.context.workspaceState.get<T>(key, defaultValue);
    }
    return this.context.workspaceState.get<T>(key);
  }

  /**
   * Set a value in workspace state
   * @param key - State key
   * @param value - Value to set
   */
  async setWorkspaceState<T>(key: string, value: T): Promise<void> {
    await this.context.workspaceState.update(key, value);
  }

  /**
   * Get extension storage path
   * @param relativePath - Relative path from storage directory
   */
  getStoragePath(relativePath?: string): string {
    const basePath = this.context.storageUri?.fsPath || this.context.globalStorageUri.fsPath;
    return relativePath ? `${basePath}/${relativePath}` : basePath;
  }

  /**
   * Get extension log path
   */
  getLogPath(): string {
    return this.context.logUri.fsPath;
  }

  /**
   * Handle window focus change event
   * @param focused - Whether the window gained focus
   */
  onWindowFocusChanged(focused: boolean): void {
    this.cooldownManager.onWindowFocusChanged(focused);
  }

  /**
   * Reset all state (call when configuration changes significantly)
   */
  reset(): void {
    this.notificationState.reset();
    this.cooldownManager.reset();
    log('[ExtensionState] Reset all extension state');
  }

  /**
   * Dispose of all resources
   * Call this when extension is deactivated
   */
  dispose(): void {
    this.isActive = false;
    this.cooldownManager.dispose();
    this.notificationState.reset();
    log('[ExtensionState] Disposed extension state');
  }
}

/**
 * Global extension state instance
 * Used for backward compatibility with existing code
 */
let globalExtensionState: ExtensionState | null = null;

/**
 * Get the global extension state instance
 * @returns ExtensionState instance or null if not initialized
 */
export function getGlobalExtensionState(): ExtensionState | null {
  return globalExtensionState;
}

/**
 * Set the global extension state instance
 * @param state - ExtensionState instance to set as global
 */
export function setGlobalExtensionState(state: ExtensionState): void {
  globalExtensionState = state;
}

/**
 * Clear the global extension state instance
 */
export function clearGlobalExtensionState(): void {
  globalExtensionState = null;
}
