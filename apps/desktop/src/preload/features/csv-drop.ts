import { ipcRenderer, webUtils } from 'electron';
import { IpcChannel, type CsvDropBridge, type SaveEnrichedResult } from '../../ipc/contract';

export const csvDropBridge: CsvDropBridge = {
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
};
