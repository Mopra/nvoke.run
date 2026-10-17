import type { CaptureStep } from '../kit';

/** A running search and a finished one, read from the searches list. Later steps use `links`. */
export const resultsShots: CaptureStep = async (kit) => {
  const { js, go, sleep, shot } = kit;
  await go('#/');
  const links = await js<{ running: string | null; done: string | null }>(`(() => {
    const rows = [...document.querySelectorAll('[data-search-status]')];
    const pick = (s) => rows.find((r) => r.getAttribute('data-search-status') === s)?.getAttribute('href') ?? null;
    return { running: pick('running'), done: pick('done') };
  })()`);
  kit.links = links;
  if (links.running) {
    await go(links.running, 1600);
    await shot('07-results-running');
  }
  if (!links.done) return;
  await go(links.done, 1600);
  await shot('08-results-done');

  // Draft openers for the whole search: queued at first, drafted a few seconds later.
  await js(`(() => {
    const t = document.querySelector('[aria-label="More actions"]');
    t?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
  })()`);
  await sleep(400);
  await js(`[...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent?.trim() === 'Draft openers')?.click()`);
  await sleep(1200);
  await shot('08c-openers-drafting');
  await sleep(6000);
  await shot('08d-openers-done');
  await sleep(2000);

  // Select a range of rows, as a click and a shift click would.
  await js(`(() => {
    const rows = document.querySelectorAll('[data-company-row]');
    rows[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    rows[3]?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  })()`);
  await sleep(600);
  await shot('08b-results-selected');
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);

  await js(`document.querySelector('[data-copy-email]')?.click()`);
  await sleep(600);
  await shot('09-toast');
  await sleep(3500);

  await js(`(() => {
    const t = document.querySelector('[aria-label="More actions"]');
    t?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
  })()`);
  await sleep(400);
  await shot('10-menu');
  await js(`[...document.querySelectorAll('[role="menuitem"]')].find((e) => /Delete/.test(e.textContent))?.click()`);
  await sleep(500);
  await shot('11-delete-dialog');
  await js(`document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(400);
  await js(`[...document.querySelectorAll('button')].find((e) => /Keep it/.test(e.textContent))?.click()`);
  await sleep(400);
  await js(`localStorage.removeItem('nvoke.exportNotice.dismissed')`);
  await js(`[...document.querySelectorAll('button')].find((e) => /Export CSV/.test(e.textContent))?.click()`);
  await sleep(500);
  await shot('11b-export-notice');
  await js(`document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(400);
};
