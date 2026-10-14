import { app } from 'electron';
import { IpcChannel, type UpdateState, type WhatsNew } from '../../../ipc/contract';
import changelog from '../../../../CHANGELOG.md?raw';
import { parseChangelog } from '../../changelog';
import type { CaptureStep } from '../kit';

/** The What's new card after an update, and the header's restart button for a downloaded one. */
export const updatesShots: CaptureStep = async ({ win, go, until, js, sleep, shot }) => {
  await go('#/searches');
  const notes = parseChangelog(changelog).slice(0, 1);
  const whatsNew: WhatsNew = { version: notes[0]?.version ?? app.getVersion(), notes };
  win.webContents.send(IpcChannel.updatesWhatsNew, whatsNew);
  await until('[data-whats-new]');
  await sleep(600);
  await shot('20-whats-new');

  // Close it the way the user would. In a capture run main has no pending card, so nothing is saved.
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  const ready: UpdateState = { status: 'ready', current: app.getVersion(), version: '9.9.9', percent: null, checkedAt: Date.now(), error: null };
  win.webContents.send(IpcChannel.updatesChanged, ready);
  await until('[data-update-button]');
  await sleep(400);
  await shot('20b-update-ready');

  win.webContents.send(IpcChannel.updatesChanged, { ...ready, status: 'unsupported', version: null });
  await sleep(200);
};
