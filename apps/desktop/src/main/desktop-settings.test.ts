import { describe, expect, it } from 'vitest';
import { parseSavedDesktop } from './desktop-settings';

describe('parseSavedDesktop', () => {
  it('keeps openAtLogin unset until the first sign-in saves it', () => {
    expect(parseSavedDesktop('{}')).toEqual({ openAtLogin: undefined, closeHintShown: false });
    expect(parseSavedDesktop(JSON.stringify({ openAtLogin: false, closeHintShown: true }))).toEqual({
      openAtLogin: false,
      closeHintShown: true,
    });
  });

  it('drops malformed fields and survives bad JSON', () => {
    expect(parseSavedDesktop(JSON.stringify({ openAtLogin: 'yes' }))).toEqual({ openAtLogin: undefined, closeHintShown: false });
    expect(parseSavedDesktop('{nope')).toEqual({});
  });
});
