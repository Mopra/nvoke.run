import { describe, expect, it } from 'vitest';
import { leadHint } from './lead-find';

const email = (address: string) => ({ address }) as never;

describe('leadHint', () => {
  it('shows the address that matched', () => {
    expect(leadHint({ domain: 'smile.dk', emails: [email('info@smile.dk'), email('mette@smile.dk')] }, 'METTE')).toBe('mette@smile.dk');
  });

  it('falls back to the first address, then the domain', () => {
    expect(leadHint({ domain: 'smile.dk', emails: [email('info@smile.dk')] }, 'smile aarhus')).toBe('info@smile.dk');
    expect(leadHint({ domain: 'smile.dk', emails: [] }, 'smile')).toBe('smile.dk');
  });
});
