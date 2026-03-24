/**
 * 文件说明：通知与提示处理模块
 * 新增内容：
 *  - 最后五次（剩余<=5）区间内，在第一次（剩余=5）与最后一次（剩余=1/0）且使用百分比>=阈值时提示
 *  - 阈值可配置（默认10%）
 * 使用说明：调用 checkAndNotifyLastFiveUsage 于统计更新后触发
 * @author SM
 *
 * REFACTORED: Now uses NotificationState class for state management
 * instead of module-level variables for better testability and lifecycle management
 */
import * as vscode from 'vscode';
import { log } from '../utils/logger';
import { convertAndFormatCurrency } from '../utils/currency';
import { UsageInfo } from '../interfaces/types';
import { t } from '../utils/i18n';
import { getGlobalNotificationState, type NotificationState } from '../core/NotificationState';
import { openExtensionSettings } from '../utils/openSettings';

/**
 * Get the notification state instance
 * @returns NotificationState instance
 */
function getNotificationState(): NotificationState {
  return getGlobalNotificationState();
}

// Reset notification tracking - now delegates to NotificationState
export function resetNotifications() {
  getNotificationState().reset();
  log('[Notifications] Reset notification tracking.');
}

export async function checkAndNotifySpending(totalSpent: number) {
  const state = getNotificationState();

  // Prevent concurrent notifications
  if (!state.beginNotification()) {
    return;
  }

  const config = vscode.workspace.getConfiguration('cursorStats');
  const spendingThreshold = config.get<number>('spendingAlertThreshold', 1);

  // If threshold is 0 or less, spending notifications are disabled
  if (spendingThreshold <= 0) {
    log('[Notifications] Spending alerts disabled (threshold <= 0).');
    state.endNotification();
    return;
  }

  try {
    if (state.getIsSpendingCheckInitialRun) {
      // On the initial run (or after a reset), prime the notifiedSpendingThresholds
      // by adding all multiples of spendingThreshold that are less than or equal to totalSpent.
      const multiplesToPrime = Math.floor(totalSpent / spendingThreshold);
      for (let i = 1; i <= multiplesToPrime; i++) {
        state.markSpendingThresholdAsNotified(i);
      }
      state.clearSpendingCheckInitialRun();
    }

    let multipleToConsider = state.getNextSpendingMultiple();

    while (true) {
      const currentThresholdAmount = multipleToConsider * spendingThreshold;
      if (totalSpent >= currentThresholdAmount) {
        log(
          `[Notifications] Spending threshold $${currentThresholdAmount.toFixed(2)} met or exceeded (Total spent: $${totalSpent.toFixed(2)}). Triggering notification.`,
        );

        const formattedCurrentThreshold = await convertAndFormatCurrency(currentThresholdAmount);
        const formattedTotalSpent = await convertAndFormatCurrency(totalSpent);

        // For the detail message, calculate the *next* threshold after the one we're notifying about
        const nextHigherThresholdAmount = (multipleToConsider + 1) * spendingThreshold;
        const formattedNextHigherThreshold =
          await convertAndFormatCurrency(nextHigherThresholdAmount);

        const message = t('notifications.spendingThresholdReached', {
          amount: formattedCurrentThreshold,
        });
        const detail = `${t('notifications.currentTotalCost', { amount: formattedTotalSpent })} ${t('notifications.nextNotificationAt', { amount: formattedNextHigherThreshold })}`;

        // Show the notification
        const notificationSelection = await vscode.window.showInformationMessage(
          message,
          { modal: false, detail },
          t('notifications.manageLimitTitle'),
          t('notifications.dismiss'),
        );

        if (notificationSelection === t('notifications.manageLimitTitle')) {
          await vscode.commands.executeCommand('cursor-stats.setLimit');
        }

        // Mark this multiple as notified
        state.markSpendingThresholdAsNotified(multipleToConsider);
        multipleToConsider++;
      } else {
        // totalSpent is less than currentThresholdAmount, so we haven't crossed this one yet. Stop.
        break;
      }
    }
  } catch (error) {
    log(
      `[Notifications] Error during checkAndNotifySpending: ${error instanceof Error ? error.message : String(error)}`,
      true,
    );
  } finally {
    state.endNotification();
  }
}

export async function checkAndNotifyUnpaidInvoice(token: string) {
  const state = getNotificationState();

  if (state.getUnpaidInvoiceNotified || !state.beginNotification()) {
    return;
  }

  try {
    log('[Notifications] Checking for unpaid mid-month invoice notification.');

    const notification = await vscode.window.showWarningMessage(
      t('notifications.unpaidInvoice'),
      t('notifications.openBillingPage'),
      t('notifications.dismiss'),
    );

    if (notification === t('notifications.openBillingPage')) {
      try {
        const { getStripeSessionUrl } = await import('../services/api'); // Lazy import
        const stripeUrl = await getStripeSessionUrl(token);
        vscode.env.openExternal(vscode.Uri.parse(stripeUrl));
      } catch (error) {
        log('[Notifications] Failed to get Stripe URL, falling back to settings page.', true);
        vscode.env.openExternal(vscode.Uri.parse('https://www.cursor.com/settings'));
      }
    }
    state.markUnpaidInvoiceAsNotified();
    log('[Notifications] Unpaid invoice notification shown.');
  } finally {
    state.endNotification();
  }
}

export async function checkAndNotifyUsage(usageInfo: UsageInfo) {
  const state = getNotificationState();

  // Prevent concurrent notifications
  if (!state.beginNotification()) {
    return;
  }

  const config = vscode.workspace.getConfiguration('cursorStats');
  const enableAlerts = config.get<boolean>('enableAlerts', true);

  if (!enableAlerts) {
    state.endNotification();
    return;
  }

  try {
    const thresholds = config
      .get<number[]>('usageAlertThresholds', [10, 30, 50, 75, 90, 100])
      .sort((a, b) => b - a); // Sort in descending order to get highest threshold first

    const { percentage, type, limit } = usageInfo;

    // If this is a usage-based notification and premium is not over limit, skip it
    if (
      type === 'usage-based' &&
      usageInfo.premiumPercentage &&
      usageInfo.premiumPercentage < 100
    ) {
      log(
        '[Notifications] Skipping usage-based notification as premium requests are not exhausted',
      );
      return;
    }

    // Find the highest threshold that has been exceeded
    const highestExceededThreshold = thresholds.find((threshold) => percentage >= threshold);

    // Get the appropriate threshold set based on type
    const hasBeenNotified =
      type === 'premium'
        ? (threshold: number) => state.hasPremiumThresholdBeenNotified(threshold)
        : (threshold: number) => state.hasUsageBasedThresholdBeenNotified(threshold);

    const markAsNotified =
      type === 'premium'
        ? (threshold: number) => state.markPremiumThresholdAsNotified(threshold)
        : (threshold: number) => state.markUsageBasedThresholdAsNotified(threshold);

    const clearThreshold =
      type === 'premium'
        ? (threshold: number) => state.clearPremiumThreshold(threshold)
        : (threshold: number) => state.clearUsageBasedThreshold(threshold);

    // Only notify if we haven't notified this threshold yet
    if (highestExceededThreshold && !hasBeenNotified(highestExceededThreshold)) {
      log(
        `[Notifications] Highest usage threshold ${highestExceededThreshold}% exceeded for ${type} usage`,
      );

      let message, detail;
      if (type === 'premium') {
        if (percentage > 100) {
          message = t('notifications.usageExceededLimit', { percentage: percentage.toFixed(1) });
          detail = t('notifications.enableUsageBasedDetail');
        } else {
          message = t('notifications.usageThresholdReached', { percentage: percentage.toFixed(1) });
          detail = t('notifications.viewSettingsDetail');
        }
      } else {
        // Only show usage-based notifications if premium is exhausted
        message = t('notifications.usageBasedSpendingThreshold', {
          percentage: percentage.toFixed(1),
          limit: limit || 0,
        });
        detail = t('notifications.manageLimitDetail');
      }

      // Show the notification
      const notification = await vscode.window.showWarningMessage(
        message,
        { modal: false, detail },
        type === 'premium' && percentage > 100
          ? t('notifications.enableUsageBasedTitle')
          : type === 'premium'
            ? t('notifications.viewSettingsTitle')
            : t('notifications.manageLimitTitle'),
        t('notifications.dismiss'),
      );

      if (notification === t('notifications.viewSettingsTitle')) {
        await openExtensionSettings();
      } else if (
        notification === t('notifications.manageLimitTitle') ||
        notification === t('notifications.enableUsageBasedTitle')
      ) {
        await vscode.commands.executeCommand('cursor-stats.setLimit');
      }

      // Mark all thresholds up to and including the current one as notified
      thresholds.forEach((threshold) => {
        if (threshold <= highestExceededThreshold) {
          markAsNotified(threshold);
        }
      });
    }

    // Clear notifications for thresholds that are no longer exceeded
    thresholds.forEach((threshold) => {
      if (percentage < threshold) {
        if (hasBeenNotified(threshold)) {
          clearThreshold(threshold);
          log(
            `[Notifications] Cleared notification for threshold ${threshold}% as ${type} usage dropped below it`,
          );
        }
      }
    });
  } finally {
    state.endNotification();
  }
}

/**
 * 智能使用监控功能：每N次查询剩余次数，检测短时间内大量使用的情况
 * 核心逻辑：
 *  - 每隔指定次数（默认5次）检查一次使用量变化
 *  - 当前后两次检查间使用量变化超过设定百分比阈值时提醒用户可能选错模型
 * 配置项：
 *  - cursorStats.smartUsageMonitorEnabled: 启用/禁用功能（默认true）
 *  - cursorStats.smartUsageMonitorInterval: 每几次查询检查一次（默认5）
 *  - cursorStats.smartUsageMonitorThreshold: 使用变化百分比阈值（默认10）
 * @param premiumCurrent 当前已用快速请求次数
 * @param premiumLimit   每月快速请求总上限
 *
 * REFACTORED: Now uses NotificationState for smart usage monitor state
 */
export async function checkAndNotifySmartUsageMonitor(
  premiumCurrent: number,
  premiumLimit: number,
) {
  const state = getNotificationState();

  try {
    const config = vscode.workspace.getConfiguration('cursorStats');
    const enabled = config.get<boolean>('smartUsageMonitorEnabled', true);
    if (!enabled) {
      return;
    }

    // 防御：无上限或数据无效时不检测
    if (!premiumLimit || premiumLimit <= 0) {
      return;
    }

    const checkInterval = Math.max(1, config.get<number>('smartUsageMonitorInterval', 5));
    const usageThreshold = Math.max(
      0,
      Math.min(100, config.get<number>('smartUsageMonitorThreshold', 10)),
    );
    const currentTime = Date.now();

    // 增加检查计数
    const checkCount = state.incrementSmartUsageMonitorCheckCount();

    // 每隔指定次数进行一次检查
    if (checkCount % checkInterval === 0) {
      const currentUsagePercent = Math.max(0, Math.min(100, (premiumCurrent / premiumLimit) * 100));
      const monitorData = state.getSmartUsageMonitorData;

      // 如果不是第一次检查
      if (monitorData.lastCheckTime > 0) {
        const timeSinceLastCheck = currentTime - monitorData.lastCheckTime;
        const usageChange = currentUsagePercent - monitorData.lastUsageValue;

        // 检查是否在短时间内（5分钟内）使用量增长超过阈值
        const isShortTime = timeSinceLastCheck < 5 * 60 * 1000; // 5分钟
        const isHighUsageIncrease = usageChange >= usageThreshold;

        // 避免频繁弹窗：距离上次通知至少10分钟
        const canShowNotification = state.canShowSmartUsageNotification(currentTime, 10);

        log(
          `[Smart Usage Monitor] Check ${checkCount}: usage change ${usageChange.toFixed(1)}% in ${(timeSinceLastCheck / 1000 / 60).toFixed(1)} minutes`,
        );

        if (isShortTime && isHighUsageIncrease && canShowNotification) {
          const timeMinutes = Math.round(timeSinceLastCheck / 1000 / 60);
          const msg = t('notifications.smartUsageMonitorAlert', {
            usageChange: usageChange.toFixed(1),
            timeMinutes: timeMinutes,
            interval: checkInterval,
          });

          const selection = await vscode.window.showWarningMessage(
            msg,
            {
              modal: false,
              detail: t('notifications.smartUsageMonitorDetail', {
                threshold: usageThreshold,
                interval: checkInterval,
              }),
            },
            t('notifications.checkModelSettings'),
            t('notifications.adjustSettings'),
            t('notifications.dismiss'),
          );

          if (selection === t('notifications.checkModelSettings')) {
            // 提示用户检查当前选择的模型
            vscode.window.showInformationMessage(
              t('notifications.checkCurrentModel'),
              t('notifications.dismiss'),
            );
          } else if (selection === t('notifications.adjustSettings')) {
            try {
              await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                '@ext:Dwtexe.cursor-stats',
              );
            } catch (error) {
              log('[Notifications] Failed to open settings for smart usage monitor', true);
            }
          }

          state.recordSmartUsageNotification(currentTime);
          log(
            `[Smart Usage Monitor] Notification shown: ${usageChange.toFixed(1)}% increase in ${timeMinutes} minutes`,
          );
        }
      }

      // 更新检查数据
      state.updateSmartUsageMonitorData(currentUsagePercent, currentTime);
    }
  } catch (error) {
    log(
      '[Notifications] Error in checkAndNotifySmartUsageMonitor: ' + (error as Error).message,
      true,
    );
  }
}
