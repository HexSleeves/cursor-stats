import * as vscode from 'vscode';
import { log } from '../utils/logger';
import { getCurrentUsageLimit, checkUsageBasedStatus } from '../services/api';
import { getCursorTokenFromDB } from '../services/database';
import { convertAndFormatCurrency } from '../utils/currency';
import { t } from '../utils/i18n';
import { getExtensionContext } from '../extension';
import { formatPercentageIntelligent } from '../utils/percentageFormatter';
import { checkTeamMembership } from '../services/team';
import {
  shouldShowProgressBars,
  createPeriodProgressBar,
  createUsageProgressBar,
  calculateDailyRemaining,
  getMonthNumber,
} from '../utils/progressBars';
// Import from new UI components
import { TooltipBuilder } from '../ui/TooltipBuilder';
import { getStatusBarColor } from '../ui/StatusColorProvider';
import type { ColorThreshold } from '../ui/StatusColorProvider';

let statusBarItem: vscode.StatusBarItem;

// Re-export types from new UI components for backward compatibility
export type { ColorThreshold };

export function createStatusBarItem(): vscode.StatusBarItem {
  log('[Status Bar] Creating status bar item...');
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  log('[Status Bar] Status bar alignment: Right, Priority: 100');
  return statusBarItem;
}

// Re-export functions from TooltipBuilder for backward compatibility
export const formatTooltipLine = TooltipBuilder.formatLine;
export const getMaxLineWidth = TooltipBuilder.getMaxLineWidth;
export const createSeparator = TooltipBuilder.createSeparator;
export const formatRelativeTime = TooltipBuilder.formatRelativeTime;

// Re-export getStatusBarColor from StatusColorProvider for backward compatibility
export { getStatusBarColor };

// Complex tooltip with progress bars and action buttons
// TODO: Further refactor to use TooltipBuilder more extensively
export async function createMarkdownTooltip(
  lines: string[],
  isError: boolean = false,
  allLines: string[] = [],
): Promise<vscode.MarkdownString> {
  const tooltip = new vscode.MarkdownString();
  tooltip.isTrusted = true;
  tooltip.supportHtml = true;
  tooltip.supportThemeIcons = true;

  // Header section with centered title
  tooltip.appendMarkdown('<div align="center">\n\n');
  tooltip.appendMarkdown(`## ⚡ ${t('statusBar.cursorUsageStats')}\n\n`);
  tooltip.appendMarkdown('</div>\n\n');

  if (isError) {
    tooltip.appendMarkdown(`> ⚠️ **${t('statusBar.errorState')}**\n\n`);
    tooltip.appendMarkdown(lines.join('\n\n'));
  } else {
    // Premium Requests Section
    // Check for the translated premium fast requests section
    const premiumRequestsSection = lines.find(
      (line) => line === t('statusBar.premiumFastRequests'),
    );
    if (premiumRequestsSection) {
      tooltip.appendMarkdown('<div align="center">\n\n');
      tooltip.appendMarkdown(`### 🚀 ${t('statusBar.premiumFastRequests')}\n\n`);
      tooltip.appendMarkdown('</div>\n\n');

      // Extract and format premium request info
      const requestLine = lines.find((line) => line.includes(t('statusBar.requestsUsed')));
      const percentLine = lines.find((line) => line.includes(t('statusBar.utilized')));
      const startOfMonthLine = lines.find((line) =>
        line.includes(t('statusBar.fastRequestsPeriod')),
      );

      if (requestLine) {
        // Extract usage information from request line and percentage line
        const usageMatch = requestLine.match(/(\d+)\/(\d+)/);
        const percentMatch = percentLine ? percentLine.match(/(\d+)%/) : null;

        if (usageMatch && usageMatch.length >= 3 && percentMatch && percentMatch.length >= 2) {
          const used = Number.parseInt(usageMatch[1]);
          const total = Number.parseInt(usageMatch[2]);
          const percent = Number.parseInt(percentMatch[1]);

          let displayText = `${used}/${total} (${percent}%) ${t('statusBar.used')}`;

          if (startOfMonthLine) {
            const periodInfo = startOfMonthLine.split(':')[1].trim();
            displayText = `${periodInfo} ● ${displayText}`;

            // Calculate date elapsed percentage
            const [startDate, endDate] = periodInfo.split('-').map((d) => d.trim());
            const elapsedPercent = Math.round(calculateDateElapsedPercentage(startDate, endDate));
            displayText = `${periodInfo} (${elapsedPercent}%) ● ${used}/${total} (${percent}%) ${t('statusBar.used')}`;

            // Display the text
            tooltip.appendMarkdown(`<div align="center">${displayText}</div>\n\n`);

            // Add progress bar for premium requests
            if (shouldShowProgressBars() && periodInfo) {
              // First add usage progress bar
              const usageProgressBar = createUsageProgressBar(used, total, t('statusBar.usage'));
              if (usageProgressBar) {
                tooltip.appendMarkdown(`<div align="center">${usageProgressBar}</div>\n\n`);
              }

              // Then add period progress bar
              const periodProgressBar = createPeriodProgressBar(
                periodInfo,
                undefined,
                t('statusBar.period'),
              );
              if (periodProgressBar) {
                tooltip.appendMarkdown(`<div align="center">${periodProgressBar}</div>\n\n`);
              }
            }

            // Add weekday indication and daily remaining calculation (independent of progress bars)
            if (periodInfo) {
              const config = vscode.workspace.getConfiguration('cursorStats');
              // Parse the end date from the period info
              const [startDateStr, endDateStr] = periodInfo.split('-').map((d) => d.trim());
              const currentYear = new Date().getFullYear();
              const endParts = endDateStr.split(' ');
              const endDay = Number.parseInt(endParts[0]);
              const endMonth = getMonthNumber(endParts[1]);
              let periodEndDate = new Date(currentYear, endMonth, endDay);

              // If end date is before start date, it means the period crosses into next year
              const startParts = startDateStr.split(' ');
              const startDay = Number.parseInt(startParts[0]);
              const startMonth = getMonthNumber(startParts[1]);
              const periodStartDate = new Date(currentYear, startMonth, startDay);

              if (periodEndDate < periodStartDate) {
                periodEndDate.setFullYear(currentYear + 1);
              }

              const dailyRemainingText = calculateDailyRemaining(used, total, periodEndDate);
              if (dailyRemainingText) {
                // Handle multi-line daily remaining text
                const lines = dailyRemainingText.split('\n');
                lines.forEach((line) => {
                  if (line.trim()) {
                    tooltip.appendMarkdown(`<div align="center">${line.trim()}</div>\n\n`);
                  }
                });
              }
            }
          } else {
            tooltip.appendMarkdown(`<div align="center">${displayText}</div>\n\n`);
          }
        } else {
          // Fallback to original format if parsing fails
          let displayText = `${requestLine.split('•')[1].trim()}`;

          if (startOfMonthLine) {
            const periodInfo = startOfMonthLine.split(':')[1].trim();
            displayText = `${periodInfo} ● ${displayText}`;
          }

          tooltip.appendMarkdown(`<div align="center">${displayText}</div>\n\n`);
        }
      }
    }

    // Usage Based Pricing Section
    const token = await getCursorTokenFromDB();
    let isEnabled = false;

    if (token) {
      try {
        // Check if user is a team member to pass teamId to the usage-based status check
        const context = getExtensionContext();
        const teamInfo = await checkTeamMembership(token, context);

        // Use the new checkUsageBasedStatus function with teamId if available
        const usageStatus = await checkUsageBasedStatus(token, teamInfo.teamId);
        isEnabled = usageStatus.isEnabled;
        const limitResponse = await getCurrentUsageLimit(token, teamInfo.teamId);

        // Find the original USD data from allLines
        let originalUsageData = null;
        if (allLines && allLines.length > 0) {
          const metadataLine = allLines.find((line) => line.includes('__USD_USAGE_DATA__:'));
          if (metadataLine) {
            try {
              const jsonStr = metadataLine.split('__USD_USAGE_DATA__:')[1].trim();
              originalUsageData = JSON.parse(jsonStr);
            } catch (e: any) {
              log('[Status Bar] Error parsing USD data: ' + e.message, true);
            }
          }
        }

        const costLine = lines.find((line) => line.includes(t('statusBar.totalCost')));
        let totalCost = 0;
        let formattedTotalCost = '';

        if (costLine) {
          // Extract the cost value, regardless of currency format
          const costMatch = costLine.match(/[^0-9]*([0-9.,]+)/);
          if (costMatch && costMatch[1]) {
            // Convert back to a number, removing any non-numeric characters except decimal point
            totalCost = Number.parseFloat(costMatch[1].replace(/[^0-9.]/g, ''));
            formattedTotalCost = costLine.split(':')[1].trim();
          }
        }

        const usageBasedPeriodLine = lines.find((line) =>
          line.includes(t('statusBar.usageBasedPeriod')),
        );

        tooltip.appendMarkdown('<div align="center">\n\n');
        tooltip.appendMarkdown(
          `### 📈 ${t('statusBar.usageBasedPricing')} (${isEnabled ? t('statusBar.enabled') : t('statusBar.disabled')})\n\n`,
        );
        tooltip.appendMarkdown('</div>\n\n');

        if (isEnabled && limitResponse.hardLimit) {
          if (usageBasedPeriodLine) {
            const periodText = usageBasedPeriodLine.split(':')[1].trim();

            // Use the original USD data for percentage calculation if available
            let usagePercentage = '0.0';
            if (originalUsageData && originalUsageData.percentage) {
              usagePercentage = originalUsageData.percentage;
            } else {
              // Fallback to calculating with converted values
              usagePercentage = formatPercentageIntelligent(
                (totalCost / limitResponse.hardLimit) * 100,
              );
            }

            // Convert the limit to the user's preferred currency
            const formattedLimit = await convertAndFormatCurrency(limitResponse.hardLimit);

            // Calculate date elapsed percentage for usage-based period
            const [startDate, endDate] = periodText.split('-').map((d) => d.trim());
            const elapsedPercent = Math.round(calculateDateElapsedPercentage(startDate, endDate));

            tooltip.appendMarkdown(
              `<div align="center">${periodText} (${elapsedPercent}%) ● ${formattedLimit} (${usagePercentage}% | ${formattedTotalCost} ${t('statusBar.used')})</div>\n\n`,
            );

            // Add usage-based pricing progress bar
            if (shouldShowProgressBars()) {
              const usageProgressBar = createUsageProgressBar(
                Number.parseFloat(usagePercentage),
                100,
                t('statusBar.usage'),
              );
              if (usageProgressBar) {
                tooltip.appendMarkdown(`<div align="center">${usageProgressBar}</div>\n\n`);
              }

              // Add period progress bar
              const periodProgressBar = createPeriodProgressBar(
                periodText,
                undefined,
                t('statusBar.period'),
              );
              if (periodProgressBar) {
                tooltip.appendMarkdown(`<div align="center">${periodProgressBar}</div>\n\n`);
              }
            }
          }
        } else if (!isEnabled) {
          tooltip.appendMarkdown(`> ℹ️ ${t('statusBar.usageBasedDisabled')}\n\n`);
        }

        // Show usage details regardless of enabled/disabled status
        // Filter out the mid-month payment item before displaying
        const pricingLines = lines
          .filter(
            (line) =>
              (line.includes('*') || line.includes('→')) &&
              line.includes('➜') &&
              !line.includes(t('api.midMonthPayment')), // Exclude the mid-month payment line item
          )
          .sort((a, b) => {
            // Extract request count from the line (e.g., "   • **042** req @ $0.001~ ➜  **$0.04**   (gpt-4-turbo)")
            // The count is between the first pair of double asterisks.
            const countA = Number.parseInt(a.match(/\*\*(\d+)\*\*/)?.[1] || '0');
            const countB = Number.parseInt(b.match(/\*\*(\d+)\*\*/)?.[1] || '0');
            return countB - countA; // Sort in descending order
          });

        if (pricingLines.length > 0) {
          // Find mid-month payment from the lines directly
          const informationalMidMonthLine = lines.find((line) =>
            line.includes(t('statusBar.youHavePaid').split(' {amount}')[0]),
          );
          let midMonthPayment = 0;
          let formattedMidMonthPayment = '';

          if (informationalMidMonthLine) {
            // Extract the payment amount from the informational line
            const paymentMatch = informationalMidMonthLine.match(/paid ([^ ]+)/); // Match the amount after "paid "
            if (paymentMatch && paymentMatch[1]) {
              formattedMidMonthPayment = paymentMatch[1];
              // Attempt to parse the numerical value, removing currency symbols/commas
              midMonthPayment = Number.parseFloat(formattedMidMonthPayment.replace(/[^0-9.]/g, '')) || 0;
            }
          }

          const unpaidAmount = totalCost - midMonthPayment;

          // Use formatted output directly
          pricingLines.forEach((line) => {
            tooltip.appendMarkdown(`• ${line.replace('•', '').trim()}\n\n`);
          });

          // Add mid-month payment message if it exists (using the found informational line)
          if (informationalMidMonthLine) {
            const unpaidPrefix = t('statusBar.unpaidAmount').split(' {amount}')[0];
            let extractedUnpaidAmountStr = lines
              .find((line) => line.includes(unpaidPrefix))
              ?.split(unpaidPrefix + ':')[1]
              .trim();
            if (extractedUnpaidAmountStr && extractedUnpaidAmountStr.endsWith(')')) {
              extractedUnpaidAmountStr = extractedUnpaidAmountStr.slice(0, -1);
            }
            const formattedUnpaidAmount =
              extractedUnpaidAmountStr || (await convertAndFormatCurrency(unpaidAmount));

            // Use the already formatted informational line, just add the unpaid part dynamically
            tooltip.appendMarkdown(
              `> ${informationalMidMonthLine.trim()}. (${t('statusBar.unpaidAmount', { amount: `**${formattedUnpaidAmount}**` })})\n\n`,
            );
          }
        } else {
          tooltip.appendMarkdown(`> ℹ️ ${t('statusBar.noUsageRecorded')}\n\n`);
        }
      } catch (error: any) {
        log('[API] Error fetching limit for tooltip: ' + error.message, true);
        tooltip.appendMarkdown(`> ⚠️ ${t('statusBar.errorCheckingStatus')}\n\n`);
      }
    } else {
      tooltip.appendMarkdown(`> ⚠️ ${t('statusBar.unableToCheckStatus')}\n\n`);
    }
  }

  // Action Buttons Section with new compact design
  tooltip.appendMarkdown('---\n\n');
  tooltip.appendMarkdown('<div align="center">\n\n');

  // First row: Account and Extension settings
  tooltip.appendMarkdown(
    `🌐 [${t('statusBar.accountSettings')}](https://www.cursor.com/settings) • `,
  );
  tooltip.appendMarkdown(`🌍 [${t('statusBar.currency')}](command:cursor-stats.selectCurrency) • `);
  tooltip.appendMarkdown(
    `⚙️ [${t('statusBar.extensionSettings')}](command:workbench.action.openSettings?%22@ext%3ADwtexe.cursor-stats%22)\n\n`,
  );

  // Second row: Usage Based Pricing, Refresh, and Last Updated
  const updatedLine = lines.find((line) => line.includes(t('time.lastUpdated')));
  const updatedTime = updatedLine
    ? formatRelativeTime(updatedLine.split(':').slice(1).join(':').trim())
    : new Date().toLocaleTimeString();

  tooltip.appendMarkdown(
    `💰 [${t('statusBar.usageBasedPricing')}](command:cursor-stats.setLimit) • `,
  );
  tooltip.appendMarkdown(`🔄 [${t('statusBar.refresh')}](command:cursor-stats.refreshStats) • `);
  tooltip.appendMarkdown(`🕒 ${updatedTime}\n\n`);

  tooltip.appendMarkdown('</div>');

  return tooltip;
}

// getStatusBarColor is now imported from StatusColorProvider

export function getMonthName(month: number): string {
  const monthKeys = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const monthKey = monthKeys[month - 1];
  return monthKey ? t(`statusBar.months.${monthKey}`) : `${t('statusBar.month')} ${month}`;
}

function calculateDateElapsedPercentage(startDateStr: string, endDateStr: string): number {
  // Parse dates in "DD Month" format
  const parseDate = (dateStr: string) => {
    const [day, month] = dateStr.trim().split(' ');

    // Build translation map for current language
    const months: { [key: string]: number } = {};

    // English month names (fallback)
    const englishMonths = {
      January: 0,
      February: 1,
      March: 2,
      April: 3,
      May: 4,
      June: 5,
      July: 6,
      August: 7,
      September: 8,
      October: 9,
      November: 10,
      December: 11,
    };

    // Add English names
    Object.assign(months, englishMonths);

    // Add translated names
    for (let i = 0; i < 12; i++) {
      const monthKeys = [
        'january',
        'february',
        'march',
        'april',
        'may',
        'june',
        'july',
        'august',
        'september',
        'october',
        'november',
        'december',
      ];
      const translatedName = t(`statusBar.months.${monthKeys[i]}`);
      months[translatedName] = i;
    }

    const currentYear = new Date().getFullYear();
    const monthIndex = months[month];

    if (monthIndex === undefined) {
      log(`[StatusBar] Could not parse month: ${month}`, true);
      return new Date(); // Return current date as fallback
    }

    return new Date(currentYear, monthIndex, Number.parseInt(day));
  };

  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);
  const currentDate = new Date();

  // Adjust year if the end date is in the next year
  if (endDate < startDate) {
    endDate.setFullYear(endDate.getFullYear() + 1);
  }

  // If current date is before start date, return 0%
  if (currentDate < startDate) {
    return 0;
  }

  // If current date is after end date, return 100%
  if (currentDate > endDate) {
    return 100;
  }

  const totalDuration = endDate.getTime() - startDate.getTime();
  const elapsedDuration = currentDate.getTime() - startDate.getTime();

  return Math.min(Math.max((elapsedDuration / totalDuration) * 100, 0), 100);
}
