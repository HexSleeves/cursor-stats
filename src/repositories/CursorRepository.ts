/**
 * CursorRepository - Handles all HTTP communication with cursor.com API
 * Separates data fetching concerns from business logic
 *
 * This repository:
 * - Makes HTTP requests to cursor.com endpoints
 * - Handles authentication via session tokens
 * - Returns raw API responses for service layer processing
 * - Provides error information for proper error handling
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import {
  CursorUsageResponse,
  UsageLimitResponse,
  TokenUsageResponse,
  MonthlyInvoiceResponse,
  FilteredUsageEventsResponse,
} from '../interfaces/types';
import {
  API_ENDPOINTS,
  API_CONFIG,
  HTTP_HEADERS,
  AUTH_COOKIE_NAME,
  TOKEN_USER_ID_SEPARATOR,
} from '../constants/api';

/**
 * Configuration for the CursorRepository
 */
export interface CursorRepositoryConfig {
  /** Authentication token (WorkosCursorSessionToken) */
  token: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retryAttempts?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
}

/**
 * API error response structure
 */
export interface ApiError {
  /** HTTP status code */
  status?: number;
  /** Error message */
  message: string;
  /** Response data */
  data?: unknown;
  /** Whether this is a network error */
  isNetworkError?: boolean;
}

/**
 * Repository result type that handles both success and error cases
 */
export type RepositoryResult<T> = RepositorySuccess<T> | RepositoryError;

/**
 * Successful repository result
 */
export interface RepositorySuccess<T> {
  /** Indicates success */
  success: true;
  /** The returned data */
  data: T;
}

/**
 * Failed repository result
 */
export interface RepositoryError {
  /** Indicates failure */
  success: false;
  /** Error information */
  error: ApiError;
}

/**
 * Parameters for fetching usage data
 */
export interface FetchUsageParams {
  /** User ID to fetch usage for */
  userId: string;
}

/**
 * Parameters for fetching monthly invoice
 */
export interface FetchMonthlyInvoiceParams {
  /** Month (1-12) */
  month: number;
  /** Year (e.g., 2024) */
  year: number;
  /** Whether to include usage events */
  includeUsageEvents?: boolean;
}

/**
 * Parameters for fetching filtered usage events (today's usage)
 */
export interface FetchFilteredUsageEventsParams {
  /** Team ID (0 for individual) */
  teamId?: number;
  /** Start timestamp in milliseconds */
  startDate: number;
  /** End timestamp in milliseconds */
  endDate: number;
  /** Page number for pagination */
  page?: number;
  /** Number of results per page */
  pageSize?: number;
}

/**
 * Parameters for fetching aggregated usage events (token usage stats)
 */
export interface FetchAggregatedUsageEventsParams {
  /** Team ID (-1 for individual) */
  teamId?: number;
  /** Start timestamp in milliseconds */
  startDate: number;
  /** End timestamp in milliseconds */
  endDate: number;
}

/**
 * Parameters for fetching hard limit
 */
export interface FetchHardLimitParams {
  /** Team ID (optional for individual) */
  teamId?: number;
}

/**
 * Parameters for setting hard limit
 */
export interface SetHardLimitParams {
  /** Hard limit amount in dollars */
  hardLimit: number;
  /** Whether usage-based pricing is not allowed */
  noUsageBasedAllowed: boolean;
}

/**
 * Parameters for fetching usage-based premium requests status
 */
export interface FetchUsageBasedParams {
  /** Team ID (optional for individual) */
  teamId?: number;
}

/**
 * CursorRepository handles HTTP communication with cursor.com API
 */
export class CursorRepository {
  private readonly axiosInstance: AxiosInstance;
  private readonly config: Required<Omit<CursorRepositoryConfig, 'token'>>;

  constructor(private readonly repositoryConfig: CursorRepositoryConfig) {
    this.config = {
      timeout: repositoryConfig.timeout ?? API_CONFIG.TIMEOUT,
      retryAttempts: repositoryConfig.retryAttempts ?? API_CONFIG.RETRY_ATTEMPTS,
      retryDelay: repositoryConfig.retryDelay ?? API_CONFIG.RETRY_DELAY,
    };

    // Create axios instance with default config
    this.axiosInstance = axios.create({
      timeout: this.config.timeout,
    });
  }

  /**
   * Create HTTP headers for cursor.com API requests
   * @param isPostRequest - Whether this is a POST request
   * @returns Headers object
   */
  private createHeaders(isPostRequest: boolean = false): Record<string, string> {
    const headers: Record<string, string> = {
      [HTTP_HEADERS.ORIGIN]: HTTP_HEADERS.REFERER,
      [HTTP_HEADERS.REFERER]: HTTP_HEADERS.REFERER.replace('/api/', '/'),
      [HTTP_HEADERS.USER_AGENT]: HTTP_HEADERS.USER_AGENT,
      [HTTP_HEADERS.COOKIE]: `${AUTH_COOKIE_NAME}=${this.repositoryConfig.token}`,
      [HTTP_HEADERS.ACCEPT]: HTTP_HEADERS.ACCEPT,
      [HTTP_HEADERS.ACCEPT_LANGUAGE]: HTTP_HEADERS.ACCEPT_LANGUAGE,
      [HTTP_HEADERS.ACCEPT_ENCODING]: HTTP_HEADERS.ACCEPT_ENCODING,
      [HTTP_HEADERS.CONNECTION]: HTTP_HEADERS.CONNECTION,
      [HTTP_HEADERS.SEC_FETCH_DEST]: HTTP_HEADERS.SEC_FETCH_DEST,
      [HTTP_HEADERS.SEC_FETCH_MODE]: HTTP_HEADERS.SEC_FETCH_MODE,
      [HTTP_HEADERS.SEC_FETCH_SITE]: HTTP_HEADERS.SEC_FETCH_SITE,
    };

    if (isPostRequest) {
      headers[HTTP_HEADERS.CONTENT_TYPE] = HTTP_HEADERS.CONTENT_TYPE;
    }

    return headers;
  }

  /**
   * Make an HTTP GET request with retry logic
   * @param url - Request URL
   * @param config - Axios request config
   * @returns Promise with parsed response data
   */
  private async get<T>(url: string, config?: AxiosRequestConfig): Promise<RepositoryResult<T>> {
    return this.request<T>('GET', url, undefined, config);
  }

  /**
   * Make an HTTP POST request with retry logic
   * @param url - Request URL
   * @param data - Request body data
   * @param config - Axios request config
   * @returns Promise with parsed response data
   */
  private async post<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<RepositoryResult<T>> {
    return this.request<T>('POST', url, data, config);
  }

  /**
   * Make an HTTP request with retry logic
   * @param method - HTTP method
   * @param url - Request URL
   * @param data - Request body data (for POST)
   * @param config - Axios request config
   * @returns Promise with parsed response data
   */
  private async request<T>(
    method: 'GET' | 'POST',
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<RepositoryResult<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const isPost = method === 'POST';
        const requestConfig: AxiosRequestConfig = {
          ...config,
          headers: {
            ...this.createHeaders(isPost),
            ...config?.headers,
          },
        };

        let response;
        if (method === 'GET') {
          response = await this.axiosInstance.get<T>(url, requestConfig);
        } else {
          response = await this.axiosInstance.post<T>(url, data, requestConfig);
        }

        return { success: true, data: response.data };
      } catch (error) {
        lastError = error as Error;

        // Don't retry on 4xx errors (except 429)
        if (axios.isAxiosError(lastError)) {
          const status = lastError.response?.status;
          if (status && status >= 400 && status < 500 && status !== 429) {
            break;
          }
        }

        // Wait before retry (except on last attempt)
        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * (attempt + 1));
        }
      }
    }

    // All attempts failed
    return this.handleError(lastError);
  }

  /**
   * Handle request error and return standardized error result
   * @param error - The error object
   * @returns Error result
   */
  private handleError(error: Error | null): RepositoryError {
    if (!error) {
      return {
        success: false,
        error: {
          message: 'Unknown error occurred',
          isNetworkError: true,
        },
      };
    }

    if (axios.isAxiosError(error)) {
      return {
        success: false,
        error: {
          status: error.response?.status,
          message: error.message,
          data: error.response?.data,
          isNetworkError: !error.response,
        },
      };
    }

    return {
      success: false,
      error: {
        message: error.message,
        isNetworkError: true,
      },
    };
  }

  /**
   * Delay helper for retry logic
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Extract user ID from authentication token
   * @returns User ID or empty string if extraction fails
   */
  extractUserId(): string {
    try {
      return this.repositoryConfig.token.split(TOKEN_USER_ID_SEPARATOR)[0];
    } catch {
      return '';
    }
  }

  // ==================== PUBLIC API METHODS ====================

  /**
   * Fetch cursor usage statistics
   * @param params - Query parameters
   * @returns Usage response or error
   */
  async fetchUsage(params: FetchUsageParams): Promise<RepositoryResult<CursorUsageResponse>> {
    return this.get<CursorUsageResponse>(API_ENDPOINTS.USAGE, {
      params: { user: params.userId },
    });
  }

  /**
   * Fetch monthly invoice data
   * @param params - Invoice parameters
   * @returns Monthly invoice response or error
   */
  async fetchMonthlyInvoice(
    params: FetchMonthlyInvoiceParams,
  ): Promise<RepositoryResult<MonthlyInvoiceResponse>> {
    return this.post<MonthlyInvoiceResponse>(API_ENDPOINTS.GET_MONTHLY_INVOICE, {
      month: params.month,
      year: params.year,
      includeUsageEvents: params.includeUsageEvents ?? false,
    });
  }

  /**
   * Fetch filtered usage events (for today's usage)
   * @param params - Filter parameters
   * @returns Filtered usage events response or error
   */
  async fetchFilteredUsageEvents(
    params: FetchFilteredUsageEventsParams,
  ): Promise<RepositoryResult<FilteredUsageEventsResponse>> {
    return this.post<FilteredUsageEventsResponse>(API_ENDPOINTS.GET_FILTERED_USAGE_EVENTS, {
      teamId: params.teamId ?? 0,
      startDate: params.startDate.toString(),
      endDate: params.endDate.toString(),
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 100,
    });
  }

  /**
   * Fetch aggregated usage events (for token usage stats)
   * @param params - Aggregation parameters
   * @returns Token usage response or error
   */
  async fetchAggregatedUsageEvents(
    params: FetchAggregatedUsageEventsParams,
  ): Promise<RepositoryResult<TokenUsageResponse>> {
    return this.post<TokenUsageResponse>(API_ENDPOINTS.GET_AGGREGATED_USAGE_EVENTS, {
      teamId: params.teamId ?? -1,
      startDate: params.startDate,
      endDate: params.endDate,
    });
  }

  /**
   * Fetch current hard limit
   * @param params - Query parameters
   * @returns Usage limit response or error
   */
  async fetchHardLimit(
    params: FetchHardLimitParams = {},
  ): Promise<RepositoryResult<UsageLimitResponse>> {
    const payload = params.teamId ? { teamId: params.teamId } : {};
    return this.post<UsageLimitResponse>(API_ENDPOINTS.GET_HARD_LIMIT, payload);
  }

  /**
   * Set hard limit for usage-based pricing
   * @param params - Limit parameters
   * @returns Success or error
   */
  async setHardLimit(params: SetHardLimitParams): Promise<RepositoryResult<void>> {
    return this.post<void>(API_ENDPOINTS.SET_HARD_LIMIT, {
      hardLimit: params.hardLimit,
      noUsageBasedAllowed: params.noUsageBasedAllowed,
    });
  }

  /**
   * Fetch usage-based premium requests status
   * @param params - Query parameters
   * @returns Status information or error
   */
  async fetchUsageBasedStatus(
    params: FetchUsageBasedParams = {},
  ): Promise<RepositoryResult<{ usageBasedPremiumRequests: boolean }>> {
    const payload = params.teamId ? { teamId: params.teamId } : {};
    return this.post<{ usageBasedPremiumRequests: boolean }>(
      API_ENDPOINTS.GET_USAGE_BASED_PREMIUM_REQUESTS,
      payload,
    );
  }

  /**
   * Fetch Stripe session URL for billing
   * @returns Stripe URL or error
   */
  async fetchStripeSessionUrl(): Promise<RepositoryResult<string>> {
    const result = await this.get<string>(API_ENDPOINTS.STRIPE_SESSION);
    if (result.success) {
      // Remove quotes from the response string
      return {
        success: true,
        data: result.data.replace(/"/g, ''),
      };
    }
    return result;
  }
}

/**
 * Factory function to create a CursorRepository
 * @param config - Repository configuration
 * @returns Configured CursorRepository instance
 */
export function createCursorRepository(config: CursorRepositoryConfig): CursorRepository {
  return new CursorRepository(config);
}

/**
 * Type guard to check if a repository result is successful
 * @param result - Repository result to check
 */
export function isRepositorySuccess<T>(
  result: RepositoryResult<T>,
): result is RepositorySuccess<T> {
  return result.success;
}

/**
 * Type guard to check if a repository result is an error
 * @param result - Repository result to check
 */
export function isRepositoryError<T>(result: RepositoryResult<T>): result is RepositoryError {
  return !result.success;
}
