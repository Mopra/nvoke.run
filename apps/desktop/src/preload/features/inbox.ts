import { ipcRenderer } from 'electron';
import { IpcChannel, type DesktopSettings, type InboxBridge, type InboxDesktopApi, type InboxResult } from '../../ipc/contract';
import { listen } from '../listen';

export const inboxBridge: InboxBridge = {
  inbox: {
    onFile: (listener) => listen(IpcChannel.inboxFile, listener),
    ready: () => ipcRenderer.send(IpcChannel.inboxReady),
    done: (result) => ipcRenderer.invoke(IpcChannel.inboxDone, result) as Promise<InboxResult>,
    failed: (failure) => ipcRenderer.invoke(IpcChannel.inboxFailed, failure) as Promise<void>,
  },
};

export const inboxDesktop: InboxDesktopApi = {
  setInboxEnabled: (enabled) => ipcRenderer.invoke(IpcChannel.desktopSetInboxEnabled, enabled) as Promise<DesktopSettings>,
  chooseInboxFolder: () => ipcRenderer.invoke(IpcChannel.desktopChooseInboxFolder) as Promise<DesktopSettings>,
  openInboxFolder: () => ipcRenderer.invoke(IpcChannel.desktopOpenInboxFolder) as Promise<void>,
};
