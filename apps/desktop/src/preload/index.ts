import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import type { HealthResponse, Search } from '@nvoke/shared';
import {
  IpcChannel,
  type AppInfo,
  type AuthState,
  type BridgeResponse,
  type ClaudeDesktopResult,
  type DesktopCommand,
  type DesktopSettings,
  type ExportResult,
  type SaveEnrichedResult,
  type LocalChange,
  type LocalCompaniesPage,
  type LocalStatus,
  type McpSetup,
  type NvokeApi,
  type QuickClipboard,
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
  files: {
    pathFor: (file) => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return '';
      }
    },
    saveEnriched: (sourcePath, csv) =>
      ipcRenderer.invoke(IpcChannel.saveEnriched, { sourcePath, csv }) as Promise<SaveEnrichedResult>,
    reveal: (filePath) => ipcRenderer.invoke(IpcChannel.revealFile, filePath) as Promise<void>,
  },
  local: {
    searches: () => ipcRenderer.invoke(IpcChannel.localSearches) as Promise<Search[] | null>,
    search: (id) => ipcRenderer.invoke(IpcChannel.localSearch, id) as Promise<Search | null>,
    companies: (searchId, query) =>
      ipcRenderer.invoke(IpcChannel.localCompanies, searchId, query) as Promise<LocalCompaniesPage | null>,
    refresh: (searchId) => ipcRenderer.invoke(IpcChannel.localRefresh, searchId) as Promise<void>,
    status: () => ipcRenderer.invoke(IpcChannel.localStatus) as Promise<LocalStatus>,
    onChange: (listener) => {
      const handler = (_event: IpcRendererEvent, change: LocalChange) => listener(change);
      ipcRenderer.on(IpcChannel.localChanged, handler);
      return () => ipcRenderer.removeListener(IpcChannel.localChanged, handler);
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
    setHotkey: (accelerator) => ipcRenderer.invoke(IpcChannel.desktopSetHotkey, accelerator) as Promise<DesktopSettings>,
    onCommand: (listener) => {
      const handler = (_event: IpcRendererEvent, command: DesktopCommand) => listener(command);
      ipcRenderer.on(IpcChannel.desktopCommand, handler);
      return () => ipcRenderer.removeListener(IpcChannel.desktopCommand, handler);
    },
  },
  quick: {
    hide: () => ipcRenderer.send(IpcChannel.quickHide),
    openInMain: (hash) => ipcRenderer.send(IpcChannel.quickOpenInMain, hash),
    setHeight: (height) => ipcRenderer.send(IpcChannel.quickSetHeight, height),
    onShown: (listener) => {
      const handler = (_event: IpcRendererEvent, clipboard: QuickClipboard) => listener(clipboard);
      ipcRenderer.on(IpcChannel.quickShown, handler);
      return () => ipcRenderer.removeListener(IpcChannel.quickShown, handler);
    },
  },
  mcp: {
    getSetup: () => ipcRenderer.invoke(IpcChannel.mcpGetSetup) as Promise<McpSetup>,
    addToClaudeDesktop: () => ipcRenderer.invoke(IpcChannel.mcpAddToClaudeDesktop) as Promise<ClaudeDesktopResult>,
    onClientsChange: (listener) => {
      const handler = (_event: IpcRendererEvent, clients: string[]) => listener(clients);
      ipcRenderer.on(IpcChannel.mcpClientsChanged, handler);
      return () => ipcRenderer.removeListener(IpcChannel.mcpClientsChanged, handler);
    },
  },
};

contextBridge.exposeInMainWorld('nvoke', api);
