import { ipcRenderer } from 'electron';
import { IpcChannel, type WindowBridge, type WindowChrome } from '../../ipc/contract';
import { listen } from '../listen';

export const windowBridge: WindowBridge = {
  window: {
    getChrome: () => ipcRenderer.invoke(IpcChannel.windowGetChrome) as Promise<WindowChrome>,
    setTheme: (theme) => ipcRenderer.invoke(IpcChannel.windowSetTheme, theme) as Promise<void>,
    setTitleBarColors: (colors) => ipcRenderer.invoke(IpcChannel.windowSetTitleBarColors, colors) as Promise<void>,
    onStateChange: (listener) => listen(IpcChannel.windowStateChanged, listener),
  },
};
