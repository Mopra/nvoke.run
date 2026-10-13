import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { isAccelerator } from '../ipc/accelerator';

/**
 * How the app lives on the computer, kept in userData between launches.
 * Pure helpers here; the tray and login item wiring live in tray.ts and
 * login-item.ts.
 */
export interface SavedDesktop {
  /** Undefined until the first sign-in turns it on. */
  openAtLogin?: boolean;
  /** The "still running in the tray" hint is shown once, on the first close. */
  closeHintShown?: boolean;
  /** The global shortcut for the quick window. Undefined means the default. */
  hotkey?: string;
  /** The watched inbox folder. Off until turned on; a missing folder means the default. */
  inboxEnabled?: boolean;
  inboxFolder?: string;
}

export function parseSavedDesktop(raw: string): SavedDesktop {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      openAtLogin: typeof data['openAtLogin'] === 'boolean' ? data['openAtLogin'] : undefined,
      closeHintShown: data['closeHintShown'] === true,
      ...(isAccelerator(data['hotkey']) ? { hotkey: data['hotkey'] } : {}),
      ...(data['inboxEnabled'] === true ? { inboxEnabled: true } : {}),
      ...(typeof data['inboxFolder'] === 'string' && isAbsolute(data['inboxFolder']) ? { inboxFolder: data['inboxFolder'] } : {}),
    };
  } catch {
    return {};
  }
}

export function readSavedDesktop(file: string): SavedDesktop {
  try {
    return parseSavedDesktop(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

export function writeSavedDesktop(file: string, data: SavedDesktop): void {
  try {
    writeFileSync(file, JSON.stringify(data));
  } catch {
    // Forgetting a preference is not worth crashing over.
  }
}
