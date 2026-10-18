import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CaptureStep } from '../kit';

/** A CSV dragged over the window, then dropped, as the OS would do it. */
export const csvDropShots: CaptureStep = async ({ win, js, go, sleep, shot }) => {
  const csvPath = join(tmpdir(), 'nvoke-capture-prospects.csv');
  writeFileSync(
    csvPath,
    ['Company,Website,City', 'Linear,https://linear.app,Remote', 'Ramp,ramp.com,New York', 'Monzo,,London', 'Figma,figma.com,San Francisco'].join('\n'),
  );
  await go('#/');
  try {
    const dbg = win.webContents.debugger;
    if (!dbg.isAttached()) dbg.attach('1.3');
    const data = { items: [], files: [csvPath], dragOperationsMask: 1 };
    await dbg.sendCommand('Input.dispatchDragEvent', { type: 'dragEnter', x: 600, y: 400, data });
    await dbg.sendCommand('Input.dispatchDragEvent', { type: 'dragOver', x: 600, y: 400, data });
    await sleep(500);
    await shot('06c-file-drop-target');
    await dbg.sendCommand('Input.dispatchDragEvent', { type: 'drop', x: 600, y: 400, data });
    await sleep(900);
    await shot('06d-file-drop-dialog');
    await js(`[...document.querySelectorAll('button')].find((e) => /^Cancel$/.test(e.textContent))?.click()`);
    await sleep(400);
  } catch (err) {
    console.warn(`[capture] file drop failed: ${String(err)}`);
  }
};
