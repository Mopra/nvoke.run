import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app, safeStorage } from 'electron';
import type { TokenStore } from './session';

/**
 * Keeps the device token encrypted with Electron safeStorage (DPAPI on
 * Windows, Keychain on macOS, the Secret Service or KWallet on Linux) in
 * userData. Without a real OS backend the token lives in memory only and the
 * user signs in again on the next launch.
 */
export function safeTokenStore(): TokenStore {
  const file = join(app.getPath('userData'), 'device-token.bin');
  let memory: string | null = null;

  function canEncrypt(): boolean {
    if (!safeStorage.isEncryptionAvailable()) return false;
    // basic_text is a hardcoded key on Linux, no better than plain text.
    return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text';
  }

  return {
    async load() {
      if (memory) return memory;
      if (!canEncrypt()) return null;
      try {
        return safeStorage.decryptString(await readFile(file));
      } catch {
        return null;
      }
    },
    async save(token) {
      memory = token;
      if (!canEncrypt()) {
        console.warn('safeStorage is not available, the device token is kept in memory only');
        return;
      }
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, safeStorage.encryptString(token), { mode: 0o600 });
    },
    async clear() {
      memory = null;
      await rm(file, { force: true });
    },
  };
}
