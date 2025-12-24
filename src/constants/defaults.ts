/**
 * Default values and constants for cursor-stats extension
 * Centralizes all magic numbers and default values used throughout the codebase
 */

/**
 * Default request limits for different models
 */
export const DEFAULT_REQUEST_LIMITS = {
  /** GPT-4 premium request limit */
  GPT_4: 500,
  /** Default max request usage when API returns null */
  DEFAULT_MAX_REQUEST_USAGE: 500,
} as const;

/**
 * Default currency values
 */
export const CURRENCY_DEFAULTS = {
  /** Default currency code */
  DEFAULT_CURRENCY: 'USD',
  /** Default currency symbol */
  DEFAULT_SYMBOL: '$',
  /** Number of decimal places for currency formatting */
  DEFAULT_DECIMALS: 2,
  /** Currency exchange rate cache expiry (24 hours in ms) */
  CACHE_EXPIRY_MS: 24 * 60 * 60 * 1000,
  /** Currency API URL */
  API_URL: 'https://latest.currency-api.pages.dev/v1/currencies/usd.json',
  /** Cache file name */
  CACHE_FILE: 'currency-rates.json',
} as const;

/**
 * Currencies that don't use decimal places
 */
export const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW'] as const;

/**
 * Remaining days urgency thresholds
 */
export const REMAINING_DAYS_THRESHOLDS = {
  /** Days remaining for critical urgency */
  CRITICAL: 3,
  /** Days remaining for warning urgency */
  WARNING: 7,
} as const;

/**
 * Remaining days urgency levels
 */
export const REMAINING_DAYS_URGENCY = {
  /** Normal urgency level */
  NORMAL: 'normal',
  /** Warning urgency level */
  WARNING: 'warning',
  /** Critical urgency level */
  CRITICAL: 'critical',
  /** Expired urgency level */
  EXPIRED: 'expired',
} as const;

/**
 * Remaining days icons by urgency level
 */
export const REMAINING_DAYS_ICONS = {
  /** Icon for normal urgency */
  NORMAL: '📅',
  /** Icon for warning urgency */
  WARNING: '🟡',
  /** Icon for critical urgency */
  CRITICAL: '🔴',
  /** Icon for expired period */
  EXPIRED: '⏰',
} as const;

/**
 * Cooldown state constants
 */
export const COOLDOWN_DEFAULTS = {
  /** Duration of cooldown period in milliseconds (10 minutes) */
  DURATION_MS: 10 * 60 * 1000,
  /** Number of consecutive errors before triggering cooldown */
  ERROR_THRESHOLD: 5,
  /** Countdown update interval in milliseconds (1 second) */
  COUNTDOWN_UPDATE_INTERVAL_MS: 1000,
} as const;

/**
 * Time constants
 */
export const TIME_DEFAULTS = {
  /** Milliseconds per second */
  MS_PER_SECOND: 1000,
  /** Seconds per minute */
  SECONDS_PER_MINUTE: 60,
  /** Minutes per hour */
  MINUTES_PER_HOUR: 60,
  /** Hours per day */
  HOURS_PER_DAY: 24,
  /** Days per week */
  DAYS_PER_WEEK: 7,
  /** Days in a typical month (for calculations) */
  DAYS_PER_MONTH: 30,
  /** Months per year */
  MONTHS_PER_YEAR: 12,
} as const;

/**
 * Percentage calculation defaults
 */
export const PERCENTAGE_DEFAULTS = {
  /** Minimum percentage value */
  MIN: 0,
  /** Maximum percentage value */
  MAX: 100,
  /** Decimal places for percentage rounding */
  DECIMAL_PLACES: 2,
  /** Maximum decimal places for intelligent percentage formatting */
  MAX_DECIMAL_PLACES: 3,
} as const;

/**
 * Progress bar defaults
 */
export const PROGRESS_BAR_DEFAULTS = {
  /** Minimum progress bar length */
  MIN_LENGTH: 5,
  /** Maximum progress bar length */
  MAX_LENGTH: 20,
  /** Default length */
  DEFAULT_LENGTH: 10,
  /** Default warning threshold percentage */
  DEFAULT_WARNING_THRESHOLD: 50,
  /** Default critical threshold percentage */
  DEFAULT_CRITICAL_THRESHOLD: 75,
} as const;

/**
 * Progress bar characters
 */
export const PROGRESS_BAR_CHARS = {
  /** Full bar character */
  FULL: '█',
  /** Empty bar character */
  EMPTY: '░',
  /** Warning bar character (half filled) */
  WARNING: '▓',
  /** Critical bar character */
  CRITICAL: '█',
} as const;

/**
 * Tooltip formatting defaults
 */
export const TOOLTIP_DEFAULTS = {
  /** Default line width for tooltip content */
  DEFAULT_LINE_WIDTH: 70,
  /** Separator character for tooltips */
  SEPARATOR: '—',
  /** Minimum spaces before model name in tooltip */
  MIN_SPACES_BEFORE_MODEL: 1,
  /** Default tooltip width calculation padding */
  TOOLTIP_WIDTH_PADDING: 4,
} as const;

/**
 * Model name constants
 */
export const MODEL_DEFAULTS = {
  /** Fallback model name when detection fails */
  UNKNOWN_MODEL: 'unknown-model',
  /** Tool calls display name */
  TOOL_CALLS: 'tool-calls',
  /** Fast premium display name */
  FAST_PREMIUM: 'fast-premium',
} as const;

/**
 * Model detection patterns
 */
export const MODEL_PATTERNS = {
  /** Token-based usage pattern */
  TOKEN_BASED: /^(\d+) token-based usage calls to ([\w.-]+),/i,
  /** Extra fast premium pattern */
  EXTRA_FAST: /extra fast premium requests? \(([^)]+)\)/i,
  /** Request count pattern */
  REQUEST_COUNT: /^(\d+)\s+(.+?)(?: request| calls)?/i,
  /** Generic model pattern for Claude models */
  CLAUDE_MODEL:
    /\b(?:discounted\s+)?(claude-(?:3-(?:opus|sonnet|haiku)|3\.[57]-sonnet(?:-[\w-]+)?(?:-max)?|4-sonnet(?:-thinking)?)|gpt-(?:4(?:\.\d+|o-128k|-preview)?|3\.5-turbo)|gemini-(?:1\.5-flash-500k|2[\.-]5-pro-(?:exp-\d{2}-\d{2}|preview-\d{2}-\d{2}|exp-max))|o[134](?:-mini)?)\b/i,
} as const;

/**
 * Supported currencies array (matches package.json enum)
 */
export const SUPPORTED_CURRENCIES = [
  'USD', // US Dollar
  'EUR', // Euro
  'GBP', // British Pound
  'JPY', // Japanese Yen
  'AUD', // Australian Dollar
  'CAD', // Canadian Dollar
  'CHF', // Swiss Franc
  'CNY', // Chinese Yuan
  'INR', // Indian Rupee
  'MXN', // Mexican Peso
  'BRL', // Brazilian Real
  'RUB', // Russian Ruble
  'KRW', // South Korean Won
  'SGD', // Singapore Dollar
  'NZD', // New Zealand Dollar
  'TRY', // Turkish Lira
  'ZAR', // South African Rand
  'SEK', // Swedish Krona
  'NOK', // Norwegian Krone
  'DKK', // Danish Krone
  'HKD', // Hong Kong Dollar
  'TWD', // Taiwan Dollar
  'PHP', // Philippine Peso
  'THB', // Thai Baht
  'IDR', // Indonesian Rupiah
  'VND', // Vietnamese Dong
  'ILS', // Israeli Shekel
  'AED', // UAE Dirham
  'SAR', // Saudi Riyal
  'MYR', // Malaysian Ringgit
  'PLN', // Polish Złoty
  'CZK', // Czech Koruna
  'HUF', // Hungarian Forint
  'RON', // Romanian Leu
  'BGN', // Bulgarian Lev
  'HRK', // Croatian Kuna
  'EGP', // Egyptian Pound
  'QAR', // Qatari Riyal
  'KWD', // Kuwaiti Dinar
  'MAD', // Moroccan Dirham
] as const;

/**
 * Currency symbols map
 */
export const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  CHF: 'CHF',
  CNY: '¥',
  INR: '₹',
  MXN: 'Mex$',
  BRL: 'R$',
  RUB: '₽',
  KRW: '₩',
  SGD: 'S$',
  NZD: 'NZ$',
  TRY: '₺',
  ZAR: 'R',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  HKD: 'HK$',
  TWD: 'NT$',
  PHP: '₱',
  THB: '฿',
  IDR: 'Rp',
  VND: '₫',
  ILS: '₪',
  AED: 'د.إ',
  SAR: '﷼',
  MYR: 'RM',
  PLN: 'zł',
  CZK: 'Kč',
  HUF: 'Ft',
  RON: 'lei',
  BGN: 'лв',
  HRK: 'kn',
  EGP: 'E£',
  QAR: 'ر.ق',
  KWD: 'د.ك',
  MAD: 'د.م.',
} as const;

/**
 * Generic keywords to exclude from unknown model detection
 */
export const GENERIC_MODEL_KEYWORDS = [
  'usage',
  'calls',
  'request',
  'requests',
  'cents',
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
] as const;

/**
 * Smart usage monitor defaults
 */
export const SMART_USAGE_MONITOR_DEFAULTS = {
  /** Default check interval (every N queries) */
  DEFAULT_INTERVAL: 5,
  /** Default threshold percentage */
  DEFAULT_THRESHOLD: 10,
  /** Minimum interval value */
  MIN_INTERVAL: 1,
  /** Maximum interval value */
  MAX_INTERVAL: 50,
  /** Minimum threshold value */
  MIN_THRESHOLD: 1,
  /** Maximum threshold value */
  MAX_THRESHOLD: 50,
} as const;
