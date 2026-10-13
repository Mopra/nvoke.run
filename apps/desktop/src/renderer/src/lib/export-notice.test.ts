import { describe, expect, it } from 'vitest';
import { dismissExportNotice, EXPORT_NOTICE_KEY, shouldShowExportNotice } from './export-notice';

function memory(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('export notice', () => {
  it('shows until dismissed, then stays dismissed', () => {
    const storage = memory();
    expect(shouldShowExportNotice(storage)).toBe(true);
    dismissExportNotice(storage);
    expect(storage.getItem(EXPORT_NOTICE_KEY)).toBe('1');
    expect(shouldShowExportNotice(storage)).toBe(false);
  });

  it('shows when storage is missing or throws', () => {
    expect(shouldShowExportNotice(undefined)).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(shouldShowExportNotice(broken)).toBe(true);
    expect(() => dismissExportNotice(broken)).not.toThrow();
  });
});
