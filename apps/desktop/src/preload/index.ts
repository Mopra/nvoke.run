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
  type InboxFile,
  type InboxResult,
  type FrontTab,
  type SaveEnrichedResult,
  type LocalChange,
  type LocalCompaniesPage,
  type LocalStatus,
  type McpSetup,
  type NotificationSettings,
  type GrabFrame,
  type GrabState,
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
  inbox: {
    onFile: (listener) => {
      const handler = (_event: IpcRendererEvent, file: InboxFile) => listener(file);
      ipcRenderer.on(IpcChannel.inboxFile, handler);
      return () => ipcRenderer.removeListener(IpcChannel.inboxFile, handler);
    },
    ready: () => ipcRenderer.send(IpcChannel.inboxReady),
    done: (result) => ipcRenderer.invoke(IpcChannel.inboxDone, result) as Promise<InboxResult>,
    failed: (failure) => ipcRenderer.invoke(IpcChannel.inboxFailed, failure) as Promise<void>,
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
    setInboxEnabled: (enabled) => ipcRenderer.invoke(IpcChannel.desktopSetInboxEnabled, enabled) as Promise<DesktopSettings>,
    chooseInboxFolder: () => ipcRenderer.invoke(IpcChannel.desktopChooseInboxFolder) as Promise<DesktopSettings>,
    openInboxFolder: () => ipcRenderer.invoke(IpcChannel.desktopOpenInboxFolder) as Promise<void>,
    setLocalCrawl: (enabled) => ipcRenderer.invoke(IpcChannel.desktopSetLocalCrawl, enabled) as Promise<DesktopSettings>,
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
    onFrontTab: (listener) => {
      const handler = (_event: IpcRendererEvent, tab: FrontTab | null) => listener(tab);
      ipcRenderer.on(IpcChannel.quickFrontTab, handler);
      return () => ipcRenderer.removeListener(IpcChannel.quickFrontTab, handler);
    },
    readFrontTab: () => ipcRenderer.invoke(IpcChannel.quickReadFrontTab) as Promise<FrontTab | null>,
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
  notifications: {
    getSettings: () => ipcRenderer.invoke(IpcChannel.notificationsGetSettings) as Promise<NotificationSettings>,
    setEnabled: (enabled) => ipcRenderer.invoke(IpcChannel.notificationsSetEnabled, enabled) as Promise<NotificationSettings>,
    markSeen: (searchId) => ipcRenderer.send(IpcChannel.notificationsMarkSeen, searchId),
    onOpenSearch: (listener) => {
      const handler = (_event: IpcRendererEvent, searchId: string) => listener(searchId);
      ipcRenderer.on(IpcChannel.notificationsOpenSearch, handler);
      return () => ipcRenderer.removeListener(IpcChannel.notificationsOpenSearch, handler);
    },
  },
  grab: {
    start: () => ipcRenderer.send(IpcChannel.grabStart),
    openSettings: () => ipcRenderer.send(IpcChannel.grabOpenSettings),
    getFrame: () => ipcRenderer.invoke(IpcChannel.grabGetFrame) as Promise<GrabFrame | null>,
    select: (rect) => ipcRenderer.send(IpcChannel.grabSelect, rect),
    cancel: () => ipcRenderer.send(IpcChannel.grabCancel),
    onState: (listener) => {
      const handler = (_event: IpcRendererEvent, state: GrabState) => listener(state);
      ipcRenderer.on(IpcChannel.grabState, handler);
      return () => ipcRenderer.removeListener(IpcChannel.grabState, handler);
    },
  },
};

contextBridge.exposeInMainWorld('nvoke', api);
