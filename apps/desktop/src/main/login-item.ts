import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';

/**
 * Start at login, hidden. Windows passes HIDDEN_FLAG to the login item,
 * macOS reports `wasOpenedAtLogin`, Linux gets an XDG autostart entry with
 * the flag. Development builds never register: the login item would point at
 * the bare electron.exe.
 */
export const HIDDEN_FLAG = '--hidden';

/** True when the OS started the app at login, so no window should open. */
export function startedHidden(argv: string[]): boolean {
  if (argv.includes(HIDDEN_FLAG)) return true;
  if (process.platform === 'darwin') return app.getLoginItemSettings().wasOpenedAtLogin === true;
  return false;
}

function autostartFile(): string {
  const config = process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config');
  return join(config, 'autostart', 'nvoke.desktop');
}

/** The Exec line of the autostart entry. The AppImage path when there is one, since execPath points into its mount. */
export function desktopEntry(executable: string): string {
  const exec = `"${executable.replace(/(["`$\\])/g, '\\$1')}" ${HIDDEN_FLAG}`;
  return ['[Desktop Entry]', 'Type=Application', 'Name=nvoke', `Exec=${exec}`, 'X-GNOME-Autostart-enabled=true', ''].join('\n');
}

export function applyOpenAtLogin(enabled: boolean): void {
  if (!app.isPackaged) return;
  try {
    if (process.platform === 'linux') {
      const file = autostartFile();
      if (enabled) {
        mkdirSync(join(file, '..'), { recursive: true });
        writeFileSync(file, desktopEntry(process.env['APPIMAGE'] || process.execPath));
      } else {
        rmSync(file, { force: true });
      }
      return;
    }
    // Windows passes args to the login item. macOS ignores them and reports wasOpenedAtLogin instead.
    app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_FLAG] });
  } catch (err) {
    console.warn(`[login-item] could not ${enabled ? 'register' : 'remove'} the login item: ${String(err)}`);
  }
}
