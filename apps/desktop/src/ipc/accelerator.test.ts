import { describe, expect, it } from 'vitest';
import { acceleratorFromEvent, acceleratorLabel, DEFAULT_HOTKEY, isAccelerator } from './accelerator';

const press = (code: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('isAccelerator', () => {
  it('accepts a modifier plus a key', () => {
    expect(isAccelerator(DEFAULT_HOTKEY)).toBe(true);
    expect(isAccelerator('Alt+F4')).toBe(true);
    expect(isAccelerator('Control+Alt+K')).toBe(true);
  });

  it('refuses a bare key, junk and repeated modifiers', () => {
    expect(isAccelerator('Space')).toBe(false);
    expect(isAccelerator('Shift+')).toBe(false);
    expect(isAccelerator('Ctrl+Shift+Space+Q')).toBe(false);
    expect(isAccelerator('Shift+Shift+K')).toBe(false);
    expect(isAccelerator('Shift+K; rm')).toBe(false);
    expect(isAccelerator(42)).toBe(false);
  });
});

describe('acceleratorFromEvent', () => {
  it('uses Cmd as the primary modifier on macOS and Ctrl elsewhere', () => {
    expect(acceleratorFromEvent(press('Space', { metaKey: true, shiftKey: true }), true)).toBe('CommandOrControl+Shift+Space');
    expect(acceleratorFromEvent(press('Space', { ctrlKey: true, shiftKey: true }), false)).toBe('CommandOrControl+Shift+Space');
    expect(acceleratorFromEvent(press('KeyK', { ctrlKey: true, altKey: true }), true)).toBe('Control+Alt+K');
  });

  it('waits for a key and a modifier', () => {
    expect(acceleratorFromEvent(press('ShiftLeft', { shiftKey: true }), false)).toBeNull();
    expect(acceleratorFromEvent(press('KeyK'), false)).toBeNull();
  });
});

describe('acceleratorLabel', () => {
  it('reads like the platform', () => {
    expect(acceleratorLabel(DEFAULT_HOTKEY, true)).toBe('⌘⇧Space');
    expect(acceleratorLabel(DEFAULT_HOTKEY, false)).toBe('Ctrl+Shift+Space');
  });
});
