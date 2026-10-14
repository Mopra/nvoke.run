import { ipcRenderer } from 'electron';
import { IpcChannel, type UpdateState, type UpdatesBridge, type WhatsNew } from '../../ipc/contract';
import { listen } from '../listen';

export const updatesBridge: UpdatesBridge = {
  updates: {
    getState: () => ipcRenderer.invoke(IpcChannel.updatesGetState) as Promise<UpdateState>,
    check: () => ipcRenderer.invoke(IpcChannel.updatesCheck) as Promise<UpdateState>,
    install: () => ipcRenderer.invoke(IpcChannel.updatesInstall) as Promise<void>,
    onChange: (listener) => listen(IpcChannel.updatesChanged, listener),
    getWhatsNew: () => ipcRenderer.invoke(IpcChannel.updatesGetWhatsNew) as Promise<WhatsNew | null>,
    dismissWhatsNew: () => ipcRenderer.invoke(IpcChannel.updatesDismissWhatsNew) as Promise<void>,
    onWhatsNew: (listener) => listen(IpcChannel.updatesWhatsNew, listener),
  },
};
