import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { enrichedPath, MAX_ENRICHED_BYTES } from './enriched-file';
import type { InboxDone, InboxFailed, InboxFailure, InboxFile, InboxResult } from '../ipc/contract';

/**
 * The watched inbox folder. A table file that lands there and stops growing
 * is read by main and handed to the renderer, which starts a `domains` search
 * like the file drop does. When the search is done main writes the enriched
 * copy to the done folder and moves the original to done/originals.
 */

const TABLE_EXTENSIONS = new Set(['.csv', '.tsv', '.txt']);

/** The same cap as a dropped file (lib/table.ts MAX_TABLE_BYTES). */
export const MAX_INBOX_BYTES = 5 * 1024 * 1024;

/** How often the folder is looked at. A file is picked up on the second look that sees it unchanged. */
export const POLL_MS = 2000;

/** `Documents/nvoke/inbox`, next to the done folder. */
export function defaultInboxFolder(documents: string): string {
  return join(documents, 'nvoke', 'inbox');
}

/**
 * Where finished files go: `nvoke/done` beside an inbox called `inbox` (the
 * default), a `done` folder inside any other folder the user picked.
 */
export function doneFolder(inbox: string): string {
  return basename(inbox).toLowerCase() === 'inbox' ? join(dirname(inbox), 'done') : join(inbox, 'done');
}

export function originalsFolder(inbox: string): string {
  return join(doneFolder(inbox), 'originals');
}

/** Whether a file name is one the inbox picks up: a CSV, TSV or TXT that is not hidden, an editor lock or an enriched copy. */
export function isInboxName(name: string): boolean {
  if (name.startsWith('.') || name.startsWith('~$')) return false;
  const ext = extname(name).toLowerCase();
  if (!TABLE_EXTENSIONS.has(ext)) return false;
  return !name.toLowerCase().endsWith('.nvoke.csv');
}

/** Table files directly in the inbox, with their size and modified time. Subfolders (done) are not entered. */
export function scanInbox(inbox: string): { name: string; path: string; size: number; mtimeMs: number }[] {
  const out: { name: string; path: string; size: number; mtimeMs: number }[] = [];
  for (const entry of readdirSync(inbox, { withFileTypes: true })) {
    if (!entry.isFile() || !isInboxName(entry.name)) continue;
    const path = join(inbox, entry.name);
    try {
      const stat = statSync(path);
      out.push({ name: entry.name, path, size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {
      // Gone between the listing and the stat.
    }
  }
  return out;
}

/** True when the enriched copy of this file is already in the done folder. */
export function isAlreadyDone(inbox: string, name: string): boolean {
  return existsSync(enrichedPath(join(doneFolder(inbox), name)));
}

/**
 * A file is ready once two looks in a row saw the same size and modified
 * time, so a copy or download in progress is left alone.
 */
export class StabilityTracker {
  private seen = new Map<string, string>();

  /** Records a look. True when it matches the one before. */
  observe(path: string, size: number, mtimeMs: number): boolean {
    const key = `${size}:${mtimeMs}`;
    const same = this.seen.get(path) === key;
    this.seen.set(path, key);
    return same;
  }

  /** Forgets files that are no longer in the folder. */
  keepOnly(paths: Set<string>): void {
    for (const path of this.seen.keys()) if (!paths.has(path)) this.seen.delete(path);
  }
}

function freeName(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) return name;
  const ext = extname(name);
  const stem = basename(name, ext);
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!existsSync(join(dir, candidate))) return candidate;
  }
}

function moveFile(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch {
    // Another drive, or a lock that copy gets around.
    copyFileSync(from, to);
    unlinkSync(from);
  }
}

/**
 * Writes the enriched copy to the done folder and moves the original to
 * done/originals, renaming it when a file of that name is already there.
 * The copy goes first: if anything fails the original is still in the inbox.
 */
export function finishInboxFile(inbox: string, sourcePath: string, csv: string): InboxResult {
  if (csv.length === 0 || Buffer.byteLength(csv, 'utf8') > MAX_ENRICHED_BYTES) return { saved: false, error: 'The result is empty or too big.' };
  const originals = originalsFolder(inbox);
  const target = enrichedPath(join(doneFolder(inbox), basename(sourcePath)));
  try {
    mkdirSync(originals, { recursive: true });
    writeFileSync(target, csv, 'utf8');
    moveFile(sourcePath, join(originals, freeName(originals, basename(sourcePath))));
  } catch {
    return { saved: false, error: 'Couldn’t write to the done folder. Is it read only?' };
  }
  return { saved: true, filePath: target };
}

/** The notification title and body for a file that could not be enriched. */
export function failureText(reason: InboxFailure, fileName: string): { title: string; body: string } {
  switch (reason) {
    case 'quota':
      return { title: 'Out of verified emails', body: `${fileName} wasn’t enriched. Your allowance for this month is used up.` };
    case 'signed-out':
      return { title: 'Sign in to enrich', body: `${fileName} is waiting in the inbox. Open nvoke and sign in.` };
    case 'empty':
      return { title: 'Nothing to enrich', body: `${fileName} has no rows with a domain or company name.` };
    default:
      return { title: 'Couldn’t enrich a file', body: `${fileName} stays in the inbox. Open nvoke to see why.` };
  }
}

export interface InboxDeps {
  /** Hands a file to the renderer. False when no window can take it yet. */
  send(file: InboxFile): boolean;
  notify(note: { title: string; body: string; onClick?: () => void }): void;
  /** Whether anyone is signed in. Without it a file waits and the user is told. */
  signedIn(): boolean;
  /** Shows a finished file in the file manager. */
  reveal(filePath: string): void;
  /** Brings the main window forward. */
  focus(): void;
}

interface Pending {
  path: string;
  name: string;
  mtimeMs: number;
}

export class InboxWatcher {
  private folder: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly stable = new StabilityTracker();
  /** Files being enriched, by id. */
  private readonly active = new Map<string, Pending>();
  /** Paths already taken, with the modified time they had. A changed file is looked at again. */
  private readonly handled = new Map<string, number>();
  /** Paths that wait for a sign-in. They are not retried until `retry`. */
  private readonly waiting = new Set<string>();
  private queue: InboxFile[] = [];
  private rendererReady = false;
  /** Why the folder can not be watched. Null when it can. */
  error: string | null = null;

  constructor(private readonly deps: InboxDeps) {}

  get watching(): string | null {
    return this.folder;
  }

  /** Watches `folder`, creating it. Replaces any folder watched before. */
  start(folder: string): void {
    this.stop();
    try {
      mkdirSync(folder, { recursive: true });
      this.error = null;
    } catch {
      this.error = 'Couldn’t create the inbox folder.';
      return;
    }
    this.folder = folder;
    this.timer = setInterval(() => this.poll(), POLL_MS);
    this.poll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.folder = null;
    this.error = null;
    this.active.clear();
    this.handled.clear();
    this.waiting.clear();
    this.queue = [];
  }

  /** The renderer mounted its listener: send what was waiting. */
  rendererIsReady(): void {
    this.rendererReady = true;
    const waiting = this.queue;
    this.queue = [];
    for (const file of waiting) this.deliver(file);
  }

  /** Files that stayed because nobody was signed in are looked at again. */
  retry(): void {
    for (const path of this.waiting) this.handled.delete(path);
    this.waiting.clear();
  }

  private deliver(file: InboxFile): void {
    if (!this.rendererReady || !this.deps.send(file)) this.queue.push(file);
  }

  private poll(): void {
    const folder = this.folder;
    if (!folder) return;
    let files: ReturnType<typeof scanInbox>;
    try {
      files = scanInbox(folder);
      this.error = null;
    } catch {
      this.error = 'Can’t read the inbox folder.';
      return;
    }
    this.stable.keepOnly(new Set(files.map((f) => f.path)));
    for (const file of files) {
      const steady = this.stable.observe(file.path, file.size, file.mtimeMs);
      if (!steady || file.size === 0) continue;
      if (this.handled.get(file.path) === file.mtimeMs) continue;
      if ([...this.active.values()].some((p) => p.path === file.path)) continue;
      if (isAlreadyDone(folder, file.name)) {
        this.handled.set(file.path, file.mtimeMs);
        continue;
      }
      this.take(file);
    }
  }

  private take(file: { name: string; path: string; size: number; mtimeMs: number }): void {
    this.handled.set(file.path, file.mtimeMs);
    if (file.size > MAX_INBOX_BYTES) {
      this.deps.notify({ title: 'That file is too big', body: `${file.name} is over 5 MB. Split it and try again.` });
      return;
    }
    if (!this.deps.signedIn()) {
      this.waiting.add(file.path);
      const { title, body } = failureText('signed-out', file.name);
      this.deps.notify({ title, body, onClick: () => this.deps.focus() });
      return;
    }
    let text: string;
    try {
      // Still locked by the app that writes it: the next look tries again.
      text = readFileSync(file.path, 'utf8');
    } catch {
      this.handled.delete(file.path);
      return;
    }
    const id = randomUUID();
    this.active.set(id, { path: file.path, name: file.name, mtimeMs: file.mtimeMs });
    this.deliver({ id, fileName: file.name, text: (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) });
  }

  /** The renderer finished an enrichment: write the copy and move the original. */
  done(payload: unknown): InboxResult {
    const p = payload as Partial<InboxDone> | null;
    const job = p && typeof p === 'object' && typeof p.id === 'string' ? this.active.get(p.id) : undefined;
    if (!p || !job || !this.folder || typeof p.csv !== 'string') return { saved: false, error: 'That file is not waiting.' };
    this.active.delete(p.id as string);
    const result = finishInboxFile(this.folder, job.path, p.csv);
    if (!result.saved) {
      this.deps.notify({ title: 'Couldn’t save the enriched file', body: `${job.name}: ${result.error}` });
      return result;
    }
    const valid = Number.isFinite(p.valid) ? Math.max(0, Math.trunc(p.valid as number)) : 0;
    const total = Number.isFinite(p.total) ? Math.max(0, Math.trunc(p.total as number)) : 0;
    const filePath = result.filePath;
    this.deps.notify({
      title: `${job.name} is enriched`,
      body: `${valid} of ${total} companies with a valid address. Click to show the file.`,
      onClick: () => this.deps.reveal(filePath),
    });
    return result;
  }

  /** The renderer could not enrich a file: tell the user and leave the file alone. */
  failed(payload: unknown): void {
    const p = payload as Partial<InboxFailed> | null;
    const job = p && typeof p === 'object' && typeof p.id === 'string' ? this.active.get(p.id) : undefined;
    if (!p || !job) return;
    this.active.delete(p.id as string);
    const reason: InboxFailure = p.reason === 'quota' || p.reason === 'signed-out' || p.reason === 'empty' ? p.reason : 'error';
    if (reason === 'signed-out') this.waiting.add(job.path);
    const { title, body } = failureText(reason, job.name);
    this.deps.notify({ title, body, onClick: () => this.deps.focus() });
  }
}
