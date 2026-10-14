import type { CaptureStep } from '../kit';

export const accountShots: CaptureStep = async ({ go, until, sleep, shot }) => {
  await go('#/account');
  // The Claude section waits on main for its setup, so the page is whole once it shows.
  await until('[data-local-mcp]');
  await sleep(300);
  await shot('12-account');
};
