import { app, ipcMain, shell } from 'electron';
import { HealthResponse } from '@nvoke/shared';
import { IpcChannel, type AppInfo } from '../../ipc/contract';
import type { MainContext } from '../context';
import { isSafeExternalUrl } from '../external-url';

/** App info, links to the system browser and the server's health. */
export function registerApp(ctx: MainContext): void {
  ipcMain.handle(IpcChannel.getAppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    apiUrl: ctx.env.apiUrl,
  }));

  ipcMain.handle(IpcChannel.openExternal, async (_event, url: unknown) => {
    if (typeof url !== 'string' || !isSafeExternalUrl(url)) {
      throw new Error('refused to open a non http(s) url');
    }
    await shell.openExternal(url);
  });

  ipcMain.handle(IpcChannel.getHealth, async () => {
    const res = await ctx.session.api('/health');
    if (!res.ok) throw new Error(`/health responded ${res.status}`);
    return HealthResponse.parse(await res.json());
  });
}
