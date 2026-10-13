/**
 * Global shortcut accelerators in Electron's format, for example
 * `CommandOrControl+Shift+Space`. Shared by main (validates before it
 * registers) and the renderer (records and labels them). Pure, no Electron.
 */

export const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space';

const MODIFIERS = ['CommandOrControl', 'Command', 'Control', 'Alt', 'Shift', 'Super'] as const;
const NAMED_KEYS = [
  'Space',
  'Tab',
  'Enter',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Up',
  'Down',
  'Left',
  'Right',
  'Plus',
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
];
const PUNCTUATION = '`-=[]\\;\',./';

function isKey(key: string): boolean {
  return /^[A-Z0-9]$/.test(key) || NAMED_KEYS.includes(key) || (key.length === 1 && PUNCTUATION.includes(key));
}

/** At least one modifier, then exactly one key, so a bare letter can never steal typing everywhere. */
export function isAccelerator(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64) return false;
  const parts = value.split('+');
  // A literal plus key is written `Plus`, so every part is a name.
  const key = parts.pop() ?? '';
  if (parts.length === 0 || !isKey(key)) return false;
  return new Set(parts).size === parts.length && parts.every((p) => (MODIFIERS as readonly string[]).includes(p));
}

/** The key a physical `KeyboardEvent.code` stands for, or null for keys we do not offer. */
export function keyFromCode(code: string): string | null {
  let m = /^Key([A-Z])$/.exec(code) ?? /^Digit([0-9])$/.exec(code);
  if (m) return m[1] ?? null;
  m = /^Arrow(Up|Down|Left|Right)$/.exec(code);
  if (m) return m[1] ?? null;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  const map: Record<string, string> = {
    Space: 'Space',
    Tab: 'Tab',
    Enter: 'Enter',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
  };
  return map[code] ?? null;
}

interface KeyLike {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Builds an accelerator from a key press, or null while only modifiers are down or the combination is not allowed. */
export function acceleratorFromEvent(event: KeyLike, mac: boolean): string | null {
  const key = keyFromCode(event.code);
  if (!key) return null;
  const parts: string[] = [];
  // Cmd is the primary modifier on macOS and Ctrl elsewhere.
  if (mac) {
    if (event.metaKey) parts.push('CommandOrControl');
    if (event.ctrlKey) parts.push('Control');
  } else {
    if (event.ctrlKey) parts.push('CommandOrControl');
    if (event.metaKey) parts.push('Super');
  }
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  const accelerator = [...parts, key].join('+');
  return isAccelerator(accelerator) ? accelerator : null;
}

/** How the shortcut reads on screen: `⌘⇧Space` on macOS, `Ctrl+Shift+Space` elsewhere. */
export function acceleratorLabel(accelerator: string, mac: boolean): string {
  const parts = accelerator.split('+');
  const key = parts.pop() ?? '';
  const shown = parts.map((p) => {
    switch (p) {
      case 'CommandOrControl':
        return mac ? '⌘' : 'Ctrl';
      case 'Command':
        return '⌘';
      case 'Control':
        return mac ? '⌃' : 'Ctrl';
      case 'Alt':
        return mac ? '⌥' : 'Alt';
      case 'Shift':
        return mac ? '⇧' : 'Shift';
      default:
        return mac ? '⌘' : 'Win';
    }
  });
  const keyLabel = key.length === 1 ? key.toUpperCase() : key;
  return mac ? `${shown.join('')}${keyLabel}` : [...shown, keyLabel].join('+');
}
