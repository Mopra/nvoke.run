import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

const { parseLocalCompaniesQuery } = await import('./ipc');

describe('parseLocalCompaniesQuery', () => {
  it('accepts the lead filters with an offset page', () => {
    expect(parseLocalCompaniesQuery({ q: 'smile', verification: 'valid', kind: 'generic', offset: 200, limit: 50 })).toEqual({
      q: 'smile',
      verification: 'valid',
      kind: 'generic',
      offset: 200,
      limit: 50,
    });
    expect(parseLocalCompaniesQuery(undefined)).toEqual({});
  });

  it('refuses unknown keys, bad values and oversized pages', () => {
    expect(parseLocalCompaniesQuery({ sql: 'drop table companies' })).toBeNull();
    expect(parseLocalCompaniesQuery({ verification: 'great' })).toBeNull();
    expect(parseLocalCompaniesQuery({ limit: 10_000 })).toBeNull();
    expect(parseLocalCompaniesQuery({ offset: -1 })).toBeNull();
    expect(parseLocalCompaniesQuery('q')).toBeNull();
  });
});
