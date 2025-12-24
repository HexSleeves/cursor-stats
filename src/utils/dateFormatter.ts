/**
 * Consolidated date formatting utilities for cursor-stats extension
 * Replaces duplicated date formatting logic across multiple files
 */

import { t } from './i18n';
import { TIME_DEFAULTS } from '../constants/defaults';

/**
 * Month names translation keys for i18n
 */
const MONTH_TRANSLATION_KEYS = [
  'statusBar.months.january',
  'statusBar.months.february',
  'statusBar.months.march',
  'statusBar.months.april',
  'statusBar.months.may',
  'statusBar.months.june',
  'statusBar.months.july',
  'statusBar.months.august',
  'statusBar.months.september',
  'statusBar.months.october',
  'statusBar.months.november',
  'statusBar.months.december',
] as const;

/**
 * English month names mapping (lowercase for case-insensitive matching)
 */
const ENGLISH_MONTH_NAMES: Readonly<Record<string, number>> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
} as const;

/**
 * DateFormatter class provides static methods for all date formatting operations
 * Used throughout the extension for consistent date display
 */
export class DateFormatter {
  /**
   * Cached month names map for quick lookup
   * Includes both English and localized month names
   */
  private static monthNamesCache: Map<string, number> | null = null;

  /**
   * Format a date with month name (e.g., "17 January")
   * Consolidates duplicated logic from updateStats.ts and progressBars.ts
   *
   * @param date - The date to format
   * @returns Formatted date string with day and localized month name
   *
   * @example
   * ```typescript
   * DateFormatter.formatWithMonthName(new Date(2024, 0, 15)); // "15 January" (English)
   * DateFormatter.formatWithMonthName(new Date(2024, 0, 15)); // "15 一月" (Chinese)
   * ```
   */
  static formatWithMonthName(date: Date): string {
    const day = date.getDate();
    const monthName = this.getMonthName(date.getMonth());
    return `${day} ${monthName}`;
  }

  /**
   * Format a date range with month names (e.g., "17 January - 16 February")
   *
   * @param startDate - The start date of the range
   * @param endDate - The end date of the range
   * @returns Formatted date range string
   *
   * @example
   * ```typescript
   * DateFormatter.formatRangeWithMonthNames(
   *   new Date(2024, 0, 15),
   *   new Date(2024, 1, 16)
   * ); // "15 January - 16 February"
   * ```
   */
  static formatRangeWithMonthNames(startDate: Date, endDate: Date): string {
    return `${this.formatWithMonthName(startDate)} - ${this.formatWithMonthName(endDate)}`;
  }

  /**
   * Get localized month name for a given month index (0-11)
   *
   * @param monthIndex - Month index (0 = January, 11 = December)
   * @returns Localized month name
   */
  static getMonthName(monthIndex: number): string {
    if (monthIndex < 0 || monthIndex > 11) {
      return t('statusBar.months.january');
    }
    return t(MONTH_TRANSLATION_KEYS[monthIndex]);
  }

  /**
   * Get an array of all localized month names
   *
   * @returns Array of 12 localized month names
   */
  static getAllMonthNames(): string[] {
    return MONTH_TRANSLATION_KEYS.map((key) => t(key));
  }

  /**
   * Convert month name to month number (0-11)
   * Supports both English and localized month names
   * Consolidates getMonthNumber from progressBars.ts
   *
   * @param monthName - Month name in English or localized
   * @returns Month number (0-11), or 0 if not found
   *
   * @example
   * ```typescript
   * DateFormatter.getMonthNumber("January"); // 0
   * DateFormatter.getMonthNumber("jan"); // 0
   * DateFormatter.getMonthNumber("May"); // 4
   * DateFormatter.getMonthNumber("五月"); // 4 (Chinese)
   * ```
   */
  static getMonthNumber(monthName: string): number {
    const normalizedName = monthName.toLowerCase().trim();

    // Check English month names first
    if (ENGLISH_MONTH_NAMES[normalizedName] !== undefined) {
      return ENGLISH_MONTH_NAMES[normalizedName];
    }

    // Build cache if not already built
    if (this.monthNamesCache === null) {
      this.monthNamesCache = new Map();
      for (let i = 0; i < 12; i++) {
        const translatedName = t(MONTH_TRANSLATION_KEYS[i]).toLowerCase();
        this.monthNamesCache.set(translatedName, i);
      }
    }

    // Check localized month names
    const cachedMonth = this.monthNamesCache.get(normalizedName);
    if (cachedMonth !== undefined) {
      return cachedMonth;
    }

    return 0; // Default to January
  }

  /**
   * Parse a date string in format "DD Month" (e.g., "17 January", "17 一月")
   * Uses current year for the parsed date
   *
   * @param dateStr - Date string to parse
   * @param preferFuture - If true, prefer dates in the future (for end dates)
   * @returns Parsed Date object, or null if parsing fails
   *
   * @example
   * ```typescript
   * DateFormatter.parseDateWithMonth("17 January");
   * DateFormatter.parseDateWithMonth("17 一月"); // Chinese
   * ```
   */
  static parseDateWithMonth(dateStr: string, preferFuture: boolean = false): Date | null {
    try {
      const parts = dateStr.trim().split(/\s+/);
      if (parts.length < 2) {
        return null;
      }

      const day = Number.parseInt(parts[0]);
      const monthName = parts.slice(1).join(' '); // Handle multi-word month names
      const month = this.getMonthNumber(monthName);

      if (Number.isNaN(day) || Number.isNaN(month)) {
        return null;
      }

      const currentYear = new Date().getFullYear();
      let parsedDate = new Date(currentYear, month, day);

      // If we prefer future dates and the parsed date is in the past,
      // assume it's for next year
      if (preferFuture) {
        const now = new Date();
        if (parsedDate < now) {
          parsedDate.setFullYear(currentYear + 1);
        }
      }

      return parsedDate;
    } catch {
      return null;
    }
  }

  /**
   * Parse a period string in format "DD Month - DD Month" (e.g., "17 January - 16 February")
   *
   * @param periodStr - Period string to parse
   * @returns Object with start and end Date objects, or null if parsing fails
   *
   * @example
   * ```typescript
   * const period = DateFormatter.parsePeriod("17 January - 16 February");
   * // Returns: { start: Date, end: Date }
   * ```
   */
  static parsePeriod(periodStr: string): { start: Date; end: Date } | null {
    if (!periodStr?.includes('-')) {
      return null;
    }

    const parts = periodStr.split('-').map((s) => s.trim());
    if (parts.length !== 2) {
      return null;
    }

    const startDate = this.parseDateWithMonth(parts[0], false);
    const endDate = this.parseDateWithMonth(parts[1], true);

    if (!startDate || !endDate) {
      return null;
    }

    return { start: startDate, end: endDate };
  }

  /**
   * Calculate the number of days between two dates
   *
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Number of days between dates (can be negative)
   */
  static daysBetween(startDate: Date, endDate: Date): number {
    const msPerDay =
      TIME_DEFAULTS.MS_PER_SECOND *
      TIME_DEFAULTS.SECONDS_PER_MINUTE *
      TIME_DEFAULTS.MINUTES_PER_HOUR *
      TIME_DEFAULTS.HOURS_PER_DAY;
    return Math.round((endDate.getTime() - startDate.getTime()) / msPerDay);
  }

  /**
   * Calculate remaining days from now to a given end date
   *
   * @param endDate - The end date
   * @returns Number of remaining days (0 if past or today)
   */
  static calculateRemainingDays(endDate: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const adjustedEndDate = new Date(endDate);
    adjustedEndDate.setHours(23, 59, 59, 999);

    const diffTime = adjustedEndDate.getTime() - today.getTime();
    const diffDays = Math.ceil(
      diffTime /
        (TIME_DEFAULTS.MS_PER_SECOND *
          TIME_DEFAULTS.SECONDS_PER_MINUTE *
          TIME_DEFAULTS.MINUTES_PER_HOUR *
          TIME_DEFAULTS.HOURS_PER_DAY),
    );

    return Math.max(0, diffDays);
  }

  /**
   * Calculate remaining days from a period string
   *
   * @param periodStr - Period string (e.g., "17 January - 16 February")
   * @returns Number of remaining days, or 0 if parsing fails
   */
  static calculateRemainingDaysFromPeriod(periodStr: string): number {
    const period = this.parsePeriod(periodStr);
    if (!period) {
      return 0;
    }
    return this.calculateRemainingDays(period.end);
  }

  /**
   * Calculate the number of weekdays between two dates (excluding weekends)
   *
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Number of weekdays (Monday-Friday)
   */
  static calculateWeekdays(startDate: Date, endDate: Date): number {
    let count = 0;
    const current = new Date(startDate);

    // Reset time portions for accurate day counting
    current.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      // 0 = Sunday, 6 = Saturday
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  /**
   * Check if a given date is a weekend (Saturday or Sunday)
   *
   * @param date - Date to check (defaults to current date)
   * @returns True if the date is a weekend day
   */
  static isWeekend(date: Date = new Date()): boolean {
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
  }

  /**
   * Calculate remaining weekdays from current date to end date
   *
   * @param endDate - End date
   * @returns Number of remaining weekdays
   */
  static calculateRemainingWeekdays(endDate: Date): number {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (today >= endDate) {
      return 0;
    }

    return this.calculateWeekdays(today, endDate);
  }

  /**
   * Format a date as a localized string
   *
   * @param date - Date to format
   * @returns Localized date string
   */
  static toLocaleString(date: Date): string {
    return date.toLocaleString();
  }

  /**
   * Get the end of a billing period based on start date
   * Assumes period is one month from start date
   *
   * @param startDate - Period start date
   * @returns Period end date
   */
  static getPeriodEnd(startDate: Date): Date {
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    return endDate;
  }

  /**
   * Clear the cached month names
   * Call when language changes to rebuild cache with new translations
   */
  static clearCache(): void {
    this.monthNamesCache = null;
  }
}

/**
 * Convenience functions that delegate to DateFormatter class
 * These maintain backward compatibility with existing code
 */

/**
 * Format a date with localized month name
 * @param date - Date to format
 * @returns Formatted date string
 */
export function formatDateWithMonthName(date: Date): string {
  return DateFormatter.formatWithMonthName(date);
}

/**
 * Convert month name to month number (0-11)
 * @param monthName - Month name (English or localized)
 * @returns Month number (0-11)
 */
export function getMonthNumber(monthName: string): number {
  return DateFormatter.getMonthNumber(monthName);
}

/**
 * Parse a period string and extract end date
 * @param periodStr - Period string (e.g., "17 January - 16 February")
 * @returns Number of remaining days, or 0 if parsing fails
 */
export function calculateRemainingDaysFromPeriod(periodStr: string): number {
  return DateFormatter.calculateRemainingDaysFromPeriod(periodStr);
}

/**
 * Calculate weekdays between two dates
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Number of weekdays
 */
export function calculateWeekdays(startDate: Date, endDate: Date): number {
  return DateFormatter.calculateWeekdays(startDate, endDate);
}

/**
 * Check if today is a weekend
 * @returns True if today is Saturday or Sunday
 */
export function isWeekend(): boolean {
  return DateFormatter.isWeekend();
}
