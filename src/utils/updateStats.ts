import { log } from './logger';
import { getCursorTokenFromDB } from '../services/database';
import { checkUsageBasedStatus, fetchCursorStats } from '../services/api';
import {
  checkAndNotifyUsage,
  checkAndNotifySpending,
  checkAndNotifyUnpaidInvoice,
} from '../handlers/notifications';
import {
  startRefreshInterval,
  getCooldownStartTime,
  getConsecutiveErrorCount,
  incrementConsecutiveErrorCount,
  setCooldownStartTime,
  resetConsecutiveErrorCount,
} from './cooldown';
import {
  createMarkdownTooltip,
  formatTooltipLine,
  getMaxLineWidth,
  getStatusBarColor,
  createSeparator,
} from '../handlers/statusBar';
import * as vscode from 'vscode';
import { convertAndFormatCurrency } from './currency';
import { t } from './i18n';
import { isApiError, isDatabaseError, getErrorInfo } from '../interfaces/errors';
import axios from 'axios';
import { CursorUsageResponse } from '../interfaces/types';

// Track unknown models to avoid repeated notifications
let unknownModelNotificationShown = false;
let detectedUnknownModels: Set<string> = new Set();

/**
 * Validates token and handles no token scenario
 */
async function validateTokenAndSetupStatusBar(
  statusBarItem: vscode.StatusBarItem,
): Promise<string | null> {
  const token = await getCursorTokenFromDB();

  if (!token) {
    log('[Critical] No valid token found', true);
    statusBarItem.text = `$(alert) ${t('statusBar.noTokenFound')}`;
    statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorBackground');
    const tooltipLines = [t('statusBar.couldNotRetrieveToken')];
    statusBarItem.tooltip = await createMarkdownTooltip(tooltipLines, true);
    log('[Status Bar] Updated status bar with no token message');
    statusBarItem.show();
    log('[Status Bar] Status bar visibility updated after no token');
    return null;
  }

  // Show status bar early to ensure visibility
  statusBarItem.show();
  return token;
}

/**
 * Fetches cursor stats with token refresh retry logic
 */
async function fetchStatsWithRetry(token: string): Promise<any> {
  return await fetchCursorStats(token).catch(async (error: unknown) => {
    // Check if it's an API authentication error
    if (isApiError(error) && (error.status === 401 || error.status === 403)) {
      log('[Auth] Token expired or invalid, attempting to refresh...', true);
      const newToken = await getCursorTokenFromDB();
      if (newToken) {
        log('[Auth] Successfully retrieved new token, retrying stats fetch...');
        return await fetchCursorStats(newToken);
      }
    }

    const errorInfo = getErrorInfo(error);
    log(`[Critical] API error: ${errorInfo.message}`, true);
    throw error; // Re-throw to be caught by outer catch
  });
}

/**
 * Resets error state on successful API connection
 */
function resetErrorStateOnSuccess(): void {
  if (getConsecutiveErrorCount() > 0 || getCooldownStartTime()) {
    log('[Stats] API connection restored, resetting error state');
    resetConsecutiveErrorCount();
    if (getCooldownStartTime()) {
      setCooldownStartTime(null);
      startRefreshInterval();
    }
  }
}

/**
 * Calculates usage data including percentages and cost text
 */
async function calculateUsageData(
  stats: any,
  usageStatus: any,
): Promise<{
  costText: string;
  totalUsageText: string;
  premiumPercent: number;
  usageBasedPercent: number;
  usagePercent: number;
  activeMonthData: any;
}> {
  let costText = '';

  // Calculate usage percentages
  const premiumPercent = Math.round(
    (stats.premiumRequests.current / stats.premiumRequests.limit) * 100,
  );
  let usageBasedPercent = 0;
  let totalUsageText = '';

  // Use current month if it has data, otherwise fall back to last month
  const activeMonthData =
    stats.currentMonth.usageBasedPricing.items.length > 0 ? stats.currentMonth : stats.lastMonth;

  log(
    `[Stats] Using ${activeMonthData === stats.currentMonth ? 'current' : 'last'} month data (${activeMonthData.month}/${activeMonthData.year})`,
  );

  if (activeMonthData.usageBasedPricing.items.length > 0) {
    const items = activeMonthData.usageBasedPricing.items;

    // Calculate actual total cost (sum of positive items only)
    const actualTotalCost = items.reduce((sum: number, item: any) => {
      const cost = parseFloat(item.totalDollars.replace('$', ''));
      // Only add positive costs (ignore mid-month payment credits)
      return cost > 0 ? sum + cost : sum;
    }, 0);

    // Calculate usage percentage based on actual total cost (always in USD)
    if (usageStatus.isEnabled && usageStatus.limit) {
      usageBasedPercent = (actualTotalCost / usageStatus.limit) * 100;
    }

    // Convert actual cost currency for status bar display
    const formattedActualCost = await convertAndFormatCurrency(actualTotalCost);
    costText = ` $(credit-card) ${formattedActualCost}`;

    // Status bar should only show premium requests count, not total
    totalUsageText = ` ${stats.premiumRequests.current}/${stats.premiumRequests.limit}${costText}`;
  } else {
    totalUsageText = ` ${stats.premiumRequests.current}/${stats.premiumRequests.limit}`;
  }

  // Set status bar color based on usage type
  // Always use only premium percent for color calculation, not combined totals
  const usagePercent = premiumPercent;

  log(`[Stats] Color calculation details:`, {
    premiumRequests: `${stats.premiumRequests.current}/${stats.premiumRequests.limit}`,
    premiumPercent: premiumPercent,
    usageBasedPercent: usageBasedPercent,
    usageBasedEnabled: usageStatus.isEnabled,
    finalUsagePercent: usagePercent,
  });

  return {
    costText,
    totalUsageText,
    premiumPercent,
    usageBasedPercent,
    usagePercent,
    activeMonthData,
  };
}

/**
 * Formats date with month name for tooltip display
 */
function formatDateWithMonthName(date: Date): string {
  const day = date.getDate();
  const monthNames = [
    t('statusBar.months.january'),
    t('statusBar.months.february'),
    t('statusBar.months.march'),
    t('statusBar.months.april'),
    t('statusBar.months.may'),
    t('statusBar.months.june'),
    t('statusBar.months.july'),
    t('statusBar.months.august'),
    t('statusBar.months.september'),
    t('statusBar.months.october'),
    t('statusBar.months.november'),
    t('statusBar.months.december'),
  ];
  const monthName = monthNames[date.getMonth()];
  return `${day} ${monthName}`;
}

/**
 * Builds the initial tooltip content with basic stats
 */
async function buildTooltipContent(stats: any, usageData: any, token: string): Promise<string[]> {
  // Build content first to determine width
  const title = t('statusBar.cursorUsageStats');
  const contentLines = [title, ''];

  // Add Team Spend section if using team spend data
  if (stats.isTeamSpendData) {
    contentLines.push(t('statusBar.teamSpend'));
  }

  contentLines.push(t('statusBar.premiumFastRequests'));

  // Format premium requests progress with fixed decimal places
  const premiumPercentFormatted = Math.round(usageData.premiumPercent);
  const startDate = new Date(stats.premiumRequests.startOfMonth);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  contentLines.push(
    formatTooltipLine(
      `   • ${stats.premiumRequests.current}/${stats.premiumRequests.limit} ${t('statusBar.requestsUsed')}`,
    ),
    formatTooltipLine(`   📊 ${premiumPercentFormatted}% ${t('statusBar.utilized')}`),
    formatTooltipLine(
      `   ${t('statusBar.fastRequestsPeriod')}: ${formatDateWithMonthName(startDate)} - ${formatDateWithMonthName(endDate)}`,
    ),
    '',
  );

  return contentLines;
}

/**
 * Adds detailed usage breakdown to tooltip content
 */
async function addDetailedUsageBreakdown(
  contentLines: string[],
  stats: any,
  token: string,
): Promise<void> {
  // Add detailed model usage breakdown if available
  try {
    const userId = token.split('%3A%3A')[0];
    const usageResponse = await axios.get<CursorUsageResponse>('https://cursor.com/api/usage', {
      params: { user: userId },
      headers: { Cookie: `WorkosCursorSessionToken=${token}` },
    });

    const usageData = usageResponse.data;

    // Show team vs individual comparison if using team spend data
    if (stats.isTeamSpendData) {
      // Get team spend data for comparison
      let teamSpendRequests = 'N/A';
      try {
        const { checkTeamMembership, getTeamSpend, extractUserSpend } = await import(
          '../services/team'
        );
        const context = await import('../extension').then((m) => m.getExtensionContext());
        const teamInfo = await checkTeamMembership(token, context);

        if (teamInfo.isTeamMember && teamInfo.teamId && teamInfo.userId) {
          const teamSpend = await getTeamSpend(token, teamInfo.teamId);
          const userSpend = extractUserSpend(teamSpend, teamInfo.userId);
          teamSpendRequests = (userSpend.fastPremiumRequests || 0).toString();
        }
      } catch (error) {
        log('[Stats] Error fetching team spend for comparison: ' + error, true);
      }

      contentLines.push(
        '🔍 **Data Source Information**',
        formatTooltipLine(
          `   • **Current Display**: Using GPT-4 individual data (${usageData['gpt-4'].numRequests} requests)`,
        ),
        formatTooltipLine(
          `   • **Team Spend Data**: ${teamSpendRequests} requests (may update slower)`,
        ),
        '',
      );
    }

    contentLines.push('📊 **Detailed Usage Breakdown**', '');

    // Show data for each model with better labeling
    Object.entries(usageData).forEach(([modelName, data]) => {
      if (typeof data === 'object' && data !== null && 'numRequests' in data) {
        const modelData = data as {
          numRequests: number;
          maxRequestUsage: number | null;
          numTokens: number;
        };
        const hasLimit = modelData.maxRequestUsage !== null;
        const hasTokens = modelData.numTokens > 0;

        let displayName = modelName;
        let description = '';

        // Better labeling based on your clarification
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

        contentLines.push(formatTooltipLine(modelLine));

        // Add description for clarity
        if (description) {
          contentLines.push(formatTooltipLine(`     ${description}`));
        }
      }
    });

    contentLines.push('', t('statusBar.usageBasedPricing'));
  } catch (error) {
    // If we can't get detailed usage data, just continue with the regular flow
    contentLines.push(t('statusBar.usageBasedPricing'));
  }
}

/**
 * Adds usage-based pricing section to tooltip content
 */
async function addUsageBasedPricingSection(
  contentLines: string[],
  activeMonthData: any,
  usageStatus: any,
): Promise<void> {
  if (activeMonthData.usageBasedPricing.items.length > 0) {
    const items = activeMonthData.usageBasedPricing.items;

    // Calculate actual total cost (sum of positive items only)
    const actualTotalCost = items.reduce((sum: number, item: any) => {
      const cost = parseFloat(item.totalDollars.replace('$', ''));
      // Only add positive costs (ignore mid-month payment credits)
      return cost > 0 ? sum + cost : sum;
    }, 0);

    // Calculate usage-based pricing period for the active month
    const billingDay = 3;
    let periodStart = new Date(activeMonthData.year, activeMonthData.month - 1, billingDay);
    let periodEnd = new Date(activeMonthData.year, activeMonthData.month, billingDay - 1);

    // Adjust year if period spans across year boundary
    if (periodEnd < periodStart) {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    contentLines.push(
      formatTooltipLine(
        `   ${t('statusBar.usageBasedPeriod')}: ${formatDateWithMonthName(periodStart)} - ${formatDateWithMonthName(periodEnd)}`,
      ),
    );

    // Calculate unpaid amount correctly
    const unpaidAmount = Math.max(
      0,
      actualTotalCost - activeMonthData.usageBasedPricing.midMonthPayment,
    );

    // Calculate usage percentage based on actual total cost (always in USD)
    const usagePercentage = usageStatus.limit
      ? ((actualTotalCost / usageStatus.limit) * 100).toFixed(1)
      : '0.0';

    // Convert currency for tooltip
    const formattedActualTotalCost = await convertAndFormatCurrency(actualTotalCost);
    const formattedUnpaidAmount = await convertAndFormatCurrency(unpaidAmount);

    // Store original values for statusBar.ts to use, using actual total cost
    const originalUsageData = {
      usdTotalCost: actualTotalCost, // Use actual cost here
      usdLimit: usageStatus.limit || 0,
      percentage: usagePercentage,
    };

    if (activeMonthData.usageBasedPricing.midMonthPayment > 0) {
      contentLines.push(
        formatTooltipLine(
          `   ${t('statusBar.currentUsage')} (${t('statusBar.total')}: ${formattedActualTotalCost} - ${t('statusBar.unpaid')}: ${formattedUnpaidAmount})`,
        ),
        formatTooltipLine(`   __USD_USAGE_DATA__:${JSON.stringify(originalUsageData)}`), // Hidden metadata line
        '',
      );
    } else {
      contentLines.push(
        formatTooltipLine(
          `   ${t('statusBar.currentUsage')} (${t('statusBar.total')}: ${formattedActualTotalCost})`,
        ),
        formatTooltipLine(`   __USD_USAGE_DATA__:${JSON.stringify(originalUsageData)}`), // Hidden metadata line
        '',
      );
    }
  }
}

/**
 * Processes usage items and adds them to tooltip content
 */
async function processUsageItems(contentLines: string[], activeMonthData: any): Promise<void> {
  if (activeMonthData.usageBasedPricing.items.length > 0) {
    const items = activeMonthData.usageBasedPricing.items;

    // Determine the maximum length for formatted item costs for padding
    let maxFormattedItemCostLength = 0;
    for (const item of items) {
      if (item.description?.includes('Mid-month usage paid')) {
        continue;
      }
      const itemCost = parseFloat(item.totalDollars.replace('$', ''));
      // We format with 2 decimal places for display
      const tempFormattedCost = itemCost.toFixed(2); // Format to string with 2 decimals
      if (tempFormattedCost.length > maxFormattedItemCostLength) {
        maxFormattedItemCostLength = tempFormattedCost.length;
      }
    }

    for (const item of items) {
      // Skip mid-month payment line item from the detailed list
      if (item.description?.includes('Mid-month usage paid')) {
        continue;
      }

      // If the item has a description, use it to provide better context
      if (item.description) {
        // Convert item cost for display
        const itemCost = parseFloat(item.totalDollars.replace('$', ''));
        let formattedItemCost = await convertAndFormatCurrency(itemCost);

        // Pad the numerical part of the formattedItemCost
        const currencySymbol = formattedItemCost.match(/^[^0-9-.\\,]*/)?.[0] || '';
        const numericalPart = formattedItemCost.substring(currencySymbol.length);
        const paddedNumericalPart = numericalPart.padStart(maxFormattedItemCostLength, '0');
        formattedItemCost = currencySymbol + paddedNumericalPart;

        let line = `   • ${item.calculation} ➜ &nbsp;&nbsp;**${formattedItemCost}**`;
        const modelName = item.modelNameForTooltip;
        let modelNameDisplay = ''; // Initialize for the model name part of the string

        if (modelName) {
          // Make sure modelName is there
          const isDiscounted =
            item.description && item.description.toLowerCase().includes('discounted');
          const isUnknown = modelName === 'unknown-model';

          if (isDiscounted) {
            modelNameDisplay = `(${t('statusBar.discounted')} | ${isUnknown ? t('statusBar.unknownModel') : modelName})`;
          } else if (isUnknown) {
            modelNameDisplay = `(${t('statusBar.unknownModel')})`;
          } else {
            modelNameDisplay = `(${modelName})`;
          }
        }
        // If modelName was undefined or null, modelNameDisplay remains empty.

        if (modelNameDisplay) {
          // Only add spacing and display string if it's not empty
          const desiredTotalWidth = 70; // Adjust as needed for good visual alignment
          const currentLineWidth = line.replace(/\*\*/g, '').replace(/&nbsp;/g, ' ').length; // Approx length without markdown & html spaces
          const modelNameDisplayLength = modelNameDisplay.replace(/&nbsp;/g, ' ').length;
          const spacesNeeded = Math.max(
            1,
            desiredTotalWidth - currentLineWidth - modelNameDisplayLength,
          );
          line += ' '.repeat(spacesNeeded) + `&nbsp;&nbsp;&nbsp;&nbsp;${modelNameDisplay}`;
        }
        contentLines.push(formatTooltipLine(line));
      } else {
        // Fallback for items without a description (should be rare but handle it)
        const itemCost = parseFloat(item.totalDollars.replace('$', ''));
        let formattedItemCost = await convertAndFormatCurrency(itemCost);

        // Pad the numerical part of the formattedItemCost
        const currencySymbol = formattedItemCost.match(/^[^0-9-.\\,]*/)?.[0] || '';
        const numericalPart = formattedItemCost.substring(currencySymbol.length);
        const paddedNumericalPart = numericalPart.padStart(maxFormattedItemCostLength, '0');
        formattedItemCost = currencySymbol + paddedNumericalPart;

        // Use a generic calculation string if item.calculation is also missing, or the original if available
        const calculationString = item.calculation || t('statusBar.unknownItem');
        contentLines.push(
          formatTooltipLine(`   • ${calculationString} ➜ &nbsp;&nbsp;**${formattedItemCost}**`),
        );
      }
    }

    contentLines.push('');
  } else {
    contentLines.push(formatTooltipLine(`   ${t('statusBar.noUsageBasedCharges')}`), '');
  }
}

/**
 * Finalizes tooltip and status bar display
 */
async function finalizeTooltipAndStatusBar(
  contentLines: string[],
  usageData: any,
  statusBarItem: vscode.StatusBarItem,
): Promise<void> {
  // Calculate the maximum line width for proper formatting
  const maxLineWidth = getMaxLineWidth(contentLines);

  // Add separator and footer
  contentLines.push(createSeparator(maxLineWidth));
  contentLines.push(formatTooltipLine(t('statusBar.clickToOpenSettings')));

  // Set tooltip
  statusBarItem.tooltip = await createMarkdownTooltip(contentLines);

  // Set status bar text
  statusBarItem.text = `$(pulse) ${usageData.totalUsageText}`;

  log('[Status Bar] Status bar updated successfully');
  log('[Stats] ' + '='.repeat(100));
}

export async function updateStats(statusBarItem: vscode.StatusBarItem) {
  try {
    log('[Stats] ' + '='.repeat(100));
    log('[Stats] Starting stats update...');

    const token = await validateTokenAndSetupStatusBar(statusBarItem);
    if (!token) {
      return;
    }

    const stats = await fetchStatsWithRetry(token);

    resetErrorStateOnSuccess();

    // Check usage-based status with team information if available
    const usageStatus = await checkUsageBasedStatus(token, stats.teamId);
    log(`[Stats] Usage-based pricing status: ${JSON.stringify(usageStatus)}`);

    const usageData = await calculateUsageData(stats, usageStatus);
    statusBarItem.color = getStatusBarColor(usageData.usagePercent);

    const contentLines = await buildTooltipContent(stats, usageData, token);

    await addDetailedUsageBreakdown(contentLines, stats, token);

    await addUsageBasedPricingSection(contentLines, usageData.activeMonthData, usageStatus);

    await processUsageItems(contentLines, usageData.activeMonthData);

    await finalizeTooltipAndStatusBar(contentLines, usageData, statusBarItem);
  } catch (error: unknown) {
    incrementConsecutiveErrorCount();
    const errorInfo = getErrorInfo(error);
    log(`[Critical] API error: ${errorInfo.message}`, true);
    log(`[Critical] Error details: ${JSON.stringify(errorInfo)}`, true);
    log('[Status Bar] Status bar visibility updated after error');
  }
}
