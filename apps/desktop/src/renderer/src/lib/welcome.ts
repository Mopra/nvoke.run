/**
 * The first launch after install greets you instead of going straight to
 * sign in. It shows until the first sign-in on this machine, stored locally.
 */

export const WELCOMED_KEY = 'nvoke.welcomed';

type WelcomeStorage = Pick<Storage, 'getItem' | 'setItem'>;

function local(): WelcomeStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function isFirstRun(storage: WelcomeStorage | undefined = local()): boolean {
  try {
    return storage?.getItem(WELCOMED_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markWelcomed(storage: WelcomeStorage | undefined = local()): void {
  try {
    storage?.setItem(WELCOMED_KEY, '1');
  } catch {
    // Private storage off: the welcome shows again, which is harmless.
  }
}
