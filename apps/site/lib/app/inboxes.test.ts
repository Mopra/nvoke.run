import { describe, expect, it } from 'vitest';
import { pendingInboxPages } from './inboxes';

describe('pendingInboxPages', () => {
  it('lists only the pages with a shared inbox still to check', () => {
    const page = (...pending: (number | null | undefined)[]) => ({
      companies: pending.map((inboxesPending) => ({ inboxesPending }) as never),
    });
    expect(pendingInboxPages([page(0, null), page(undefined, 2), page(), page(1)])).toEqual([1, 3]);
    expect(pendingInboxPages([])).toEqual([]);
  });
});
