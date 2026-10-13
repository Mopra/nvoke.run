import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { HealthResponse } from '@nvoke/shared';
import {
  IpcChannel,
  type AppInfo,
  type AuthState,
  type BridgeResponse,
  type DesktopCommand,
  type DesktopSettings,
  type ExportResult,
  type NvokeApi,
  type WindowChrome,
  type WindowState,
} from '../ipc/contract';

// The only surface the renderer gets. No raw ipcRenderer, no Node APIs, and
// never the device token.
const api: NvokeApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.getAppInfo) as Promise<AppInfo>,
  openExternal: (url) => ipcRenderer.invoke(IpcChannel.openExternal, url) as Promise<void>,
  getHealth: () => ipcRenderer.invoke(IpcChannel.getHealth) as Promise<HealthResponse>,
  request: (method, path, body) => ipcRenderer.invoke(IpcChannel.apiRequest, method, path, body) as Promise<BridgeResponse>,
  exportCsv: (searchId, defaultFileName) =>
    ipcRenderer.invoke(IpcChannel.exportCsv, searchId, defaultFileName) as Promise<ExportResult>,
  startDragCsv: (fileName, csv) => ipcRenderer.send(IpcChannel.startDragCsv, { fileName, csv }),
  auth: {
    getState: () => ipcRenderer.invoke(IpcChannel.authGetState) as Promise<AuthState>,
    signIn: () => ipcRenderer.invoke(IpcChannel.authSignIn) as Promise<void>,
    cancelSignIn: () => ipcRenderer.invoke(IpcChannel.authCancel) as Promise<void>,
    signOut: () => ipcRenderer.invoke(IpcChannel.authSignOut) as Promise<void>,
    onChange: (listener) => {
      const handler = (_event: IpcRendererEvent, state: AuthState) => listener(state);
      ipcRenderer.on(IpcChannel.authChanged, handler);
      return () => ipcRenderer.removeListener(IpcChannel.authChanged, handler);
    },
  },
  window: {
    getChrome: () => ipcRenderer.invoke(IpcChannel.windowGetChrome) as Promise<WindowChrome>,
    setTheme: (theme) => ipcRenderer.invoke(IpcChannel.windowSetTheme, theme) as Promise<void>,
    setTitleBarColors: (colors) => ipcRenderer.invoke(IpcChannel.windowSetTitleBarColors, colors) as Promise<void>,
    onStateChange: (listener) => {
      const handler = (_event: IpcRendererEvent, state: WindowState) => listener(state);
      ipcRenderer.on(IpcChannel.windowStateChanged, handler);
      return () => ipcRenderer.removeListener(IpcChannel.windowStateChanged, handler);
    },
  },
  desktop: {
    getSettings: () => ipcRenderer.invoke(IpcChannel.desktopGetSettings) as Promise<DesktopSettings>,
    setOpenAtLogin: (enabled) => ipcRenderer.invoke(IpcChannel.desktopSetOpenAtLogin, enabled) as Promise<DesktopSettings>,
    onCommand: (listener) => {
      const handler = (_event: IpcRendererEvent, command: DesktopCommand) => listener(command);
      ipcRenderer.on(IpcChannel.desktopCommand, handler);
      return () => ipcRenderer.removeListener(IpcChannel.desktopCommand, handler);
    },
  },
};

contextBridge.exposeInMainWorld('nvoke', api);
