import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSecrets, SecretsError } from './secrets.js';

const key = () => randomBytes(32).toString('base64');

describe('secrets', () => {
  it('round trips', () => {
    const s = createSecrets(key());
    const sealed = s.seal('app password æøå');
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(s.open(sealed)).toBe('app password æøå');
  });

  it('seals the same text differently each time', () => {
    const s = createSecrets(key());
    expect(s.seal('x')).not.toBe(s.seal('x'));
  });

  it('refuses a tampered secret', () => {
    const s = createSecrets(key());
    const parts = s.seal('hello').split('.');
    parts[3] = Buffer.from('jello').toString('base64url');
    expect(() => s.open(parts.join('.'))).toThrow(SecretsError);
  });

  it('refuses another key', () => {
    const sealed = createSecrets(key()).seal('hello');
    expect(() => createSecrets(key()).open(sealed)).toThrow(SecretsError);
  });

  it('refuses a short key', () => {
    expect(() => createSecrets(randomBytes(16).toString('base64'))).toThrow(SecretsError);
  });

  it('derives stable keys per purpose', () => {
    const k = key();
    expect(createSecrets(k).derive('unsubscribe').equals(createSecrets(k).derive('unsubscribe'))).toBe(true);
    expect(createSecrets(k).derive('a').equals(createSecrets(k).derive('b'))).toBe(false);
  });
});
