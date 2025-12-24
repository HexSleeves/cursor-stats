/**
 * Configuration defaults and types for cursor-stats extension
 * Centralizes all configuration keys and their default values
 */

/**
 * Configuration section identifier
 */
export const CONFIG_SECTION = 'cursorStats';

/**
 * Configuration keys matching package.json schema
 */
export const CONFIG_KEYS = {
  /** Enable detailed logging for debugging purposes */
  ENABLE_LOGGING: 'enableLogging',
  /** Enable colored status bar based on usage percentage */
  ENABLE_STATUS_BAR_COLORS: 'enableStatusBarColors',
  /** Customize status bar text color based on usage percentage */
  STATUS_BAR_COLOR_THRESHOLDS: 'statusBarColorThresholds',
  /** Enable usage alert notifications */
  ENABLE_ALERTS: 'enableAlerts',
  /** Percentage thresholds at which to show usage alerts */
  USAGE_ALERT_THRESHOLDS: 'usageAlertThresholds',
  /** How often to refresh the stats (in seconds) */
  REFRESH_INTERVAL: 'refreshInterval',
  /** Show total requests (fast requests + usage-based requests) in the status bar */
  SHOW_TOTAL_REQUESTS: 'showTotalRequests',
  /** Show today's usage amount in the status bar */
  SHOW_TODAY_USAGE: 'showTodayUsage',
  /** Dollar amount threshold for spending notifications */
  SPENDING_ALERT_THRESHOLD: 'spendingAlertThreshold',
  /** Currency to display monetary values in */
  CURRENCY: 'currency',
  /** Show emoji-based progress bars in the tooltip */
  SHOW_PROGRESS_BARS: 'showProgressBars',
  /** Length of the progress bars (number of characters) */
  PROGRESS_BAR_LENGTH: 'progressBarLength',
  /** Percentage threshold at which progress bars turn yellow (warning) */
  PROGRESS_BAR_WARNING_THRESHOLD: 'progressBarWarningThreshold',
  /** Percentage threshold at which progress bars turn red (critical) */
  PROGRESS_BAR_CRITICAL_THRESHOLD: 'progressBarCriticalThreshold',
  /** Custom path to the Cursor database file */
  CUSTOM_DATABASE_PATH: 'customDatabasePath',
  /** Exclude weekends from period progress calculations */
  EXCLUDE_WEEKENDS: 'excludeWeekends',
  /** Show estimated fast requests remaining per day in the tooltip */
  SHOW_DAILY_REMAINING: 'showDailyRemaining',
  /** Show remaining days until period end in the status bar and tooltip */
  SHOW_REMAINING_DAYS: 'showRemainingDays',
  /** Language for the extension interface and messages */
  LANGUAGE: 'language',
  /** Show changelog popup and update notifications when extension is updated */
  SHOW_CHANGELOG_ON_UPDATE: 'showChangelogOnUpdate',
  /** Enable smart usage monitoring to detect potential model misselection */
  SMART_USAGE_MONITOR_ENABLED: 'smartUsageMonitorEnabled',
  /** Check usage every N queries to monitor for rapid consumption patterns */
  SMART_USAGE_MONITOR_INTERVAL: 'smartUsageMonitorInterval',
  /** Usage percentage threshold for smart usage monitor alerts */
  SMART_USAGE_MONITOR_THRESHOLD: 'smartUsageMonitorThreshold',
  /** Choose how usage is displayed in the status bar */
  DISPLAY_MODE: 'displayMode',
  /** Maximum token usage amount in USD for token billing mode */
  TOKEN_MAX_AMOUNT: 'tokenMaxAmount',
} as const;

/**
 * Display mode options
 */
export const DISPLAY_MODE = {
  /** Display request count (e.g., 0/500) */
  CLASSIC: 'classic',
  /** Display token usage cost in USD */
  TOKEN: 'token',
} as const;

/**
 * Default values for configuration options
 */
export const CONFIG_DEFAULTS = {
  /** Enable detailed logging for debugging purposes */
  ENABLE_LOGGING: true,
  /** Enable colored status bar based on usage percentage */
  ENABLE_STATUS_BAR_COLORS: true,
  /** Enable usage alert notifications */
  ENABLE_ALERTS: true,
  /** How often to refresh the stats (in seconds) - minimum 10 */
  REFRESH_INTERVAL: 60,
  /** Show total requests in the status bar */
  SHOW_TOTAL_REQUESTS: false,
  /** Show today's usage amount in the status bar */
  SHOW_TODAY_USAGE: true,
  /** Dollar amount threshold for spending notifications (0 to disable) */
  SPENDING_ALERT_THRESHOLD: 1,
  /** Currency to display monetary values in */
  CURRENCY: 'USD',
  /** Show emoji-based progress bars in the tooltip */
  SHOW_PROGRESS_BARS: false,
  /** Length of the progress bars (number of characters) */
  PROGRESS_BAR_LENGTH: 10,
  /** Percentage threshold at which progress bars turn yellow (warning) */
  PROGRESS_BAR_WARNING_THRESHOLD: 50,
  /** Percentage threshold at which progress bars turn red (critical) */
  PROGRESS_BAR_CRITICAL_THRESHOLD: 75,
  /** Custom path to the Cursor database file (empty = default location) */
  CUSTOM_DATABASE_PATH: '',
  /** Exclude weekends from period progress calculations */
  EXCLUDE_WEEKENDS: false,
  /** Show estimated fast requests remaining per day in the tooltip */
  SHOW_DAILY_REMAINING: false,
  /** Show remaining days until period end in the status bar and tooltip */
  SHOW_REMAINING_DAYS: true,
  /** Language for the extension interface and messages */
  LANGUAGE: 'en',
  /** Show changelog popup and update notifications when extension is updated */
  SHOW_CHANGELOG_ON_UPDATE: true,
  /** Enable smart usage monitoring to detect potential model misselection */
  SMART_USAGE_MONITOR_ENABLED: true,
  /** Check usage every N queries to monitor for rapid consumption patterns */
  SMART_USAGE_MONITOR_INTERVAL: 5,
  /** Usage percentage threshold for smart usage monitor alerts */
  SMART_USAGE_MONITOR_THRESHOLD: 10,
  /** Choose how usage is displayed in the status bar */
  DISPLAY_MODE: DISPLAY_MODE.CLASSIC,
  /** Maximum token usage amount in USD for token billing mode */
  TOKEN_MAX_AMOUNT: 20,
} as const;

/**
 * Default status bar color thresholds
 * Replicates original behavior with percentage-based color transitions
 */
export const DEFAULT_STATUS_BAR_COLOR_THRESHOLDS = [
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
] as const;

/**
 * Default usage alert thresholds (percentage points)
 */
export const DEFAULT_USAGE_ALERT_THRESHOLDS = [10, 30, 50, 75, 90, 100] as const;

/**
 * Supported languages
 */
export const SUPPORTED_LANGUAGES = [
  'en', // English
  'de', // Deutsch (German)
  'ru', // Русский (Russian)
  'zh', // 中文 (Chinese)
  'ko', // 한국어 (Korean)
  'ja', // 日本語 (Japanese)
  'kk', // Қазақша (Kazakh)
] as const;

/**
 * Helper type for configuration values
 */
export type ConfigValue<T extends keyof typeof CONFIG_KEYS> = T extends keyof typeof CONFIG_DEFAULTS
  ? (typeof CONFIG_DEFAULTS)[T]
  : unknown;

/**
 * Status bar color threshold configuration
 */
export interface StatusBarColorThreshold {
  /** Minimum percentage threshold (0-100) */
  percentage: number;
  /** Color to use (theme color ID or hex) */
  color: string;
}

/**
 * Display mode type
 */
export type DisplayMode =
  | keyof typeof DISPLAY_MODE
  | (typeof DISPLAY_MODE)[keyof typeof DISPLAY_MODE];

/**
 * Language type
 */
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];
