import { ipcRenderer } from 'electron';
import { IpcChannel, type ApiBridge, type BridgeResponse, type ExportResult } from '../../ipc/contract';

export const apiBridge: ApiBridge = {
  request: (method, path, body) => ipcRenderer.invoke(IpcChannel.apiRequest, method, path, body) as Promise<BridgeResponse>,
  exportCsv: (searchId, defaultFileName) =>
    ipcRenderer.invoke(IpcChannel.exportCsv, searchId, defaultFileName) as Promise<ExportResult>,
};
