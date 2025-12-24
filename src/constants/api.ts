/**
 * API endpoints and configuration constants for cursor.com API
 * Centralizes all API URLs and request configuration
 */

/**
 * Base URL for cursor.com API
 */
export const API_BASE_URL = 'https://cursor.com';

/**
 * API endpoints for cursor.com
 */
export const API_ENDPOINTS = {
  /** Usage statistics endpoint */
  USAGE: `${API_BASE_URL}/api/usage`,
  /** Team list endpoint */
  TEAMS: `${API_BASE_URL}/api/dashboard/teams`,
  /** Team details endpoint */
  TEAM_DETAILS: `${API_BASE_URL}/api/dashboard/team`,
  /** Team spend endpoint */
  GET_TEAM_SPEND: `${API_BASE_URL}/api/dashboard/get-team-spend`,
  /** Monthly invoice endpoint */
  GET_MONTHLY_INVOICE: `${API_BASE_URL}/api/dashboard/get-monthly-invoice`,
  /** Token usage stats endpoint */
  TOKEN_USAGE: `${API_BASE_URL}/api/dashboard/token-usage`,
  /** Aggregated usage events endpoint */
  GET_AGGREGATED_USAGE_EVENTS: `${API_BASE_URL}/api/dashboard/get-aggregated-usage-events`,
  /** Filtered usage events endpoint */
  GET_FILTERED_USAGE_EVENTS: `${API_BASE_URL}/api/dashboard/get-filtered-usage-events`,
  /** Hard limit endpoint */
  GET_HARD_LIMIT: `${API_BASE_URL}/api/dashboard/get-hard-limit`,
  /** Set hard limit endpoint */
  SET_HARD_LIMIT: `${API_BASE_URL}/api/dashboard/set-hard-limit`,
  /** Usage-based premium requests endpoint */
  GET_USAGE_BASED_PREMIUM_REQUESTS: `${API_BASE_URL}/api/dashboard/get-usage-based-premium-requests`,
  /** Stripe session endpoint */
  STRIPE_SESSION: `${API_BASE_URL}/api/stripeSession`,
} as const;

/**
 * API configuration constants
 */
export const API_CONFIG = {
  /** Request timeout in milliseconds */
  TIMEOUT: 15000,
  /** Number of retry attempts for failed requests */
  RETRY_ATTEMPTS: 3,
  /** Delay between retry attempts in milliseconds */
  RETRY_DELAY: 1000,
  /** Consecutive errors before cooldown mode */
  COOLDOWN_ERROR_THRESHOLD: 5,
  /** Cooldown duration in milliseconds (10 minutes) */
  COOLDOWN_DURATION_MS: 10 * 60 * 1000,
  /** Update check interval in milliseconds (1 hour) */
  RELEASE_CHECK_INTERVAL: 1000 * 60 * 60,
  /** Minimum refresh interval in milliseconds (5 seconds) */
  MIN_REFRESH_INTERVAL: 5000,
} as const;

/**
 * HTTP request headers for cursor.com API
 */
export const HTTP_HEADERS = {
  /** Origin header to bypass CORS validation */
  ORIGIN: 'https://cursor.com',
  /** Referer header */
  REFERER: 'https://cursor.com/',
  /** User agent for browser simulation */
  USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  /** Accept header */
  ACCEPT: 'application/json, text/plain, */*',
  /** Accept language header */
  ACCEPT_LANGUAGE: 'en-US,en;q=0.9',
  /** Accept encoding header */
  ACCEPT_ENCODING: 'gzip, deflate, br',
  /** Connection header */
  CONNECTION: 'keep-alive',
  /** Sec fetch dest header */
  SEC_FETCH_DEST: 'empty',
  /** Sec fetch mode header */
  SEC_FETCH_MODE: 'cors',
  /** Sec fetch site header */
  SEC_FETCH_SITE: 'same-origin',
  /** Content type for POST requests */
  CONTENT_TYPE: 'application/json',
  /** Cookie header (key for auth cookie, value is set dynamically) */
  COOKIE: 'cookie',
} as const;

/**
 * Cookie name for authentication token
 */
export const AUTH_COOKIE_NAME = 'WorkosCursorSessionToken';

/**
 * Default values for billing date calculations
 * Usage-based pricing renews on the 3rd day of each month
 */
export const USAGE_BASED_BILLING_DAY = 3;

/**
 * Token separator for extracting user ID from session token
 */
export const TOKEN_USER_ID_SEPARATOR = '%3A%3A';
