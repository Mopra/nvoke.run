import { describe, expect, it } from 'vitest';
import type { Search } from '@nvoke/shared';
import { dropToday, dropTodayLabel } from './drop-today';

const now = new Date(2026, 9, 13, 15, 0);

function search(id: string, kind: Search['kind'], createdAt: Date, emailsValid: number): Search {
  const base = {
    id,
    limit: 25,
    status: 'done' as const,
    error: null,
    companiesFound: 10,
    companiesCrawled: 10,
    emailsFound: emailsValid,
    emailsValid,
    createdAt: createdAt.toISOString(),
    startedAt: null,
    finishedAt: null,
  };
  if (kind === 'drop') return { ...base, kind, params: { dropId: id, dropName: 'AI tools', sources: ['show_hn'] } };
  return { ...base, kind: 'web', params: { keyword: 'dentists' } };
}

describe('dropToday', () => {
  it('sums verified emails from drop searches made since local midnight, newest first', () => {
    const today = dropToday(
      [
        search('a', 'drop', new Date(2026, 9, 13, 6, 0), 7),
        search('b', 'drop', new Date(2026, 9, 13, 9, 0), 5),
        search('c', 'drop', new Date(2026, 9, 12, 23, 59), 40),
        search('d', 'web', new Date(2026, 9, 13, 10, 0), 99),
      ],
      now,
    );
    expect(today).toEqual({ leads: 12, searchIds: ['b', 'a'] });
  });
});

describe('dropTodayLabel', () => {
  it('reads as a short tray line', () => {
    expect(dropTodayLabel({ leads: 0, searchIds: [] })).toBe('No drop leads yet today');
    expect(dropTodayLabel({ leads: 1, searchIds: ['a'] })).toBe('Today’s drops: 1 lead');
    expect(dropTodayLabel({ leads: 1240, searchIds: ['a', 'b'] })).toBe('Today’s drops: 1,240 leads');
  });
});
