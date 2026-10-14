import type { CaptureStep } from '../kit';

/** Offline: the app runs on the local copy of searches and companies. */
export const localCopyShots: CaptureStep = async ({ links, js, go, reload, shot }) => {
  if (!links.done) return;
  await js(`localStorage.setItem('nvoke.mock.offline', '1'); location.hash = '#/'`);
  await reload();
  await shot('11c-offline-searches');
  await go(links.done, 1600);
  await shot('11d-offline-results');
  await js(`localStorage.removeItem('nvoke.mock.offline')`);
  await reload();
};
