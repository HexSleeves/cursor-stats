/**
 * ClassicModeHandler - Handles classic display mode updates
 * Extracted classic mode logic from updateStats.ts
 *
 * This handler:
 * - Updates status bar in classic mode
 * - Displays premium fast request stats
 * - Shows usage-based pricing information
 * - Handles remaining days display
 * - Triggers notifications
 */

import * as vscode from 'vscode';
import axios from 'axios';
import { log } from '../utils/logger';
import { t } from '../utils/i18n';
import type { CursorUsageResponse } from '../interfaces/types';
import { ExtensionState } from '../core/ExtensionState';
import { StatsService } from '../services/StatsService';
import { UsageService } from '../services/UsageService';
import { TooltipBuilder } from '../ui/TooltipBuilder';
import { getStatusBarColor } from '../ui/StatusColorProvider';
import { convertAndFormatCurrency } from '../utils/currency';
import {
  calculateRemainingDaysFromPeriod,
  formatRemainingDaysText,
  getRemainingDaysIcon,
  shouldShowRemainingDays,
} from '../utils/remainingDays';
import { DateFormatter } from '../utils/dateFormatter';
import {
  checkAndNotifyUsage, checkAndNotifyUnpaidInvoice,
  checkAndNotifySmartUsageMonitor
} from './notifications';

/**
 * Classic mode handler configuration
 */
export interface ClassicModeHandlerConfig {
  /** Extension state */
  extensionState: ExtensionState;
  /** Stats service */
  statsService: StatsService;
}

/**
 * Classic mode handler handles classic mode display
 */
export class ClassicModeHandler {
  private readonly extensionState: ExtensionState;
  private readonly statsService: StatsService;
  private unknownModelNotificationShown = false;
  private detectedUnknownModels: Set<string> = new Set();

  constructor(config: ClassicModeHandlerConfig) {
    this.extensionState = config.extensionState;
    this.statsService = config.statsService;
  }

  /**
   * Update status bar in classic mode
   * @param statusBarItem - Status bar item to update
   * @param token - Authentication token
   */
  async update(statusBarItem: vscode.StatusBarItem, _token: string): Promise<void> {
    log('[ClassicModeHandler] Starting classic mode update...');

    // Get team info
    const usageService = this.statsService['usageService'];
    const teamInfo = await usageService.getTeamMembershipInfo();

    // Fetch stats
    const statsResult = await this.statsService.fetchClassicStats();
    if (!statsResult.success) {
      throw new Error(statsResult.error.message);
    }

    const { cursorStats, usageBasedStatus, premiumPercent, remainingPercent } = statsResult.data;

    // Calculate remaining days if enabled
    const remainingDaysInfo = this.calculateRemainingDays(cursorStats);

    // Build total usage text
    const totalUsageText = this.buildTotalUsageText(
      cursorStats,
      usageBasedStatus,
      premiumPercent,
      remainingPercent,
      remainingDaysInfo,
    );

    // Set status bar text and color
    statusBarItem.text = `$(graph)${totalUsageText}`;
    statusBarItem.color = getStatusBarColor(premiumPercent);

    // Build and set tooltip
    await this.buildTooltip(statusBarItem, cursorStats, usageBasedStatus, teamInfo);

    // Show status bar
    statusBarItem.show();

    // Trigger notifications
    this.scheduleNotifications(cursorStats, usageBasedStatus);

    // Check for unknown models
    await this.checkUnknownModels();

    log('[ClassicModeHandler] Classic mode stats update completed successfully');
  }

  /**
   * Calculate remaining days for billing period
   * @param cursorStats - Cursor stats
   * @returns Remaining days info
   */
  private calculateRemainingDays(cursorStats: any): {
    remainingDays: number;
    remainingDaysText: string;
    remainingDaysIcon: string;
  } | null {
    if (!shouldShowRemainingDays()) {
      return null;
    }

    const startDate = new Date(cursorStats.premiumRequests.startOfMonth);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const periodInfo = `${DateFormatter.formatWithMonthName(startDate)} - ${DateFormatter.formatWithMonthName(endDate)}`;
    const remainingDays = calculateRemainingDaysFromPeriod(periodInfo);

    return {
      remainingDays,
      remainingDaysText: formatRemainingDaysText(remainingDays),
      remainingDaysIcon: getRemainingDaysIcon(remainingDays),
    };
  }

  /**
   * Build total usage text for status bar
   * @param cursorStats - Cursor stats
   * @param usageBasedStatus - Usage-based status
   * @param premiumPercent - Premium percentage
   * @param remainingPercent - Remaining percentage
   * @param remainingDaysInfo - Remaining days info
   * @returns Total usage text
   */
  private buildTotalUsageText(
    cursorStats: any,
    _usageBasedStatus: { isEnabled: boolean; limit: number },
    _premiumPercent: number,
    _remainingPercent: number,
    remainingDaysInfo: { remainingDaysText: string; remainingDaysIcon: string } | null,
  ): string {
    const { premiumRequests, currentMonth, lastMonth } = cursorStats;

    // Use current month if it has data, otherwise fall back to last month
    const activeMonthData =
      currentMonth.usageBasedPricing.items.length > 0 ? currentMonth : lastMonth;

    let costText = '';

    if (activeMonthData.usageBasedPricing.items.length > 0) {
      const items = activeMonthData.usageBasedPricing.items;

      // Calculate actual total cost (positive items only)
      const actualTotalCost = items.reduce((sum: number, item: any) => {
        const cost = Number.parseFloat(item.totalDollars.replace('$', ''));
        return cost > 0 ? sum + cost : sum;
      }, 0);

      // Convert currency for display
      const formattedActualCost = convertAndFormatCurrency(actualTotalCost);
      costText = ` $(credit-card) ${formattedActualCost}`;
    }

    return ` ${premiumRequests.current}/${premiumRequests.limit}${costText}`;
  }

  /**
   * Build tooltip for classic mode
   * @param statusBarItem - Status bar item
   * @param cursorStats - Cursor stats
   * @param usageBasedStatus - Usage-based status
   * @param teamInfo - Team info
   */
  private async buildTooltip(
    statusBarItem: vscode.StatusBarItem,
    cursorStats: any,
    usageBasedStatus: { isEnabled: boolean; limit: number },
    teamInfo: { teamId?: number; userId?: number },
  ): Promise<void> {
    const tooltipLines = await this.generateTooltipLines(cursorStats, usageBasedStatus, teamInfo);
    statusBarItem.tooltip = await TooltipBuilder.createMarkdownTooltip(tooltipLines);
  }

  /**
   * Generate tooltip lines
   * @param cursorStats - Cursor stats
   * @param usageBasedStatus - Usage-based status
   * @param teamInfo - Team info
   * @returns Tooltip lines
   */
  private async generateTooltipLines(
    cursorStats: any,
    _usageBasedStatus: { isEnabled: boolean; limit: number },
    teamInfo: { teamId?: number; userId?: number },
  ): Promise<string[]> {
    const lines: string[] = [t('statusBar.cursorUsageStats'), ''];

    // Add team spend indicator if applicable
    if (cursorStats.isTeamSpendData) {
      lines.push(t('statusBar.teamSpend'));
    }

    lines.push(t('statusBar.premiumFastRequests'));

    // Premium requests info
    const { premiumRequests } = cursorStats;
    const premiumPercent = Math.round((premiumRequests.current / premiumRequests.limit) * 100);

    lines.push(
      TooltipBuilder.formatLine(
        `   • ${premiumRequests.current}/${premiumRequests.limit} ${t('statusBar.requestsUsed')}`,
      ),
      TooltipBuilder.formatLine(`   📊 ${premiumPercent}% ${t('statusBar.utilized')}`),
    );

    // Add remaining days if enabled
    if (shouldShowRemainingDays()) {
      const remainingDaysInfo = this.calculateRemainingDays(cursorStats);
      if (remainingDaysInfo) {
        lines.push(
          TooltipBuilder.formatLine(
            `   ${remainingDaysInfo.remainingDaysIcon} ${t('statusBar.remainingDays.label')}: ${remainingDaysInfo.remainingDaysText}`,
          ),
        );
      }
    }

    lines.push('');

    // Add detailed usage breakdown
    await this.addDetailedUsageBreakdown(lines, cursorStats, teamInfo);

    return lines;
  }

  /**
   * Add detailed usage breakdown to tooltip
   * @param lines - Tooltip lines array
   * @param cursorStats - Cursor stats
   * @param teamInfo - Team info
   */
  private async addDetailedUsageBreakdown(
    lines: string[],
    cursorStats: any,
    _teamInfo: { teamId?: number; userId?: number },
  ): Promise<void> {
    const token = await this.getCursorToken();

    try {
      const usageService = this.statsService['usageService'] as UsageService;
      const userId = usageService['cursorRepository'].extractUserId();

      const usageResponse = await axios.get<CursorUsageResponse>('https://cursor.com/api/usage', {
        params: { user: userId },
        headers: { Cookie: `WorkosCursorSessionToken=${token}` },
      });

      const usageData = usageResponse.data;

      // Show team vs individual comparison if using team spend data
      if (cursorStats.isTeamSpendData) {
        lines.push(
          '🔍 **Data Source Information**',
          TooltipBuilder.formatLine(
            `   • **Current Display**: Using GPT-4 individual data (${usageData['gpt-4'].numRequests} requests)`,
          ),
        );
      }

      lines.push('📊 **Detailed Usage Breakdown**', '');

      // Show data for each model
      Object.entries(usageData).forEach(([modelName, data]) => {
        if (typeof data === 'object' && data !== null && 'numRequests' in data) {
          const modelData = data as any;
          const hasLimit = modelData.maxRequestUsage !== null;
          const hasTokens = modelData.numTokens > 0;

          let displayName = modelName;
          let description = '';

          if (modelName === 'gpt-4') {
            displayName = 'GPT-4 (Premium/Fast)';
            description = 'Fast premium requests';
          } else if (modelName === 'gpt-4-32k') {
            displayName = 'GPT-4-32k (Usage-Based)';
            description = 'Usage-based spending limit';
          } else if (modelName === 'gpt-3.5-turbo') {
            displayName = 'GPT-3.5-turbo';
            description = 'Legacy model';
          }

          let modelLine = `   • **${displayName}**: ${modelData.numRequests} requests`;
          if (hasLimit) {
            modelLine += ` / ${modelData.maxRequestUsage} limit`;
          }
          if (hasTokens) {
            modelLine += ` (${modelData.numTokens} tokens)`;
          }

          lines.push(TooltipBuilder.formatLine(modelLine));

          if (description) {
            lines.push(TooltipBuilder.formatLine(`     ${description}`));
          }
        }
      });

      lines.push('', t('statusBar.usageBasedPricing'));
    } catch (error) {
      lines.push(t('statusBar.usageBasedPricing'));
    }
  }

  /**
   * Get cursor token from database
   * @returns Token string or undefined if not found
   */
  private async getCursorToken(): Promise<string | undefined> {
    const { getCursorTokenFromDB } = await import('../services/database');
    return await getCursorTokenFromDB();
  }

  /**
   * Schedule notifications to run after a delay
   * @param cursorStats - Cursor stats
   * @param usageBasedStatus - Usage-based status
   */
  private scheduleNotifications(
    cursorStats: any,
    usageBasedStatus: { isEnabled: boolean; limit: number },
  ): void {
    setTimeout(() => {
      const premiumPercent = Math.round(
        (cursorStats.premiumRequests.current / cursorStats.premiumRequests.limit) * 100,
      );

      // Check premium usage
      checkAndNotifyUsage({
        percentage: premiumPercent,
        type: 'premium',
      });

      // Check usage-based if premium is over limit
      if (premiumPercent >= 100 && usageBasedStatus.isEnabled) {
        const { currentMonth, lastMonth } = cursorStats;
        const activeMonthData =
          currentMonth.usageBasedPricing.items.length > 0 ? currentMonth : lastMonth;

        const items = activeMonthData.usageBasedPricing.items;
        const actualTotalCost = items.reduce((sum: number, item: any) => {
          const cost = Number.parseFloat(item.totalDollars.replace('$', ''));
          return cost > 0 ? sum + cost : sum;
        }, 0);
        const usageBasedPercent = (actualTotalCost / usageBasedStatus.limit) * 100;

        checkAndNotifyUsage({
          percentage: usageBasedPercent,
          type: 'usage-based',
          limit: usageBasedStatus.limit,
          premiumPercentage: premiumPercent,
        });

        if (activeMonthData.usageBasedPricing.hasUnpaidMidMonthInvoice) {
          checkAndNotifyUnpaidInvoice(cursorStats.teamId);
        }
      }

      // Smart usage monitor
      checkAndNotifySmartUsageMonitor(
        cursorStats.premiumRequests.current,
        cursorStats.premiumRequests.limit,
      );
    }, 1000);
  }

  /**
   * Check for unknown models and show notification
   */
  private async checkUnknownModels(): Promise<void> {
    if (this.unknownModelNotificationShown || this.detectedUnknownModels.size === 0) {
      return;
    }

    this.unknownModelNotificationShown = true;
    const unknownModelsString = Array.from(this.detectedUnknownModels).join(', ');

    log('[ClassicModeHandler] Showing notification for unknown models: ' + unknownModelsString);

    const selection = await vscode.window.showInformationMessage(
      t('notifications.unknownModelsDetected', { models: unknownModelsString }),
      t('commands.createReport'),
      t('commands.openGitHubIssues'),
    );

    if (selection === t('commands.createReport')) {
      vscode.commands.executeCommand('cursor-stats.createReport');
    } else if (selection === t('commands.openGitHubIssues')) {
      vscode.env.openExternal(
        vscode.Uri.parse('https://github.com/Dwtexe/cursor-stats/issues/new'),
      );
    }
  }

  /**
   * Reset handler state
   */
  reset(): void {
    this.unknownModelNotificationShown = false;
    this.detectedUnknownModels.clear();
    log('[ClassicModeHandler] Reset handler state');
  }
}

/**
 * Factory function to create a ClassicModeHandler
 * @param config - Handler configuration
 * @returns New ClassicModeHandler instance
 */
export function createClassicModeHandler(config: ClassicModeHandlerConfig): ClassicModeHandler {
  return new ClassicModeHandler(config);
}
