/**
 * Authentication utilities with enhanced JWT token validation
 * Provides secure token handling with proper validation and error reporting
 */

import * as jwt from 'jsonwebtoken';
import { ErrorFactory, AuthError, ValidationError } from '../interfaces/errors';
import { ValidationResult, ValidationUtils } from './validation';

/**
 * JWT token payload interface for Cursor tokens
 */
export interface CursorTokenPayload extends jwt.JwtPayload {
  sub: string;
  iat?: number;
  exp?: number;
  aud?: string;
  iss?: string;
  // Add other expected Cursor-specific claims
  userId?: string;
  email?: string;
  plan?: string;
}

/**
 * Decoded JWT token with header information
 */
export interface DecodedToken {
  header: jwt.JwtHeader;
  payload: CursorTokenPayload;
  signature: string;
}

/**
 * Token validation options
 */
export interface TokenValidationOptions {
  requireExp?: boolean;
  requireIat?: boolean;
  maxAge?: number; // in seconds
  allowedAudiences?: string[];
  allowedIssuers?: string[];
}

/**
 * Authentication service for JWT token handling
 */
export class AuthService {
  /**
   * Validates JWT token structure and format
   */
  static validateTokenFormat(token: string): ValidationResult<string> {
    // Check if token is a string
    const requiredResult = ValidationUtils.validateRequired(token, 'token');
    if (!requiredResult.isValid) {
      return requiredResult;
    }

    // Check basic format (should have 3 parts separated by dots)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return {
        isValid: false,
        error: ErrorFactory.createAuthError('Invalid JWT format: token must have 3 parts', {
          code: 'INVALID_JWT_FORMAT',
          tokenType: 'JWT',
          reason: 'malformed',
          context: { partsCount: parts.length },
        }),
      };
    }

    // Check if parts are base64url encoded (basic check)
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i] || parts[i].length === 0) {
        return {
          isValid: false,
          error: ErrorFactory.createAuthError(`Invalid JWT format: part ${i + 1} is empty`, {
            code: 'INVALID_JWT_FORMAT',
            tokenType: 'JWT',
            reason: 'malformed',
            context: { emptyPart: i + 1 },
          }),
        };
      }
    }

    return {
      isValid: true,
      value: token,
    };
  }

  /**
   * Decodes JWT token without verification
   */
  static decodeToken(token: string): ValidationResult<DecodedToken> {
    // First validate format
    const formatResult = this.validateTokenFormat(token);
    if (!formatResult.isValid) {
      return {
        isValid: false,
        error: formatResult.error,
      };
    }

    try {
      const decoded = jwt.decode(token, { complete: true });

      if (!decoded || typeof decoded === 'string') {
        return {
          isValid: false,
          error: ErrorFactory.createAuthError('Failed to decode JWT token', {
            code: 'JWT_DECODE_FAILED',
            tokenType: 'JWT',
            reason: 'malformed',
          }),
        };
      }

      // Validate payload structure
      const payloadResult = this.validateTokenPayload(decoded.payload);
      if (!payloadResult.isValid) {
        return {
          isValid: false,
          error: payloadResult.error,
        };
      }

      return {
        isValid: true,
        value: {
          header: decoded.header,
          payload: payloadResult.value!,
          signature: decoded.signature,
        },
      };
    } catch (error) {
      return {
        isValid: false,
        error: ErrorFactory.createAuthError('JWT decoding failed', {
          code: 'JWT_DECODE_ERROR',
          tokenType: 'JWT',
          reason: 'malformed',
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
      };
    }
  }

  /**
   * Validates JWT token payload structure
   */
  static validateTokenPayload(payload: unknown): ValidationResult<CursorTokenPayload> {
    if (!payload || typeof payload !== 'object') {
      return {
        isValid: false,
        error: ErrorFactory.createAuthError('JWT payload must be an object', {
          code: 'INVALID_JWT_PAYLOAD',
          tokenType: 'JWT',
          reason: 'malformed',
        }),
      };
    }

    const payloadObj = payload as Record<string, unknown>;

    // Validate required 'sub' claim
    if (!payloadObj.sub || typeof payloadObj.sub !== 'string') {
      return {
        isValid: false,
        error: ErrorFactory.createAuthError('JWT payload missing or invalid "sub" claim', {
          code: 'MISSING_SUB_CLAIM',
          tokenType: 'JWT',
          reason: 'missing_claims',
          context: { sub: payloadObj.sub },
        }),
      };
    }

    // Validate numeric claims if present
    const numericClaims = ['iat', 'exp', 'nbf'];
    for (const claim of numericClaims) {
      if (payloadObj[claim] !== undefined && typeof payloadObj[claim] !== 'number') {
        return {
          isValid: false,
          error: ErrorFactory.createAuthError(`JWT payload "${claim}" claim must be a number`, {
            code: 'INVALID_CLAIM_TYPE',
            tokenType: 'JWT',
            reason: 'malformed',
            context: { claim, value: payloadObj[claim] },
          }),
        };
      }
    }

    return {
      isValid: true,
      value: payloadObj as CursorTokenPayload,
    };
  }

  /**
   * Validates token with additional options
   */
  static validateToken(
    token: string,
    options: TokenValidationOptions = {},
  ): ValidationResult<CursorTokenPayload> {
    // Decode the token
    const decodeResult = this.decodeToken(token);
    if (!decodeResult.isValid) {
      return {
        isValid: false,
        error: decodeResult.error,
      };
    }

    const { payload } = decodeResult.value!;

    // Check expiration if required or present
    if (options.requireExp || payload.exp) {
      if (!payload.exp) {
        return {
          isValid: false,
          error: ErrorFactory.createAuthError('Token expiration claim is required', {
            code: 'MISSING_EXP_CLAIM',
            tokenType: 'JWT',
            reason: 'missing_claims',
          }),
        };
      }

      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        return {
          isValid: false,
          error: ErrorFactory.createAuthError('Token has expired', {
            code: 'TOKEN_EXPIRED',
            tokenType: 'JWT',
            reason: 'expired',
            context: { exp: payload.exp, now },
          }),
        };
      }
    }

    // Check issued at if required or present
    if (options.requireIat || payload.iat) {
      if (!payload.iat) {
        return {
          isValid: false,
          error: ErrorFactory.createAuthError('Token issued at claim is required', {
            code: 'MISSING_IAT_CLAIM',
            tokenType: 'JWT',
            reason: 'missing_claims',
          }),
        };
      }

      // Check max age if specified
      if (options.maxAge) {
        const now = Math.floor(Date.now() / 1000);
        const age = now - payload.iat;
        if (age > options.maxAge) {
          return {
            isValid: false,
            error: ErrorFactory.createAuthError('Token is too old', {
              code: 'TOKEN_TOO_OLD',
              tokenType: 'JWT',
              reason: 'expired',
              context: { age, maxAge: options.maxAge },
            }),
          };
        }
      }
    }

    // Check audience if specified
    if (options.allowedAudiences && options.allowedAudiences.length > 0) {
      if (!payload.aud) {
        return {
          isValid: false,
          error: ErrorFactory.createAuthError('Token audience claim is required', {
            code: 'MISSING_AUD_CLAIM',
            tokenType: 'JWT',
            reason: 'missing_claims',
          }),
        };
      }

      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      const hasValidAudience = audiences.some((aud) => options.allowedAudiences!.includes(aud));

      if (!hasValidAudience) {
        return {
          isValid: false,
          error: ErrorFactory.createAuthError('Token audience is not allowed', {
            code: 'INVALID_AUDIENCE',
            tokenType: 'JWT',
            reason: 'invalid_format',
            context: { audience: payload.aud, allowedAudiences: options.allowedAudiences },
          }),
        };
      }
    }

    // Check issuer if specified
    if (options.allowedIssuers && options.allowedIssuers.length > 0) {
      if (!payload.iss) {
        return {
          isValid: false,
          error: ErrorFactory.createAuthError('Token issuer claim is required', {
            code: 'MISSING_ISS_CLAIM',
            tokenType: 'JWT',
            reason: 'missing_claims',
          }),
        };
      }

      if (!options.allowedIssuers.includes(payload.iss)) {
        return {
          isValid: false,
          error: ErrorFactory.createAuthError('Token issuer is not allowed', {
            code: 'INVALID_ISSUER',
            tokenType: 'JWT',
            reason: 'invalid_format',
            context: { issuer: payload.iss, allowedIssuers: options.allowedIssuers },
          }),
        };
      }
    }

    return {
      isValid: true,
      value: payload,
    };
  }

  /**
   * Extracts user ID from Cursor token
   */
  static extractUserId(token: string): ValidationResult<string> {
    const validationResult = this.validateToken(token);
    if (!validationResult.isValid) {
      return {
        isValid: false,
        error: validationResult.error,
      };
    }

    const payload = validationResult.value!;

    // Try to extract user ID from sub claim
    if (payload.sub.includes('|')) {
      const parts = payload.sub.split('|');
      if (parts.length >= 2 && parts[1]) {
        return {
          isValid: true,
          value: parts[1],
        };
      }
    }

    // Fallback to userId claim if available
    if (payload.userId) {
      return {
        isValid: true,
        value: payload.userId,
      };
    }

    return {
      isValid: false,
      error: ErrorFactory.createAuthError('Unable to extract user ID from token', {
        code: 'USER_ID_EXTRACTION_FAILED',
        tokenType: 'JWT',
        reason: 'invalid_format',
        context: { sub: payload.sub },
      }),
    };
  }

  /**
   * Creates session token for Cursor API
   */
  static createSessionToken(token: string): ValidationResult<string> {
    const userIdResult = this.extractUserId(token);
    if (!userIdResult.isValid) {
      return userIdResult;
    }

    const userId = userIdResult.value!;
    const sessionToken = `${userId}%3A%3A${token}`;

    return {
      isValid: true,
      value: sessionToken,
    };
  }

  /**
   * Validates session token format
   */
  static validateSessionToken(sessionToken: string): ValidationResult<{
    userId: string;
    token: string;
  }> {
    if (!sessionToken || typeof sessionToken !== 'string') {
      return {
        isValid: false,
        error: ErrorFactory.createAuthError('Session token must be a non-empty string', {
          code: 'INVALID_SESSION_TOKEN',
          tokenType: 'SessionToken',
          reason: 'invalid_format',
        }),
      };
    }

    const parts = sessionToken.split('%3A%3A');
    if (parts.length !== 2) {
      return {
        isValid: false,
        error: ErrorFactory.createAuthError('Invalid session token format', {
          code: 'INVALID_SESSION_TOKEN_FORMAT',
          tokenType: 'SessionToken',
          reason: 'malformed',
          context: { partsCount: parts.length },
        }),
      };
    }

    const [userId, token] = parts;
    if (!userId || !token) {
      return {
        isValid: false,
        error: ErrorFactory.createAuthError('Session token contains empty parts', {
          code: 'EMPTY_SESSION_TOKEN_PARTS',
          tokenType: 'SessionToken',
          reason: 'malformed',
        }),
      };
    }

    // Validate the JWT part
    const tokenValidation = this.validateToken(token);
    if (!tokenValidation.isValid) {
      return {
        isValid: false,
        error: tokenValidation.error,
      };
    }

    return {
      isValid: true,
      value: { userId, token },
    };
  }
}
