import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ release: '24.0.0', error: null as Error | null, stdout: '[]' }));

vi.mock('node:child_process', () => ({
  execFile: (_c: string, _a: string[], _o: unknown, cb: (e: Error | null, out: string, err: string) => void) => {
    if (state.error) cb(state.error, '', (state.error as { stderr?: string }).stderr ?? '');
    else cb(null, state.stdout, '');
  },
}));
vi.mock('node:fs/promises', () => ({ writeFile: async () => {}, rm: async () => {} }));
vi.mock('node:os', () => ({ release: () => state.release, tmpdir: () => '/tmp' }));

import { OcrUnavailable, recognize } from './ocr';

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;

function onMac() {
  Object.defineProperty(process, 'platform', { value: 'darwin' });
}

afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  vi.restoreAllMocks();
  state.error = null;
});

describe('visionOcr failures', () => {
  it('blames the OS only below macOS 10.15', async () => {
    onMac();
    state.release = '18.7.0';
    state.error = Object.assign(new Error('failed'), { stderr: 'whatever' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recognize(Buffer.alloc(1))).rejects.toThrow('needs macOS 10.15');
  });

  it('shows the first line of osascript stderr on a newer macOS', async () => {
    onMac();
    state.release = '24.0.0';
    state.error = Object.assign(new Error('Command failed'), { stderr: 'script.js: SyntaxError: bad token\nsecond line\n' });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = await recognize(Buffer.alloc(1)).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(OcrUnavailable);
    expect((failure as Error).message).toBe('Text recognition failed: script.js: SyntaxError: bad token');
    expect(log).toHaveBeenCalled();
  });
});
