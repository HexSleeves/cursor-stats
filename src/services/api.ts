import axios, { AxiosError } from 'axios';
import {
  CursorStats,
  UsageLimitResponse,
  UsageItem,
  CursorUsageResponse,
} from '../interfaces/types';
import { log } from '../utils/logger';
import { checkTeamMembership, getTeamSpend, extractUserSpend } from './team';
import { getExtensionContext } from '../extension';
import { t } from '../utils/i18n';
import { createCursorHeaders } from '../utils/httpHeaders';
import { ErrorFactory, ApiError, FileSystemError, getErrorInfo } from '../interfaces/errors';
import * as fs from 'fs';

/**
 * Helper function to create ApiError from axios errors
 */
function createApiErrorFromAxios(
  error: unknown,
  context: {
    operation: string;
    endpoint?: string;
    method?: string;
  },
): ApiError {
  if (axios.isAxiosError(error)) {
    return ErrorFactory.createApiError(`API ${context.operation} failed: ${error.message}`, {
      code: `API_${context.operation.toUpperCase()}_FAILED`,
      status: error.response?.status,
      endpoint: context.endpoint,
      method: context.method,
      response: error.response
        ? {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
          }
        : undefined,
      cause: error,
    });
  }

  return ErrorFactory.createApiError(`${context.operation} failed with unknown error`, {
    code: `${context.operation.toUpperCase()}_UNKNOWN_ERROR`,
    endpoint: context.endpoint,
    method: context.method,
    cause: error instanceof Error ? error : new Error(String(error)),
  });
}

/**
 * Type guard for usage limit response
 */
function isUsageLimitResponse(data: unknown): data is UsageLimitResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    (typeof (data as any).hardLimit === 'number' || (data as any).hardLimit === undefined) &&
    (typeof (data as any).hardLimitPerUser === 'number' ||
      (data as any).hardLimitPerUser === undefined) &&
    (typeof (data as any).noUsageBasedAllowed === 'boolean' ||
      (data as any).noUsageBasedAllowed === undefined)
  );
}

export async function getCurrentUsageLimit(
  token: string,
  teamId?: number,
): Promise<UsageLimitResponse> {
  const endpoint = 'https://cursor.com/api/dashboard/get-hard-limit';

  try {
    const payload = teamId ? { teamId } : {};
    const response = await axios.post(endpoint, payload, {
      headers: createCursorHeaders(token, true),
    });

    // Validate response structure
    if (!isUsageLimitResponse(response.data)) {
      throw ErrorFactory.createApiError('Invalid usage limit response structure', {
        code: 'INVALID_RESPONSE_STRUCTURE',
        endpoint,
        method: 'POST',
        context: { responseData: response.data },
      });
    }

    return response.data;
  } catch (error) {
    const apiError = createApiErrorFromAxios(error, {
      operation: 'get_usage_limit',
      endpoint,
      method: 'POST',
    });

    log(`[API] Error fetching usage limit: ${apiError.message}`, true);
    log(`[API] Error details: ${JSON.stringify(getErrorInfo(apiError))}`, true);
    throw apiError;
  }
}

export async function setUsageLimit(
  token: string,
  hardLimit: number,
  noUsageBasedAllowed: boolean,
): Promise<void> {
  const endpoint = 'https://cursor.com/api/dashboard/set-hard-limit';

  try {
    await axios.post(
      endpoint,
      {
        hardLimit,
        noUsageBasedAllowed,
      },
      {
        headers: createCursorHeaders(token, true),
      },
    );
    log(
      `[API] Successfully ${noUsageBasedAllowed ? 'disabled' : 'enabled'} usage-based pricing with limit: $${hardLimit}`,
    );
  } catch (error) {
    const apiError = createApiErrorFromAxios(error, {
      operation: 'set_usage_limit',
      endpoint,
      method: 'POST',
    });

    log(`[API] Error setting usage limit: ${apiError.message}`, true);
    log(`[API] Error details: ${JSON.stringify(getErrorInfo(apiError))}`, true);
    throw apiError;
  }
}

export async function checkUsageBasedStatus(
  token: string,
  teamId?: number,
): Promise<{ isEnabled: boolean; limit?: number }> {
  try {
    // Use the same endpoint that the web dashboard uses
    const payload = teamId ? { teamId } : {};
    log(`[API] Checking usage-based status with payload: ${JSON.stringify(payload)}`);

    const response = await axios.post(
      'https://cursor.com/api/dashboard/get-usage-based-premium-requests',
      payload,
      {
        headers: createCursorHeaders(token, true),
      },
    );

    log(`[API] Usage-based status response: ${JSON.stringify(response.data)}`);

    // Get the hard limit to determine the spending limit
    const limitResponse = await getCurrentUsageLimit(token, teamId);
    log(`[API] Hard limit response: ${JSON.stringify(limitResponse)}`);

    const isEnabled = response.data.usageBasedPremiumRequests === true;
    log(`[API] Usage-based pricing is ${isEnabled ? 'enabled' : 'disabled'}`);

    return {
      isEnabled: isEnabled,
      limit: limitResponse.hardLimit,
    };
  } catch (error) {
    const apiError = createApiErrorFromAxios(error, {
      operation: 'check_usage_based_status',
      endpoint: 'https://cursor.com/api/dashboard/get-usage-based-premium-requests',
      method: 'POST',
    });

    log(`[API] Error checking usage-based status: ${apiError.message}`, true);
    log(`[API] Error details: ${JSON.stringify(getErrorInfo(apiError))}`, true);

    // Return default state instead of throwing to maintain backward compatibility
    return {
      isEnabled: false,
    };
  }
}

async function fetchMonthData(
  token: string,
  month: number,
  year: number,
): Promise<{ items: UsageItem[]; hasUnpaidMidMonthInvoice: boolean; midMonthPayment: number }> {
  log(`[API] Fetching data for ${month}/${year}`);
  try {
    // Path to local dev data file, leave empty for production
    const devDataPath: string = '';

    let response;
    if (devDataPath) {
      try {
        log(`[API] Dev mode enabled, reading from: ${devDataPath}`);
        const rawData = fs.readFileSync(devDataPath, 'utf8');
        response = { data: JSON.parse(rawData) };
        log('[API] Successfully loaded dev data');
      } catch (devError) {
        const fileError = ErrorFactory.createFileSystemError(
          'Failed to read development data file',
          {
            code: 'DEV_DATA_READ_FAILED',
            path: devDataPath,
            operation: 'read',
            cause: devError instanceof Error ? devError : new Error(String(devError)),
          },
        );
        log(`[API] Error reading dev data: ${fileError.message}`, true);
        throw fileError;
      }
    } else {
      response = await axios.post(
        'https://cursor.com/api/dashboard/get-monthly-invoice',
        {
          month,
          year,
          includeUsageEvents: false,
        },
        {
          headers: createCursorHeaders(token, true),
        },
      );
    }

    const usageItems: UsageItem[] = [];
    let midMonthPayment = 0;
    if (response.data.items) {
      // First pass: find the maximum request count and cost per request among valid items
      let maxRequestCount = 0;
      let maxCostPerRequest = 0;
      for (const item of response.data.items) {
        // Skip items without cents value or mid-month payments
        if (
          !item.hasOwnProperty('cents') ||
          typeof item.cents === 'undefined' ||
          item.description.includes('Mid-month usage paid')
        ) {
          continue;
        }

        let currentItemRequestCount = 0;
        const tokenBasedMatch = item.description.match(/^(\d+) token-based usage calls to/);
        if (tokenBasedMatch && tokenBasedMatch[1]) {
          currentItemRequestCount = parseInt(tokenBasedMatch[1]);
        } else {
          const originalMatch = item.description.match(/^(\d+)/); // Match digits at the beginning
          if (originalMatch && originalMatch[1]) {
            currentItemRequestCount = parseInt(originalMatch[1]);
          }
        }

        if (currentItemRequestCount > 0) {
          maxRequestCount = Math.max(maxRequestCount, currentItemRequestCount);

          // Calculate cost per request for this item to find maximum
          const costPerRequestCents = item.cents / currentItemRequestCount;
          const costPerRequestDollars = costPerRequestCents / 100;
          maxCostPerRequest = Math.max(maxCostPerRequest, costPerRequestDollars);
        }
      }

      // Calculate the padding width based on the maximum request count
      const paddingWidth = maxRequestCount > 0 ? maxRequestCount.toString().length : 1; // Ensure paddingWidth is at least 1

      // Calculate the padding width for cost per request (format to 3 decimal places and find max width)
      // Max cost will be something like "XX.XXX" or "X.XXX", so we need to find the max length of that string.
      // Let's find the maximum cost in cents first to determine the number of integer digits.
      let maxCostCentsForPadding = 0;
      for (const item of response.data.items) {
        if (
          !item.hasOwnProperty('cents') ||
          typeof item.cents === 'undefined' ||
          item.description.includes('Mid-month usage paid')
        ) {
          continue;
        }
        let currentItemRequestCount = 0;
        const tokenBasedMatch = item.description.match(/^(\d+) token-based usage calls to/);
        if (tokenBasedMatch && tokenBasedMatch[1]) {
          currentItemRequestCount = parseInt(tokenBasedMatch[1]);
        } else {
          const originalMatch = item.description.match(/^(\d+)/);
          if (originalMatch && originalMatch[1]) {
            currentItemRequestCount = parseInt(originalMatch[1]);
          }
        }
        if (currentItemRequestCount > 0) {
          const costPerRequestCents = item.cents / currentItemRequestCount;
          maxCostCentsForPadding = Math.max(maxCostCentsForPadding, costPerRequestCents);
        }
      }
      // Now format this max cost per request to get its string length
      const maxCostPerRequestForPaddingFormatted = (maxCostCentsForPadding / 100).toFixed(3);
      const costPaddingWidth = maxCostPerRequestForPaddingFormatted.length;

      for (const item of response.data.items) {
        // Skip items without cents value
        if (!item.hasOwnProperty('cents')) {
          log('[API] Skipping item without cents value: ' + item.description);
          continue;
        }

        // Check if this is a mid-month payment
        if (item.description.includes('Mid-month usage paid')) {
          // Skip if cents is undefined
          if (typeof item.cents === 'undefined') {
            continue;
          }
          // Add to the total mid-month payment amount (convert from cents to dollars)
          midMonthPayment += Math.abs(item.cents) / 100;
          log(
            `[API] Added mid-month payment of $${(Math.abs(item.cents) / 100).toFixed(2)}, total now: $${midMonthPayment.toFixed(2)}`,
          );
          // Add a special line for mid-month payment that statusBar.ts can parse
          usageItems.push({
            calculation: `${t('api.midMonthPayment')}: $${midMonthPayment.toFixed(2)}`,
            totalDollars: `-$${midMonthPayment.toFixed(2)}`,
            description: item.description,
          });
          continue; // Skip adding this to regular usage items
        }

        // Logic to parse different item description formats
        const cents = item.cents;

        if (typeof cents === 'undefined') {
          log('[API] Skipping item with undefined cents value: ' + item.description);
          continue;
        }

        let requestCount: number;
        let parsedModelName: string; // Renamed from modelInfo for clarity

        const tokenBasedMatch = item.description.match(
          /^(\d+) token-based usage calls to ([\w.-]+), totalling: \$(?:[\d.]+)/,
        );
        if (tokenBasedMatch) {
          requestCount = parseInt(tokenBasedMatch[1]);
          parsedModelName = tokenBasedMatch[2];
        } else {
          const originalMatch = item.description.match(
            /^(\d+)\s+(.+?)(?: request| calls)?(?: beyond|\*| per|$)/i,
          );
          if (originalMatch) {
            requestCount = parseInt(originalMatch[1]);

            // Updated pattern to handle "discounted" prefix and include claude-4-sonnet
            const genericModelPattern =
              /\b(?:discounted\s+)?(claude-(?:3-(?:opus|sonnet|haiku)|3\.[57]-sonnet(?:-[\w-]+)?(?:-max)?|4-sonnet(?:-thinking)?)|gpt-(?:4(?:\.\d+|o-128k|-preview)?|3\.5-turbo)|gemini-(?:1\.5-flash-500k|2[\.-]5-pro-(?:exp-\d{2}-\d{2}|preview-\d{2}-\d{2}|exp-max))|o[134](?:-mini)?)\b/i;
            const specificModelMatch = item.description.match(genericModelPattern);

            if (item.description.includes('tool calls')) {
              parsedModelName = t('api.toolCalls');
            } else if (specificModelMatch) {
              // Extract the model name (group 1), which excludes the "discounted" prefix
              parsedModelName = specificModelMatch[1];
            } else if (item.description.includes('extra fast premium request')) {
              const extraFastModelMatch = item.description.match(
                /extra fast premium requests? \(([^)]+)\)/i,
              );
              if (extraFastModelMatch && extraFastModelMatch[1]) {
                parsedModelName = extraFastModelMatch[1]; // e.g., Haiku
              } else {
                parsedModelName = t('api.fastPremium');
              }
            } else {
              // Fallback for unknown model structure
              parsedModelName = t('statusBar.unknownModel'); // Default to unknown-model
              log(
                `[API] Could not determine specific model for (original format): "${item.description}". Using "${parsedModelName}".`,
              );
            }
          } else {
            log('[API] Could not extract request count or model info from: ' + item.description);
            parsedModelName = t('statusBar.unknownModel'); // Ensure it's set for items we can't parse fully
            // Try to get at least a request count if possible, even if model is unknown
            const fallbackCountMatch = item.description.match(/^(\d+)/);
            if (fallbackCountMatch) {
              requestCount = parseInt(fallbackCountMatch[1]);
            } else {
              continue; // Truly unparsable
            }
          }
        }

        // Skip items with 0 requests to avoid division by zero
        if (requestCount === 0) {
          log('[API] Skipping item with 0 requests: ' + item.description);
          continue;
        }

        const costPerRequestCents = cents / requestCount;
        const totalDollars = cents / 100;

        const paddedRequestCount = requestCount.toString().padStart(paddingWidth, '0');
        const costPerRequestDollarsFormatted = (costPerRequestCents / 100)
          .toFixed(3)
          .padStart(costPaddingWidth, '0');

        const isTotallingItem = !!tokenBasedMatch;
        const tilde = isTotallingItem ? '~' : '&nbsp;&nbsp;';
        const itemUnit = t('api.requestUnit'); // Always use "req" as the unit

        // Simplified calculation string, model name is now separate
        const calculationString = `**${paddedRequestCount}** ${itemUnit} @ **$${costPerRequestDollarsFormatted}${tilde}**`;

        usageItems.push({
          calculation: calculationString,
          totalDollars: `$${totalDollars.toFixed(2)}`,
          description: item.description,
          modelNameForTooltip: parsedModelName, // Store the determined model name here
          isDiscounted: item.description.toLowerCase().includes('discounted'), // Add a flag for discounted items
        });
      }
    }

    return {
      items: usageItems,
      hasUnpaidMidMonthInvoice: response.data.hasUnpaidMidMonthInvoice,
      midMonthPayment,
    };
  } catch (error) {
    const apiError = createApiErrorFromAxios(error, {
      operation: 'get_monthly_data',
      endpoint: 'https://cursor.com/api/dashboard/get-monthly-invoice',
      method: 'POST',
    });

    log(`[API] Error fetching monthly data for ${month}/${year}: ${apiError.message}`, true);
    log(`[API] Error details: ${JSON.stringify(getErrorInfo(apiError))}`, true);
    throw apiError;
  }
}

export async function fetchCursorStats(token: string): Promise<CursorStats> {
  // Extract user ID from token
  const userId = token.split('%3A%3A')[0];

  try {
    // Check if user is a team member
    const context = getExtensionContext();
    const teamInfo = await checkTeamMembership(token, context);

    let premiumRequests;
    let isUsingTeamSpend = false;

    if (teamInfo.isTeamMember && teamInfo.teamId && teamInfo.userId) {
      // Use team spend data for team members to get team-specific usage
      log('[API] User is team member, fetching team spend data...');
      try {
        const teamSpend = await getTeamSpend(token, teamInfo.teamId);
        const userSpend = extractUserSpend(teamSpend, teamInfo.userId);

        // Get individual usage to get the premium request limit (GPT-4)
        const individualUsage = await axios.get<CursorUsageResponse>(
          'https://cursor.com/api/usage',
          {
            params: { user: userId },
            headers: createCursorHeaders(token, false),
          },
        );

        // Use GPT-4 data for both current usage and limit since it updates faster
        const premiumRequestLimit = individualUsage.data['gpt-4'].maxRequestUsage || 500;

        premiumRequests = {
          current: individualUsage.data['gpt-4'].numRequests, // Use GPT-4 number instead of team spend
          limit: premiumRequestLimit, // Use the premium request limit (500)
          startOfMonth: teamInfo.startOfMonth,
        };

        log('[API] Successfully extracted team member data with premium request limit', {
          teamPremiumRequests: userSpend.fastPremiumRequests || 0,
          individualPremiumRequests: individualUsage.data['gpt-4'].numRequests,
          premiumRequestLimit: premiumRequestLimit,
          usageBasedLimit: individualUsage.data['gpt-4-32k'].maxRequestUsage,
          usageBasedCurrent: individualUsage.data['gpt-4-32k'].numRequests,
          hardLimitOverrideDollars: userSpend.hardLimitOverrideDollars,
          userName: userSpend.name,
          usingGPT4Number: true, // Log that we're using GPT-4 number
        });

        isUsingTeamSpend = true;
      } catch (spendError) {
        const errorInfo = getErrorInfo(spendError);
        log(
          `[API] Team spend failed, falling back to individual usage API: ${errorInfo.message}`,
          true,
        );
        log(`[API] Team spend error details: ${JSON.stringify(errorInfo)}`, true);
        // Fall through to individual API
      }
    }

    // Fallback to individual usage API if team methods failed or user is not a team member
    if (!premiumRequests) {
      log('[API] Using individual usage API...');
      const usageResponse = await axios.get<CursorUsageResponse>('https://cursor.com/api/usage', {
        params: { user: userId },
        headers: createCursorHeaders(token, false),
      });

      const usageData = usageResponse.data;
      log('[API] Successfully fetched individual usage data', {
        gpt4Requests: usageData['gpt-4'].numRequests,
        gpt4Limit: usageData['gpt-4'].maxRequestUsage,
        gpt4Tokens: usageData['gpt-4'].numTokens,
        startOfMonth: usageData.startOfMonth,
      });

      premiumRequests = {
        current: usageData['gpt-4'].numRequests,
        limit: usageData['gpt-4'].maxRequestUsage,
        startOfMonth: usageData.startOfMonth,
      };
    }

    // Get current date for usage-based pricing (which renews on 2nd/3rd of each month)
    const currentDate = new Date();
    const usageBasedBillingDay = 3; // Assuming it's the 3rd day of the month
    let usageBasedCurrentMonth = currentDate.getMonth() + 1;
    let usageBasedCurrentYear = currentDate.getFullYear();

    // If we're in the first few days of the month (before billing date),
    // consider the previous month as the current billing period
    if (currentDate.getDate() < usageBasedBillingDay) {
      usageBasedCurrentMonth = usageBasedCurrentMonth === 1 ? 12 : usageBasedCurrentMonth - 1;
      if (usageBasedCurrentMonth === 12) {
        usageBasedCurrentYear--;
      }
    }

    // Calculate previous month for usage-based pricing
    const usageBasedLastMonth = usageBasedCurrentMonth === 1 ? 12 : usageBasedCurrentMonth - 1;
    const usageBasedLastYear =
      usageBasedCurrentMonth === 1 ? usageBasedCurrentYear - 1 : usageBasedCurrentYear;

    const currentMonthData = await fetchMonthData(
      token,
      usageBasedCurrentMonth,
      usageBasedCurrentYear,
    );
    const lastMonthData = await fetchMonthData(token, usageBasedLastMonth, usageBasedLastYear);

    log(
      `[API] Returning stats with teamId: ${teamInfo.teamId}, isTeamSpendData: ${isUsingTeamSpend}`,
    );

    return {
      currentMonth: {
        month: usageBasedCurrentMonth,
        year: usageBasedCurrentYear,
        usageBasedPricing: currentMonthData,
      },
      lastMonth: {
        month: usageBasedLastMonth,
        year: usageBasedLastYear,
        usageBasedPricing: lastMonthData,
      },
      premiumRequests,
      isTeamSpendData: isUsingTeamSpend,
      teamId: teamInfo.teamId,
    };
  } catch (error) {
    const apiError = createApiErrorFromAxios(error, {
      operation: 'fetch_cursor_stats',
      endpoint: 'https://cursor.com/api/usage',
      method: 'GET',
    });

    log(`[API] Error fetching premium requests: ${apiError.message}`, true);
    log(`[API] Error details: ${JSON.stringify(getErrorInfo(apiError))}`, true);
    throw apiError;
  }
}

export async function getStripeSessionUrl(token: string): Promise<string> {
  try {
    const response = await axios.get('https://cursor.com/api/stripeSession', {
      headers: createCursorHeaders(token, false),
    });
    // Remove quotes from the response string
    return response.data.replace(/"/g, '');
  } catch (error) {
    const apiError = createApiErrorFromAxios(error, {
      operation: 'get_stripe_session_url',
      endpoint: 'https://cursor.com/api/stripeSession',
      method: 'GET',
    });

    log(`[API] Error getting Stripe session URL: ${apiError.message}`, true);
    log(`[API] Error details: ${JSON.stringify(getErrorInfo(apiError))}`, true);
    throw apiError;
  }
}
