// Records the product film's scenes from the real window (src/main/capture/film)
// and turns each into a take for apps/video: cropped to the window, trimmed to
// the scene's first frame, 60 fps. Dev only, Windows only (ffmpeg's ddagrab).
//
//   pnpm --filter @nvoke/desktop film            every scene
//   pnpm --filter @nvoke/desktop film journey    one or more scenes by name
//   pnpm --filter @nvoke/desktop film --process  only redo the cropping
//
// Keep the screen unlocked and the top left corner uncovered while it runs:
// a small flash there marks each scene's first frame. Needs ffmpeg on PATH.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const video = resolve(root, '../video');
const rawDir = join(video, '.raw');
const takesDir = join(video, 'public', 'takes');

const args = process.argv.slice(2);
const processOnly = args.includes('--process');
const names = args.filter((a) => !a.startsWith('--'));

if (!processOnly) await record(names.length ? names.join(',') : 'all');
processTakes(names);

/** The primary display in physical pixels, as the grabber sees it. Electron misreports it at a forced scale. */
function screenSize() {
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-f', 'lavfi', '-i', 'ddagrab=output_idx=0:framerate=10', '-frames:v', '1', '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const size = /d3d11, (\d+x\d+)/.exec(probe.stderr ?? '')?.[1];
  if (!size) throw new Error('could not read the screen size from ffmpeg ddagrab');
  return size;
}

function record(scenes) {
  const size = screenSize();
  const env = { ...process.env, VITE_MOCK: '1', VITE_FILM: '1', NVOKE_CAPTURE: rawDir, NVOKE_FILM: scenes, NVOKE_FILM_SCREEN: size };
  // Electron based tools can export this, and electron.exe then starts as plain Node.
  delete env.ELECTRON_RUN_AS_NODE;
  return new Promise((done, fail) => {
    const child = spawn('pnpm', ['exec', 'electron-vite', 'dev'], { cwd: root, env, stdio: 'inherit', shell: true });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`recording exited with ${code}`))));
  });
}

/** The first frame where the flash in the corner went white. */
function syncFrame(raw, flash) {
  const out = execFileSync(
    'ffmpeg',
    ['-hide_banner', '-i', raw, '-frames:v', '900', '-vf', `crop=${flash.size}:${flash.size}:${flash.x}:${flash.y},signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`, '-f', 'null', '-'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 },
  );
  let frame = -1;
  for (const line of out.split('\n')) {
    const f = /^frame:(\d+)/.exec(line);
    if (f) frame = Number(f[1]);
    const y = /YAVG=([\d.]+)/.exec(line);
    if (y && Number(y[1]) > 128) return frame;
  }
  throw new Error(`${raw}: the flash never showed. Was the top left corner covered?`);
}

function processTakes(only) {
  mkdirSync(takesDir, { recursive: true });
  const all = existsSync(rawDir) ? readdirSync(rawDir).filter((f) => f.endsWith('.raw.json')).map((f) => f.slice(0, -9)) : [];
  for (const name of only.length ? only : all) {
    const meta = JSON.parse(readFileSync(join(rawDir, `${name}.raw.json`), 'utf8'));
    const raw = join(rawDir, `${name}.raw.mp4`);
    const start = syncFrame(raw, meta.flash);
    const { x, y, w, h } = meta.window;
    const even = (n) => n - (n % 2);
    console.log(`[film] ${name}: frame 0 is raw frame ${start}, cropping ${w}x${h} at ${x},${y}`);
    execFileSync(
      'ffmpeg',
      [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', raw,
        '-vf', `fps=60,trim=start_frame=${start},setpts=PTS-STARTPTS,crop=${even(w)}:${even(h)}:${x}:${y}`,
        '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        join(takesDir, `${name}.mp4`),
      ],
      { stdio: 'inherit' },
    );
    const take = {
      take: name,
      fps: 60,
      width: even(w),
      height: even(h),
      durationMs: meta.durationMs,
      cursor: meta.cursor,
      events: meta.events,
      rects: meta.rects,
    };
    writeFileSync(join(takesDir, `${name}.json`), JSON.stringify(take));
    console.log(`[film] wrote ${join(takesDir, `${name}.mp4`)}`);
  }
}
