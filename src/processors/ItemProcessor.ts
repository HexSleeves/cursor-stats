/**
 * ItemProcessor - Processes monthly invoice items into usage items
 * Extracted from services/api.ts fetchMonthData function
 *
 * This processor:
 * - Processes raw invoice items into displayable usage items
 * - Calculates request counts and costs
 * - Formats calculation strings with proper padding
 * - Handles mid-month payments
 * - Tracks total costs and unpaid invoices
 */

import { log } from '../utils/logger';
import { t } from '../utils/i18n';
import type { UsageItem } from '../interfaces/types';
import { ModelDetector, type RawInvoiceItem } from './ModelDetector';

/**
 * Raw invoice response from API
 */
export interface RawInvoiceResponse {
  items?: RawInvoiceItem[];
  hasUnpaidMidMonthInvoice?: boolean;
}

/**
 * Processed monthly data result
 */
export interface ProcessedMonthlyData {
  /** Processed usage items */
  items: UsageItem[];
  /** Whether there's an unpaid mid-month invoice */
  hasUnpaidMidMonthInvoice: boolean;
  /** Total mid-month payment amount */
  midMonthPayment: number;
}

/**
 * Configuration for item processing
 */
export interface ItemProcessorConfig {
  /** Model detector for identifying models */
  modelDetector?: ModelDetector;
}

/**
 * ItemProcessor processes raw invoice items into usage items
 */
export class ItemProcessor {
  private readonly modelDetector: ModelDetector;

  constructor(config: ItemProcessorConfig = {}) {
    this.modelDetector = config.modelDetector || new ModelDetector();
  }

  /**
   * Process raw invoice response into monthly data
   * @param invoiceResponse - Raw invoice response from API
   * @returns Processed monthly data
   */
  processInvoiceResponse(invoiceResponse: RawInvoiceResponse): ProcessedMonthlyData {
    const usageItems: UsageItem[] = [];
    let midMonthPayment = 0;

    if (!invoiceResponse.items) {
      return {
        items: usageItems,
        hasUnpaidMidMonthInvoice: invoiceResponse.hasUnpaidMidMonthInvoice || false,
        midMonthPayment: 0,
      };
    }

    // First pass: find max request count and max cost per request for padding
    let maxRequestCount = 0;
    let maxCostPerRequest = 0;

    for (const item of invoiceResponse.items) {
      // Skip items without cents or mid-month payments
      if (
        !item.hasOwnProperty('cents') ||
        typeof item.cents === 'undefined' ||
        item.description.includes('Mid-month usage paid')
      ) {
        continue;
      }

      const requestCount = this.extractRequestCount(item.description);
      if (requestCount > 0) {
        maxRequestCount = Math.max(maxRequestCount, requestCount);
        const costPerRequestCents = item.cents / requestCount;
        const costPerRequestDollars = costPerRequestCents / 100;
        maxCostPerRequest = Math.max(maxCostPerRequest, costPerRequestDollars);
      }
    }

    // Calculate padding widths
    const paddingWidth = maxRequestCount > 0 ? maxRequestCount.toString().length : 1;
    const costPaddingWidth = this.calculateCostPaddingWidth(invoiceResponse.items);

    // Second pass: process items
    for (const item of invoiceResponse.items) {
      // Skip items without cents value
      if (!item.hasOwnProperty('cents')) {
        log('[ItemProcessor] Skipping item without cents value: ' + item.description);
        continue;
      }

      // Check for mid-month payment
      if (item.description.includes('Mid-month usage paid')) {
        if (typeof item.cents === 'undefined') {
          continue;
        }
        midMonthPayment += Math.abs(item.cents) / 100;
        log(
          `[ItemProcessor] Added mid-month payment of $${(Math.abs(item.cents) / 100).toFixed(2)}, total now: $${midMonthPayment.toFixed(2)}`,
        );

        usageItems.push({
          calculation: `${t('api.midMonthPayment')}: $${midMonthPayment.toFixed(2)}`,
          totalDollars: `-$${midMonthPayment.toFixed(2)}`,
          description: item.description,
        });
        continue;
      }

      const cents = item.cents;
      if (typeof cents === 'undefined') {
        log('[ItemProcessor] Skipping item with undefined cents value: ' + item.description);
        continue;
      }

      const requestCount = this.extractRequestCount(item.description);
      if (requestCount === 0) {
        log('[ItemProcessor] Skipping item with 0 requests: ' + item.description);
        continue;
      }

      // Detect model
      const modelResult = this.modelDetector.detectFromInvoiceItem(item);

      // Calculate costs
      const costPerRequestCents = cents / requestCount;
      const totalDollars = cents / 100;

      // Format calculation string
      const paddedRequestCount = requestCount.toString().padStart(paddingWidth, '0');
      const costPerRequestDollarsFormatted = (costPerRequestCents / 100)
        .toFixed(3)
        .padStart(costPaddingWidth, '0');

      const isTotallingItem = item.description.includes('token-based usage calls');
      const tilde = isTotallingItem ? '~' : '  ';
      const itemUnit = t('api.requestUnit');

      const calculationString = `**${paddedRequestCount}** ${itemUnit} @ **$${costPerRequestDollarsFormatted}${tilde}**`;

      usageItems.push({
        calculation: calculationString,
        totalDollars: `$${totalDollars.toFixed(2)}`,
        description: item.description,
        modelNameForTooltip: modelResult.modelName,
        isDiscounted: modelResult.isDiscounted,
      });
    }

    return {
      items: usageItems,
      hasUnpaidMidMonthInvoice: invoiceResponse.hasUnpaidMidMonthInvoice || false,
      midMonthPayment,
    };
  }

  /**
   * Extract request count from description
   * @param description - Item description
   * @returns Request count
   */
  private extractRequestCount(description: string): number {
    // Try token-based format first
    const tokenBasedMatch = description.match(/^(\d+) token-based usage calls to/);
    if (tokenBasedMatch && tokenBasedMatch[1]) {
      return Number.parseInt(tokenBasedMatch[1], 10);
    }

    // Try original format
    const originalMatch = description.match(/^(\d+)/);
    if (originalMatch && originalMatch[1]) {
      return Number.parseInt(originalMatch[1], 10);
    }

    return 0;
  }

  /**
   * Calculate the padding width for cost per request display
   * @param items - Invoice items to analyze
   * @returns Padding width for cost display
   */
  private calculateCostPaddingWidth(items: RawInvoiceItem[]): number {
    let maxCostCents = 0;

    for (const item of items) {
      if (
        !item.hasOwnProperty('cents') ||
        typeof item.cents === 'undefined' ||
        item.description.includes('Mid-month usage paid')
      ) {
        continue;
      }

      const requestCount = this.extractRequestCount(item.description);
      if (requestCount > 0) {
        const costPerRequestCents = item.cents / requestCount;
        maxCostCents = Math.max(maxCostCents, costPerRequestCents);
      }
    }

    const maxCostPerRequestFormatted = (maxCostCents / 100).toFixed(3);
    return maxCostPerRequestFormatted.length;
  }

  /**
   * Get the model detector used by this processor
   * @returns The model detector instance
   */
  getModelDetector(): ModelDetector {
    return this.modelDetector;
  }

  /**
   * Reset processor state
   */
  reset(): void {
    this.modelDetector.resetUnknownModelTracking();
    log('[ItemProcessor] Reset item processor state');
  }
}

/**
 * Factory function to create an ItemProcessor
 * @param config - Processor configuration
 * @returns New ItemProcessor instance
 */
export function createItemProcessor(config?: ItemProcessorConfig): ItemProcessor {
  return new ItemProcessor(config);
}
