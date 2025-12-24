/**
 * StatsUpdateHandler - Main handler for stats updates
 * Coordinates between different mode handlers and manages update flow
 *
 * This handler:
 * - Routes updates to appropriate mode handler (token or classic)
 * - Manages cooldown state
 * - Handles errors and retry logic
 * - Coordinates with cooldown manager
 * - Provides unified API for stats updates
 */

import * as vscode from 'vscode';
import { log } from '../utils/logger';
import { t } from '../utils/i18n';
import { ExtensionState } from '../core/ExtensionState';
import { StatsService } from '../services/StatsService';
import { getCursorTokenFromDB } from '../services/database';

/**
 * Handler configuration
 */
export interface StatsUpdateHandlerConfig {
  /** Extension state */
  extensionState: ExtensionState;
  /** Stats service */
  statsService: StatsService;
}

/**
 * StatsUpdateHandler coordinates stats updates
 */
export class StatsUpdateHandler {
  private readonly extensionState: ExtensionState;
  private readonly statsService: StatsService;
  private tokenModeHandler: any = null; // Will be lazy-loaded
  private classicModeHandler: any = null; // Will be lazy-loaded

  constructor(config: StatsUpdateHandlerConfig) {
    this.extensionState = config.extensionState;
    this.statsService = config.statsService;
  }

  /**
   * Update status bar with current stats
   * @param statusBarItem - Status bar item to update
   */
  async updateStats(statusBarItem: vscode.StatusBarItem): Promise<void> {
    const cooldownManager = this.extensionState.getCooldownManager;

    // Check if in cooldown
    if (cooldownManager.isInCooldown()) {
      log('[StatsHandler] In cooldown, skipping update');
      return;
    }

    try {
      log('[StatsHandler] Starting stats update...');
      const token = await getCursorTokenFromDB();

      if (!token) {
        this.handleNoToken(statusBarItem);
        return;
      }

      // Show status bar early
      statusBarItem.show();

      // Get display mode and route to appropriate handler
      const displayMode = this.statsService.getDisplayMode();
      log('[StatsHandler] Display mode: ' + displayMode);

      if (displayMode === 'token') {
        await this.updateTokenMode(statusBarItem, token);
      } else {
        await this.updateClassicMode(statusBarItem, token);
      }

      // Reset error state on success
      if (cooldownManager.getConsecutiveErrorCount > 0 || cooldownManager.getCooldownStartTime) {
        log('[StatsHandler] API connection restored, resetting error state');
        cooldownManager.resetErrorCount();
        if (cooldownManager.getCooldownStartTime) {
          cooldownManager.reset();
          cooldownManager.startRefreshInterval();
        }
      }

      log('[StatsHandler] Stats update completed successfully');
    } catch (error: any) {
      this.handleUpdateError(statusBarItem, error);
    }
  }

  /**
   * Handle case when no token is found
   * @param statusBarItem - Status bar item to update
   */
  private handleNoToken(statusBarItem: vscode.StatusBarItem): void {
    log('[StatsHandler] No valid token found', true);
    statusBarItem.text = `$(alert) ${t('statusBar.noTokenFound')}`;
    statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorBackground');

    // Import dynamically to avoid circular dependency
    import('../ui/TooltipBuilder').then(({ TooltipBuilder }) => {
      const tooltipLines = [t('statusBar.couldNotRetrieveToken')];
      TooltipBuilder.createMarkdownTooltip(tooltipLines, { isError: true }).then((tooltip) => {
        statusBarItem.tooltip = tooltip;
        statusBarItem.show();
      });
    });
  }

  /**
   * Update stats in token mode
   * @param statusBarItem - Status bar item to update
   * @param token - Authentication token
   */
  private async updateTokenMode(statusBarItem: vscode.StatusBarItem, token: string): Promise<void> {
    // Lazy load TokenModeHandler
    if (!this.tokenModeHandler) {
      const TokenModeHandler = (await import('./TokenModeHandler')).TokenModeHandler;
      this.tokenModeHandler = new TokenModeHandler({
        extensionState: this.extensionState,
        statsService: this.statsService,
      });
    }

    await this.tokenModeHandler.update(statusBarItem, token);
  }

  /**
   * Update stats in classic mode
   * @param statusBarItem - Status bar item to update
   * @param token - Authentication token
   */
  private async updateClassicMode(
    statusBarItem: vscode.StatusBarItem,
    token: string,
  ): Promise<void> {
    // Lazy load ClassicModeHandler
    if (!this.classicModeHandler) {
      const ClassicModeHandler = (await import('./ClassicModeHandler')).ClassicModeHandler;
      this.classicModeHandler = new ClassicModeHandler({
        extensionState: this.extensionState,
        statsService: this.statsService,
      });
    }

    await this.classicModeHandler.update(statusBarItem, token);
  }

  /**
   * Handle update error
   * @param _statusBarItem - Status bar item to update
   * @param error - Error object
   */
  private handleUpdateError(_statusBarItem: vscode.StatusBarItem, error: any): void {
    const cooldownManager = this.extensionState.getCooldownManager;
    const errorCount = cooldownManager.incrementErrorCount();

    log('[StatsHandler] API error: ' + error.message, true);

    // Check if we should enter cooldown
    if (cooldownManager.hasReachedErrorThreshold()) {
      log('[StatsHandler] Error threshold reached, entering cooldown');
      cooldownManager.startCooldown();
    }
  }

  /**
   * Force a refresh regardless of cooldown state
   * @param statusBarItem - Status bar item to update
   */
  async forceRefresh(statusBarItem: vscode.StatusBarItem): Promise<void> {
    const cooldownManager = this.extensionState.getCooldownManager;
    cooldownManager.reset();
    await this.updateStats(statusBarItem);
  }

  /**
   * Reset handler state
   */
  reset(): void {
    if (this.tokenModeHandler?.reset) {
      this.tokenModeHandler.reset();
    }
    if (this.classicModeHandler?.reset) {
      this.classicModeHandler.reset();
    }
  }

  /**
   * Dispose of handler resources
   */
  dispose(): void {
    // Clean up any resources
    log('[StatsHandler] Disposed stats update handler');
  }
}

/**
 * Factory function to create a StatsUpdateHandler
 * @param config - Handler configuration
 * @returns New StatsUpdateHandler instance
 */
export function createStatsUpdateHandler(config: StatsUpdateHandlerConfig): StatsUpdateHandler {
  return new StatsUpdateHandler(config);
}
