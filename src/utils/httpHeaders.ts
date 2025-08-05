// Start of Selection
/**
 * @author SM
 * HTTP request header utility for standardizing cursor.com API request headers
 * Addresses CORS and Origin validation issues
 */

/**
 * Generates standard cursor.com request headers to resolve 403 Invalid origin errors
 * @param token - Authentication token (WorkosCursorSessionToken)
 * @param isPostRequest - Whether this is a POST request, defaults to false
 * @returns Complete headers object
 */
export function createCursorHeaders(
  token: string,
  isPostRequest: boolean = false,
): Record<string, string> {
  const headers: Record<string, string> = {
    // Critical headers to resolve "Invalid origin for state-changing request" errors
    Origin: 'https://cursor.com',
    Referer: 'https://cursor.com/',

    // Simulate real browser environment
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

    // Authentication
    Cookie: `WorkosCursorSessionToken=${token}`,

    // Standard request headers
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',

    // Security policy related
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };

  // POST requests require Content-Type header
  if (isPostRequest) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

/**
 * Creates enhanced error handling wrapper with detailed 403 error information
 * @param error - axios error object
 * @param context - Error context information
 */
export function enhanceApiError(error: any, context: string): Error {
  if (error.response?.status === 403) {
    const errorMessage = `[${context}] 403 Forbidden - ${error.response?.data?.error || 'Invalid origin for state-changing request'}`;
    const enhancedError = new Error(errorMessage);
    enhancedError.stack = error.stack;
    return enhancedError;
  }
  return error;
}

/**
 * Checks if the request URL is related to cursor.com
 * @param url - Request URL
 * @returns Whether it's a cursor.com request
 */
export function isCursorApiUrl(url: string): boolean {
  return url.startsWith('https://cursor.com/api/');
}
