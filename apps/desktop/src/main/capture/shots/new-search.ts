import type { CaptureStep } from '../kit';

export const newSearchShots: CaptureStep = async ({ win, js, go, sleep, shot }) => {
  await go('#/new?kind=local');
  await shot('04-new-local');
  await go('#/new?kind=web');
  await shot('05-new-web');
  await go('#/new?kind=launches');
  await shot('06-new-launches');
  await go('#/new?kind=domains');
  await shot('06a-new-list-empty');
  // Pasted for real, so the list reads back like it does for a user.
  await js(`document.querySelector('textarea#list')?.focus()`);
  await win.webContents.insertText(
    ['linear.app', 'https://www.figma.com/about', 'hello@raycast.com', 'Pleo', 'Too Good To Go', 'Novo Nordisk A/S', 'vercel.com, supabase.com'].join('\n'),
  );
  await sleep(300);
  await shot('06b-new-list');
};
