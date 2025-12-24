/**
 * TooltipBuilder - Builds markdown tooltips for status bar
 * Extracted from handlers/statusBar.ts to separate UI concerns
 *
 * This component:
 * - Formats tooltip lines with proper wrapping
 * - Creates markdown strings for tooltips
 * - Builds separators and visual elements
 * - Handles time formatting
 * - Supports both error and success states
 */

import * as vscode from 'vscode';
import { log } from '../utils/logger';
import { t } from '../utils/i18n';

/**
 * Tooltip configuration options
 */
export interface TooltipConfig {
  /** Whether this is an error tooltip */
  isError?: boolean;
  /** Title for the tooltip */
  title?: string;
  /** All lines including metadata (for parsing) */
  allLines?: string[];
}

/**
 * TooltipBuilder creates markdown tooltips for the status bar
 */
export class TooltipBuilder {
  /**
   * Format a tooltip line with proper wrapping
   * @param text - Text to format
   * @param maxWidth - Maximum width before wrapping
   * @returns Formatted text
   */
  static formatLine(text: string, maxWidth: number = 50): string {
    if (text.length <= maxWidth) {
      return text;
    }
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + word).length > maxWidth) {
        if (currentLine) {
          lines.push(currentLine.trim());
        }
        currentLine = word;
      } else {
        currentLine += (currentLine ? ' ' : '') + word;
      }
    }
    if (currentLine) {
      lines.push(currentLine.trim());
    }
    return lines.join('\n   ');
  }

  /**
   * Get the maximum line width from an array of lines
   * @param lines - Lines to measure
   * @returns Maximum width
   */
  static getMaxLineWidth(lines: string[]): number {
    return Math.max(...lines.map((line) => line.length), 0);
  }

  /**
   * Create a separator line of specified width
   * @param width - Width of separator
   * @returns Separator string
   */
  static createSeparator(width: number): string {
    const separatorWidth = Math.floor(width / 2);
    return '╌'.repeat(separatorWidth + 5);
  }

  /**
   * Format relative time from date string
   * @param dateString - ISO date string
   * @returns Formatted time (HH:MM:SS)
   */
  static formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Create a markdown tooltip from content lines
   * @param lines - Content lines
   * @param config - Tooltip configuration
   * @returns Markdown string for tooltip
   */
  static async createMarkdownTooltip(
    lines: string[],
    config: TooltipConfig = {},
  ): Promise<vscode.MarkdownString> {
    const { isError = false, allLines = [] } = config;

    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;
    tooltip.supportHtml = true;
    tooltip.supportThemeIcons = true;

    // Header section with centered title
    const title = config.title || t('statusBar.cursorUsageStats');
    tooltip.appendMarkdown('<div align="center">\n\n');
    tooltip.appendMarkdown(`## ⚡ ${title}\n\n`);
    tooltip.appendMarkdown('</div>\n\n');

    if (isError) {
      tooltip.appendMarkdown(`> ⚠️ **${t('statusBar.errorState')}**\n\n`);
      tooltip.appendMarkdown(lines.join('\n\n'));
    } else {
      await this.buildContentSections(tooltip, lines, allLines);
    }

    // Action Buttons Section
    this.buildActionButtons(tooltip, lines);

    return tooltip;
  }

  /**
   * Build content sections for the tooltip
   * @param tooltip - Markdown string to append to
   * @param lines - Content lines
   * @param allLines - All lines including metadata
   */
  private static async buildContentSections(
    tooltip: vscode.MarkdownString,
    lines: string[],
    allLines: string[],
  ): Promise<void> {
    // Premium Requests Section
    this.buildPremiumRequestsSection(tooltip, lines);

    // Usage Based Pricing Section
    await this.buildUsageBasedPricingSection(tooltip, lines, allLines);
  }

  /**
   * Build premium requests section
   * @param tooltip - Markdown string to append to
   * @param lines - Content lines
   */
  private static buildPremiumRequestsSection(
    tooltip: vscode.MarkdownString,
    lines: string[],
  ): void {
    const premiumRequestsSection = lines.find(
      (line) => line === t('statusBar.premiumFastRequests'),
    );
    if (!premiumRequestsSection) {
      return;
    }

    tooltip.appendMarkdown('<div align="center">\n\n');
    tooltip.appendMarkdown(`### 🚀 ${t('statusBar.premiumFastRequests')}\n\n`);
    tooltip.appendMarkdown('</div>\n\n');

    const requestLine = lines.find((line) => line.includes(t('statusBar.requestsUsed')));
    const percentLine = lines.find((line) => line.includes(t('statusBar.utilized')));
    const startOfMonthLine = lines.find((line) => line.includes(t('statusBar.fastRequestsPeriod')));

    if (!requestLine) {
      return;
    }

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
        tooltip.appendMarkdown(`<div align="center">${displayText}</div>\n\n`);
      } else {
        tooltip.appendMarkdown(`<div align="center">${displayText}</div>\n\n`);
      }
    } else {
      // Fallback
      let displayText = `${requestLine.split('•')[1].trim()}`;
      if (startOfMonthLine) {
        const periodInfo = startOfMonthLine.split(':')[1].trim();
        displayText = `${periodInfo} ● ${displayText}`;
      }
      tooltip.appendMarkdown(`<div align="center">${displayText}</div>\n\n`);
    }
  }

  /**
   * Build usage-based pricing section
   * @param tooltip - Markdown string to append to
   * @param lines - Content lines
   * @param allLines - All lines including metadata
   */
  private static async buildUsageBasedPricingSection(
    tooltip: vscode.MarkdownString,
    lines: string[],
    _allLines: string[],
  ): Promise<void> {
    tooltip.appendMarkdown('<div align="center">\n\n');
    tooltip.appendMarkdown(`### 📈 ${t('statusBar.usageBasedPricing')}\n\n`);
    tooltip.appendMarkdown('</div>\n\n');

    // Filter pricing lines
    const pricingLines = lines.filter(
      (line) =>
        (line.includes('*') || line.includes('→')) &&
        line.includes('➜') &&
        !line.includes(t('api.midMonthPayment')),
    );

    if (pricingLines.length > 0) {
      pricingLines.forEach((line) => {
        tooltip.appendMarkdown(`• ${line.replace('•', '').trim()}\n\n`);
      });
    } else {
      tooltip.appendMarkdown(`> ℹ️ ${t('statusBar.noUsageDataAvailable')}\n\n`);
    }
  }

  /**
   * Build action buttons section
   * @param tooltip - Markdown string to append to
   * @param lines - Content lines
   */
  private static buildActionButtons(tooltip: vscode.MarkdownString, lines: string[]): void {
    tooltip.appendMarkdown('---\n\n');
    tooltip.appendMarkdown('<div align="center">\n\n');

    // First row: Account and Extension settings
    tooltip.appendMarkdown(
      `🌐 [${t('statusBar.accountSettings')}](https://www.cursor.com/settings) • `,
    );
    tooltip.appendMarkdown(
      `🌍 [${t('statusBar.currency')}](command:cursor-stats.selectCurrency) • `,
    );
    tooltip.appendMarkdown(
      `⚙️ [${t('statusBar.extensionSettings')}](command:workbench.action.openSettings?%22@ext%3ADwtexe.cursor-stats%22)\n\n`,
    );

    // Second row: Usage Based Pricing, Refresh, and Last Updated
    const updatedLine = lines.find((line) => line.includes(t('time.lastUpdated')));
    const updatedTime = updatedLine
      ? this.formatRelativeTime(updatedLine.split(':').slice(1).join(':').trim())
      : new Date().toLocaleTimeString();

    tooltip.appendMarkdown(
      `💰 [${t('statusBar.usageBasedPricing')}](command:cursor-stats.setLimit) • `,
    );
    tooltip.appendMarkdown(`🔄 [${t('statusBar.refresh')}](command:cursor-stats.refreshStats) • `);
    tooltip.appendMarkdown(`🕒 ${updatedTime}\n\n`);

    tooltip.appendMarkdown('</div>');
  }

  /**
   * Calculate date elapsed percentage
   * @param startDateStr - Start date string
   * @param endDateStr - End date string
   * @returns Elapsed percentage (0-100)
   */
  static calculateDateElapsedPercentage(startDateStr: string, endDateStr: string): number {
    const parseDate = (dateStr: string) => {
      const [day, month] = dateStr.trim().split(' ');

      // Build translation map for current language
      const months: { [key: string]: number } = {};

      // English month names (fallback)
      const englishMonths: { [key: string]: number } = {
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
        log(`[TooltipBuilder] Could not parse month: ${month}`, true);
        return new Date();
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

  /**
   * Get localized month name
   * @param month - Month number (1-12)
   * @returns Localized month name
   */
  static getMonthName(month: number): string {
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
}

/**
 * Factory function to create a TooltipBuilder instance
 * (For consistency with other builders, though TooltipBuilder uses static methods)
 */
export function createTooltipBuilder(): typeof TooltipBuilder {
  return TooltipBuilder;
}
