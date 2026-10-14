import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { IpcChannel, type ExportResult } from '../../ipc/contract';
import { bridgeRequest, deletedSearchId, exportCsvToFile, safeCsvFileName } from '../api-bridge';
import type { MainContext } from '../context';

/** The renderer's only door to apps/server, and the CSV export to a file. */
export function registerApi(ctx: MainContext): void {
  // Paths are limited to /v1/ and the device token is attached here, never in the renderer.
  ipcMain.handle(IpcChannel.apiRequest, async (_event, method: unknown, path: unknown, body: unknown) => {
    const res = await bridgeRequest(ctx.session, method, path, body);
    const deleted = deletedSearchId(method, path, res);
    if (deleted) ctx.emit('search-deleted', deleted);
    return res;
  });

  ipcMain.handle(IpcChannel.exportCsv, async (event, searchId: unknown, defaultFileName: unknown): Promise<ExportResult> => {
    const options = {
      title: 'Export CSV',
      defaultPath: join(app.getPath('downloads'), safeCsvFileName(defaultFileName)),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    };
    const win = BrowserWindow.fromWebContents(event.sender);
    const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return { saved: false };
    return exportCsvToFile(ctx.session, searchId, picked.filePath);
  });
}
