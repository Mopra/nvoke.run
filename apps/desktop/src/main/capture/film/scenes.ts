import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clipboard } from 'electron';
import { extractCompanies } from '../../grab-extract';
import { waitForLoad } from '../kit';
import type { Director } from './director';
import { physical } from './place';
import { ARTICLE_BRANDS, articlePage, brandPage } from './stage';

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
  // The export notice is shown once per user; the film's user has read it.
  await d.js(
    `localStorage.removeItem('nvoke.mock.site-profile'); localStorage.setItem('nvoke.exportNotice.dismissed', '1'); location.hash = ${JSON.stringify(hash)}`,
  );
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
    await d.rect('siteField', 'input#website');
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
    // Straight to Start: resting on a title raises its native tooltip.
    await d.click('[data-suggestion] button', { rest: 500 });
    d.mark('started');

    await d.until('[data-company-row]', 30_000);
    d.mark('first-row');
    await d.rect('rows', '[data-company-row]');
    await d.move({ x: 1060, y: 610 }, 900);
    await d.rect('counters', '[data-search-display] dl');
    // Running: counters climb, rows land. Wait for the end.
    await waitDone(d);
    d.mark('done');
    await d.hold(1200);

    await d.click('[aria-label="More actions"]');
    await d.hold(350);
    await d.click(await d.byText('Draft openers'));
    d.mark('drafting');
    await d.move({ x: 700, y: 430 }, 900);
    // The device's head takes the top of the window: scroll the companies up to where the openers land.
    await d.scroll(320, 900);
    await d.hold(3600);
    d.mark('openers');
    await d.rect('first-company', '[data-company-row]');
    await d.rect('personRow', '[data-company-row] [data-person]');
    await d.until('[data-company-row] [data-opener="done"]', 10_000);
    await d.rect('opener', '[data-company-row] [data-opener="done"]');
    await d.hold(1500);
    const exportButton = await d.byText('Export CSV', 'button');
    await d.rect('exportButton', exportButton);
    await d.click(exportButton);
    d.mark('export');
    await d.hold(4500);
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

/** Opens the film's finished plain words search, the one the montage shows off. */
async function openHero(d: Director): Promise<void> {
  await fresh(d, '#/');
  await d.until('[data-search-kind="icp"][data-search-status="done"]');
  const href = await d.js<string>(`document.querySelector('[data-search-kind="icp"][data-search-status="done"]').getAttribute('href')`);
  await d.js(`location.hash = ${JSON.stringify(href)}`);
  await d.until('[data-company-row]');
  await d.hold(900);
}

/** Ctrl K, then a name: the command bar finds people across every search. */
const command: Scene = {
  async setup(d) {
    await openHero(d);
    d.place(1000, 560);
  },
  async act(d) {
    await d.hold(500);
    await d.key('K', ['control']);
    await d.hold(450);
    // The bar and its first rows, around the field.
    const field = await d.box('[aria-label="Search or jump to"]');
    d.log.rects['commandBar'] = { x: Math.round((field.x - 24) * 2), y: Math.round((field.y - 20) * 2), w: Math.round((field.w + 48) * 2), h: Math.round((field.h + 110) * 2) };
    await d.type('hannah', 11);
    await d.hold(2200);
  },
};

/** Decision makers only, one click. */
const people: Scene = {
  async setup(d) {
    await openHero(d);
    d.place(1050, 520);
  },
  async act(d) {
    await d.hold(300);
    await d.click(await d.byText('Decision makers'), { rest: 200 });
    await d.hold(900);
    await d.rect('personRow', '[data-person]');
    await d.move({ x: 760, y: 420 }, 700);
    await d.scroll(260, 1100);
    await d.hold(900);
  },
};

/** Keeps finding new leads: the switch goes on. */
const ongoing: Scene = {
  async setup(d) {
    await openHero(d);
    d.place(700, 520);
  },
  async act(d) {
    await d.hold(300);
    await d.rect('ongoing', '[role="switch"]');
    await d.click('[role="switch"]', { rest: 250 });
    await d.hold(2600);
  },
};

/** A CSV dropped on the window becomes a search. */
const drop: Scene = {
  async setup(d) {
    await fresh(d, '#/');
    d.place(1100, 600);
  },
  async act(d) {
    const csvPath = join(tmpdir(), 'brands-to-check.csv');
    writeFileSync(
      csvPath,
      ['Company,Website,City', 'Hollow & Pine,hollowandpine.co.uk,Bristol', 'Field Day Coffee,fielddaycoffee.co.uk,Leeds', 'Kestrel Cycling,kestrelcycling.co.uk,Manchester'].join('\n'),
    );
    const dbg = d.win.webContents.debugger;
    if (!dbg.isAttached()) dbg.attach('1.3');
    const data = { items: [], files: [csvPath], dragOperationsMask: 1 };
    await d.hold(300);
    await d.move({ x: 620, y: 360 }, 700);
    await dbg.sendCommand('Input.dispatchDragEvent', { type: 'dragEnter', x: 620, y: 360, data });
    await dbg.sendCommand('Input.dispatchDragEvent', { type: 'dragOver', x: 620, y: 360, data });
    d.mark('over');
    await d.hold(1100);
    await dbg.sendCommand('Input.dispatchDragEvent', { type: 'drop', x: 620, y: 360, data });
    d.mark('dropped');
    await d.hold(2200);
    dbg.detach();
  },
};

/** nvoke in Claude and Cursor, from Account. */
const agents: Scene = {
  async setup(d) {
    await fresh(d, '#/account');
    await d.until('[data-local-mcp]');
    await d.js(`document.querySelector('[data-local-mcp]')?.scrollIntoView({ block: 'start', behavior: 'instant' }); document.querySelector('main')?.scrollBy({ top: -56, behavior: 'instant' })`);
    // The setup lines hold this computer's paths: soften them to texture.
    await d.js(`(() => { const st = document.createElement('style'); st.textContent = '[data-local-mcp] pre, [data-local-mcp] code, [data-local-mcp] .font-mono { filter: blur(5px); }'; document.head.append(st); })()`);
    await d.hold(500);
    d.place(1000, 600);
  },
  async act(d) {
    await d.hold(300);
    // The heading and the Claude Desktop row only: below them sit setup lines with this computer's paths.
    const button = await d.byText('Add to Claude Desktop');
    const top = await d.box('[data-local-mcp]');
    const end = await d.box(button);
    const s = 2;
    d.log.rects['mcpPanel'] = { x: Math.round(top.x * s), y: Math.round(top.y * s), w: Math.round(top.w * s), h: Math.round((end.y + end.h - top.y) * s) };
    await d.move(button, 900);
    await d.hold(2400);
  },
};

/** Over a brand's own site: the quick window offers its contacts from the copied domain. */
const quick: Scene = {
  async setup(d) {
    await d.set.stage(brandPage());
    saved = await clipboard.readText();
    await clipboard.writeText('hollowandpine.co.uk');
    // Load the quick window off camera: a window still loading misses what the clipboard holds.
    const q = d.set.quick;
    q?.show();
    if (q?.window) await waitForLoad(q.window);
    await d.hold(800);
    q?.hide(false);
    await d.hold(300);
  },
  async act(d) {
    const q = d.set.quick;
    if (!q) throw new Error('[film] no quick window');
    await d.hold(900);
    q.show();
    d.set.raiseQuick();
    d.mark('shown');
    await d.hold(1300);
    if (q.window) {
      d.rectAt('quickWindow', physical(q.window));
      await d.keyIn(q.window, 'Return');
    }
    d.mark('searching');
    await d.hold(7500);
    if (q.window) d.rectAt('quickWindow', physical(q.window));
    await clipboard.writeText(saved);
  },
};
let saved = '';

/** Grab from screen over a retail blog: the film draws the drag, nvoke reads the list. */
const grab: Scene = {
  async setup(d) {
    await d.set.stage(articlePage());
    // A fresh quick window, with nothing left from an earlier scene.
    d.set.quick?.window?.destroy();
  },
  async act(d) {
    const q = d.set.quick;
    if (!q) throw new Error('[film] no quick window');
    const list = await d.set.stageBox('[data-film-list]');
    const pad = 24;
    d.rectAt('grabBox', { x: list.x - pad, y: list.y - pad, w: list.w + pad * 2, h: list.h + pad * 2 });
    await d.hold(600);
    d.mark('drag');
    // The film draws the box being dragged over this stretch.
    await d.hold(1500);
    d.mark('dropped');
    q.reveal();
    d.set.raiseQuick();
    q.sendGrab({ status: 'reading' });
    await d.hold(1200);
    // What the OS text engine reads off the list: each brand's name line.
    const { items, people: dropped } = extractCompanies(ARTICLE_BRANDS.map(([name]) => name));
    q.sendGrab({ status: 'done', items, people: dropped });
    d.mark('listed');
    await d.hold(600);
    if (q.window) d.rectAt('quickWindow', physical(q.window));
    await d.hold(2400);
  },
};

export const SCENES: Record<string, Scene> = { journey, command, people, ongoing, drop, agents, quick, grab };
