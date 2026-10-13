import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, ipcMain, nativeImage, type NativeImage } from 'electron';
import { IpcChannel } from '../ipc/contract';
import { safeCsvFileName } from './api-bridge';

/** Larger than any page of results the renderer holds, small enough to write synchronously. */
export const MAX_DRAG_CSV_BYTES = 16 * 1024 * 1024;

/** Drag files older than this are removed on the next drag and at launch. */
const KEEP_MS = 24 * 60 * 60 * 1000;

export interface DragCsv {
  fileName: string;
  csv: string;
}

/** Checks what the renderer sent. Returns null for anything that is not a CSV text and a name. */
export function parseDragCsv(payload: unknown): DragCsv | null {
  const p = payload as Partial<DragCsv> | null;
  if (!p || typeof p !== 'object' || typeof p.csv !== 'string' || typeof p.fileName !== 'string') return null;
  if (p.csv.length === 0 || Buffer.byteLength(p.csv, 'utf8') > MAX_DRAG_CSV_BYTES) return null;
  return { fileName: safeCsvFileName(p.fileName), csv: p.csv };
}

/** Removes drag folders under `root` older than `maxAgeMs`. Never throws. */
export function sweepDragFiles(root: string, now = Date.now(), maxAgeMs = KEEP_MS): void {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    const dir = join(root, name);
    try {
      if (now - statSync(dir).mtimeMs > maxAgeMs) rmSync(dir, { recursive: true, force: true });
    } catch {
      // Another app may still hold the file open. Try again next time.
    }
  }
}

/** Writes the CSV to `<root>/<random>/<fileName>`, so the dropped file keeps a clean name. */
export function writeDragFile(root: string, drag: DragCsv): string {
  const dir = join(root, randomUUID());
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, drag.fileName);
  writeFileSync(filePath, drag.csv, 'utf8');
  return filePath;
}

let fallbackIcon: NativeImage | null = null;

/**
 * startDrag needs a non-empty icon. The OS icon for a .csv file is the honest
 * one; this square in the app's iris is the fallback when the OS has none.
 */
function dragFallbackIcon(): NativeImage {
  if (fallbackIcon) return fallbackIcon;
  const size = 32;
  const bitmap = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) bitmap.set([0xf0, 0x5a, 0x5b, 0xff], i * 4); // BGRA
  fallbackIcon = nativeImage.createFromBitmap(bitmap, { width: size, height: size });
  return fallbackIcon;
}

const iconCache = new Map<string, NativeImage>();

async function csvIcon(filePath: string): Promise<NativeImage> {
  const cached = iconCache.get('csv');
  if (cached) return cached;
  try {
    const icon = await app.getFileIcon(filePath, { size: 'normal' });
    if (!icon.isEmpty()) {
      iconCache.set('csv', icon);
      return icon;
    }
  } catch {
    // Fall through to the drawn icon.
  }
  return dragFallbackIcon();
}

/**
 * The renderer starts a drag of selected leads: main writes them to a temp
 * CSV and hands the OS a file drag, so they drop into Excel, Outlook, a CRM
 * in the browser or a folder.
 */
export function registerDragIpc(): void {
  const root = join(app.getPath('temp'), 'nvoke-drag');
  sweepDragFiles(root);
  // Look the icon up now, so the first drag needs no wait.
  try {
    void csvIcon(writeDragFile(root, { fileName: 'icon.csv', csv: '\r\n' }));
  } catch {
    // The first drag looks it up instead.
  }

  ipcMain.on(IpcChannel.startDragCsv, (event, payload: unknown) => {
    const drag = parseDragCsv(payload);
    if (!drag) return;
    sweepDragFiles(root);
    let filePath: string;
    try {
      filePath = writeDragFile(root, drag);
    } catch {
      return;
    }
    // Synchronous when the icon is cached, so the OS drag starts while the button is still down.
    const cached = iconCache.get('csv');
    if (cached) {
      event.sender.startDrag({ file: filePath, icon: cached });
      return;
    }
    void csvIcon(filePath).then((icon) => {
      if (!event.sender.isDestroyed()) event.sender.startDrag({ file: filePath, icon });
    });
  });
}
