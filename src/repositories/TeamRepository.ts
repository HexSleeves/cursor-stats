/**
 * TeamRepository - Handles team-related API calls to cursor.com
 * Separates team data fetching from business logic
 *
 * This repository:
 * - Fetches team membership information
 * - Gets team spend data
 * - Manages team member data extraction
 * - Handles caching of team information
 */

import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as jwt from 'jsonwebtoken';
import {
  TeamInfo,
  TeamMemberInfo,
  TeamSpendResponse,
  TeamMemberSpend,
  UserCache,
  CursorUsageResponse,
} from '../interfaces/types';
import { API_ENDPOINTS, API_CONFIG, TOKEN_USER_ID_SEPARATOR } from '../constants/api';
import { log } from '../utils/logger';
import { createCursorHeaders } from '../utils/httpHeaders';

/**
 * Team membership information
 */
export interface TeamMembershipInfo {
  /** Whether the user is a team member */
  isTeamMember: boolean;
  /** Team ID (if member) */
  teamId?: number;
  /** User ID within the team */
  userId?: number;
  /** Start of month date for billing cycle */
  startOfMonth: string;
}

/**
 * Configuration for team repository
 */
export interface TeamRepositoryConfig {
  /** Authentication token */
  token: string;
  /** Extension context for caching */
  context: vscode.ExtensionContext;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Team repository handles team-related API calls
 */
export class TeamRepository {
  private axiosInstance: AxiosInstance;
  private readonly context: vscode.ExtensionContext;
  private readonly token: string;
  private readonly cacheFileName: string;

  constructor(config: TeamRepositoryConfig) {
    this.token = config.token;
    this.context = config.context;
    this.cacheFileName = 'user-cache.json';

    this.axiosInstance = axios.create({
      timeout: config.timeout ?? API_CONFIG.TIMEOUT,
    });
  }

  /**
   * Get the path to the user cache file
   */
  private getCachePath(): string {
    return path.join(this.context.extensionPath, this.cacheFileName);
  }

  /**
   * Load user cache from disk
   */
  private loadUserCache(): UserCache | null {
    try {
      const cachePath = this.getCachePath();
      if (fs.existsSync(cachePath)) {
        const cacheData = fs.readFileSync(cachePath, 'utf8');
        const cache = JSON.parse(cacheData);
        log('[TeamRepo] Cache loaded successfully');
        return cache;
      } else {
        log('[TeamRepo] No cache file found');
      }
    } catch (error: any) {
      log('[TeamRepo] Error loading user cache: ' + error.message, true);
    }
    return null;
  }

  /**
   * Save user cache to disk
   */
  private saveUserCache(cache: UserCache): void {
    try {
      const cachePath = this.getCachePath();
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      log('[TeamRepo] Cache saved successfully', {
        userId: cache.userId,
        isTeamMember: cache.isTeamMember,
        teamId: cache.teamId,
      });
    } catch (error: any) {
      log('[TeamRepo] Error saving user cache: ' + error.message, true);
    }
  }

  /**
   * Extract JWT subject from token
   */
  private extractJwtSub(): string {
    try {
      const jwtToken = this.token.split(TOKEN_USER_ID_SEPARATOR)[1];
      const decoded = jwt.decode(jwtToken, { complete: true });
      return (decoded?.payload?.sub as string) || '';
    } catch {
      return '';
    }
  }

  /**
   * Extract user ID from token
   */
  private extractUserId(): string {
    try {
      return this.token.split(TOKEN_USER_ID_SEPARATOR)[0];
    } catch {
      return '';
    }
  }

  /**
   * Check if the user is a team member
   * Uses cache when available
   */
  async checkTeamMembership(): Promise<TeamMembershipInfo> {
    try {
      const jwtSub = this.extractJwtSub();

      // Check cache first
      const cache = this.loadUserCache();
      if (cache?.jwtSub === jwtSub && cache?.startOfMonth) {
        log('[TeamRepo] Using cached team membership data');
        return {
          isTeamMember: cache.isTeamMember,
          teamId: cache.teamId,
          userId: cache.userId,
          startOfMonth: cache.startOfMonth,
        };
      }

      log('[TeamRepo] Cache miss or invalid, fetching fresh data');

      // Get start of month from usage API
      const userId = this.extractUserId();
      const usageResponse = await this.axiosInstance.get<CursorUsageResponse>(API_ENDPOINTS.USAGE, {
        params: { user: userId },
        headers: createCursorHeaders(this.token, false),
      });
      const startOfMonth = usageResponse.data.startOfMonth;
      log('[TeamRepo] Got startOfMonth: ' + startOfMonth);

      // Fetch team membership data
      const teamsResponse = await this.axiosInstance.post<TeamInfo>(
        API_ENDPOINTS.TEAMS,
        {},
        {
          headers: createCursorHeaders(this.token, true),
        },
      );

      const isTeamMember = teamsResponse.data.teams && teamsResponse.data.teams.length > 0;
      const teamId = isTeamMember ? teamsResponse.data.teams[0].id : undefined;
      log(
        '[TeamRepo] Team membership check result: ' +
          (isTeamMember ? 'Team member' : 'Individual user'),
      );

      let teamUserId: number | undefined;

      if (isTeamMember && teamId) {
        // Fetch team details to get userId
        const teamResponse = await this.axiosInstance.post<TeamMemberInfo>(
          API_ENDPOINTS.TEAM_DETAILS,
          { teamId },
          {
            headers: createCursorHeaders(this.token, true),
          },
        );
        teamUserId = teamResponse.data.userId;
        log('[TeamRepo] Team user ID: ' + teamUserId);
      }

      // Save to cache
      const cacheData: UserCache = {
        userId: teamUserId || 0,
        jwtSub,
        isTeamMember,
        teamId,
        lastChecked: Date.now(),
        startOfMonth,
      };
      this.saveUserCache(cacheData);

      return {
        isTeamMember,
        teamId,
        userId: teamUserId,
        startOfMonth,
      };
    } catch (error: any) {
      log('[TeamRepo] Error checking team membership: ' + error.message, true);
      throw error;
    }
  }

  /**
   * Get team spend data
   * @param teamId - Team ID to fetch spend data for
   */
  async getTeamSpend(teamId: number): Promise<TeamSpendResponse> {
    try {
      log('[TeamRepo] Fetching team spend for team ID: ' + teamId);

      const response = await this.axiosInstance.post<TeamSpendResponse>(
        API_ENDPOINTS.GET_TEAM_SPEND,
        { teamId },
        {
          headers: createCursorHeaders(this.token, true),
          timeout: 15000,
        },
      );

      log('[TeamRepo] Team spend fetched successfully', {
        memberCount: response.data.teamMemberSpend.length,
        totalMembers: response.data.totalMembers,
      });

      return response.data;
    } catch (error: any) {
      log('[TeamRepo] Error fetching team spend: ' + error.message, true);
      throw error;
    }
  }

  /**
   * Extract user spend data from team spend response
   * @param teamSpend - Team spend response
   * @param userId - User ID to extract data for
   */
  extractUserSpend(teamSpend: TeamSpendResponse, userId: number): TeamMemberSpend {
    log('[TeamRepo] Extracting spend data for user ID: ' + userId);

    const userSpend = teamSpend.teamMemberSpend.find((member) => member.userId === userId);

    if (!userSpend) {
      log(
        '[TeamRepo] User spend data not found',
        {
          availableUserIds: teamSpend.teamMemberSpend.map((m) => m.userId),
          searchedUserId: userId,
        },
        true,
      );
      throw new Error('User spend data not found in team spend response');
    }

    log('[TeamRepo] Successfully extracted user spend data', {
      userId: userSpend.userId,
      name: userSpend.name,
      fastPremiumRequests: userSpend.fastPremiumRequests || 0,
    });

    return userSpend;
  }

  /**
   * Clear the user cache
   * Call this when switching users or logging out
   */
  clearCache(): void {
    try {
      const cachePath = this.getCachePath();
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
        log('[TeamRepo] Cache cleared successfully');
      }
    } catch (error: any) {
      log('[TeamRepo] Error clearing cache: ' + error.message, true);
    }
  }
}

/**
 * Factory function to create a TeamRepository
 * @param config - Repository configuration
 * @returns Configured TeamRepository instance
 */
export function createTeamRepository(config: TeamRepositoryConfig): TeamRepository {
  return new TeamRepository(config);
}
