import { ipcRenderer } from 'electron';
import { IpcChannel, type DesktopCoreApi, type DesktopSettings } from '../../ipc/contract';
import { listen } from '../listen';

export const desktopCore: DesktopCoreApi = {
  getSettings: () => ipcRenderer.invoke(IpcChannel.desktopGetSettings) as Promise<DesktopSettings>,
  onCommand: (listener) => listen(IpcChannel.desktopCommand, listener),
};
