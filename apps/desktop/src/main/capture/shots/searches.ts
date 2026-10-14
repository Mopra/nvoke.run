import type { CaptureStep } from '../kit';

/** Signed out, then the searches list. */
export const searchesShots: CaptureStep = async ({ js, reload, shot }) => {
  await js(`localStorage.setItem('nvoke.mock.auth', 'signed-out')`);
  await reload();
  await shot('01-signed-out');

  await js(`localStorage.setItem('nvoke.mock.auth', 'signed-in'); location.hash = '#/'`);
  await reload();
  await shot('02-searches');
};
