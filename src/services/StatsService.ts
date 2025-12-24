/**
 * StatsService - Main service for stats orchestration
 * Coordinates between repositories and processors to provide complete stats
 *
 * This service:
 * - Provides the main entry point for stats operations
 * - Coordinates data fetching from UsageService
 * - Orchestrates processing through processors
 * - Handles error recovery and fallback logic
 * - Provides a clean API for handlers to consume
 */

import { log } from '../utils/logger';
import type {
  CursorStats,
  TokenUsageResponse,
  TodayUsageData,
  UsageBasedStatus,
} from '../interfaces/types';
import { UsageService, type UsageResult } from './UsageService';
import { ExtensionState } from '../core/ExtensionState';

/**
 * Display mode for status bar
 */
export type DisplayMode = 'classic' | 'token';

/**
 * Configuration for StatsService
 */
export interface StatsServiceConfig {
  /** Usage service for data fetching */
  usageService: UsageService;
  /** Extension state for configuration access */
  extensionState: ExtensionState;
}

/**
 * Complete stats data for display
 */
export interface DisplayStats {
  /** Display mode */
  mode: DisplayMode;
  /** Classic mode stats */
  classic?: ClassicStats;
  /** Token mode stats */
  token?: TokenStats;
}

/**
 * Classic mode stats data
 */
export interface ClassicStats {
  /** Cursor stats */
  cursorStats: CursorStats;
  /** Usage-based status */
  usageBasedStatus: UsageBasedStatus;
  /** Premium percentage */
  premiumPercent: number;
  /** Remaining percentage */
  remainingPercent: number;
}

/**
 * Token mode stats data
 */
export interface TokenStats {
  /** Token usage response */
  tokenUsage: TokenUsageResponse;
  /** Total cost in USD */
  totalCostUSD: number;
  /** Maximum amount */
  maxAmount: number;
  /** Usage percentage */
  usagePercent: number;
  /** Remaining percentage */
  remainingPercent: number;
  /** Today's usage (optional) */
  todayUsage?: TodayUsageData;
}

/**
 * StatsService provides high-level stats operations
 */
export class StatsService {
  private readonly usageService: UsageService;
  private readonly extensionState: ExtensionState;

  constructor(config: StatsServiceConfig) {
    this.usageService = config.usageService;
    this.extensionState = config.extensionState;
  }

  /**
   * Get the current display mode from configuration
   * @returns Display mode
   */
  getDisplayMode(): DisplayMode {
    const config = this.extensionState.getConfig();
    return config.displayMode;
  }

  /**
   * Check if today's usage should be shown
   * @returns Whether to show today's usage
   */
  shouldShowTodayUsage(): boolean {
    const config = this.extensionState.getConfig();
    return this.getDisplayMode() === 'token'; // Only show in token mode for now
  }

  /**
   * Get the maximum amount for token mode
   * @returns Maximum amount in USD
   */
  getTokenMaxAmount(): number {
    const config = this.extensionState.getConfig();
    // This would be a config setting
    return 20; // Default value
  }

  /**
   * Fetch classic mode stats
   * @returns Classic stats or error
   */
  async fetchClassicStats(): Promise<UsageResult<ClassicStats>> {
    try {
      log('[StatsService] Fetching classic mode stats...');

      // Fetch cursor stats
      const cursorStatsResult = await this.usageService.fetchCursorStats();
      if (!cursorStatsResult.success) {
        return cursorStatsResult;
      }

      const cursorStats = cursorStatsResult.data;

      // Check usage-based status
      const usageBasedResult = await this.usageService.checkUsageBasedStatus(cursorStats.teamId);
      if (!usageBasedResult.success) {
        log('[StatsService] Warning: Failed to check usage-based status', true);
      }

      const usageBasedStatus = usageBasedResult.success
        ? usageBasedResult.data
        : { isEnabled: false, limit: 0 };

      // Calculate percentages
      const premiumPercent = Math.round(
        (cursorStats.premiumRequests.current / cursorStats.premiumRequests.limit) * 100,
      );

      const remainingPercent = this.calculateRemainingPercent(
        cursorStats.premiumRequests.current,
        cursorStats.premiumRequests.limit,
      );

      const classicStats: ClassicStats = {
        cursorStats,
        usageBasedStatus,
        premiumPercent,
        remainingPercent,
      };

      log('[StatsService] Successfully fetched classic stats', {
        premiumRequests: `${cursorStats.premiumRequests.current}/${cursorStats.premiumRequests.limit}`,
        premiumPercent,
      });

      return { success: true, data: classicStats };
    } catch (error: any) {
      log('[StatsService] Error fetching classic stats: ' + error.message, true);
      return {
        success: false,
        error: {
          message: error.message,
          isNetworkError: true,
        },
      };
    }
  }

  /**
   * Fetch token mode stats
   * @returns Token stats or error
   */
  async fetchTokenStats(): Promise<UsageResult<TokenStats>> {
    try {
      log('[StatsService] Fetching token mode stats...');

      // Get team info for teamId
      const teamInfo = await this.usageService['getTeamMembershipInfo']();

      // Fetch token usage stats
      const tokenUsageResult = await this.usageService.fetchTokenUsageStats({
        teamId: teamInfo.teamId,
      });

      if (!tokenUsageResult.success) {
        return tokenUsageResult;
      }

      const tokenUsage = tokenUsageResult.data;

      // Calculate costs and percentages
      const totalCostUSD = tokenUsage.totalCostCents / 100;
      const maxAmount = this.getTokenMaxAmount();
      const usagePercent = Math.min((totalCostUSD / maxAmount) * 100, 100);
      const remainingPercent = Math.max(100 - usagePercent, 0);

      const tokenStats: TokenStats = {
        tokenUsage,
        totalCostUSD,
        maxAmount,
        usagePercent,
        remainingPercent,
      };

      // Fetch today's usage if enabled
      if (this.shouldShowTodayUsage()) {
        const todayUsageResult = await this.usageService.fetchTodayUsage({
          teamId: teamInfo.teamId ?? 0,
        });

        if (todayUsageResult.success) {
          tokenStats.todayUsage = todayUsageResult.data;
          log('[StatsService] Today usage: $' + todayUsageResult.data.totalUSD.toFixed(2));
        } else {
          log('[StatsService] Warning: Failed to fetch today usage', true);
        }
      }

      log('[StatsService] Successfully fetched token stats', {
        totalCostUSD: `$${totalCostUSD.toFixed(2)}`,
        usagePercent: Math.round(usagePercent),
      });

      return { success: true, data: tokenStats };
    } catch (error: any) {
      log('[StatsService] Error fetching token stats: ' + error.message, true);
      return {
        success: false,
        error: {
          message: error.message,
          isNetworkError: true,
        },
      };
    }
  }

  /**
   * Fetch stats based on current display mode
   * @returns Display stats or error
   */
  async fetchStats(): Promise<UsageResult<DisplayStats>> {
    const displayMode = this.getDisplayMode();
    log('[StatsService] Fetching stats for mode: ' + displayMode);

    if (displayMode === 'token') {
      const tokenStatsResult = await this.fetchTokenStats();
      if (!tokenStatsResult.success) {
        return tokenStatsResult;
      }

      return {
        success: true,
        data: {
          mode: displayMode,
          token: tokenStatsResult.data,
        },
      };
    }

    // Classic mode (default)
    const classicStatsResult = await this.fetchClassicStats();
    if (!classicStatsResult.success) {
      return classicStatsResult;
    }

    return {
      success: true,
      data: {
        mode: displayMode,
        classic: classicStatsResult.data,
      },
    };
  }

  /**
   * Calculate remaining percentage with proper formatting
   * @param current - Current value
   * @param max - Maximum value
   * @returns Remaining percentage (0-100)
   */
  private calculateRemainingPercent(current: number, max: number): number {
    if (max <= 0) {
      return 0;
    }
    const remaining = Math.max(0, max - current);
    return Math.round((remaining / max) * 100);
  }

  /**
   * Reset any cached data or state
   * Call this when configuration changes or user logs out
   */
  reset(): void {
    log('[StatsService] Resetting stats service');
    // Future: clear any cached data here
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    log('[StatsService] Disposing stats service');
    // Future: clean up any resources here
  }
}

/**
 * Factory function to create a StatsService
 * @param config - Service configuration
 * @returns Configured StatsService instance
 */
export function createStatsService(config: StatsServiceConfig): StatsService {
  return new StatsService(config);
}

/**
 * Type guard to check if display stats is token mode
 * @param stats - Display stats to check
 */
export function isTokenMode(stats: DisplayStats): stats is DisplayStats & { token: TokenStats } {
  return stats.mode === 'token' && stats.token !== undefined;
}

/**
 * Type guard to check if display stats is classic mode
 * @param stats - Display stats to check
 */
export function isClassicMode(
  stats: DisplayStats,
): stats is DisplayStats & { classic: ClassicStats } {
  return stats.mode === 'classic' && stats.classic !== undefined;
}
