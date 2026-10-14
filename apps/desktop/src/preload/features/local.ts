import { ipcRenderer } from 'electron';
import type { Search } from '@nvoke/shared';
import { IpcChannel, type LocalBridge, type LocalCompaniesPage, type LocalFindResult, type LocalStatus } from '../../ipc/contract';
import { listen } from '../listen';

export const localBridge: LocalBridge = {
  local: {
    searches: () => ipcRenderer.invoke(IpcChannel.localSearches) as Promise<Search[] | null>,
    search: (id) => ipcRenderer.invoke(IpcChannel.localSearch, id) as Promise<Search | null>,
    companies: (searchId, query) =>
      ipcRenderer.invoke(IpcChannel.localCompanies, searchId, query) as Promise<LocalCompaniesPage | null>,
    find: (query) => ipcRenderer.invoke(IpcChannel.localFind, query) as Promise<LocalFindResult | null>,
    refresh: (searchId) => ipcRenderer.invoke(IpcChannel.localRefresh, searchId) as Promise<void>,
    status: () => ipcRenderer.invoke(IpcChannel.localStatus) as Promise<LocalStatus>,
    onChange: (listener) => listen(IpcChannel.localChanged, listener),
  },
};
