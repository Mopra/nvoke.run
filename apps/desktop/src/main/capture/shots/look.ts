import type { CaptureStep } from '../kit';

/** The Field look on the main screens. Runs last and puts the look back to Calm. */
export const lookShots: CaptureStep = async ({ js, reload, go, until, sleep, shot, links }) => {
  await js(`localStorage.setItem('nvoke.look', 'field'); location.hash = '#/'`);
  await reload();
  await shot('30-field-searches');
  await go('#/new?kind=local');
  await shot('31-field-new');
  // The results step finds the finished search; when it did not run, look it up here.
  const done =
    links.done ??
    (await go('#/'),
    await js<string | null>(
      `document.querySelector('[data-search-status="done"]:not([data-search-kind="icp"])')?.getAttribute('href') ?? null`,
    ));
  if (done) {
    await go(done, 1600);
    await shot('32-field-results');
  }
  await go('#/account');
  await until('[data-local-mcp]');
  await sleep(300);
  await shot('33-field-account');
  await js(`localStorage.removeItem('nvoke.look'); location.hash = '#/'`);
  await reload();
};
