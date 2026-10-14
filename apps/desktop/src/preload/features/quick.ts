import { ipcRenderer } from 'electron';
import { IpcChannel, type DesktopSettings, type FrontTab, type QuickBridge, type QuickDesktopApi } from '../../ipc/contract';
import { listen } from '../listen';

export const quickBridge: QuickBridge = {
  quick: {
    hide: () => ipcRenderer.send(IpcChannel.quickHide),
    openInMain: (hash) => ipcRenderer.send(IpcChannel.quickOpenInMain, hash),
    setHeight: (height) => ipcRenderer.send(IpcChannel.quickSetHeight, height),
    onShown: (listener) => listen(IpcChannel.quickShown, listener),
    onFrontTab: (listener) => listen(IpcChannel.quickFrontTab, listener),
    readFrontTab: () => ipcRenderer.invoke(IpcChannel.quickReadFrontTab) as Promise<FrontTab | null>,
  },
};

export const quickDesktop: QuickDesktopApi = {
  setHotkey: (accelerator) => ipcRenderer.invoke(IpcChannel.desktopSetHotkey, accelerator) as Promise<DesktopSettings>,
};
