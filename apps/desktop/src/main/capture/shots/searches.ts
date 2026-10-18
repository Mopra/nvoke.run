import type { CaptureStep } from '../kit';

/** The first launch's welcome, signed out after that, then the searches list. */
export const searchesShots: CaptureStep = async ({ js, reload, shot }) => {
  await js(`localStorage.setItem('nvoke.mock.auth', 'signed-out'); localStorage.removeItem('nvoke.welcomed')`);
  await reload();
  await shot('00-welcome');

  await js(`localStorage.setItem('nvoke.welcomed', '1')`);
  await reload();
  await shot('01-signed-out');

  await js(`localStorage.setItem('nvoke.mock.auth', 'signed-in'); location.hash = '#/'`);
  await reload();
  await shot('02-searches');
};
