import { ipcRenderer } from 'electron';
import { IpcChannel, type DesktopSettings, type LocalCrawlDesktopApi } from '../../ipc/contract';

export const localCrawlDesktop: LocalCrawlDesktopApi = {
  setLocalCrawl: (enabled) => ipcRenderer.invoke(IpcChannel.desktopSetLocalCrawl, enabled) as Promise<DesktopSettings>,
};
