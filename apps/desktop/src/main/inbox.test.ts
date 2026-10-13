import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultInboxFolder,
  doneFolder,
  finishInboxFile,
  InboxWatcher,
  isAlreadyDone,
  isInboxName,
  scanInbox,
  StabilityTracker,
} from './inbox';

let root: string;
let inbox: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nvoke-inbox-'));
  inbox = join(root, 'nvoke', 'inbox');
  mkdirSync(inbox, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('paths', () => {
  it('puts done beside an inbox called inbox, inside any other folder', () => {
    expect(defaultInboxFolder('/docs')).toBe(join('/docs', 'nvoke', 'inbox'));
    expect(doneFolder(join('/docs', 'nvoke', 'inbox'))).toBe(join('/docs', 'nvoke', 'done'));
    expect(doneFolder(join('/work', 'leads'))).toBe(join('/work', 'leads', 'done'));
  });
});

describe('isInboxName', () => {
  it('takes tables and skips hidden files, locks, partial downloads and enriched copies', () => {
    expect(isInboxName('list.csv')).toBe(true);
    expect(isInboxName('List.TSV')).toBe(true);
    expect(isInboxName('notes.txt')).toBe(true);
    expect(isInboxName('list.csv.crdownload')).toBe(false);
    expect(isInboxName('.hidden.csv')).toBe(false);
    expect(isInboxName('~$list.csv')).toBe(false);
    expect(isInboxName('list.nvoke.csv')).toBe(false);
    expect(isInboxName('sheet.xlsx')).toBe(false);
  });
});

describe('StabilityTracker', () => {
  it('is ready on the second look that sees no change', () => {
    const t = new StabilityTracker();
    expect(t.observe('a', 10, 1)).toBe(false);
    expect(t.observe('a', 10, 1)).toBe(true);
    expect(t.observe('a', 20, 2)).toBe(false);
    expect(t.observe('a', 20, 2)).toBe(true);
  });
});

describe('finishInboxFile', () => {
  it('writes the copy to done and moves the original to originals', () => {
    const src = join(inbox, 'leads.csv');
    writeFileSync(src, 'domain\nlinear.app\n');
    const result = finishInboxFile(inbox, src, 'domain,email\nlinear.app,a@linear.app\n');
    expect(result).toEqual({ saved: true, filePath: join(root, 'nvoke', 'done', 'leads.nvoke.csv') });
    expect(existsSync(src)).toBe(false);
    expect(readFileSync(join(root, 'nvoke', 'done', 'originals', 'leads.csv'), 'utf8')).toBe('domain\nlinear.app\n');
    expect(isAlreadyDone(inbox, 'leads.csv')).toBe(true);
    expect(isAlreadyDone(inbox, 'other.csv')).toBe(false);
  });

  it('does not overwrite an earlier original', () => {
    const originals = join(root, 'nvoke', 'done', 'originals');
    mkdirSync(originals, { recursive: true });
    writeFileSync(join(originals, 'leads.csv'), 'old');
    const src = join(inbox, 'leads.csv');
    writeFileSync(src, 'new');
    finishInboxFile(inbox, src, 'x');
    expect(readFileSync(join(originals, 'leads (2).csv'), 'utf8')).toBe('new');
  });
});

describe('scanInbox', () => {
  it('lists table files and leaves the done folder alone', () => {
    writeFileSync(join(inbox, 'a.csv'), 'x');
    mkdirSync(join(inbox, 'done'));
    writeFileSync(join(inbox, 'done', 'b.csv'), 'x');
    expect(scanInbox(inbox).map((f) => f.name)).toEqual(['a.csv']);
  });
});

describe('InboxWatcher', () => {
  afterEach(() => vi.useRealTimers());

  function setup(signedIn: () => boolean = () => true) {
    vi.useFakeTimers();
    const sent: { id: string; fileName: string; text: string }[] = [];
    const notes: { title: string; body: string }[] = [];
    const watcher = new InboxWatcher({
      send: (f) => {
        sent.push(f);
        return true;
      },
      notify: (n) => notes.push(n),
      signedIn,
      reveal: () => undefined,
      focus: () => undefined,
    });
    watcher.rendererIsReady();
    return { watcher, sent, notes };
  }

  it('waits for a file to stop changing, then hands it over once', () => {
    const { watcher, sent } = setup();
    watcher.start(inbox);
    writeFileSync(join(inbox, 'a.csv'), 'domain\nlinear.app\n');
    vi.advanceTimersByTime(2000);
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(2000);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.fileName).toBe('a.csv');
    vi.advanceTimersByTime(10_000);
    expect(sent).toHaveLength(1);
    watcher.stop();
  });

  it('skips a file whose enriched copy is already in done', () => {
    mkdirSync(join(root, 'nvoke', 'done'), { recursive: true });
    writeFileSync(join(root, 'nvoke', 'done', 'a.nvoke.csv'), 'x');
    const { watcher, sent } = setup();
    watcher.start(inbox);
    writeFileSync(join(inbox, 'a.csv'), 'domain\nlinear.app\n');
    vi.advanceTimersByTime(10_000);
    expect(sent).toHaveLength(0);
    watcher.stop();
  });

  it('finishes a file and notifies, and rejects an id it never handed out', () => {
    const { watcher, sent, notes } = setup();
    watcher.start(inbox);
    writeFileSync(join(inbox, 'a.csv'), 'domain\nlinear.app\n');
    vi.advanceTimersByTime(4000);
    expect(watcher.done({ id: 'nope', csv: 'x', valid: 1, total: 1 }).saved).toBe(false);
    const result = watcher.done({ id: sent[0]?.id, csv: 'domain,email\n', valid: 3, total: 5 });
    expect(result.saved).toBe(true);
    expect(notes[0]?.body).toContain('3 of 5');
    expect(existsSync(join(inbox, 'a.csv'))).toBe(false);
    watcher.stop();
  });

  it('keeps a failed file in place and notifies about quota', () => {
    const { watcher, sent, notes } = setup();
    watcher.start(inbox);
    writeFileSync(join(inbox, 'a.csv'), 'domain\nlinear.app\n');
    vi.advanceTimersByTime(4000);
    watcher.failed({ id: sent[0]?.id, reason: 'quota' });
    expect(notes[0]?.title).toBe('Out of verified emails');
    expect(existsSync(join(inbox, 'a.csv'))).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(sent).toHaveLength(1);
    watcher.stop();
  });

  it('holds files while signed out and takes them after retry', () => {
    let signedIn = false;
    const { watcher, sent, notes } = setup(() => signedIn);
    watcher.start(inbox);
    writeFileSync(join(inbox, 'a.csv'), 'domain\nlinear.app\n');
    vi.advanceTimersByTime(4000);
    expect(sent).toHaveLength(0);
    expect(notes[0]?.title).toBe('Sign in to enrich');
    signedIn = true;
    watcher.retry();
    vi.advanceTimersByTime(2000);
    expect(sent).toHaveLength(1);
    watcher.stop();
  });
});
