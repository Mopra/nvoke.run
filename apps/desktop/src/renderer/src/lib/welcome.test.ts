import { describe, expect, it } from 'vitest';
import { isFirstRun, markWelcomed } from './welcome';

function memory(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v) };
}

describe('welcome', () => {
  it('greets until the first sign-in', () => {
    const storage = memory();
    expect(isFirstRun(storage)).toBe(true);
    markWelcomed(storage);
    expect(isFirstRun(storage)).toBe(false);
  });
});
