import { readFileSync, writeFileSync } from 'node:fs';

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
}

export function parseSavedDesktop(raw: string): SavedDesktop {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      openAtLogin: typeof data['openAtLogin'] === 'boolean' ? data['openAtLogin'] : undefined,
      closeHintShown: data['closeHintShown'] === true,
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
