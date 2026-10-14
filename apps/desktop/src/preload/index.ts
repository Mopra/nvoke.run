import { contextBridge } from 'electron';
import type { NvokeApi } from '../ipc/contract';
import { apiBridge } from './features/api';
import { appBridge } from './features/app';
import { authBridge } from './features/auth';
import { csvDropBridge } from './features/csv-drop';
import { desktopCore } from './features/desktop';
import { dragOutBridge } from './features/drag-out';
import { grabBridge } from './features/grab';
import { inboxBridge, inboxDesktop } from './features/inbox';
import { localBridge } from './features/local';
import { localCrawlDesktop } from './features/local-crawl';
import { mcpBridge } from './features/mcp';
import { notificationsBridge } from './features/notifications';
import { quickBridge, quickDesktop } from './features/quick';
import { trayDesktop } from './features/tray';
import { updatesBridge } from './features/updates';
import { windowBridge } from './features/window';

// The only surface the renderer gets. No raw ipcRenderer, no Node APIs, and
// never the device token. Each feature's bridge lives in features/<feature>.ts.
const api: NvokeApi = {
  ...apiBridge,
  ...appBridge,
  ...authBridge,
  ...csvDropBridge,
  ...dragOutBridge,
  ...grabBridge,
  ...inboxBridge,
  ...localBridge,
  ...mcpBridge,
  ...notificationsBridge,
  ...quickBridge,
  ...updatesBridge,
  ...windowBridge,
  desktop: {
    ...desktopCore,
    ...inboxDesktop,
    ...localCrawlDesktop,
    ...quickDesktop,
    ...trayDesktop,
  },
};

contextBridge.exposeInMainWorld('nvoke', api);
