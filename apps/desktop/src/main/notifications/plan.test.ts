import { describe, expect, it } from 'vitest';
import type { Search } from '@nvoke/shared';
import { badgeBitmap, deliveryBody, markSeen, planPoll, EMPTY_STATE, BADGE_SIZE } from './plan';

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function drop(n: number, over: Partial<Search> = {}): Search {
  return {
    id: id(n),
    kind: 'drop',
    params: { dropId: id(900), dropName: 'AI tools', sources: ['product_hunt'] },
    limit: 50,
    status: 'done',
    error: null,
    companiesFound: 14,
    companiesCrawled: 14,
    emailsFound: 12,
    emailsValid: 9,
    createdAt: '2026-10-13T08:00:00.000Z',
    startedAt: '2026-10-13T08:00:01.000Z',
    finishedAt: '2026-10-13T08:05:00.000Z',
    ...over,
  } as Search;
}

describe('planPoll', () => {
  it('records what exists on the first poll without announcing or badging it', () => {
    const plan = planPoll([drop(1), drop(2)], EMPTY_STATE);
    expect(plan.deliveries).toEqual([]);
    expect(plan.unseen).toBe(0);
    expect(plan.state.baselined).toBe(true);
  });

  it('announces a new finished drop once and counts it as unseen', () => {
    const first = planPoll([drop(1)], EMPTY_STATE);
    const second = planPoll([drop(2), drop(1)], first.state);
    expect(second.deliveries).toEqual([{ searchId: id(2), dropName: 'AI tools', companies: 14, validEmails: 9 }]);
    expect(second.unseen).toBe(9);
    const third = planPoll([drop(2), drop(1)], second.state);
    expect(third.deliveries).toEqual([]);
    expect(third.unseen).toBe(9);
  });

  it('ignores running searches, searches without valid emails and other kinds', () => {
    const base = planPoll([], EMPTY_STATE).state;
    const plan = planPoll(
      [drop(1, { status: 'running' }), drop(2, { emailsValid: 0 }), { ...drop(3), kind: 'local', params: { niche: 'a', location: 'b' } } as Search],
      base,
    );
    expect(plan.deliveries).toEqual([]);
    expect(plan.unseen).toBe(0);
  });

  it('clears a search from the count once it is opened', () => {
    const base = planPoll([], EMPTY_STATE).state;
    const searches = [drop(1), drop(2, { emailsValid: 4 })];
    const plan = planPoll(searches, base);
    expect(plan.unseen).toBe(13);
    expect(markSeen(searches, plan.state, id(1)).unseen).toBe(4);
  });
});

describe('deliveryBody', () => {
  it('reads like a headline and handles one', () => {
    expect(deliveryBody({ searchId: id(1), dropName: 'x', companies: 14, validEmails: 9 })).toBe('14 new launches, 9 valid emails');
    expect(deliveryBody({ searchId: id(1), dropName: 'x', companies: 1, validEmails: 1 })).toBe('1 new launch, 1 valid email');
  });
});

describe('badgeBitmap', () => {
  it('draws a transparent corner, an accent disc and white digits', () => {
    const buf = badgeBitmap(7);
    expect(buf.length).toBe(BADGE_SIZE * BADGE_SIZE * 4);
    expect(buf[3]).toBe(0);
    const center = ((BADGE_SIZE / 2) * BADGE_SIZE + BADGE_SIZE / 2) * 4;
    expect(buf[center + 3]).toBe(255);
    expect(buf.some((v, i) => i % 4 === 0 && v === 0xff && buf[i + 1] === 0xff)).toBe(true);
  });
});
