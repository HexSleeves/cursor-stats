/**
 * TokenModeHandler - Handles token display mode updates
 * Extracted token mode logic from updateStats.ts
 *
 * This handler:
 * - Updates status bar in token mode
 * - Displays token usage stats
 * - Shows today's usage if enabled
 * - Builds tooltips for token mode
 * - Calculates usage percentages
 */

import * as vscode from 'vscode';
import { log } from '../utils/logger';
import { t } from '../utils/i18n';
import { ExtensionState } from '../core/ExtensionState';
import { StatsService } from '../services/StatsService';
import { UsageService } from '../services/UsageService';
import { TooltipBuilder } from '../ui/TooltipBuilder';
import { getStatusBarColor } from '../ui/StatusColorProvider';
import { formatRemainingPercentage } from '../utils/percentageFormatter';

/**
 * Token mode handler configuration
 */
export interface TokenModeHandlerConfig {
  /** Extension state */
  extensionState: ExtensionState;
  /** Stats service */
  statsService: StatsService;
}

/**
 * Token mode display data
 */
interface TokenDisplayData {
  /** Total cost in USD */
  totalCostUSD: number;
  /** Max amount setting */
  maxAmount: number;
  /** Usage percentage */
  usagePercent: number;
  /** Remaining percentage */
  remainingPercent: number;
  /** Today's usage (optional) */
  todayUsage?: { totalUSD: number };
  /** Token usage stats */
  tokenUsage: {
    aggregations: Array<{
      modelIntent: string;
      inputTokens: string;
      outputTokens: string;
      cacheReadTokens: string;
      cacheWriteTokens: string;
      totalCents: number;
    }>;
    totalInputTokens: string;
    totalOutputTokens: string;
    totalCacheReadTokens: string;
    totalCacheWriteTokens: string;
    totalCostCents: number;
  };
}

/**
 * TokenModeHandler handles token mode display
 */
export class TokenModeHandler {
  private readonly extensionState: ExtensionState;
  private readonly statsService: StatsService;

  constructor(config: TokenModeHandlerConfig) {
    this.extensionState = config.extensionState;
    this.statsService = config.statsService;
  }

  /**
   * Update status bar in token mode
   * @param statusBarItem - Status bar item to update
   * @param token - Authentication token
   */
  async update(statusBarItem: vscode.StatusBarItem, _token: string): Promise<void> {
    try {
      log('[TokenModeHandler] Updating token mode stats...');

      // Get team info
      const teamInfo = await this.getTeamInfo();

      // Fetch token usage stats
      const usageService = this.statsService['usageService'] as UsageService;
      const tokenResult = await usageService.fetchTokenUsageStats({ teamId: teamInfo.teamId });

      if (!tokenResult.success) {
        throw new Error(tokenResult.error.message);
      }

      const tokenUsage = tokenResult.data;

      // Get config settings
      const config = this.extensionState.getConfig();
      const maxAmount = vscode.workspace
        .getConfiguration('cursorStats')
        .get<number>('tokenMaxAmount', 20);
      const showTodayUsage = config.showTodayUsage || true;

      // Calculate costs and percentages
      const totalCostUSD = tokenUsage.totalCostCents / 100;
      const usagePercent = Math.min((totalCostUSD / maxAmount) * 100, 100);
      const remainingPercent = Math.max(100 - usagePercent, 0);

      // Format display values
      const formattedUsedCost = `$${totalCostUSD.toFixed(2)}`;
      const formattedMaxCost = `$${maxAmount.toFixed(2)}`;
      const formattedRemainingPercent = formatRemainingPercentage(totalCostUSD, maxAmount);

      // Fetch today's usage if enabled
      let todayUsageText = '';
      let todayUsage: { totalUSD: number } | null = null;

      if (showTodayUsage) {
        try {
          const todayResult = await usageService.fetchTodayUsage({
            teamId: teamInfo.teamId ?? 0,
          });

          if (todayResult.success) {
            todayUsage = { totalUSD: todayResult.data.totalUSD };
            todayUsageText = ` • ${t('statusBar.today')}: $${todayUsage.totalUSD.toFixed(2)}`;
            log('[TokenModeHandler] Today usage: $' + todayUsage.totalUSD.toFixed(2));
          }
        } catch (error: any) {
          log('[TokenModeHandler] Failed to fetch today usage: ' + error.message, true);
        }
      }

      // Build status bar text - simplified to avoid squishing
      statusBarItem.text = `$(credit-card) ${formattedUsedCost}/${formattedMaxCost}`;

      // Set status bar color
      statusBarItem.color = getStatusBarColor(usagePercent);

      // Build tooltip
      const tooltipLines = this.buildTooltipLines(
        {
          totalCostUSD,
          maxAmount,
          usagePercent,
          remainingPercent,
          todayUsage: todayUsage || undefined,
          tokenUsage,
        },
        showTodayUsage,
      );

      statusBarItem.tooltip = await TooltipBuilder.createMarkdownTooltip(tooltipLines);
      statusBarItem.show();

      log('[TokenModeHandler] Token mode stats update completed successfully');
    } catch (error: any) {
      log('[TokenModeHandler] Token mode API error: ' + error.message, true);
      throw error;
    }
  }

  /**
   * Get team membership info
   * @returns Team info
   */
  private async getTeamInfo(): Promise<{ teamId?: number; userId?: number }> {
    const usageService = this.statsService['usageService'] as UsageService;
    const teamInfo = await usageService.getTeamMembershipInfo();
    return {
      teamId: teamInfo.teamId,
      userId: teamInfo.userId,
    };
  }

  /**
   * Build tooltip lines for token mode
   * @param data - Token display data
   * @param showTodayUsage - Whether to show today's usage
   * @returns Tooltip lines
   */
  private buildTooltipLines(data: TokenDisplayData, showTodayUsage: boolean): string[] {
    const { totalCostUSD, maxAmount, usagePercent, remainingPercent, todayUsage, tokenUsage } =
      data;

    const lines = [
      t('statusBar.tokenUsageStats') || 'Token Usage Statistics',
      '',
      `💳 ${t('statusBar.totalCost') || 'Total Cost'}: $${totalCostUSD.toFixed(2)}/$${maxAmount.toFixed(2)}`,
      `📊 ${Math.round(usagePercent)}% ${t('statusBar.utilized') || 'Utilized'} • ${remainingPercent.toFixed(0)}% ${t('statusBar.remaining') || 'Remaining'}`,
    ];

    if (showTodayUsage && todayUsage) {
      lines.push(`📅 ${t('statusBar.today')}: $${todayUsage.totalUSD.toFixed(2)}`);
    }

    lines.push(
      '',
      `🔢 ${t('statusBar.totalTokens') || 'Total Tokens'}:`,
      `   • ${t('statusBar.inputTokens') || 'Input'}: ${tokenUsage.totalInputTokens}`,
      `   • ${t('statusBar.outputTokens') || 'Output'}: ${tokenUsage.totalOutputTokens}`,
      `   • ${t('statusBar.cacheRead') || 'Cache Read'}: ${tokenUsage.totalCacheReadTokens}`,
      `   • ${t('statusBar.cacheWrite') || 'Cache Write'}: ${tokenUsage.totalCacheWriteTokens}`,
      '',
      '📋 **Model Breakdown**',
    );

    // Add each model's details
    for (const aggregation of tokenUsage.aggregations) {
      const modelCostUSD = aggregation.totalCents / 100;
      lines.push(
        `   • **${aggregation.modelIntent}**: $${modelCostUSD.toFixed(2)}`,
        `     Input: ${aggregation.inputTokens}, Output: ${aggregation.outputTokens}`,
      );
    }

    lines.push(
      '',
      TooltipBuilder.formatLine(
        `🕒 ${t('time.lastUpdated') || 'Last Updated'}: ${new Date().toLocaleString()}`,
      ),
    );

    return lines;
  }

  /**
   * Reset handler state
   */
  reset(): void {
    log('[TokenModeHandler] Reset handler state');
  }
}

/**
 * Factory function to create a TokenModeHandler
 * @param config - Handler configuration
 * @returns New TokenModeHandler instance
 */
export function createTokenModeHandler(config: TokenModeHandlerConfig): TokenModeHandler {
  return new TokenModeHandler(config);
}
