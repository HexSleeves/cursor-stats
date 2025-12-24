/**
 * StatusColorProvider - Provides status bar colors based on usage percentage
 * Extracted from handlers/statusBar.ts getStatusBarColor function
 *
 * This component:
 * - Calculates status bar color based on usage percentage
 * - Supports custom color thresholds from configuration
 * - Handles both hex colors and VS Code theme colors
 * - Can be disabled via configuration
 */

import * as vscode from 'vscode';

/**
 * Color threshold configuration
 */
export interface ColorThreshold {
  /** Percentage threshold (0-100) */
  percentage: number;
  /** Color value (hex code or theme color ID) */
  color: string;
}

/**
 * Color provider configuration
 */
export interface ColorProviderConfig {
  /** Whether status bar colors are enabled */
  enabled?: boolean;
  /** Custom color thresholds */
  customThresholds?: ColorThreshold[];
}

/**
 * Default color thresholds for usage-based coloring
 */
const DEFAULT_COLOR_THRESHOLDS: ColorThreshold[] = [
  { percentage: 95, color: '#CC0000' },
  { percentage: 90, color: '#FF3333' },
  { percentage: 85, color: '#FF4D4D' },
  { percentage: 80, color: '#FF6600' },
  { percentage: 75, color: '#FF8800' },
  { percentage: 70, color: '#FFAA00' },
  { percentage: 65, color: '#FFCC00' },
  { percentage: 60, color: '#FFE066' },
  { percentage: 50, color: '#DCE775' },
  { percentage: 40, color: '#66BB6A' },
  { percentage: 30, color: '#81C784' },
  { percentage: 20, color: '#B3E6B3' },
  { percentage: 10, color: '#E8F5E9' },
  { percentage: 0, color: '#FFFFFF' },
];

/**
 * StatusColorProvider provides colors for status bar based on usage
 */
export class StatusColorProvider {
  private config: ColorProviderConfig;

  constructor(config: ColorProviderConfig = {}) {
    this.config = config;
  }

  /**
   * Update the provider configuration
   * @param config - New configuration
   */
  updateConfig(config: Partial<ColorProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get the color for a given usage percentage
   * @param percentage - Usage percentage (0-100+)
   * @returns Color value (hex string or ThemeColor)
   */
  getColor(percentage: number): vscode.ThemeColor | string {
    // Load current configuration
    const vsCodeConfig = vscode.workspace.getConfiguration('cursorStats');
    const colorsEnabled =
      this.config.enabled ?? vsCodeConfig.get<boolean>('enableStatusBarColors', true);
    const customThresholds =
      this.config.customThresholds ??
      vsCodeConfig.get<ColorThreshold[]>('statusBarColorThresholds');

    const defaultColor: vscode.ThemeColor | string = new vscode.ThemeColor(
      'statusBarItem.foreground',
    );

    if (!colorsEnabled) {
      return defaultColor;
    }

    if (customThresholds && customThresholds.length > 0) {
      return this.getColorFromThresholds(percentage, customThresholds, defaultColor);
    }

    return this.getDefaultColor(percentage, defaultColor);
  }

  /**
   * Get color from custom thresholds
   * @param percentage - Usage percentage
   * @param thresholds - Custom thresholds
   * @param defaultColor - Default color if no match
   * @returns Color value
   */
  private getColorFromThresholds(
    percentage: number,
    thresholds: ColorThreshold[],
    defaultColor: vscode.ThemeColor | string,
  ): vscode.ThemeColor | string {
    // Sort thresholds in descending order of percentage
    const sortedThresholds = [...thresholds].sort((a, b) => b.percentage - a.percentage);

    // Find the first threshold that the percentage meets or exceeds
    const matchedThreshold = sortedThresholds.find(
      (threshold) => percentage >= threshold.percentage,
    );

    if (matchedThreshold) {
      // Check if the color is a hex code or a theme color ID
      if (matchedThreshold.color.startsWith('#')) {
        return matchedThreshold.color;
      } else {
        return new vscode.ThemeColor(matchedThreshold.color);
      }
    }

    return defaultColor;
  }

  /**
   * Get default color based on hardcoded thresholds
   * @param percentage - Usage percentage
   * @param defaultColor - Default color if no match
   * @returns Color value
   */
  private getDefaultColor(percentage: number, defaultColor: vscode.ThemeColor | string): string {
    for (const threshold of DEFAULT_COLOR_THRESHOLDS) {
      if (percentage >= threshold.percentage) {
        return threshold.color;
      }
    }
    return defaultColor as string;
  }

  /**
   * Get all default color thresholds
   * @returns Array of default thresholds
   */
  static getDefaultThresholds(): ColorThreshold[] {
    return [...DEFAULT_COLOR_THRESHOLDS];
  }

  /**
   * Check if a color string is a hex code
   * @param color - Color string to check
   * @returns True if hex code
   */
  static isHexColor(color: string): boolean {
    return color.startsWith('#');
  }

  /**
   * Check if colors are enabled in configuration
   * @returns True if enabled
   */
  static isEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('cursorStats');
    return config.get<boolean>('enableStatusBarColors', true);
  }

  /**
   * Get custom thresholds from configuration
   * @returns Custom thresholds or undefined
   */
  static getCustomThresholds(): ColorThreshold[] | undefined {
    const config = vscode.workspace.getConfiguration('cursorStats');
    return config.get<ColorThreshold[]>('statusBarColorThresholds');
  }
}

/**
 * Factory function to create a StatusColorProvider
 * @param config - Provider configuration
 * @returns New StatusColorProvider instance
 */
export function createStatusColorProvider(config?: ColorProviderConfig): StatusColorProvider {
  return new StatusColorProvider(config);
}

/**
 * Shared singleton instance for convenience
 */
export const statusColorProvider = new StatusColorProvider();

/**
 * Convenience function to get color for a percentage
 * Uses the shared provider instance
 * @param percentage - Usage percentage
 * @returns Color value
 */
export function getStatusBarColor(percentage: number): vscode.ThemeColor | string {
  return statusColorProvider.getColor(percentage);
}
