import * as vscode from 'vscode';
import { log } from './logger';
import { t } from './i18n';

const EXTENSION_SETTINGS_QUERY = '@ext:Dwtexe.cursor-stats';
const EXTENSION_SETTINGS_SECTION = 'cursorStats';

export async function openExtensionSettings(): Promise<boolean> {
  try {
    await vscode.commands.executeCommand('workbench.action.openSettings', EXTENSION_SETTINGS_QUERY);
    return true;
  } catch (error) {
    log('[Settings] Direct extension settings open failed, falling back to settings section', true);
  }

  try {
    await vscode.commands.executeCommand(
      'workbench.action.openSettings',
      EXTENSION_SETTINGS_SECTION,
    );
    return true;
  } catch (error) {
    log('[Settings] Section settings open failed, falling back to generic settings', true);
  }

  try {
    await vscode.commands.executeCommand('workbench.action.openSettings');
    return true;
  } catch (error) {
    log('[Settings] Failed to open settings', true);
    vscode.window.showErrorMessage(t('notifications.failedToOpenSettings'));
    return false;
  }
}
