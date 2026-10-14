import { ipcRenderer } from 'electron';
import { IpcChannel, type AuthBridge, type AuthState } from '../../ipc/contract';
import { listen } from '../listen';

export const authBridge: AuthBridge = {
  auth: {
    getState: () => ipcRenderer.invoke(IpcChannel.authGetState) as Promise<AuthState>,
    signIn: () => ipcRenderer.invoke(IpcChannel.authSignIn) as Promise<void>,
    cancelSignIn: () => ipcRenderer.invoke(IpcChannel.authCancel) as Promise<void>,
    signOut: () => ipcRenderer.invoke(IpcChannel.authSignOut) as Promise<void>,
    onChange: (listener) => listen(IpcChannel.authChanged, listener),
  },
};
