import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: {}, shell: {} }));

const { enrichedPath, isEnrichedPath, parseSaveEnriched, saveEnrichedCopy } = await import('./enriched-file');

describe('enrichedPath', () => {
  it('puts name.nvoke.csv next to the original', () => {
    expect(enrichedPath(join(tmpdir(), 'leads.csv'))).toBe(join(tmpdir(), 'leads.nvoke.csv'));
    expect(enrichedPath(join(tmpdir(), 'list.TXT'))).toBe(join(tmpdir(), 'list.nvoke.csv'));
  });

  it('writes over an enriched copy instead of stacking suffixes', () => {
    expect(enrichedPath(join(tmpdir(), 'leads.nvoke.csv'))).toBe(join(tmpdir(), 'leads.nvoke.csv'));
  });
});

describe('parseSaveEnriched', () => {
  const sourcePath = join(tmpdir(), 'leads.csv');

  it('accepts an absolute table path and a csv', () => {
    expect(parseSaveEnriched({ sourcePath, csv: 'a\r\n' })).toEqual({ sourcePath, csv: 'a\r\n' });
  });

  it('refuses relative paths, other file types and empty or odd input', () => {
    expect(parseSaveEnriched({ sourcePath: 'leads.csv', csv: 'a' })).toBeNull();
    expect(parseSaveEnriched({ sourcePath: join(tmpdir(), 'notes.exe'), csv: 'a' })).toBeNull();
    expect(parseSaveEnriched({ sourcePath, csv: '' })).toBeNull();
    expect(parseSaveEnriched({ sourcePath: `${sourcePath}\0.csv`, csv: 'a' })).toBeNull();
    expect(parseSaveEnriched({ sourcePath, csv: 3 })).toBeNull();
    expect(parseSaveEnriched(null)).toBeNull();
  });
});

describe('saveEnrichedCopy', () => {
  it('writes the copy and leaves the original alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nvoke-enrich-test-'));
    const source = join(dir, 'leads.csv');
    writeFileSync(source, 'domain\r\nacme.com\r\n');
    const res = saveEnrichedCopy({ sourcePath: source, csv: 'domain,email\r\nacme.com,a@acme.com\r\n' });
    expect(res).toEqual({ saved: true, filePath: join(dir, 'leads.nvoke.csv') });
    expect(readFileSync(join(dir, 'leads.nvoke.csv'), 'utf8')).toContain('a@acme.com');
    expect(readFileSync(source, 'utf8')).toBe('domain\r\nacme.com\r\n');
  });

  it('refuses a source that does not exist', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'nvoke-enrich-test-')), 'gone.csv');
    expect(saveEnrichedCopy({ sourcePath: missing, csv: 'a' })).toMatchObject({ saved: false });
  });
});

describe('isEnrichedPath', () => {
  it('only shows enriched copies', () => {
    expect(isEnrichedPath(join(tmpdir(), 'leads.nvoke.csv'))).toBe(true);
    expect(isEnrichedPath(join(tmpdir(), 'passwords.txt'))).toBe(false);
    expect(isEnrichedPath('leads.nvoke.csv')).toBe(false);
    expect(isEnrichedPath(4)).toBe(false);
  });
});
