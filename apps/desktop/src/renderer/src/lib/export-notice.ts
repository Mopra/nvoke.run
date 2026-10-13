/**
 * The short note shown before a CSV export: outreach rules differ by country
 * and the customer is responsible for how the contacts are used. It shows on
 * every export until the user ticks "Don't show this again", stored locally.
 */

export const EXPORT_NOTICE_KEY = 'nvoke.exportNotice.dismissed';

type NoticeStorage = Pick<Storage, 'getItem' | 'setItem'>;

function local(): NoticeStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function shouldShowExportNotice(storage: NoticeStorage | undefined = local()): boolean {
  try {
    return storage?.getItem(EXPORT_NOTICE_KEY) !== '1';
  } catch {
    return true;
  }
}

export function dismissExportNotice(storage: NoticeStorage | undefined = local()): void {
  try {
    storage?.setItem(EXPORT_NOTICE_KEY, '1');
  } catch {
    // Storage can be full or blocked. The notice then simply shows again.
  }
}
