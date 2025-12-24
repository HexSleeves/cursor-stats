/**
 * 剩余天数计算工具
 * 根据到期月份和天数计算剩余天数
 * @author SM
 */

import * as vscode from 'vscode';
import { t } from './i18n';
import { getMonthNumber } from './progressBars';

/**
 * 检查是否启用了剩余天数显示功能
 * @returns 是否显示剩余天数
 */
export function shouldShowRemainingDays(): boolean {
  const config = vscode.workspace.getConfiguration('cursorStats');
  return config.get<boolean>('showRemainingDays', true);
}

/**
 * 计算到期日期的剩余天数
 * @param endDateStr 结束日期字符串，格式如 "17 May" 或 "17 5月"
 * @returns 剩余天数，如果已过期则返回 0
 */
export function calculateRemainingDays(endDateStr: string): number {
  try {
    // 解析日期字符串，格式如 "17 May" 或 "17 5月"
    const [dayStr, monthStr] = endDateStr.trim().split(' ');
    const day = Number.parseInt(dayStr);
    const month = getMonthNumber(monthStr);

    if (Number.isNaN(day) || month === undefined) {
      console.warn(`[RemainingDays] 无法解析日期: ${endDateStr}`);
      return 0;
    }

    const currentYear = new Date().getFullYear();
    let endDate = new Date(currentYear, month, day);

    // 如果结束日期早于当前日期，说明是下一年的日期
    const now = new Date();
    if (endDate < now) {
      endDate.setFullYear(currentYear + 1);
    }

    // 计算剩余天数
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 重置时间为当天开始
    endDate.setHours(23, 59, 59, 999); // 设置为当天结束

    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  } catch (error) {
    console.error(`[RemainingDays] 计算剩余天数时出错: ${error}`);
    return 0;
  }
}

/**
 * 从周期信息中提取结束日期并计算剩余天数
 * @param periodInfo 周期信息字符串，格式如 "17 April - 17 May"
 * @returns 剩余天数
 */
export function calculateRemainingDaysFromPeriod(periodInfo: string): number {
  try {
    if (!periodInfo?.includes('-')) {
      return 0;
    }

    // 提取结束日期部分
    const [, endDateStr] = periodInfo.split('-').map((d) => d.trim());
    return calculateRemainingDays(endDateStr);
  } catch (error) {
    console.error(`[RemainingDays] 从周期信息计算剩余天数时出错: ${error}`);
    return 0;
  }
}

/**
 * 格式化剩余天数显示文本
 * @param remainingDays 剩余天数
 * @returns 格式化的显示文本
 */
export function formatRemainingDaysText(remainingDays: number): string {
  if (remainingDays <= 0) {
    return t('statusBar.remainingDays.expired');
  } else if (remainingDays === 1) {
    return t('statusBar.remainingDays.oneDay');
  } else {
    return t('statusBar.remainingDays.multipleDays', { days: remainingDays });
  }
}

/**
 * 获取剩余天数的紧急程度级别
 * @param remainingDays 剩余天数
 * @returns 紧急程度: 'normal' | 'warning' | 'critical' | 'expired'
 */
export function getRemainingDaysUrgency(
  remainingDays: number,
): 'normal' | 'warning' | 'critical' | 'expired' {
  if (remainingDays <= 0) {
    return 'expired';
  } else if (remainingDays <= 3) {
    return 'critical';
  } else if (remainingDays <= 7) {
    return 'warning';
  } else {
    return 'normal';
  }
}

/**
 * 根据剩余天数获取对应的图标
 * @param remainingDays 剩余天数
 * @returns 对应的图标字符
 */
export function getRemainingDaysIcon(remainingDays: number): string {
  const urgency = getRemainingDaysUrgency(remainingDays);

  switch (urgency) {
    case 'expired':
      return '⏰';
    case 'critical':
      return '🔴';
    case 'warning':
      return '🟡';
    default:
      return '📅';
  }
}
