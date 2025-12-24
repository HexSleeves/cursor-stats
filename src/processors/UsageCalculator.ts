/**
 * UsageCalculator - Provides utilities for calculating usage metrics
 * Consolidates percentage and cost calculations from multiple files
 *
 * This processor:
 * - Calculates usage percentages
 * - Calculates remaining percentages
 * - Formats percentages intelligently (removes unnecessary decimals)
 * - Calculates total costs from usage items
 * - Provides billing period calculations
 */

import type { UsageItem } from '../interfaces/types';

/**
 * Usage calculation result
 */
export interface UsageCalculation {
  /** Usage percentage (0-100) */
  usagePercent: number;
  /** Remaining percentage (0-100) */
  remainingPercent: number;
  /** Formatted usage percentage string */
  formattedUsagePercent: string;
  /** Formatted remaining percentage string */
  formattedRemainingPercent: string;
}

/**
 * Cost calculation result
 */
export interface CostCalculation {
  /** Total actual cost (positive items only) */
  actualTotalCost: number;
  /** Unpaid amount */
  unpaidAmount: number;
  /** Whether calculation is valid */
  isValid: boolean;
}

/**
 * Billing period info
 */
export interface BillingPeriod {
  /** Start date of the period */
  startDate: Date;
  /** End date of the period */
  endDate: Date;
  /** Month number (1-12) */
  month: number;
  /** Year */
  year: number;
}

/**
 * UsageCalculator provides usage calculation utilities
 */
export class UsageCalculator {
  /**
   * Calculate usage and remaining percentages
   * @param current - Current value
   * @param max - Maximum value
   * @returns Usage calculation result
   */
  calculateUsage(current: number, max: number): UsageCalculation {
    // Guard against invalid max
    if (max <= 0) {
      return {
        usagePercent: 0,
        remainingPercent: 0,
        formattedUsagePercent: '0',
        formattedRemainingPercent: '0',
      };
    }

    // Calculate percentages
    const usagePercentExact = (current / max) * 100;
    const usagePercent = Math.round(usagePercentExact);
    const remainingPercent = Math.max(0, Math.round(((max - current) / max) * 100));

    // Format intelligently
    const formattedUsagePercent = this.formatPercentageIntelligent(usagePercentExact);
    const formattedRemainingPercent = this.formatRemainingPercent(current, max);

    return {
      usagePercent,
      remainingPercent,
      formattedUsagePercent,
      formattedRemainingPercent,
    };
  }

  /**
   * Calculate remaining percentage with boundary protection
   * @param current - Current value
   * @param max - Maximum value
   * @returns Remaining percentage (0-100)
   */
  calculateRemainingPercent(current: number, max: number): number {
    if (max <= 0) {
      return 0;
    }
    const remaining = Math.max(0, max - current);
    return Math.round((remaining / max) * 100);
  }

  /**
   * Format percentage intelligently - remove unnecessary decimals
   * @param percent - Percentage value
   * @returns Formatted percentage string
   */
  formatPercentageIntelligent(percent: number): string {
    if (percent % 1 === 0) {
      // Whole number
      return percent.toString();
    } else if ((percent * 10) % 1 === 0) {
      // One decimal place
      return percent.toFixed(1);
    } else {
      // Up to 3 decimal places
      return percent.toFixed(3).replace(/\.?0+$/, '');
    }
  }

  /**
   * Format remaining percentage with smart decimal handling
   * @param current - Current value
   * @param max - Maximum value
   * @returns Formatted remaining percentage string
   */
  formatRemainingPercent(current: number, max: number): string {
    if (max <= 0) {
      return '0';
    }

    const remaining = Math.max(0, max - current);
    const percent = (remaining / max) * 100;

    return this.formatPercentageIntelligent(percent);
  }

  /**
   * Calculate total cost from usage items
   * @param items - Usage items
   * @param includeMidMonthPayment - Whether to include mid-month payments in calculation
   * @returns Cost calculation result
   */
  calculateTotalCost(items: UsageItem[], includeMidMonthPayment = false): CostCalculation {
    let actualTotalCost = 0;
    let midMonthPayment = 0;
    let isValid = false;

    for (const item of items) {
      const cost = Number.parseFloat(item.totalDollars.replace('$', ''));

      // Track mid-month payments separately
      if (item.description?.includes('Mid-month usage paid')) {
        midMonthPayment += Math.abs(cost);
        continue;
      }

      // Only add positive costs (ignore mid-month payment credits)
      if (cost > 0) {
        actualTotalCost += cost;
        isValid = true;
      }
    }

    // If including mid-month payment, add it
    if (includeMidMonthPayment) {
      actualTotalCost += midMonthPayment;
    }

    // Calculate unpaid amount
    const unpaidAmount = Math.max(0, actualTotalCost - midMonthPayment);

    return {
      actualTotalCost,
      unpaidAmount,
      isValid,
    };
  }

  /**
   * Calculate usage-based percentage
   * @param totalCost - Total cost
   * @param limit - Usage limit
   * @returns Usage percentage (0-100+)
   */
  calculateUsageBasedPercent(totalCost: number, limit: number): number {
    if (limit <= 0) {
      return 0;
    }
    return (totalCost / limit) * 100;
  }

  /**
   * Calculate billing period for usage-based pricing
   * Usage-based billing renews on the 3rd of each month
   * @param referenceDate - Reference date (default: now)
   * @param billingDay - Day of month for billing (default: 3)
   * @returns Billing period info
   */
  calculateBillingPeriod(referenceDate: Date = new Date(), billingDay = 3): BillingPeriod {
    const currentDate = new Date(referenceDate);
    let currentMonth = currentDate.getMonth() + 1;
    let currentYear = currentDate.getFullYear();

    // If we're in the first few days of the month (before billing date),
    // consider the previous month as the current billing period
    if (currentDate.getDate() < billingDay) {
      currentMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      if (currentMonth === 12) {
        currentYear--;
      }
    }

    // Calculate period start and end dates
    const startDate = new Date(currentYear, currentMonth - 1, billingDay);
    let endDate = new Date(currentYear, currentMonth, billingDay - 1);

    // Adjust year if period spans across year boundary
    if (endDate < startDate) {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    return {
      startDate,
      endDate,
      month: currentMonth,
      year: currentYear,
    };
  }

  /**
   * Calculate previous billing period
   * @param currentPeriod - Current billing period
   * @returns Previous billing period
   */
  calculatePreviousBillingPeriod(currentPeriod: BillingPeriod): BillingPeriod {
    let prevMonth = currentPeriod.month - 1;
    let prevYear = currentPeriod.year;

    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear--;
    }

    const startDate = new Date(prevYear, prevMonth - 1, 3); // Assuming 3rd as billing day
    let endDate = new Date(prevYear, prevMonth, 2);

    if (endDate < startDate) {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    return {
      startDate,
      endDate,
      month: prevMonth,
      year: prevYear,
    };
  }

  /**
   * Clamp a value between min and max
   * @param value - Value to clamp
   * @param min - Minimum value
   * @param max - Maximum value
   * @returns Clamped value
   */
  clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Check if a value is within a percentage threshold
   * @param value - Current value
   * @param max - Maximum value
   * @param thresholdPercent - Threshold percentage (0-100)
   * @returns Whether value exceeds threshold
   */
  exceedsThreshold(value: number, max: number, thresholdPercent: number): boolean {
    if (max <= 0) {
      return false;
    }
    const currentPercent = (value / max) * 100;
    return currentPercent >= thresholdPercent;
  }

  /**
   * Format cost with currency symbol
   * @param cost - Cost in dollars
   * @param currency - Currency symbol (default: '$')
   * @param decimals - Number of decimal places (default: 2)
   * @returns Formatted cost string
   */
  formatCost(cost: number, currency: string = '$', decimals: number = 2): string {
    return `${currency}${cost.toFixed(decimals)}`;
  }
}

/**
 * Factory function to create a UsageCalculator
 * @returns New UsageCalculator instance
 */
export function createUsageCalculator(): UsageCalculator {
  return new UsageCalculator();
}

/**
 * Shared singleton instance for convenience
 */
export const usageCalculator = new UsageCalculator();
