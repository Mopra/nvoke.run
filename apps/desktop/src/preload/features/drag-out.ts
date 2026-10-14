import { ipcRenderer } from 'electron';
import { IpcChannel, type DragOutBridge } from '../../ipc/contract';

export const dragOutBridge: DragOutBridge = {
  startDragCsv: (fileName, csv) => ipcRenderer.send(IpcChannel.startDragCsv, { fileName, csv }),
};
