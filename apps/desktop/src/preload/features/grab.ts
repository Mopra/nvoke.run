import { ipcRenderer } from 'electron';
import { IpcChannel, type GrabBridge, type GrabFrame } from '../../ipc/contract';
import { listen } from '../listen';

export const grabBridge: GrabBridge = {
  grab: {
    start: () => ipcRenderer.send(IpcChannel.grabStart),
    openSettings: () => ipcRenderer.send(IpcChannel.grabOpenSettings),
    getFrame: () => ipcRenderer.invoke(IpcChannel.grabGetFrame) as Promise<GrabFrame | null>,
    select: (rect) => ipcRenderer.send(IpcChannel.grabSelect, rect),
    cancel: () => ipcRenderer.send(IpcChannel.grabCancel),
    onState: (listener) => listen(IpcChannel.grabState, listener),
  },
};
