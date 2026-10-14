import { ipcMain } from 'electron';
import { isAccelerator } from '../../ipc/accelerator';
import { IpcChannel, type DesktopSettings } from '../../ipc/contract';
import type { MainContext } from '../context';
import { QuickWindow } from '../quick-window';

/** The quick window: the command bar over any app, on a global shortcut. docs/desktop/quick-search.md. */
export function registerQuick(ctx: MainContext): QuickWindow {
  const quick = new QuickWindow({
    openInMain: (hash) => ctx.sendCommand({ name: 'route', hash }),
    disabled: !!ctx.captureDir,
    automationAsked: (browser) => ctx.desktop.automationAsked?.includes(browser) ?? false,
    markAutomationAsked: (browser) => {
      const asked = ctx.desktop.automationAsked ?? [];
      if (!asked.includes(browser)) ctx.saveDesktop({ automationAsked: [...asked, browser] });
    },
  });
  quick.init(ctx.desktop.hotkey);
  quick.registerIpc();

  ctx.provideSettings(() => ({ hotkey: quick.accelerator, hotkeyError: quick.error }));

  ipcMain.handle(IpcChannel.desktopSetHotkey, (_event, accelerator: unknown): DesktopSettings => {
    if (!isAccelerator(accelerator)) throw new Error('hotkey must be modifiers plus a key, like CommandOrControl+Shift+Space');
    // A clash keeps the shortcut in use and reports the reason in hotkeyError.
    if (quick.setHotkey(accelerator) !== false) ctx.saveDesktop({ hotkey: accelerator });
    return ctx.settings();
  });

  ctx.onQuit(() => quick.destroy());
  return quick;
}
