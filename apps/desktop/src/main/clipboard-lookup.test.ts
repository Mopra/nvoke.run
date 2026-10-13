import { describe, expect, it } from 'vitest';
import { clipboardLookup } from './clipboard-lookup';

describe('clipboardLookup', () => {
  it('reads a domain, a URL and an email address', () => {
    expect(clipboardLookup('acme.com')).toEqual({ domain: 'acme.com', from: 'domain' });
    expect(clipboardLookup(' https://www.acme.com/contact?x=1\n')).toEqual({ domain: 'acme.com', from: 'url' });
    expect(clipboardLookup('www.acme.com/about')).toEqual({ domain: 'acme.com', from: 'url' });
    expect(clipboardLookup('Jane@Acme.com')).toEqual({ domain: 'acme.com', from: 'email' });
  });

  it('ignores prose, lists, names and long text', () => {
    expect(clipboardLookup('')).toBeNull();
    expect(clipboardLookup('Acme Inc')).toBeNull();
    expect(clipboardLookup('a.com\nb.com')).toBeNull();
    expect(clipboardLookup('see acme.com for more')).toBeNull();
    expect(clipboardLookup(`${'a'.repeat(400)}.com`)).toBeNull();
  });
});
