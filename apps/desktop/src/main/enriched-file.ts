import { existsSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';
import { ipcMain, shell } from 'electron';
import { IpcChannel, type SaveEnrichedResult } from '../ipc/contract';

/** The enriched copy's tail: `leads.csv` becomes `leads.nvoke.csv`. */
const ENRICHED_SUFFIX = '.nvoke.csv';

/** What a dropped table may be called. The renderer reads it, main only needs its folder and name. */
const SOURCE_EXTENSIONS = new Set(['.csv', '.tsv', '.txt']);

/** A list of a thousand companies with a few emails each stays far below this. */
export const MAX_ENRICHED_BYTES = 16 * 1024 * 1024;

export interface SaveEnriched {
  sourcePath: string;
  csv: string;
}

/** Checks what the renderer sent. Returns null for anything that is not an absolute path to a table file and a CSV text. */
export function parseSaveEnriched(payload: unknown): SaveEnriched | null {
  const p = payload as Partial<SaveEnriched> | null;
  if (!p || typeof p !== 'object' || typeof p.sourcePath !== 'string' || typeof p.csv !== 'string') return null;
  if (p.sourcePath.length === 0 || p.sourcePath.length > 4096 || p.sourcePath.includes('\0')) return null;
  if (!isAbsolute(p.sourcePath) || !SOURCE_EXTENSIONS.has(extname(p.sourcePath).toLowerCase())) return null;
  if (p.csv.length === 0 || Buffer.byteLength(p.csv, 'utf8') > MAX_ENRICHED_BYTES) return null;
  return { sourcePath: p.sourcePath, csv: p.csv };
}

/**
 * Where the enriched copy of `sourcePath` goes: the same folder, the same
 * name with `.nvoke.csv`. Enriching an enriched copy again writes over it
 * instead of stacking `.nvoke.nvoke.csv`.
 */
export function enrichedPath(sourcePath: string): string {
  const ext = extname(sourcePath);
  let stem = basename(sourcePath, ext);
  if (ext.toLowerCase() === '.csv' && stem.toLowerCase().endsWith('.nvoke')) stem = stem.slice(0, -'.nvoke'.length);
  return join(dirname(sourcePath), `${stem}${ENRICHED_SUFFIX}`);
}

/** Whether `filePath` is an enriched copy a reveal may show. */
export function isEnrichedPath(filePath: unknown): filePath is string {
  return (
    typeof filePath === 'string' &&
    filePath.length <= 4096 &&
    isAbsolute(filePath) &&
    filePath.toLowerCase().endsWith(ENRICHED_SUFFIX)
  );
}

/** Writes the copy next to the original. Never throws. */
export function saveEnrichedCopy(payload: unknown): SaveEnrichedResult {
  const save = parseSaveEnriched(payload);
  if (!save) return { saved: false, error: 'That file can’t be enriched.' };
  try {
    if (!statSync(save.sourcePath).isFile()) return { saved: false, error: 'The original is gone.' };
  } catch {
    return { saved: false, error: 'The original is gone.' };
  }
  const target = enrichedPath(save.sourcePath);
  try {
    writeFileSync(target, save.csv, 'utf8');
  } catch {
    return { saved: false, error: 'Couldn’t write next to the original. Is the folder read only?' };
  }
  return { saved: true, filePath: target };
}

/** Saving the enriched copy of a dropped list and showing it in the file manager. */
export function registerEnrichedIpc(): void {
  ipcMain.handle(IpcChannel.saveEnriched, (_event, payload: unknown): SaveEnrichedResult => saveEnrichedCopy(payload));
  ipcMain.handle(IpcChannel.revealFile, (_event, filePath: unknown): void => {
    if (isEnrichedPath(filePath) && existsSync(filePath)) shell.showItemInFolder(filePath);
  });
}
