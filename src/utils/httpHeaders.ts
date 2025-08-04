/**
 * @author SM
 * HTTP请求头工具类，用于统一管理cursor.com API请求的标准请求头
 * 解决CORS和Origin验证问题
 */

/**
 * 生成标准的cursor.com请求头，解决403 Invalid origin错误
 * @param token - 认证令牌（WorkosCursorSessionToken）
 * @param isPostRequest - 是否为POST请求，默认false
 * @returns 完整的请求头对象
 */
export function createCursorHeaders(token: string, isPostRequest: boolean = false): Record<string, string> {
    const headers: Record<string, string> = {
        // 关键请求头：用于解决"Invalid origin for state-changing request"错误
        'Origin': 'https://cursor.com',
        'Referer': 'https://cursor.com/',
        
        // 模拟真实浏览器环境
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        
        // 认证信息
        'Cookie': `WorkosCursorSessionToken=${token}`,
        
        // 标准请求头
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        
        // 安全策略相关
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
    };
    
    // POST请求需要Content-Type头
    if (isPostRequest) {
        headers['Content-Type'] = 'application/json';
    }
    
    return headers;
}

/**
 * 创建增强的错误处理包装器，提供更详细的403错误信息
 * @param error - axios错误对象
 * @param context - 错误上下文信息
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
 * 检查是否为cursor.com相关的请求URL
 * @param url - 请求URL
 * @returns 是否为cursor.com请求
 */
export function isCursorApiUrl(url: string): boolean {
    return url.startsWith('https://cursor.com/api/');
}