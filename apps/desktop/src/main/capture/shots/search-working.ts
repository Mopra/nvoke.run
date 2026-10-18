import type { CaptureStep } from '../kit';

/** A plain words search just started: the sonar and the steps in place of the empty list. */
export const searchWorkingShots: CaptureStep = async ({ win, js, go, sleep, shot }) => {
  await go('#/new');
  await js(`document.querySelector('textarea')?.focus()`);
  await win.webContents.insertText('Shopify brands doing 1 to 10 million a year in sales');
  await sleep(200);
  await js(`document.querySelector('form')?.requestSubmit()`);
  await sleep(700);
  await shot('07a-results-working');
};
