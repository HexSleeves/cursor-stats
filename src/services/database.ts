import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import * as fs from 'fs';
import initSqlJs from 'sql.js';
import { execSync } from 'child_process';
import { log } from '../utils/logger';
import { PathValidator } from '../utils/validation';
import { AuthService } from '../utils/auth';
import {
  ErrorFactory,
  DatabaseError,
  FileSystemError,
  isFileSystemError,
  isDatabaseError,
  isAuthError,
  getErrorInfo,
} from '../interfaces/errors';

// use globalStorageUri to get the user directory path
// support Portable mode : https://code.visualstudio.com/docs/editor/portable
function getDefaultUserDirPath(): string {
  // Import getExtensionContext here to avoid circular dependency
  const { getExtensionContext } = require('../extension');
  const context = getExtensionContext();
  const extensionGlobalStoragePath = context.globalStorageUri.fsPath;
  const userDirPath = path.dirname(path.dirname(path.dirname(extensionGlobalStoragePath)));
  log(`[Database] Default user directory path: ${userDirPath}`);
  return userDirPath;
}

/**
 * Gets the Cursor database path with comprehensive validation and security checks
 * @throws {DatabaseError} When path validation fails or security requirements are not met
 */
export function getCursorDBPath(): string {
  try {
    // Check for custom path in settings
    const config = vscode.workspace.getConfiguration('cursorStats');
    const customPath = config.get<string>('customDatabasePath');
    const userDirPath = getDefaultUserDirPath();

    if (customPath && customPath.trim() !== '') {
      log(`[Database] Validating custom path: ${customPath}`);

      // Validate custom path with security checks
      const validationResult = PathValidator.validateDatabasePath(customPath);
      if (!validationResult.isValid) {
        const error = ErrorFactory.createDatabaseError(
          `Invalid custom database path: ${validationResult.error?.message}`,
          {
            code: 'INVALID_CUSTOM_PATH',
            path: customPath,
            operation: 'path_validation',
            cause: validationResult.error,
          },
        );
        log(`[Database] Custom path validation failed: ${error.message}`, true);
        throw error;
      }

      log(`[Database] Using validated custom path: ${validationResult.value}`);
      return validationResult.value!;
    }

    // Build default path based on platform
    const folderName = vscode.env.appName;
    let defaultPath: string;

    if (process.platform === 'win32') {
      defaultPath = path.join(userDirPath, 'User', 'globalStorage', 'state.vscdb');
    } else if (process.platform === 'linux') {
      const isWSL = vscode.env.remoteName === 'wsl';
      if (isWSL) {
        const windowsUsername = getWindowsUsername();
        if (windowsUsername) {
          defaultPath = path.join(
            '/mnt/c/Users',
            windowsUsername,
            'AppData/Roaming',
            folderName,
            'User/globalStorage/state.vscdb',
          );
        } else {
          defaultPath = path.join(userDirPath, 'User', 'globalStorage', 'state.vscdb');
        }
      } else {
        defaultPath = path.join(userDirPath, 'User', 'globalStorage', 'state.vscdb');
      }
    } else if (process.platform === 'darwin') {
      defaultPath = path.join(userDirPath, 'User', 'globalStorage', 'state.vscdb');
    } else {
      defaultPath = path.join(userDirPath, 'User', 'globalStorage', 'state.vscdb');
    }

    // Validate default path (should always pass, but good to be safe)
    const validationResult = PathValidator.validateDatabasePath(defaultPath);
    if (!validationResult.isValid) {
      const error = ErrorFactory.createDatabaseError(
        `Invalid default database path: ${validationResult.error?.message}`,
        {
          code: 'INVALID_DEFAULT_PATH',
          path: defaultPath,
          operation: 'path_validation',
          cause: validationResult.error,
          context: { platform: process.platform, folderName },
        },
      );
      log(`[Database] Default path validation failed: ${error.message}`, true);
      throw error;
    }

    log(`[Database] Using validated default path: ${validationResult.value}`);
    return validationResult.value!;
  } catch (error) {
    if (isDatabaseError(error)) {
      throw error;
    }

    const dbError = ErrorFactory.createDatabaseError('Failed to determine database path', {
      code: 'PATH_DETERMINATION_FAILED',
      operation: 'get_db_path',
      cause: error instanceof Error ? error : new Error(String(error)),
      context: { platform: process.platform },
    });
    log(`[Database] Path determination failed: ${dbError.message}`, true);
    throw dbError;
  }
}

/**
 * Retrieves and validates the Cursor authentication token from the database
 * @returns Promise<string | undefined> Session token if found and valid, undefined otherwise
 * @throws {DatabaseError} When database operations fail critically
 */
export async function getCursorTokenFromDB(): Promise<string | undefined> {
  let db: any = null;

  try {
    // Get validated database path
    const dbPath = getCursorDBPath();
    log(`[Database] Attempting to open database at: ${dbPath}`);

    // Check if database file exists
    if (!fs.existsSync(dbPath)) {
      log('[Database] Database file does not exist');
      return undefined;
    }

    // Validate file access permissions
    try {
      fs.accessSync(dbPath, fs.constants.R_OK);
    } catch (accessError) {
      const error = ErrorFactory.createFileSystemError(
        'Cannot read database file: insufficient permissions',
        {
          code: 'DATABASE_ACCESS_DENIED',
          path: dbPath,
          operation: 'read',
          cause: accessError instanceof Error ? accessError : new Error(String(accessError)),
        },
      );
      log(`[Database] Access denied: ${error.message}`, true);
      throw error;
    }

    // Read and initialize database
    let dbBuffer: Buffer;
    try {
      dbBuffer = fs.readFileSync(dbPath);
    } catch (readError) {
      const error = ErrorFactory.createFileSystemError('Failed to read database file', {
        code: 'DATABASE_READ_FAILED',
        path: dbPath,
        operation: 'read',
        cause: readError instanceof Error ? readError : new Error(String(readError)),
      });
      log(`[Database] Read failed: ${error.message}`, true);
      throw error;
    }

    try {
      const SQL = await initSqlJs();
      db = new SQL.Database(new Uint8Array(dbBuffer));
    } catch (initError) {
      const error = ErrorFactory.createDatabaseError('Failed to initialize SQLite database', {
        code: 'DATABASE_INIT_FAILED',
        path: dbPath,
        operation: 'initialize',
        cause: initError instanceof Error ? initError : new Error(String(initError)),
      });
      log(`[Database] Initialization failed: ${error.message}`, true);
      throw error;
    }

    // Query for authentication token
    let result: any[];
    try {
      result = db.exec("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'");
    } catch (queryError) {
      const error = ErrorFactory.createDatabaseError('Failed to query authentication token', {
        code: 'TOKEN_QUERY_FAILED',
        path: dbPath,
        operation: 'query',
        query: "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'",
        cause: queryError instanceof Error ? queryError : new Error(String(queryError)),
      });
      log(`[Database] Query failed: ${error.message}`, true);
      throw error;
    }

    // Check if token was found
    if (!result.length || !result[0].values.length) {
      log('[Database] No authentication token found in database');
      return undefined;
    }

    // Extract token value
    const tokenValue = result[0].values[0][0];
    if (typeof tokenValue !== 'string') {
      log('[Database] Token value is not a string', true);
      return undefined;
    }

    const token = tokenValue;
    log(
      `[Database] Found token, length: ${token.length}, starts with: ${token.substring(0, 20)}...`,
    );

    // Validate and process token using AuthService
    const sessionTokenResult = AuthService.createSessionToken(token);
    if (!sessionTokenResult.isValid) {
      if (isAuthError(sessionTokenResult.error)) {
        log(`[Database] Token validation failed: ${sessionTokenResult.error.message}`, true);
        log(
          `[Database] Auth error details: ${JSON.stringify(getErrorInfo(sessionTokenResult.error))}`,
          true,
        );
      } else {
        log(
          `[Database] Unexpected error during token validation: ${sessionTokenResult.error?.message}`,
          true,
        );
      }
      return undefined;
    }

    const sessionToken = sessionTokenResult.value!;
    log(`[Database] Successfully created session token, length: ${sessionToken.length}`);
    return sessionToken;
  } catch (error) {
    // Log detailed error information
    const errorInfo = getErrorInfo(error);
    log(`[Database] Critical error: ${errorInfo.message}`, true);
    log(`[Database] Error details: ${JSON.stringify(errorInfo)}`, true);

    // Re-throw database and filesystem errors as they indicate serious issues
    if (isDatabaseError(error) || isFileSystemError(error)) {
      throw error;
    }

    // For other errors, log but don't throw to maintain backward compatibility
    return undefined;
  } finally {
    // Ensure database is always closed
    if (db) {
      try {
        db.close();
        log('[Database] Database connection closed');
      } catch (closeError) {
        log(`[Database] Warning: Failed to close database: ${closeError}`, true);
      }
    }
  }
}
/**
 * Gets the Windows username for WSL environments
 * @returns string | undefined Username if found, undefined otherwise
 */
export function getWindowsUsername(): string | undefined {
  try {
    // Executes cmd.exe and echoes the %USERNAME% variable
    const result = execSync('cmd.exe /C "echo %USERNAME%"', {
      encoding: 'utf8',
      timeout: 5000, // 5 second timeout
    });

    const username = result.trim();
    if (!username || username.length === 0) {
      log('[Database] Windows username is empty', true);
      return undefined;
    }

    // Basic validation - username should not contain invalid characters
    if (username.includes('..') || username.includes('/') || username.includes('\\')) {
      log(`[Database] Windows username contains invalid characters: ${username}`, true);
      return undefined;
    }

    log(`[Database] Retrieved Windows username: ${username}`);
    return username;
  } catch (error) {
    const errorInfo = getErrorInfo(error);
    log(`[Database] Error getting Windows username: ${errorInfo.message}`, true);
    return undefined;
  }
}
