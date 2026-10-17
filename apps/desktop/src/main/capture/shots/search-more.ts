import type { CaptureStep } from '../kit';

/**
 * Search more on a finished search: the sentence in place of the numbers,
 * then the same list running again with its runs under the title. Last in
 * the list, since it sends the demo search running again.
 */
export const searchMoreShots: CaptureStep = async (kit) => {
  const { js, go, sleep, shot } = kit;
  if (!kit.links.done) return;
  await go(kit.links.done, 1600);
  await js(`[...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Search more')?.click()`);
  await sleep(700);
  await shot('08e-search-more');
  await js(`document.querySelector('[data-search-more] button[type="submit"]')?.click()`);
  await sleep(6000);
  await shot('08f-search-more-running');
};
