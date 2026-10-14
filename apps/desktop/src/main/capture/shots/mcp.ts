import type { CaptureStep } from '../kit';

/** Use nvoke in Claude and Cursor, on Account. */
export const mcpShots: CaptureStep = async ({ js, sleep, shot }) => {
  // Clear of the top fade, so the heading reads.
  await js(`document.querySelector('[data-local-mcp]')?.scrollIntoView({ block: 'start', behavior: 'instant' }); document.querySelector('main')?.scrollBy({ top: -56, behavior: 'instant' })`);
  await sleep(900);
  await shot('12b-claude');
};
