/**
 * UsageService - Orchestrates usage data fetching and processing
 * Combines data from multiple sources (CursorRepository, TeamRepository)
 * to provide high-level usage statistics
 *
 * This service:
 * - Fetches cursor stats (premium requests, usage-based pricing)
 * - Fetches token usage stats for token mode
 * - Fetches today's usage data
 * - Combines team and individual usage data
 * - Provides a unified interface for usage information
 */

import { log } from '../utils/logger';
import type {
  CursorStats,
  TokenUsageResponse,
  UsageBasedStatus,
  TodayUsageData,
} from '../interfaces/types';
import { CursorRepository, isRepositorySuccess } from '../repositories/CursorRepository';
import { TeamRepository, type TeamMembershipInfo } from '../repositories/TeamRepository';

/**
 * Result type for usage operations
 */
export type UsageResult<T> = UsageSuccess<T> | UsageError;

export interface UsageSuccess<T> {
  success: true;
  data: T;
}

export interface UsageError {
  success: false;
  error: {
    message: string;
    isNetworkError?: boolean;
    statusCode?: number;
  };
}

/**
 * Configuration for UsageService
 */
export interface UsageServiceConfig {
  /** Cursor repository for API calls */
  cursorRepository: CursorRepository;
  /** Team repository for team data */
  teamRepository: TeamRepository;
  /** Authentication token */
  token: string;
}

/**
 * Parameters for fetching cursor stats
 */
export interface FetchCursorStatsParams {
  /** Whether to include detailed usage data */
  includeDetailed?: boolean;
}

/**
 * Parameters for fetching token usage stats
 */
export interface FetchTokenStatsParams {
  /** Team ID (if applicable) */
  teamId?: number;
  /** Start date for aggregation */
  startDate?: Date;
  /** End date for aggregation */
  endDate?: Date;
}

/**
 * Parameters for fetching today's usage
 */
export interface FetchTodayUsageParams {
  /** Team ID (0 for individual) */
  teamId?: number;
}

/**
 * UsageService provides high-level usage data operations
 */
export class UsageService {
  private readonly cursorRepository: CursorRepository;
  private readonly teamRepository: TeamRepository;
  private readonly token: string;

  constructor(config: UsageServiceConfig) {
    this.cursorRepository = config.cursorRepository;
    this.teamRepository = config.teamRepository;
    this.token = config.token;
  }

  /**
   * Fetch cursor stats (premium requests, usage-based pricing)
   * Combines data from multiple API endpoints
   * @param params - Fetch parameters
   * @returns Cursor stats or error
   */
  async fetchCursorStats(_params: FetchCursorStatsParams = {}): Promise<UsageResult<CursorStats>> {
    try {
      log('[UsageService] Fetching cursor stats...');

      // Get team membership info
      const teamInfo = await this.getTeamMembershipInfo();

      // Extract user ID from token
      const userId = this.cursorRepository.extractUserId();
      if (!userId) {
        throw new Error('Could not extract user ID from token');
      }

      // Fetch usage data
      const usageResult = await this.cursorRepository.fetchUsage({ userId });
      if (!isRepositorySuccess(usageResult)) {
        return this.createError(usageResult.error);
      }
      const usageData = usageResult.data;

      // Get current and previous month dates
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const lastMonthDate = new Date(now);
      lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
      const lastMonth = lastMonthDate.getMonth() + 1;
      const lastYear = lastMonthDate.getFullYear();

      // Fetch monthly invoices (current and last month)
      const [currentMonthResult, lastMonthResult] = await Promise.all([
        this.cursorRepository.fetchMonthlyInvoice({
          month: currentMonth,
          year: currentYear,
          includeUsageEvents: true,
        }),
        this.cursorRepository.fetchMonthlyInvoice({
          month: lastMonth,
          year: lastYear,
          includeUsageEvents: true,
        }),
      ]);

      if (!isRepositorySuccess(currentMonthResult) || !isRepositorySuccess(lastMonthResult)) {
        log('[UsageService] Warning: Failed to fetch some monthly invoice data', true);
      }

      // Determine if we're using team spend data
      let isTeamSpendData = false;
      let premiumRequestsCurrent = usageData['gpt-4']?.numRequests || 0;
      let premiumRequestsLimit = usageData['gpt-4']?.maxRequestUsage || 0;

      if (teamInfo.isTeamMember && teamInfo.teamId && teamInfo.userId) {
        try {
          const teamSpend = await this.teamRepository.getTeamSpend(teamInfo.teamId);
          const userSpend = this.teamRepository.extractUserSpend(teamSpend, teamInfo.userId);
          premiumRequestsCurrent = userSpend.fastPremiumRequests || premiumRequestsCurrent;
          isTeamSpendData = true;
          log('[UsageService] Using team spend data for premium requests');
        } catch (error: any) {
          log('[UsageService] Failed to fetch team spend, falling back to individual data', true);
        }
      }

      // Process usage-based pricing items from invoice data
      const currentMonthData = currentMonthResult.success
        ? this.processMonthlyInvoice(currentMonthResult.data)
        : this.createEmptyMonthlyData(currentMonth, currentYear);

      const lastMonthData = lastMonthResult.success
        ? this.processMonthlyInvoice(lastMonthResult.data)
        : this.createEmptyMonthlyData(lastMonth, lastYear);

      const cursorStats: CursorStats = {
        currentMonth: currentMonthData,
        lastMonth: lastMonthData,
        premiumRequests: {
          current: premiumRequestsCurrent,
          limit: premiumRequestsLimit,
          startOfMonth: usageData.startOfMonth,
        },
        isTeamSpendData,
        teamId: teamInfo.teamId,
      };

      log('[UsageService] Successfully fetched cursor stats', {
        premiumRequests: `${premiumRequestsCurrent}/${premiumRequestsLimit}`,
        isTeamSpendData,
      });

      return { success: true, data: cursorStats };
    } catch (error: any) {
      log('[UsageService] Error fetching cursor stats: ' + error.message, true);
      return this.createErrorFromException(error);
    }
  }

  /**
   * Fetch token usage stats for token display mode
   * @param params - Fetch parameters
   * @returns Token usage response or error
   */
  async fetchTokenUsageStats(
    params: FetchTokenStatsParams = {},
  ): Promise<UsageResult<TokenUsageResponse>> {
    try {
      log('[UsageService] Fetching token usage stats...');

      // Get team info if teamId not provided
      let teamId = params.teamId;
      if (teamId === undefined) {
        const teamInfo = await this.getTeamMembershipInfo();
        teamId = teamInfo.teamId;
      }

      // Set default date range (current month to date)
      const startDate = params.startDate || this.getMonthStart();
      const endDate = params.endDate || new Date();

      const result = await this.cursorRepository.fetchAggregatedUsageEvents({
        teamId,
        startDate: startDate.getTime(),
        endDate: endDate.getTime(),
      });

      if (!isRepositorySuccess(result)) {
        return this.createError(result.error);
      }

      log('[UsageService] Successfully fetched token usage stats', {
        totalCostCents: result.data.totalCostCents,
        aggregationCount: result.data.aggregations.length,
      });

      return { success: true, data: result.data };
    } catch (error: any) {
      log('[UsageService] Error fetching token usage stats: ' + error.message, true);
      return this.createErrorFromException(error);
    }
  }

  /**
   * Fetch today's usage data
   * @param params - Fetch parameters
   * @returns Today's usage data or error
   */
  async fetchTodayUsage(params: FetchTodayUsageParams = {}): Promise<UsageResult<TodayUsageData>> {
    try {
      log("[UsageService] Fetching today's usage...");

      // Get team info if teamId not provided
      let teamId = params.teamId;
      if (teamId === undefined) {
        const teamInfo = await this.getTeamMembershipInfo();
        teamId = teamInfo.teamId ?? 0;
      }

      // Calculate today's date range (start of day to now)
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const result = await this.cursorRepository.fetchFilteredUsageEvents({
        teamId,
        startDate: startOfDay.getTime(),
        endDate: now.getTime(),
        page: 1,
        pageSize: 100,
      });

      if (!isRepositorySuccess(result)) {
        return this.createError(result.error);
      }

      // Calculate total cost from usage events
      const totalCents = result.data.totalCents || 0;
      const totalUSD = totalCents / 100;

      const todayUsage: TodayUsageData = {
        totalCents,
        totalUSD,
      };

      log("[UsageService] Successfully fetched today's usage", {
        totalUSD,
      });

      return { success: true, data: todayUsage };
    } catch (error: any) {
      log("[UsageService] Error fetching today's usage: " + error.message, true);
      return this.createErrorFromException(error);
    }
  }

  /**
   * Check usage-based pricing status
   * @param teamId - Team ID (optional)
   * @returns Usage-based status or error
   */
  async checkUsageBasedStatus(teamId?: number): Promise<UsageResult<UsageBasedStatus>> {
    try {
      log('[UsageService] Checking usage-based pricing status...');

      // Get team info if teamId not provided
      if (teamId === undefined) {
        const teamInfo = await this.getTeamMembershipInfo();
        teamId = teamInfo.teamId;
      }

      // Fetch hard limit
      const hardLimitResult = await this.cursorRepository.fetchHardLimit({ teamId });
      if (!isRepositorySuccess(hardLimitResult)) {
        return this.createError(hardLimitResult.error);
      }

      // Fetch usage-based status
      const usageBasedResult = await this.cursorRepository.fetchUsageBasedStatus({ teamId });
      if (!isRepositorySuccess(usageBasedResult)) {
        return this.createError(usageBasedResult.error);
      }

      const isEnabled = usageBasedResult.data.usageBasedPremiumRequests;
      const limit = hardLimitResult.data.hardLimit ?? hardLimitResult.data.hardLimitPerUser ?? 0;

      const status: UsageBasedStatus = {
        isEnabled,
        limit,
      };

      log('[UsageService] Usage-based pricing status', {
        isEnabled,
        limit,
      });

      return { success: true, data: status };
    } catch (error: any) {
      log('[UsageService] Error checking usage-based status: ' + error.message, true);
      return this.createErrorFromException(error);
    }
  }

  /**
   * Get team membership info with caching
   * @returns Team membership information
   */
  async getTeamMembershipInfo(): Promise<TeamMembershipInfo> {
    return await this.teamRepository.checkTeamMembership();
  }

  /**
   * Process monthly invoice data to extract usage-based pricing items
   * @param invoiceData - Raw invoice data
   * @returns Processed monthly data
   */
  private processMonthlyInvoice(invoiceData: any): {
    month: number;
    year: number;
    usageBasedPricing: {
      items: Array<{
        calculation: string;
        totalDollars: string;
        description?: string;
        modelNameForTooltip?: string;
        isDiscounted?: boolean;
      }>;
      hasUnpaidMidMonthInvoice: boolean;
      midMonthPayment: number;
    };
  } {
    // Extract usage items from invoice data
    const items = (invoiceData.usageEvents || []).map((event: any) => ({
      calculation: event.calculation || '',
      totalDollars: event.totalDollars || '$0.00',
      description: event.description,
      modelNameForTooltip: event.modelNameForTooltip,
      isDiscounted: event.isDiscounted || false,
    }));

    return {
      month: invoiceData.month || new Date().getMonth() + 1,
      year: invoiceData.year || new Date().getFullYear(),
      usageBasedPricing: {
        items,
        hasUnpaidMidMonthInvoice: invoiceData.hasUnpaidMidMonthInvoice || false,
        midMonthPayment: invoiceData.midMonthPayment || 0,
      },
    };
  }

  /**
   * Create empty monthly data for when invoice fetch fails
   * @param month - Month number
   * @param year - Year
   * @returns Empty monthly data structure
   */
  private createEmptyMonthlyData(
    month: number,
    year: number,
  ): {
    month: number;
    year: number;
    usageBasedPricing: {
      items: any[];
      hasUnpaidMidMonthInvoice: boolean;
      midMonthPayment: number;
    };
  } {
    return {
      month,
      year,
      usageBasedPricing: {
        items: [],
        hasUnpaidMidMonthInvoice: false,
        midMonthPayment: 0,
      },
    };
  }

  /**
   * Get start of current month as Date
   * @returns Start of month date
   */
  private getMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  /**
   * Create an error result from a repository error
   * @param error - Repository error
   * @returns Usage error result
   */
  private createError(error: {
    message: string;
    isNetworkError?: boolean;
    status?: number;
  }): UsageError {
    return {
      success: false,
      error: {
        message: error.message,
        isNetworkError: error.isNetworkError,
        statusCode: error.status,
      },
    };
  }

  /**
   * Create an error result from an exception
   * @param error - Exception object
   * @returns Usage error result
   */
  private createErrorFromException(error: Error): UsageError {
    return {
      success: false,
      error: {
        message: error.message,
        isNetworkError: true,
      },
    };
  }
}

/**
 * Factory function to create a UsageService
 * @param config - Service configuration
 * @returns Configured UsageService instance
 */
export function createUsageService(config: UsageServiceConfig): UsageService {
  return new UsageService(config);
}

/**
 * Type guard to check if a usage result is successful
 * @param result - Usage result to check
 */
export function isUsageSuccess<T>(result: UsageResult<T>): result is UsageSuccess<T> {
  return result.success;
}

/**
 * Type guard to check if a usage result is an error
 * @param result - Usage result to check
 */
export function isUsageError<T>(result: UsageResult<T>): result is UsageError {
  return !result.success;
}
