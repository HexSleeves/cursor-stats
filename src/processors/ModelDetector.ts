/**
 * ModelDetector - Detects and normalizes model names from usage descriptions
 * Extracted from services/api.ts fetchMonthData function
 *
 * This processor:
 * - Detects model names from various description formats
 * - Handles token-based usage format
 * - Handles request-based format with generic model patterns
 * - Provides fallback for unknown models
 * - Tracks detected unknown models for notifications
 */

import { log } from '../utils/logger';
import { t } from '../utils/i18n';

/**
 * Model detection result
 */
export interface ModelDetectionResult {
  /** The detected model name */
  modelName: string;
  /** Whether this is a tool call */
  isToolCall: boolean;
  /** Whether the model name is unknown */
  isUnknown: boolean;
  /** Whether the description indicates a discounted rate */
  isDiscounted: boolean;
}

/**
 * Raw API item from invoice
 */
export interface RawInvoiceItem {
  /** Description of the usage item */
  description: string;
  /** Cost in cents */
  cents?: number;
}

/**
 * ModelDetector extracts model information from usage descriptions
 */
export class ModelDetector {
  /** Set of unknown models detected for notifications */
  private detectedUnknownModels: Set<string>;

  /** Whether unknown model notification has been shown */
  private unknownModelNotificationShown: boolean;

  constructor() {
    this.detectedUnknownModels = new Set<string>();
    this.unknownModelNotificationShown = false;
  }

  /**
   * Detect model name from invoice item description
   * @param item - Raw invoice item
   * @returns Model detection result
   */
  detectFromInvoiceItem(item: RawInvoiceItem): ModelDetectionResult {
    const description = item.description;

    // Check for discounted flag
    const isDiscounted = description.toLowerCase().includes('discounted');

    // Try token-based format first
    const tokenBasedMatch = description.match(
      /^(\d+) token-based usage calls to ([\w.-]+), totalling: \$(?:[\d.]+)/,
    );
    if (tokenBasedMatch && tokenBasedMatch[2]) {
      const modelName = tokenBasedMatch[2];
      return {
        modelName,
        isToolCall: false,
        isUnknown: false,
        isDiscounted,
      };
    }

    // Try original format with model name
    const originalMatch = description.match(
      /^(\d+)\s+(.+?)(?: request| calls)?(?: beyond|\*| per|$)/i,
    );
    if (originalMatch) {
      const extractedDescription = originalMatch[2].trim();

      // Check for tool calls first
      if (description.includes('tool calls')) {
        return {
          modelName: t('api.toolCalls'),
          isToolCall: true,
          isUnknown: false,
          isDiscounted,
        };
      }

      // Check for generic model pattern
      const genericModelPattern =
        /\b(?:discounted\s+)?(claude-(?:3-(?:opus|sonnet|haiku)|3\.[57]-sonnet(?:-[\w-]+)?(?:-max)?|4-sonnet(?:-thinking)?)|gpt-(?:4(?:\.\d+|o-128k|-preview)?|3\.5-turbo)|gemini-(?:1\.5-flash-500k|2[\.-]5-pro-(?:exp-\d{2}-\d{2}|preview-\d{2}-\d{2}|exp-max))|o[134](?:-mini)?)\b/i;
      const specificModelMatch = description.match(genericModelPattern);

      if (specificModelMatch) {
        // Extract the model name (group 1), which excludes the "discounted" prefix
        const modelName = specificModelMatch[1];
        return {
          modelName,
          isToolCall: false,
          isUnknown: false,
          isDiscounted,
        };
      }

      // Check for extra fast premium request format
      const extraFastModelMatch = description.match(/extra fast premium requests? \(([^)]+)\)/i);
      if (extraFastModelMatch && extraFastModelMatch[1]) {
        const modelName = extraFastModelMatch[1];
        return {
          modelName,
          isToolCall: false,
          isUnknown: false,
          isDiscounted,
        };
      }

      // Check if this should be tracked as unknown
      this.trackUnknownModel(extractedDescription, isDiscounted);

      // Fallback to unknown
      return {
        modelName: t('statusBar.unknownModel'),
        isToolCall: false,
        isUnknown: true,
        isDiscounted,
      };
    }

    // Try to get at least a request count if model is unknown
    const fallbackCountMatch = description.match(/^(\d+)/);
    if (fallbackCountMatch) {
      return {
        modelName: t('statusBar.unknownModel'),
        isToolCall: false,
        isUnknown: true,
        isDiscounted,
      };
    }

    // Truly unparseable
    return {
      modelName: t('statusBar.unknownModel'),
      isToolCall: false,
      isUnknown: true,
      isDiscounted,
    };
  }

  /**
   * Track unknown model for potential notification
   * @param extractedTerm - The extracted model name or term
   * @param isDiscounted - Whether the item is discounted
   */
  private trackUnknownModel(extractedTerm: string, isDiscounted: boolean): void {
    let termForNotification = extractedTerm;

    // Remove "discounted" prefix if present
    if (isDiscounted && termForNotification.toLowerCase().startsWith('discounted ')) {
      termForNotification = termForNotification.substring(11).trim();
    }

    // Clean up suffixes
    termForNotification = termForNotification
      .replace(/requests?|calls?|beyond|\*|per|,$/gi, '')
      .trim();

    if (termForNotification.toLowerCase().endsWith(' usage')) {
      termForNotification = termForNotification.substring(0, termForNotification.length - 6).trim();
    }

    // Validate it's meaningful
    if (!termForNotification || termForNotification.length <= 1) {
      return;
    }

    const lowerTerm = termForNotification.toLowerCase();
    if (lowerTerm === 'token-based' || lowerTerm === 'discounted') {
      return;
    }

    // Check against generic keywords
    const genericKeywords = [
      'usage',
      'calls',
      'request',
      'requests',
      'beyond',
      'month',
      'day',
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
      'premium',
      'extra',
      'tool',
      'fast',
      'thinking',
    ];

    const isGeneric = genericKeywords.includes(lowerTerm);
    if (isGeneric) {
      return;
    }

    // Check if already present (case-insensitive partial match)
    const alreadyPresent = Array.from(this.detectedUnknownModels).some(
      (detected) =>
        detected.toLowerCase().includes(lowerTerm) || lowerTerm.includes(detected.toLowerCase()),
    );

    if (!alreadyPresent) {
      this.detectedUnknownModels.add(termForNotification);
      log(`[ModelDetector] Detected unknown model: '${termForNotification}'`);
    }
  }

  /**
   * Get the set of detected unknown models
   * @returns Set of unknown model names
   */
  getDetectedUnknownModels(): Set<string> {
    return new Set(this.detectedUnknownModels);
  }

  /**
   * Check if unknown model notification has been shown
   * @returns Whether notification was shown
   */
  hasShownUnknownModelNotification(): boolean {
    return this.unknownModelNotificationShown;
  }

  /**
   * Mark that unknown model notification has been shown
   */
  markUnknownModelNotificationShown(): void {
    this.unknownModelNotificationShown = true;
  }

  /**
   * Reset unknown model tracking
   * Call this when starting a new scan or after showing notification
   */
  resetUnknownModelTracking(): void {
    this.detectedUnknownModels.clear();
    this.unknownModelNotificationShown = false;
    log('[ModelDetector] Reset unknown model tracking');
  }

  /**
   * Extract request count from description
   * @param description - Item description
   * @returns Request count or 0 if not found
   */
  extractRequestCount(description: string): number {
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
}

/**
 * Factory function to create a ModelDetector
 * @returns New ModelDetector instance
 */
export function createModelDetector(): ModelDetector {
  return new ModelDetector();
}
