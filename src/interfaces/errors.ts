/**
 * Comprehensive error type hierarchy for the Cursor Stats extension
 * Provides structured error handling with context information for debugging
 */

/**
 * Base error interface with common properties
 */
export interface BaseError extends Error {
  readonly code: string;
  readonly timestamp: Date;
  readonly context?: Record<string, unknown>;
  readonly cause?: Error;
}

/**
 * API-related errors
 */
export interface ApiError extends BaseError {
  readonly status?: number;
  readonly endpoint?: string;
  readonly method?: string;
  readonly response?: {
    status: number;
    statusText: string;
    data?: unknown;
  };
}

/**
 * Database-related errors
 */
export interface DatabaseError extends BaseError {
  readonly operation?: string;
  readonly path?: string;
  readonly query?: string;
}

/**
 * Validation errors for input/data validation
 */
export interface ValidationError extends BaseError {
  readonly field?: string;
  readonly value?: unknown;
  readonly constraint?: string;
}

/**
 * Authentication and authorization errors
 */
export interface AuthError extends BaseError {
  readonly tokenType?: string;
  readonly reason?: 'invalid_format' | 'expired' | 'malformed' | 'missing_claims';
}

/**
 * Configuration-related errors
 */
export interface ConfigError extends BaseError {
  readonly setting?: string;
  readonly expectedType?: string;
  readonly actualValue?: unknown;
}

/**
 * Network/connectivity errors
 */
export interface NetworkError extends BaseError {
  readonly url?: string;
  readonly timeout?: number;
  readonly retryCount?: number;
}

/**
 * File system operation errors
 */
export interface FileSystemError extends BaseError {
  readonly path?: string;
  readonly operation?: 'read' | 'write' | 'delete' | 'access';
  readonly permissions?: string;
}

/**
 * Extension lifecycle errors
 */
export interface ExtensionError extends BaseError {
  readonly phase?: 'activation' | 'deactivation' | 'initialization';
  readonly component?: string;
}

/**
 * Error factory functions for creating typed errors
 */
export class ErrorFactory {
  static createApiError(
    message: string,
    options: {
      code?: string;
      status?: number;
      endpoint?: string;
      method?: string;
      response?: ApiError['response'];
      cause?: Error;
      context?: Record<string, unknown>;
    } = {},
  ): ApiError {
    const error = new Error(message);
    return Object.assign(error, {
      name: 'ApiError',
      code: options.code || 'API_ERROR',
      timestamp: new Date(),
      status: options.status,
      endpoint: options.endpoint,
      method: options.method,
      response: options.response,
      cause: options.cause,
      context: options.context,
    }) as ApiError;
  }

  static createDatabaseError(
    message: string,
    options: {
      code?: string;
      operation?: string;
      path?: string;
      query?: string;
      cause?: Error;
      context?: Record<string, unknown>;
    } = {},
  ): DatabaseError {
    const error = new Error(message);
    return Object.assign(error, {
      name: 'DatabaseError',
      code: options.code || 'DATABASE_ERROR',
      timestamp: new Date(),
      operation: options.operation,
      path: options.path,
      query: options.query,
      cause: options.cause,
      context: options.context,
    }) as DatabaseError;
  }

  static createValidationError(
    message: string,
    options: {
      code?: string;
      field?: string;
      value?: unknown;
      constraint?: string;
      cause?: Error;
      context?: Record<string, unknown>;
    } = {},
  ): ValidationError {
    const error = new Error(message);
    return Object.assign(error, {
      name: 'ValidationError',
      code: options.code || 'VALIDATION_ERROR',
      timestamp: new Date(),
      field: options.field,
      value: options.value,
      constraint: options.constraint,
      cause: options.cause,
      context: options.context,
    }) as ValidationError;
  }

  static createAuthError(
    message: string,
    options: {
      code?: string;
      tokenType?: string;
      reason?: AuthError['reason'];
      cause?: Error;
      context?: Record<string, unknown>;
    } = {},
  ): AuthError {
    const error = new Error(message);
    return Object.assign(error, {
      name: 'AuthError',
      code: options.code || 'AUTH_ERROR',
      timestamp: new Date(),
      tokenType: options.tokenType,
      reason: options.reason,
      cause: options.cause,
      context: options.context,
    }) as AuthError;
  }

  static createConfigError(
    message: string,
    options: {
      code?: string;
      setting?: string;
      expectedType?: string;
      actualValue?: unknown;
      cause?: Error;
      context?: Record<string, unknown>;
    } = {},
  ): ConfigError {
    const error = new Error(message);
    return Object.assign(error, {
      name: 'ConfigError',
      code: options.code || 'CONFIG_ERROR',
      timestamp: new Date(),
      setting: options.setting,
      expectedType: options.expectedType,
      actualValue: options.actualValue,
      cause: options.cause,
      context: options.context,
    }) as ConfigError;
  }

  static createNetworkError(
    message: string,
    options: {
      code?: string;
      url?: string;
      timeout?: number;
      retryCount?: number;
      cause?: Error;
      context?: Record<string, unknown>;
    } = {},
  ): NetworkError {
    const error = new Error(message);
    return Object.assign(error, {
      name: 'NetworkError',
      code: options.code || 'NETWORK_ERROR',
      timestamp: new Date(),
      url: options.url,
      timeout: options.timeout,
      retryCount: options.retryCount,
      cause: options.cause,
      context: options.context,
    }) as NetworkError;
  }

  static createFileSystemError(
    message: string,
    options: {
      code?: string;
      path?: string;
      operation?: FileSystemError['operation'];
      permissions?: string;
      cause?: Error;
      context?: Record<string, unknown>;
    } = {},
  ): FileSystemError {
    const error = new Error(message);
    return Object.assign(error, {
      name: 'FileSystemError',
      code: options.code || 'FILESYSTEM_ERROR',
      timestamp: new Date(),
      path: options.path,
      operation: options.operation,
      permissions: options.permissions,
      cause: options.cause,
      context: options.context,
    }) as FileSystemError;
  }

  static createExtensionError(
    message: string,
    options: {
      code?: string;
      phase?: ExtensionError['phase'];
      component?: string;
      cause?: Error;
      context?: Record<string, unknown>;
    } = {},
  ): ExtensionError {
    const error = new Error(message);
    return Object.assign(error, {
      name: 'ExtensionError',
      code: options.code || 'EXTENSION_ERROR',
      timestamp: new Date(),
      phase: options.phase,
      component: options.component,
      cause: options.cause,
      context: options.context,
    }) as ExtensionError;
  }
}

/**
 * Type guards for error identification
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && error.name === 'ApiError';
}

export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof Error && error.name === 'DatabaseError';
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof Error && error.name === 'ValidationError';
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof Error && error.name === 'AuthError';
}

export function isConfigError(error: unknown): error is ConfigError {
  return error instanceof Error && error.name === 'ConfigError';
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof Error && error.name === 'NetworkError';
}

export function isFileSystemError(error: unknown): error is FileSystemError {
  return error instanceof Error && error.name === 'FileSystemError';
}

export function isExtensionError(error: unknown): error is ExtensionError {
  return error instanceof Error && error.name === 'ExtensionError';
}

/**
 * Utility function to extract error information for logging
 */
export function getErrorInfo(error: unknown): {
  name: string;
  message: string;
  code?: string;
  stack?: string;
  context?: Record<string, unknown>;
} {
  if (error instanceof Error) {
    const baseError = error as BaseError;
    return {
      name: error.name,
      message: error.message,
      code: baseError.code,
      stack: error.stack,
      context: baseError.context,
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}
