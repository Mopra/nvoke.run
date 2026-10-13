import { ipcMain } from 'electron';
import { EmailKind, Verification } from '@nvoke/shared';
import { z } from 'zod';
import { IpcChannel, type LocalCompaniesQuery } from '../../ipc/contract';
import { LOCAL_PAGE_MAX } from './store';
import type { LocalStore } from './store';
import type { LeadSync } from './sync';

const SearchId = z.uuid();

/** What the renderer may send to `local.companies`. Anything else is refused. */
export const LocalCompaniesQuerySchema = z.strictObject({
  verification: Verification.optional(),
  kind: EmailKind.optional(),
  q: z.string().max(200).optional(),
  offset: z.number().int().min(0).max(10_000_000).optional(),
  limit: z.number().int().min(1).max(LOCAL_PAGE_MAX).optional(),
});

export function parseLocalCompaniesQuery(raw: unknown): LocalCompaniesQuery | null {
  const parsed = LocalCompaniesQuerySchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : null;
}

/**
 * The `local:*` handlers. Every one validates its input and answers from the
 * store only while signed in, so a signed out app never reads or recreates
 * the file.
 */
export function registerLocalIpc(store: LocalStore, sync: LeadSync): void {
  ipcMain.handle(IpcChannel.localSearches, () => (sync.active ? store.listSearches() : null));

  ipcMain.handle(IpcChannel.localSearch, (_event, id: unknown) => {
    if (!sync.active || !SearchId.safeParse(id).success) return null;
    return store.getSearch(id as string);
  });

  ipcMain.handle(IpcChannel.localCompanies, (_event, id: unknown, query: unknown) => {
    const parsed = parseLocalCompaniesQuery(query);
    if (!sync.active || !SearchId.safeParse(id).success || !parsed) return null;
    return store.queryCompanies(id as string, parsed);
  });

  ipcMain.handle(IpcChannel.localRefresh, (_event, id: unknown) => {
    if (!SearchId.safeParse(id).success) return;
    // In the background: the renderer hears about the result through local:changed.
    void sync.refresh(id as string);
  });

  ipcMain.handle(IpcChannel.localStatus, () => sync.status());
}
