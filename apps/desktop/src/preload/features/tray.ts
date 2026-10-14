import { ipcRenderer } from 'electron';
import { IpcChannel, type DesktopSettings, type TrayDesktopApi } from '../../ipc/contract';

export const trayDesktop: TrayDesktopApi = {
  setOpenAtLogin: (enabled) => ipcRenderer.invoke(IpcChannel.desktopSetOpenAtLogin, enabled) as Promise<DesktopSettings>,
};
