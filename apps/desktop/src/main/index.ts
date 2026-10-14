import { app } from 'electron';
import { prepareCapture, registerCapture } from './capture';
import { MainContext } from './context';
import { registerDragIpc } from './drag';
import { registerEnrichedIpc } from './enriched-file';
import { registerApi } from './features/api';
import { registerApp } from './features/app';
import { registerAuth } from './features/auth';
import { registerDesktop } from './features/desktop';
import { registerGrab } from './features/grab';
import { registerInbox } from './features/inbox';
import { registerLocalCopy } from './features/local';
import { registerLocalCrawl } from './features/local-crawl';
import { registerMcp } from './features/mcp';
import { registerNotifications } from './features/notifications';
import { registerQuick } from './features/quick';
import { registerTray } from './features/tray';
import { openMainWindow, registerWindow } from './features/window';

/**
 * Each feature registers its IPC, settings and lifecycle from its own file in
 * `features/`, through the shared MainContext. This file only calls them.
 */

/** Dev only: `--capture[=dir]` screenshots every screen and quits (see capture/). */
const captureDir = prepareCapture();

const env = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  siteUrl: import.meta.env.VITE_SITE_URL || (app.isPackaged ? 'https://nvoke.run' : 'http://localhost:3001'),
};

// One running instance. A second launch (for example the OS opening an
// nvoke:// link on Windows or Linux) hands its argv to the first and quits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main();
}

function main(): void {
  const ctx = new MainContext({ env, captureDir });
  // Windows needs the installer's AppUserModelID for the tray balloon and notifications.
  if (process.platform === 'win32') app.setAppUserModelId('app.nvoke.desktop');

  const auth = registerAuth(ctx);
  app.on('will-quit', () => ctx.quit());

  app.whenReady().then(async () => {
    auth.ready();
    registerApp(ctx);
    registerApi(ctx);
    registerDesktop(ctx);
    registerLocalCopy(ctx);
    const quick = registerQuick(ctx);
    registerInbox(ctx);
    registerNotifications(ctx);
    const grab = registerGrab(ctx, quick);
    registerWindow(ctx);
    registerDragIpc();
    registerEnrichedIpc();
    registerMcp(ctx);
    registerTray(ctx);
    registerLocalCrawl(ctx);
    registerCapture(ctx, { quick, grab });
    openMainWindow(ctx);
    await auth.start();
  });
}
