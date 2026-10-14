import type { CaptureStep } from '../kit';

/** API keys on Account: the list, a new key and the key shown once. */
export const apiKeysShots: CaptureStep = async ({ win, js, sleep, shot }) => {
  await js(`document.querySelector('[data-api-keys]')?.scrollIntoView({ block: 'start' })`);
  await sleep(500);
  await shot('13-api-keys');
  await js(`[...document.querySelectorAll('button')].find((e) => /New key/.test(e.textContent))?.click()`);
  await sleep(500);
  await shot('14-new-key');
  // Type for real, so React sees the change like a keystroke.
  await js(`document.querySelector('input[aria-label="Key name"]')?.focus()`);
  await win.webContents.insertText('Zapier');
  await sleep(200);
  await js(`[...document.querySelectorAll('button')].find((e) => /Create key/.test(e.textContent))?.click()`);
  await sleep(900);
  await shot('15-key-created');
  await js(`[...document.querySelectorAll('button')].find((e) => /^Done$/.test(e.textContent))?.click()`);
  await sleep(400);
};
