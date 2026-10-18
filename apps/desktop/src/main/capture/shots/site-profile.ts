import type { CaptureStep } from '../kit';

/** Clicks the first button whose text is exactly `label`. */
const click = (label: string): string =>
  `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})?.click()`;

/**
 * Start from your website: the empty step, reading, the suggestions, the
 * profile editor and an unreadable site. Starts from no profile each theme.
 */
export const siteProfileShots: CaptureStep = async ({ win, js, go, until, reload, sleep, shot }) => {
  await js(`localStorage.removeItem('nvoke.mock.site-profile'); location.hash = '#/new?kind=website'`);
  await reload();
  await until('input#website');
  await shot('03a-website-step');

  await js(`document.querySelector('input#website')?.focus()`);
  await win.webContents.insertText('brightlane.co');
  await js(click('Read my site'));
  await sleep(2600);
  await shot('03b-website-reading');
  await until('[data-suggestion]', 15_000);
  await sleep(700);
  await shot('03c-website-suggestions');

  await js(click('Edit'));
  await sleep(500);
  await shot('03d-website-edit');
  await js(click('Cancel'));
  await sleep(300);

  await js(click('Read another site'));
  await until('input#website');
  await js(`document.querySelector('input#website')?.focus()`);
  await win.webContents.insertText('brightlane.invalid');
  await js(click('Read my site'));
  await until('[role="alert"]', 15_000);
  await sleep(400);
  await shot('03e-website-error');
  await js(click('Back to your suggestions'));
  await go('#/');
};
