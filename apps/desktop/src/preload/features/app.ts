import { ipcRenderer } from 'electron';
import type { HealthResponse } from '@nvoke/shared';
import { IpcChannel, type AppBridge, type AppInfo } from '../../ipc/contract';

export const appBridge: AppBridge = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.getAppInfo) as Promise<AppInfo>,
  openExternal: (url) => ipcRenderer.invoke(IpcChannel.openExternal, url) as Promise<void>,
  getHealth: () => ipcRenderer.invoke(IpcChannel.getHealth) as Promise<HealthResponse>,
};
