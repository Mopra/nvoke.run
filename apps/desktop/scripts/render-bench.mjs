// The crawl benchmark's desktop pass (docs/research/crawl-benchmark.md): the
// sites a server run found no address on, read through the local render
// crawl's own code (src/main/local-crawl/bench.ts) in hidden windows.
//
//   pnpm --filter @nvoke/desktop bench:render --from <server label> [--concurrency 4]
//
// Reads apps/server/.bench/results/<label>.json and writes
// <label>.render.json next to it; `cli bench render --from <label>` in the
// server then prints the combined table. ELECTRON_RUN_AS_NODE is removed for
// the same reason as in capture.mjs.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const server = resolve(root, '../server');
const flag = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const label = flag('from');
if (!label) {
  console.error('usage: bench:render --from <server label> [--concurrency N]');
  process.exit(2);
}

const sample = JSON.parse(readFileSync(resolve(server, 'bench/crawl-sample.json'), 'utf8'));
const websites = new Map(sample.map((s) => [s.domain, s.website]));
const results = JSON.parse(readFileSync(resolve(server, `.bench/results/${label}.json`), 'utf8'));
const sites = results
  .filter((r) => r.emails.length === 0 && websites.has(r.domain))
  .map((r) => ({ domain: r.domain, website: websites.get(r.domain) }));
const input = resolve(server, `.bench/results/${label}.render-in.json`);
writeFileSync(input, JSON.stringify(sites));
console.log(`${sites.length} of ${results.length} sites had no address in ${label}`);

const env = { ...process.env, NVOKE_RENDER_BENCH: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const build = spawnSync('pnpm', ['exec', 'electron-vite', 'build'], { cwd: root, env, stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

const electron = createRequire(import.meta.url)('electron');
const run = spawnSync(electron, [resolve(root, 'out/main/render-bench.js')], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...env,
    NVOKE_RENDER_BENCH_IN: input,
    NVOKE_RENDER_BENCH_OUT: resolve(server, `.bench/results/${label}.render.json`),
    NVOKE_RENDER_BENCH_CONCURRENCY: flag('concurrency') ?? '4',
  },
});
process.exit(run.status ?? 1);
