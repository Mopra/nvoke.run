import { describe, expect, it } from 'vitest';
import type { Company, Email, Opener } from '@nvoke/shared';
import { anyOpenerQueued, canDraftOpener, companiesPollInterval, edgePages, edgePollInterval, openerSourceLabel, openersNotice } from './openers';
import { ONGOING_POLL_MS, POLL_MS } from './quota';

const opener = (status: Opener['status']): Opener => ({ status, line: null, sourceUrl: null, quote: null, draftedAt: null });
const withOpener = (status: Opener['status'] | null): Pick<Company, 'opener'> => ({ opener: status ? opener(status) : null });
const email = (verification: Email['verification']): Pick<Email, 'verification'> => ({ verification });

describe('canDraftOpener', () => {
  it('needs at least one valid email', () => {
    expect(canDraftOpener({ emails: [email('risky'), email('valid')] as Email[] })).toBe(true);
    expect(canDraftOpener({ emails: [email('catch_all'), email(null)] as Email[] })).toBe(false);
    expect(canDraftOpener({ emails: [] })).toBe(false);
  });
});

describe('polling the companies', () => {
  it('refetches every loaded page only while an opener is queued', () => {
    const pages = [{ companies: [withOpener('done'), withOpener(null)] }, { companies: [withOpener('queued')] }] as never;
    expect(anyOpenerQueued([withOpener('done'), withOpener('queued')])).toBe(true);
    expect(companiesPollInterval(pages)).toBe(POLL_MS);
    expect(companiesPollInterval([{ companies: [withOpener('done'), withOpener('failed')] }] as never)).toBe(false);
    expect(companiesPollInterval(undefined)).toBe(false);
  });

  it('polls the edges of the list while live, slowly while ongoing', () => {
    expect(edgePollInterval(true, false)).toBe(POLL_MS);
    expect(edgePollInterval(true, true)).toBe(POLL_MS);
    expect(edgePollInterval(false, true)).toBe(ONGOING_POLL_MS);
    expect(edgePollInterval(false, false)).toBe(false);
  });

  it('refetches the first and the last loaded page, never the ones between', () => {
    expect(edgePages(0)).toEqual([]);
    expect(edgePages(1)).toEqual([0]);
    expect(edgePages(7)).toEqual([0, 6]);
  });
});

describe('openersNotice', () => {
  it('counts what was queued and what was skipped', () => {
    expect(openersNotice({ queued: 42, skipped: 8 })).toEqual({
      title: 'Drafting 42 openers.',
      description: '8 skipped: no valid email or already drafted.',
    });
    expect(openersNotice({ queued: 1, skipped: 0 })).toEqual({ title: 'Drafting 1 opener.' });
  });

  it('says so when nothing was queued', () => {
    expect(openersNotice({ queued: 0, skipped: 3 }).title).toBe('No openers to draft');
  });
});

describe('openerSourceLabel', () => {
  it('shows the path, or home page for the root', () => {
    expect(openerSourceLabel('https://acme.dk/about/')).toBe('/about');
    expect(openerSourceLabel('https://acme.dk/')).toBe('home page');
    expect(openerSourceLabel('not a url')).toBe('not a url');
  });
});
