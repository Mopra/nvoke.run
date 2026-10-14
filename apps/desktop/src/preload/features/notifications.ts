import { ipcRenderer } from 'electron';
import { IpcChannel, type NotificationSettings, type NotificationsBridge } from '../../ipc/contract';
import { listen } from '../listen';

export const notificationsBridge: NotificationsBridge = {
  notifications: {
    getSettings: () => ipcRenderer.invoke(IpcChannel.notificationsGetSettings) as Promise<NotificationSettings>,
    setEnabled: (enabled) => ipcRenderer.invoke(IpcChannel.notificationsSetEnabled, enabled) as Promise<NotificationSettings>,
    markSeen: (searchId) => ipcRenderer.send(IpcChannel.notificationsMarkSeen, searchId),
    onOpenSearch: (listener) => listen(IpcChannel.notificationsOpenSearch, listener),
  },
};
