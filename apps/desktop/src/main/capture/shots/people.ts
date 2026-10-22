import type { CaptureStep } from '../kit';

/** Clicks the first button whose text is exactly `label`. */
const click = (label: string): string =>
  `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})?.click()`;

/**
 * People first (docs/desktop/people.md): Sonar's form, the island
 * with a plain words search's stage note, its results while it runs and once
 * it ended, and the people filters.
 */
export const peopleShots: CaptureStep = async ({ win, js, go, until, sleep, shot }) => {
  await go('#/new');
  await until('textarea#icp-description');
  await shot('04a-new-describe');
  await js(`document.querySelector('textarea#icp-description')?.focus()`);
  await win.webContents.insertText('Marketing agencies with 5 to 30 people that build websites for clients');
  await sleep(300);
  await shot('04b-new-describe-filled');
  // The country panel, searched, then the pick lands as a chip.
  await js(`document.querySelector('#icp-countries')?.click()`);
  await until('[aria-label="Search countries"]');
  await js(`document.querySelector('[aria-label="Search countries"]')?.focus()`);
  await win.webContents.insertText('neth');
  await sleep(300);
  await shot('04c-new-describe-countries');
  await js(`document.querySelector('[aria-label="Search countries"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  await sleep(400);
  await shot('04d-new-describe-details');

  await go('#/', 1200);
  await shot('17-island-stage');
  const links = await js<{ running: string | null; done: string | null }>(`(() => {
    const rows = [...document.querySelectorAll('[data-search-kind="icp"]')];
    const pick = (s) => rows.find((r) => r.getAttribute('data-search-status') === s)?.getAttribute('href') ?? null;
    return { running: pick('running') ?? pick('queued'), done: pick('done') };
  })()`);
  if (links.running) {
    await go(links.running, 1600);
    await shot('17a-people-running');
  }
  if (!links.done) return;
  await go(links.done, 1600);
  await until('[data-person]');
  await shot('17b-people-done');
  await js(click('Decision makers'));
  await sleep(700);
  await shot('17c-people-decision-makers');
  await js(click('Decision makers'));
  // Shared inboxes are off on the demo search: the pill raises the card that switches them on.
  await js(click('Shared inboxes'));
  await sleep(700);
  await shot('17d-people-inboxes');
  await js(click('Check shared inboxes for this search'));
  await sleep(900);
  await shot('17e-people-inboxes-checking');
  await sleep(5000);
  await shot('17f-people-inboxes-settled');
  await js(click('Shared inboxes'));
  await sleep(300);
};
