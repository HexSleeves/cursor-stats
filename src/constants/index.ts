/**
 * Application Constants
 * 
 * This file contains all hardcoded values, magic numbers, timeouts, intervals,
 * API endpoints, and configuration defaults used throughout the application.
 * 
 * Organized by category for better maintainability.
 */

// =============================================================================
// TIME CONSTANTS
// =============================================================================

/** Timeout and interval values in milliseconds */
export const TIME = {
  /** Minimum refresh interval in seconds */
  MIN_REFRESH_INTERVAL_SECONDS: 5,
  
  /** Default refresh interval in seconds */
  DEFAULT_REFRESH_INTERVAL_SECONDS: 30,
  
  /** Convert seconds to milliseconds */
  SECONDS_TO_MS: 1000,
  
  /** Convert minutes to milliseconds */
  MINUTES_TO_MS: 60 * 1000,
  
  /** Convert hours to milliseconds */
  HOURS_TO_MS: 60 * 60 * 1000,
  
  /** Release check interval (1 hour) */
  RELEASE_CHECK_INTERVAL: 60 * 60 * 1000,
  
  /** Extension activation delay */
  ACTIVATION_DELAY: 3000,
  
  /** Initial stats update delay */
  INITIAL_STATS_DELAY: 1500,
  
  /** Cooldown duration (10 minutes) */
  COOLDOWN_DURATION: 10 * 60 * 1000,
  
  /** Countdown update interval */
  COUNTDOWN_UPDATE_INTERVAL: 1000,
  
  /** Currency cache expiry (24 hours) */
  CURRENCY_CACHE_EXPIRY: 24 * 60 * 60 * 1000,
  
  /** Windows username command timeout */
  WINDOWS_USERNAME_TIMEOUT: 5000,
} as const;

// =============================================================================
// API ENDPOINTS
// =============================================================================

/** All API endpoints used by the application */
export const API_ENDPOINTS = {
  /** Cursor API base URL */
  CURSOR_BASE: 'https://cursor.com/api',
  
  /** Get usage-based pricing hard limit */
  GET_HARD_LIMIT: 'https://cursor.com/api/dashboard/get-hard-limit',
  
  /** Set usage-based pricing hard limit */
  SET_HARD_LIMIT: 'https://cursor.com/api/dashboard/set-hard-limit',
  
  /** Get usage-based premium requests status */
  GET_USAGE_BASED_STATUS: 'https://cursor.com/api/dashboard/get-usage-based-premium-requests',
  
  /** Get monthly invoice data */
  GET_MONTHLY_INVOICE: 'https://cursor.com/api/dashboard/get-monthly-invoice',
  
  /** Get individual usage data */
  GET_USAGE: 'https://cursor.com/api/usage',
  
  /** Get Stripe session URL */
  GET_STRIPE_SESSION: 'https://cursor.com/api/stripeSession',
  
  /** Currency exchange rates API */
  CURRENCY_API: 'https://latest.currency-api.pages.dev/v1/currencies/usd.json',
  
  /** Cursor settings page */
  CURSOR_SETTINGS: 'https://www.cursor.com/settings',
} as const;

// =============================================================================
// UI CONSTANTS
// =============================================================================

/** User interface related constants */
export const UI = {
  /** Status bar alignment priority */
  STATUS_BAR_PRIORITY: 100,
  
  /** Default tooltip line max width */
  TOOLTIP_MAX_WIDTH: 50,
  
  /** Separator width divisor */
  SEPARATOR_WIDTH_DIVISOR: 2,
  
  /** Additional separator padding */
  SEPARATOR_PADDING: 5,
  
  /** Time format padding */
  TIME_PADDING: 2,
  
  /** Time padding character */
  TIME_PADDING_CHAR: '0',
  
  /** Progress bar emojis */
  PROGRESS_EMPTY: '⬜',
  PROGRESS_FILLED: '🟩',
  PROGRESS_WARNING: '🟨',
  PROGRESS_CRITICAL: '🟥',
} as const;

// =============================================================================
// CONFIGURATION DEFAULTS
// =============================================================================

/** Default configuration values */
export const CONFIG_DEFAULTS = {
  /** Default monthly spending limit placeholder */
  DEFAULT_SPENDING_LIMIT: '50',
  
  /** Progress bar settings */
  PROGRESS_BAR_LENGTH: 10,
  PROGRESS_BAR_WARNING_THRESHOLD: 75,
  PROGRESS_BAR_CRITICAL_THRESHOLD: 90,
  SHOW_PROGRESS_BARS: false,
  
  /** Usage thresholds for color coding */
  USAGE_THRESHOLDS: {
    CRITICAL_95: 95,
    CRITICAL_90: 90,
    HIGH_85: 85,
    HIGH_80: 80,
    MEDIUM_HIGH_75: 75,
    MEDIUM_HIGH_70: 70,
    MEDIUM_65: 65,
    MEDIUM_60: 60,
    MEDIUM_LOW_50: 50,
    LOW_40: 40,
    LOW_30: 30,
    VERY_LOW_20: 20,
    MINIMAL_10: 10,
  },
  
  /** Usage threshold colors */
  USAGE_COLORS: {
    CRITICAL_95: '#CC0000',
    CRITICAL_90: '#FF3333',
    HIGH_85: '#FF4D4D',
    HIGH_80: '#FF6600',
    MEDIUM_HIGH_75: '#FF8800',
    MEDIUM_HIGH_70: '#FFAA00',
    MEDIUM_65: '#FFCC00',
    MEDIUM_60: '#FFE066',
    MEDIUM_LOW_50: '#DCE775',
    LOW_40: '#66BB6A',
    LOW_30: '#81C784',
    VERY_LOW_20: '#B3E6B3',
    MINIMAL_10: '#E8F5E9',
    DEFAULT: undefined,
  },
} as const;

// =============================================================================
// DATABASE CONSTANTS
// =============================================================================

/** Database related constants */
export const DATABASE = {
  /** Database file name */
  STATE_DB_FILE: 'state.vscdb',
  
  /** Database path components */
  PATH_COMPONENTS: {
    USER: 'User',
    GLOBAL_STORAGE: 'globalStorage',
  },
  
  /** Platform-specific paths */
  PLATFORM_PATHS: {
    WSL_MOUNT: '/mnt/c/Users',
    WINDOWS_APPDATA: 'AppData/Roaming',
  },
  
  /** Database queries */
  QUERIES: {
    GET_AUTH_TOKEN: "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'",
  },
  
  /** Windows username command */
  WINDOWS_USERNAME_CMD: 'cmd.exe /C "echo %USERNAME%"',
} as const;

// =============================================================================
// VALIDATION CONSTANTS
// =============================================================================

/** Validation related constants */
export const VALIDATION = {
  /** Minimum values */
  MIN_POSITIVE_NUMBER: 0,
  
  /** Array indices */
  FIRST_INDEX: 0,
  SECOND_INDEX: 1,
  THIRD_INDEX: 2,
  
  /** Token parsing */
  TOKEN_SEPARATOR: '%3A%3A',
  TOKEN_PREVIEW_LENGTH: 20,
  
  /** Billing day of month */
  USAGE_BASED_BILLING_DAY: 3,
  
  /** Month calculations */
  MONTHS_IN_YEAR: 12,
  FIRST_MONTH: 1,
  LAST_MONTH: 12,
  
  /** Percentage calculations */
  PERCENTAGE_MULTIPLIER: 100,
  MAX_PERCENTAGE: 100,
  MIN_PERCENTAGE: 0,
  
  /** Currency formatting */
  CURRENCY_DECIMAL_PLACES: 2,
  COST_DECIMAL_PLACES: 3,
  CENTS_TO_DOLLARS: 100,
} as const;

// =============================================================================
// FILE SYSTEM CONSTANTS
// =============================================================================

/** File system related constants */
export const FILE_SYSTEM = {
  /** File names */
  CURRENCY_CACHE_FILE: 'currency-rates.json',
  
  /** File encoding */
  UTF8_ENCODING: 'utf8',
  
  /** Path validation patterns */
  INVALID_PATH_CHARS: ['..', '/', '\\'],
} as const;

// =============================================================================
// HTTP CONSTANTS
// =============================================================================

/** HTTP related constants */
export const HTTP = {
  /** Standard headers */
  HEADERS: {
    ORIGIN: 'https://cursor.com',
    REFERER: 'https://cursor.com/',
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ACCEPT: 'application/json, text/plain, */*',
    ACCEPT_LANGUAGE: 'zh-CN,zh;q=0.9,en;q=0.8',
    ACCEPT_ENCODING: 'gzip, deflate, br',
    CONNECTION: 'keep-alive',
    CONTENT_TYPE: 'application/json',
    SEC_FETCH_DEST: 'empty',
    SEC_FETCH_MODE: 'cors',
    SEC_FETCH_SITE: 'same-origin',
  },
  
  /** Status codes */
  STATUS_CODES: {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
  },
} as const;

// =============================================================================
// MONTH CONSTANTS
// =============================================================================

/** Month related constants */
export const MONTHS = {
  /** English month names to numbers */
  NAME_TO_NUMBER: {
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
  },
  
  /** Month keys for translation */
  KEYS: [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ],
} as const;
