import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, type AppInfo, type NvokeApi } from '../ipc/contract';

// The only surface the renderer gets. No raw ipcRenderer, no Node APIs.
const api: NvokeApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.getAppInfo) as Promise<AppInfo>,
  openExternal: (url) => ipcRenderer.invoke(IpcChannel.openExternal, url) as Promise<void>,
};

contextBridge.exposeInMainWorld('nvoke', api);
