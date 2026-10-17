import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';
import { HiddenBrowser } from './browser';
import { readSite, type SiteRead } from './reader';

/**
 * The desktop pass of the crawl benchmark (docs/research/crawl-benchmark.md):
 * reads the sites the server run found no address on through the same
 * readSite and hidden window as the local render crawl, and writes what it
 * found next to the server results. Run by scripts/render-bench.mjs, which
 * passes NVOKE_RENDER_BENCH_IN (`[{ domain, website }]`), NVOKE_RENDER_BENCH_OUT
 * and NVOKE_RENDER_BENCH_CONCURRENCY. Nothing is cached: a browser
 * renders live, so this pass reads today's web.
 */

export interface RenderBenchSite {
  domain: string;
  website: string;
}

export interface RenderBenchResult extends SiteRead {
  domain: string;
  ms: number;
}

async function main(): Promise<void> {
  const input = process.env['NVOKE_RENDER_BENCH_IN'];
  const output = process.env['NVOKE_RENDER_BENCH_OUT'];
  const concurrency = process.env['NVOKE_RENDER_BENCH_CONCURRENCY'];
  if (!input || !output) throw new Error('NVOKE_RENDER_BENCH_IN and NVOKE_RENDER_BENCH_OUT are required');
  const sites = JSON.parse(readFileSync(input, 'utf8')) as RenderBenchSite[];
  const results: RenderBenchResult[] = new Array(sites.length);
  let next = 0;
  let done = 0;
  // One window and one in-memory session per worker, each wiped after every site.
  const worker = async (n: number): Promise<void> => {
    const browser = new HiddenBrowser(`nvoke-render-bench-${n}`);
    for (;;) {
      const i = next++;
      if (i >= sites.length) return;
      const site = sites[i]!;
      const started = Date.now();
      let read: SiteRead;
      try {
        read = await readSite(site, browser);
      } catch {
        read = { outcome: 'failed', emails: [], pages: 0 };
      } finally {
        await browser.reset();
      }
      results[i] = { domain: site.domain, ...read, ms: Date.now() - started };
      console.log(`${String(++done).padStart(4)}/${sites.length} ${read.outcome.padEnd(7)} ${String(read.emails?.length ?? 0).padStart(2)} ${site.domain}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Number(concurrency) || 4) }, (_, n) => worker(n)));
  writeFileSync(output, JSON.stringify(results, null, 1));
  console.log(`wrote ${results.length} results to ${output}`);
}

// A throwaway profile: the bench never touches the user's nvoke data.
app.setPath('userData', join(tmpdir(), 'nvoke-render-bench'));
app.disableHardwareAcceleration();
// Closing a site's window must not end the run.
app.on('window-all-closed', () => undefined);
void app.whenReady().then(main).then(
  () => app.exit(0),
  (err: unknown) => {
    console.error(err);
    app.exit(1);
  },
);
