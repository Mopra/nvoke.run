import type { Director } from './director';

/**
 * One film scene: `setup` brings the app to its first frame off camera, `act`
 * plays it on camera. Positions are window DIPs (the window is 1200x675).
 */
export interface Scene {
  setup(d: Director): Promise<void>;
  act(d: Director): Promise<void>;
}

/** Fresh route with a clean slate: no site profile, the given hash, reloaded. */
async function fresh(d: Director, hash: string): Promise<void> {
  await d.js(`localStorage.removeItem('nvoke.mock.site-profile'); location.hash = ${JSON.stringify(hash)}`);
  d.win.webContents.reload();
  await new Promise<void>((r) => d.win.webContents.once('did-finish-load', () => r()));
  await d.hold(1600);
}

/**
 * The journey, in one continuous take: paste the site, read it, start the
 * first suggestion, watch the search run and finish, draft openers. The film
 * cuts it into its scenes by the marks.
 */
const journey: Scene = {
  async setup(d) {
    await fresh(d, '#/new?kind=website');
    await d.until('input#website');
    d.place(900, 520);
  },
  async act(d) {
    await d.hold(800);
    d.mark('paste');
    await d.click('input#website');
    await d.hold(250);
    await d.type('brightlane.co');
    await d.hold(450);
    await d.click(await d.byText('Read my site'));
    d.mark('reading');
    await d.move({ x: 860, y: 470 }, 900);
    await d.until('[data-suggestion]', 20_000);
    d.mark('suggestions');
    await d.hold(400);
    await d.rect('profile', 'main');
    await d.rect('suggestion', '[data-suggestion]');
    await d.hold(1600);
    await d.move('[data-suggestion]', 700);
    await d.hold(500);
    await d.click('[data-suggestion] button');
    d.mark('started');

    await d.until('[data-company-row]', 30_000);
    d.mark('first-row');
    await d.move({ x: 1060, y: 610 }, 900);
    await d.js(`[...document.querySelectorAll('div')].find((e) => e.textContent.trim() === 'Websites crawled')?.closest('.grid')?.setAttribute('data-film', 'counters')`);
    await d.rect('counters', '[data-film="counters"]');
    // Running: counters climb, rows land. Wait for the end.
    await waitDone(d);
    d.mark('done');
    await d.hold(1200);

    await d.click('[aria-label="More actions"]');
    await d.hold(350);
    await d.click(await d.byText('Draft openers'));
    d.mark('drafting');
    await d.move({ x: 700, y: 430 }, 900);
    await d.hold(4500);
    d.mark('openers');
    await d.rect('first-company', '[data-company-row]');
    await d.hold(1500);
    await d.click(await d.byText('Export CSV', 'button'));
    d.mark('export');
    await d.hold(2500);
  },
};

/** Until the results header says Done. */
async function waitDone(d: Director): Promise<void> {
  const end = Date.now() + 90_000;
  while (Date.now() < end) {
    const done = await d.js<boolean>(`(document.querySelector('section h1')?.nextElementSibling?.textContent.trim() ?? '').startsWith('Done')`);
    if (done) return;
    await d.hold(200);
  }
  const status = await d.js<string>(`document.querySelector('section h1')?.parentElement?.textContent.slice(0, 200) ?? location.hash`);
  throw new Error(`[film] the search never finished: ${status}`);
}

export const SCENES: Record<string, Scene> = { journey };
