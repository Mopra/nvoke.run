import type { CaptureStep } from '../kit';

export const commandBarShots: CaptureStep = async ({ win, js, sleep, shot }) => {
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, metaKey: true, bubbles: true }))`);
  await sleep(500);
  await shot('03-command-bar');
  // Typed text also lists leads from every search in the local copy.
  await js(`document.querySelector('[aria-label="Search or jump to"]')?.focus()`);
  await win.webContents.insertText('info');
  await sleep(500);
  await shot('03-command-bar-leads');
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(400);
};
