/**
 * 百分比格式化工具函数
 * @author SM
 */

/**
 * 智能格式化百分比，根据结果自动调整小数位数
 * @param percentage 百分比数值
 * @param maxDecimals 最大小数位数，默认3位
 * @returns 格式化后的百分比字符串
 */
export function formatPercentageIntelligent(percentage: number, maxDecimals: number = 3): string {
    // 如果是整数，直接返回不带小数点的字符串
    if (percentage === Math.floor(percentage)) {
        return percentage.toString();
    }
    
    // 尝试不同的小数位数，从1到maxDecimals
    for (let decimals = 1; decimals <= maxDecimals; decimals++) {
        const factor = Math.pow(10, decimals);
        const rounded = Math.round(percentage * factor) / factor;
        
        // 如果舍入后等于原值（在精度范围内），则使用这个小数位数
        if (Math.abs(rounded - percentage) < 1e-10) {
            return rounded.toFixed(decimals).replace(/\.?0+$/, ''); // 移除尾随的零
        }
    }
    
    // 如果无法在指定精度内完全表示，使用最大小数位数
    return percentage.toFixed(maxDecimals).replace(/\.?0+$/, '');
}

/**
 * 计算并智能格式化剩余百分比
 * @param current 当前使用量
 * @param limit 总限额
 * @param maxDecimals 最大小数位数，默认3位
 * @returns 格式化后的剩余百分比字符串
 */
export function formatRemainingPercentage(current: number, limit: number, maxDecimals: number = 3): string {
    if (limit <= 0) {
        return "0";
    }
    
    const usedPercent = (current / limit) * 100;
    const remainingPercent = Math.max(0, Math.min(100, 100 - usedPercent));
    
    return formatPercentageIntelligent(remainingPercent, maxDecimals);
}
