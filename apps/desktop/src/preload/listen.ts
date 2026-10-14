import { ipcRenderer, type IpcRendererEvent } from 'electron';

/** Subscribes to a push from main. Returns an unsubscribe function. */
export function listen<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
