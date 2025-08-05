/**
 * Comprehensive validation utilities for input validation and data sanitization
 * Provides type-safe validation with detailed error reporting
 */

import { isAbsolute, normalize } from 'path';
import { ErrorFactory, ValidationError } from '../interfaces/errors';

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  isValid: boolean;
  value?: T;
  error?: ValidationError;
}

/**
 * Path validation utilities
 */
export class PathValidator {
  /**
   * Validates and sanitizes a file system path
   */
  static validatePath(
    path: string,
    options: {
      mustExist?: boolean;
      mustBeAbsolute?: boolean;
      allowedExtensions?: string[];
      maxLength?: number;
    } = {},
  ): ValidationResult<string> {
    try {
      // Basic type and null checks
      if (typeof path !== 'string') {
        return {
          isValid: false,
          error: ErrorFactory.createValidationError('Path must be a string', {
            field: 'path',
            value: path,
            constraint: 'type_string',
          }),
        };
      }

      if (!path || path.trim() === '') {
        return {
          isValid: false,
          error: ErrorFactory.createValidationError('Path cannot be empty', {
            field: 'path',
            value: path,
            constraint: 'not_empty',
          }),
        };
      }

      const trimmedPath = path.trim();

      // Length validation
      if (options.maxLength && trimmedPath.length > options.maxLength) {
        return {
          isValid: false,
          error: ErrorFactory.createValidationError(
            `Path exceeds maximum length of ${options.maxLength}`,
            {
              field: 'path',
              value: trimmedPath,
              constraint: 'max_length',
            },
          ),
        };
      }

      // Path traversal protection
      if (trimmedPath.includes('..')) {
        return {
          isValid: false,
          error: ErrorFactory.createValidationError('Path traversal not allowed', {
            field: 'path',
            value: trimmedPath,
            constraint: 'no_traversal',
            code: 'SECURITY_VIOLATION',
          }),
        };
      }

      // Normalize the path
      const normalizedPath = normalize(trimmedPath);

      // Absolute path requirement
      if (options.mustBeAbsolute && !isAbsolute(normalizedPath)) {
        return {
          isValid: false,
          error: ErrorFactory.createValidationError('Path must be absolute', {
            field: 'path',
            value: normalizedPath,
            constraint: 'absolute_path',
          }),
        };
      }

      // Extension validation
      if (options.allowedExtensions && options.allowedExtensions.length > 0) {
        const hasValidExtension = options.allowedExtensions.some((ext) =>
          normalizedPath.toLowerCase().endsWith(ext.toLowerCase()),
        );

        if (!hasValidExtension) {
          return {
            isValid: false,
            error: ErrorFactory.createValidationError(
              `Path must have one of the allowed extensions: ${options.allowedExtensions.join(', ')}`,
              {
                field: 'path',
                value: normalizedPath,
                constraint: 'allowed_extensions',
              },
            ),
          };
        }
      }

      return {
        isValid: true,
        value: normalizedPath,
      };
    } catch (error) {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError('Path validation failed', {
          field: 'path',
          value: path,
          constraint: 'validation_error',
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
      };
    }
  }

  /**
   * Validates database path specifically
   */
  static validateDatabasePath(path: string): ValidationResult<string> {
    return this.validatePath(path, {
      mustBeAbsolute: true,
      allowedExtensions: ['.vscdb', '.db', '.sqlite', '.sqlite3'],
      maxLength: 1000,
    });
  }
}

/**
 * Configuration validation utilities
 */
export class ConfigValidator {
  /**
   * Validates refresh interval setting
   */
  static validateRefreshInterval(value: unknown): ValidationResult<number> {
    if (typeof value !== 'number') {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError('Refresh interval must be a number', {
          field: 'refreshInterval',
          value,
          constraint: 'type_number',
        }),
      };
    }

    if (value < 10) {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError('Refresh interval must be at least 10 seconds', {
          field: 'refreshInterval',
          value,
          constraint: 'min_value',
        }),
      };
    }

    if (value > 3600) {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError('Refresh interval cannot exceed 1 hour', {
          field: 'refreshInterval',
          value,
          constraint: 'max_value',
        }),
      };
    }

    return {
      isValid: true,
      value: Math.floor(value),
    };
  }

  /**
   * Validates currency code
   */
  static validateCurrency(value: unknown, allowedCurrencies: string[]): ValidationResult<string> {
    if (typeof value !== 'string') {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError('Currency must be a string', {
          field: 'currency',
          value,
          constraint: 'type_string',
        }),
      };
    }

    const upperValue = value.toUpperCase();
    if (!allowedCurrencies.includes(upperValue)) {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError(
          `Currency must be one of: ${allowedCurrencies.join(', ')}`,
          {
            field: 'currency',
            value,
            constraint: 'allowed_values',
          },
        ),
      };
    }

    return {
      isValid: true,
      value: upperValue,
    };
  }

  /**
   * Validates percentage threshold
   */
  static validatePercentage(value: unknown, field: string): ValidationResult<number> {
    if (typeof value !== 'number') {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError(`${field} must be a number`, {
          field,
          value,
          constraint: 'type_number',
        }),
      };
    }

    if (value < 0 || value > 100) {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError(`${field} must be between 0 and 100`, {
          field,
          value,
          constraint: 'range_0_100',
        }),
      };
    }

    return {
      isValid: true,
      value,
    };
  }

  /**
   * Validates color threshold configuration
   */
  static validateColorThreshold(
    value: unknown,
  ): ValidationResult<{ percentage: number; color: string }> {
    if (!value || typeof value !== 'object') {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError('Color threshold must be an object', {
          field: 'colorThreshold',
          value,
          constraint: 'type_object',
        }),
      };
    }

    const obj = value as Record<string, unknown>;

    // Validate percentage
    const percentageResult = this.validatePercentage(obj.percentage, 'percentage');
    if (!percentageResult.isValid) {
      return {
        isValid: false,
        error: percentageResult.error,
      };
    }

    // Validate color
    if (typeof obj.color !== 'string' || !obj.color.trim()) {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError('Color must be a non-empty string', {
          field: 'color',
          value: obj.color,
          constraint: 'type_string_non_empty',
        }),
      };
    }

    return {
      isValid: true,
      value: {
        percentage: percentageResult.value!,
        color: obj.color.trim(),
      },
    };
  }
}

/**
 * API response validation utilities
 */
export class ApiValidator {
  /**
   * Validates API response structure
   */
  static validateApiResponse<T>(
    response: unknown,
    validator: (data: unknown) => data is T,
  ): ValidationResult<T> {
    if (!response) {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError('API response is null or undefined', {
          field: 'response',
          value: response,
          constraint: 'not_null',
        }),
      };
    }

    if (!validator(response)) {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError(
          'API response does not match expected structure',
          {
            field: 'response',
            value: response,
            constraint: 'structure_validation',
          },
        ),
      };
    }

    return {
      isValid: true,
      value: response,
    };
  }

  /**
   * Validates usage data structure
   */
  static validateUsageData(data: unknown): ValidationResult<{
    current: number;
    limit: number;
    startOfMonth: string;
  }> {
    if (!data || typeof data !== 'object') {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError('Usage data must be an object', {
          field: 'usageData',
          value: data,
          constraint: 'type_object',
        }),
      };
    }

    const obj = data as Record<string, unknown>;

    // Validate current
    if (typeof obj.current !== 'number' || obj.current < 0) {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError('Current usage must be a non-negative number', {
          field: 'current',
          value: obj.current,
          constraint: 'non_negative_number',
        }),
      };
    }

    // Validate limit
    if (typeof obj.limit !== 'number' || obj.limit < 0) {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError('Usage limit must be a non-negative number', {
          field: 'limit',
          value: obj.limit,
          constraint: 'non_negative_number',
        }),
      };
    }

    // Validate startOfMonth
    if (typeof obj.startOfMonth !== 'string') {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError('Start of month must be a string', {
          field: 'startOfMonth',
          value: obj.startOfMonth,
          constraint: 'type_string',
        }),
      };
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    if (!dateRegex.test(obj.startOfMonth)) {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError(
          'Start of month must be a valid ISO date string',
          {
            field: 'startOfMonth',
            value: obj.startOfMonth,
            constraint: 'iso_date_format',
          },
        ),
      };
    }

    return {
      isValid: true,
      value: {
        current: obj.current,
        limit: obj.limit,
        startOfMonth: obj.startOfMonth,
      },
    };
  }
}

/**
 * General utility functions
 */
export class ValidationUtils {
  /**
   * Validates that a value is not null or undefined
   */
  static validateRequired<T>(value: T | null | undefined, field: string): ValidationResult<T> {
    if (value === null || value === undefined) {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError(`${field} is required`, {
          field,
          value,
          constraint: 'required',
        }),
      };
    }

    return {
      isValid: true,
      value,
    };
  }

  /**
   * Validates array of values
   */
  static validateArray<T>(
    value: unknown,
    field: string,
    itemValidator: (item: unknown) => ValidationResult<T>,
  ): ValidationResult<T[]> {
    if (!Array.isArray(value)) {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError(`${field} must be an array`, {
          field,
          value,
          constraint: 'type_array',
        }),
      };
    }

    const results: T[] = [];
    for (let i = 0; i < value.length; i++) {
      const itemResult = itemValidator(value[i]);
      if (!itemResult.isValid) {
        return {
          isValid: false,
          error: ErrorFactory.createValidationError(`${field}[${i}] validation failed`, {
            field: `${field}[${i}]`,
            value: value[i],
            constraint: 'array_item_validation',
            cause: itemResult.error,
          }),
        };
      }
      results.push(itemResult.value!);
    }

    return {
      isValid: true,
      value: results,
    };
  }

  /**
   * Combines multiple validation results
   */
  static combineValidations(...results: ValidationResult<unknown>[]): ValidationResult<unknown[]> {
    const errors: ValidationError[] = [];
    const values: unknown[] = [];

    for (const result of results) {
      if (!result.isValid && result.error) {
        errors.push(result.error);
      } else if (result.value !== undefined) {
        values.push(result.value);
      }
    }

    if (errors.length > 0) {
      return {
        isValid: false,
        error: ErrorFactory.createValidationError('Multiple validation errors occurred', {
          constraint: 'multiple_errors',
          context: { errors: errors.map((e) => e.message) },
        }),
      };
    }

    return {
      isValid: true,
      value: values,
    };
  }
}
