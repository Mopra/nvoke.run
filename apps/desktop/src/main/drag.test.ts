import { existsSync, mkdtempSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, ipcMain: {}, nativeImage: {} }));

const { MAX_DRAG_CSV_BYTES, parseDragCsv, sweepDragFiles, writeDragFile } = await import('./drag');

describe('parseDragCsv', () => {
  it('accepts a csv and cleans the name', () => {
    expect(parseDragCsv({ fileName: '../../evil:name', csv: 'a,b\r\n' })).toEqual({
      fileName: '-..-evil-name.csv',
      csv: 'a,b\r\n',
    });
  });

  it('refuses anything else', () => {
    expect(parseDragCsv(null)).toBeNull();
    expect(parseDragCsv('a,b')).toBeNull();
    expect(parseDragCsv({ fileName: 'x.csv', csv: '' })).toBeNull();
    expect(parseDragCsv({ fileName: 1, csv: 'a' })).toBeNull();
    expect(parseDragCsv({ fileName: 'x.csv', csv: 'a'.repeat(MAX_DRAG_CSV_BYTES + 1) })).toBeNull();
  });
});

describe('drag files', () => {
  it('writes into a folder of its own and sweeps old folders', () => {
    const root = mkdtempSync(join(tmpdir(), 'nvoke-drag-test-'));
    const fresh = writeDragFile(root, { fileName: 'leads.csv', csv: 'x' });
    const old = writeDragFile(root, { fileName: 'leads.csv', csv: 'y' });
    expect(basename(fresh)).toBe('leads.csv');
    expect(dirname(fresh)).not.toBe(dirname(old));
    expect(readFileSync(fresh, 'utf8')).toBe('x');

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    utimesSync(dirname(old), twoDaysAgo, twoDaysAgo);
    sweepDragFiles(root);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(old)).toBe(false);
  });

  it('ignores a missing root', () => {
    expect(() => sweepDragFiles(join(tmpdir(), 'nvoke-drag-does-not-exist'))).not.toThrow();
  });
});
