/**
 * ErrorHandler - Standardized error handling utilities
 *
 * This module provides consistent error handling across the extension:
 * - Error type checking and categorization
 * - User-friendly error messages
 * - Error logging with appropriate severity
 * - Error recovery suggestions
 *
 * Usage:
 * ```typescript
 * import { handleError, isErrorType, AppError } from './utils/errorHandler';
 *
 * try {
 *     await someOperation();
 * } catch (error) {
 *     handleError(error, 'MyOperation');
 * }
 * ```
 */

import * as vscode from 'vscode';
import { log } from './logger';

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  /** Network-related errors (no connection, timeout, etc.) */
  NETWORK = 'network',
  /** API-related errors (404, 500, rate limits, etc.) */
  API = 'api',
  /** Authentication errors */
  AUTH = 'auth',
  /** Data parsing/validation errors */
  DATA = 'data',
  /** File system errors */
  FILESYSTEM = 'filesystem',
  /** Configuration errors */
  CONFIGURATION = 'configuration',
  /** Unknown/unexpected errors */
  UNKNOWN = 'unknown',
}

/**
 * Base application error class
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly category: ErrorCategory = ErrorCategory.UNKNOWN,
    public readonly statusCode?: number,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    return this.message;
  }

  /**
   * Get suggestion for resolving the error
   */
  getSuggestion(): string | undefined {
    switch (this.category) {
      case ErrorCategory.NETWORK:
        return 'Please check your internet connection and try again.';
      case ErrorCategory.AUTH:
        return 'Please check your authentication token and try signing in again.';
      case ErrorCategory.API:
        if (this.statusCode === 429) {
          return 'You are being rate limited. Please wait a moment before trying again.';
        }
        if (this.statusCode && this.statusCode >= 500) {
          return 'The server is experiencing issues. Please try again later.';
        }
        return 'There was an issue communicating with the server. Please try again.';
      case ErrorCategory.CONFIGURATION:
        return 'Please check your extension settings and try again.';
      default:
        return undefined;
    }
  }
}

/**
 * Network error class
 */
export class NetworkError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(message, ErrorCategory.NETWORK, undefined, originalError);
    this.name = 'NetworkError';
  }
}

/**
 * API error class
 */
export class APIError extends AppError {
  constructor(message: string, statusCode?: number, originalError?: Error) {
    super(message, ErrorCategory.API, statusCode, originalError);
    this.name = 'APIError';
  }

  isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  isServerError(): boolean {
    return this.statusCode !== undefined && this.statusCode >= 500;
  }

  isClientError(): boolean {
    return this.statusCode !== undefined && this.statusCode >= 400 && this.statusCode < 500;
  }
}

/**
 * Authentication error class
 */
export class AuthError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(message, ErrorCategory.AUTH, undefined, originalError);
    this.name = 'AuthError';
  }
}

/**
 * Data error class (parsing, validation, etc.)
 */
export class DataError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(message, ErrorCategory.DATA, undefined, originalError);
    this.name = 'DataError';
  }
}

/**
 * Configuration error class
 */
export class ConfigurationError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(message, ErrorCategory.CONFIGURATION, undefined, originalError);
    this.name = 'ConfigurationError';
  }
}

/**
 * Parsed error information
 */
export interface ErrorInfo {
  /** Error category */
  category: ErrorCategory;
  /** User-friendly error message */
  message: string;
  /** Suggested resolution (if available) */
  suggestion?: string;
  /** HTTP status code (if applicable) */
  statusCode?: number;
  /** Whether the error is recoverable (user can retry) */
  isRecoverable: boolean;
}

/**
 * Check if error is an Axios error (has response data)
 */
export function isAxiosError(
  error: unknown,
): error is { response?: { data?: unknown }; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    ('response' in error || 'code' in error)
  );
}

/**
 * Get status code from error if available
 */
export function getStatusCode(error: unknown): number | undefined {
  if (isAxiosError(error) && error.response) {
    const response = error.response as { status?: number };
    return response.status;
  }
  return undefined;
}

/**
 * Categorize an error based on its properties
 */
export function categorizeError(error: unknown): ErrorCategory {
  // Check for known error types
  if (error instanceof AppError) {
    return error.category;
  }

  // Check for Axios errors (network/API)
  if (isAxiosError(error)) {
    const statusCode = getStatusCode(error);
    if (statusCode === 401 || statusCode === 403) {
      return ErrorCategory.AUTH;
    }
    if (statusCode) {
      return ErrorCategory.API;
    }
    return ErrorCategory.NETWORK;
  }

  // Check for network errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return ErrorCategory.NETWORK;
    }
    if (message.includes('econnrefused') || message.includes('enotfound')) {
      return ErrorCategory.NETWORK;
    }
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Parse an error into structured information
 */
export function parseError(error: unknown, context?: string): ErrorInfo {
  const category = categorizeError(error);
  const statusCode = getStatusCode(error);

  let message = 'An unexpected error occurred';
  let suggestion: string | undefined;
  let isRecoverable = true;

  // Extract message from error
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  // Add context if provided
  if (context) {
    message = `[${context}] ${message}`;
  }

  // Determine recoverability and suggestion based on category/status
  switch (category) {
    case ErrorCategory.NETWORK:
      isRecoverable = true;
      suggestion = 'Please check your internet connection and try again.';
      break;
    case ErrorCategory.AUTH:
      isRecoverable = false;
      suggestion = 'Please check your authentication token and try signing in again.';
      break;
    case ErrorCategory.API:
      if (statusCode === 429) {
        isRecoverable = true;
        suggestion = 'You are being rate limited. Please wait a moment before trying again.';
      } else if (statusCode && statusCode >= 500) {
        isRecoverable = true;
        suggestion = 'The server is experiencing issues. Please try again later.';
      } else {
        isRecoverable = true;
        suggestion = 'Please try again. If the problem persists, please report this issue.';
      }
      break;
    case ErrorCategory.DATA:
      isRecoverable = false;
      suggestion = 'There may be an issue with the data format. Please report this issue.';
      break;
    case ErrorCategory.CONFIGURATION:
      isRecoverable = false;
      suggestion = 'Please check your extension settings and try again.';
      break;
    default:
      isRecoverable = true;
      break;
  }

  return { category, message, suggestion, statusCode, isRecoverable };
}

/**
 * Handle an error with logging and optional user notification
 */
export function handleError(
  error: unknown,
  context: string,
  options: HandleErrorOptions = {},
): ErrorInfo {
  const { notify = false, logError = true } = options;

  const errorInfo = parseError(error, context);

  // Log the error
  if (logError) {
    const logMessage = `[${context}] ${errorInfo.message}`;
    const isError =
      errorInfo.category === ErrorCategory.AUTH ||
      errorInfo.category === ErrorCategory.CONFIGURATION ||
      errorInfo.category === ErrorCategory.DATA;

    log(logMessage, isError);

    // Log additional details
    if (errorInfo.statusCode) {
      log(`[${context}] Status code: ${errorInfo.statusCode}`, false);
    }
    if (errorInfo.suggestion) {
      log(`[${context}] Suggestion: ${errorInfo.suggestion}`, false);
    }
  }

  // Show user notification if requested
  if (notify) {
    const message = errorInfo.suggestion
      ? `${errorInfo.message}\n\n${errorInfo.suggestion}`
      : errorInfo.message;

    if (errorInfo.category === ErrorCategory.AUTH) {
      vscode.window.showErrorMessage(message, 'OK');
    } else {
      vscode.window.showWarningMessage(message, 'OK');
    }
  }

  return errorInfo;
}

/**
 * Handle error options
 */
export interface HandleErrorOptions {
  /** Whether to show a notification to the user */
  notify?: boolean;
  /** Whether to log the error */
  logError?: boolean;
}

/**
 * Wrap an async function with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context: string,
  options: HandleErrorOptions = {},
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error, context, options);
      throw error; // Re-throw for caller to handle
    }
  }) as T;
}

/**
 * Type guard for AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard for NetworkError
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

/**
 * Type guard for APIError
 */
export function isAPIError(error: unknown): error is APIError {
  return error instanceof APIError;
}

/**
 * Type guard for AuthError
 */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/**
 * Create an error from an unknown value
 */
export function createError(
  message: string,
  category: ErrorCategory = ErrorCategory.UNKNOWN,
  originalError?: unknown,
): AppError {
  switch (category) {
    case ErrorCategory.NETWORK:
      return new NetworkError(message, originalError instanceof Error ? originalError : undefined);
    case ErrorCategory.API:
      return new APIError(
        message,
        undefined,
        originalError instanceof Error ? originalError : undefined,
      );
    case ErrorCategory.AUTH:
      return new AuthError(message, originalError instanceof Error ? originalError : undefined);
    case ErrorCategory.DATA:
      return new DataError(message, originalError instanceof Error ? originalError : undefined);
    case ErrorCategory.CONFIGURATION:
      return new ConfigurationError(
        message,
        originalError instanceof Error ? originalError : undefined,
      );
    default:
      return new AppError(
        message,
        category,
        undefined,
        originalError instanceof Error ? originalError : undefined,
      );
  }
}

/**
 * Safe error extraction - returns message string from any error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unknown error occurred';
}
