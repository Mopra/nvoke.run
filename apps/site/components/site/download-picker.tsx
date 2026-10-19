'use client';

import { useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import { Figure, Readout } from '@/components/mockups/parts';
import { useInView } from '@/components/site/home/motion';
import { useRunTo } from '@/components/site/pricing/motion';
import { Button } from '@/components/ui/button';
import type { DownloadTarget, Downloads, OsId } from '@/lib/download';
import { cn } from '@/lib/utils';

type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } };

function detectOs(): OsId | null {
  const nav = navigator as NavigatorWithUAData;
  const hint = `${nav.userAgentData?.platform ?? ''} ${nav.userAgent}`.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(hint)) return null;
  if (hint.includes('win')) return 'windows';
  if (hint.includes('mac')) return 'mac';
  if (hint.includes('linux') || hint.includes('x11')) return 'linux';
  return null;
}

const noop = () => () => {};

/** OS of the visitor, or null on the server and on phones. */
function useOs(): OsId | null {
  return useSyncExternalStore(noop, detectOs, () => null);
}

function FileKeys({ target, available, primary }: { target: DownloadTarget; available: boolean; primary: boolean }) {
  if (!available) {
    return (
      <Button variant="secondary" size="lg" disabled>
        Coming soon
      </Button>
    );
  }
  return (
    <>
      {target.files.map((file, i) =>
        file.url ? (
          <Button key={file.fileName} asChild size="lg" variant={primary && i === 0 ? 'dark' : 'secondary'}>
            <a href={file.url} download>
              <Download />
              {file.label}
            </a>
          </Button>
        ) : null,
      )}
    </>
  );
}

const SCAN_ROUNDS = 2;

/**
 * The download on the hero screen. When it comes into view the screen scans
 * the three systems in turn, then locks on the visitor's with its LED lit,
 * and the dark key under it downloads. The other systems sit below on
 * hairlines. On phones and the server nothing is detected, so all three
 * sit below and the screen reads the version.
 */
export function DownloadPicker({ downloads }: { downloads: Downloads }) {
  const os = useOs();
  const targets = downloads.targets;
  const detected = targets.find((t) => t.os === os) ?? null;
  const others = detected ? targets.filter((t) => t !== detected) : targets;

  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -10% 0px', true);
  const scanEnd = targets.length * SCAN_ROUNDS;
  const tick = useRunTo(scanEnd, 170, inView);
  const scanning = tick < scanEnd;
  const shown = scanning ? targets[tick % targets.length]! : detected;
  const version = `v${downloads.version}`;

  return (
    <div ref={ref} className="mx-auto w-full max-w-4xl">
      <div className="screen screen-hero p-6 sm:p-10" aria-live={scanning ? 'off' : 'polite'}>
        <div className="flex items-center gap-3">
          <span className={cn('led', scanning ? 'led-on motion-safe:animate-blink' : detected ? 'led-on' : '')} />
          <span className="cap text-screen-foreground/50">
            {scanning ? 'Detecting system' : detected ? 'Your system' : 'Pick your system'}
          </span>
          {downloads.available ? <span className="cap ml-auto text-screen-foreground/50 tabular-nums">{version}</span> : null}
        </div>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <div className="min-w-0">
            <p className="lcd text-[40px] leading-none uppercase sm:text-[80px]">{shown ? shown.name : 'Desktop'}</p>
            <p className="cap mt-3 text-screen-foreground/50">{shown ? shown.requirement : 'Windows, macOS and Linux'}</p>
          </div>
          <Readout label="Version" className="items-start sm:items-end">
            <Figure
              value={downloads.available ? downloads.version : 'SOON'}
              ghost={downloads.available ? downloads.version.replace(/\d/g, '8') : '8888'}
              className="text-[32px] sm:text-[48px]"
            />
          </Readout>
        </div>

        <div aria-hidden="true" className="mt-8 grid grid-cols-3 gap-3 border-t border-screen-dim pt-5 sm:mt-10">
          {targets.map((t) => {
            const on = shown === t;
            return (
              <span key={t.os} className="flex items-center gap-2">
                <span className={cn('led', on && 'led-on')} />
                <span className={cn('cap truncate transition-colors', on ? 'text-screen-foreground' : 'text-screen-foreground/40')}>{t.name}</span>
              </span>
            );
          })}
        </div>
      </div>

      {detected ? (
        <div className="mt-10 flex flex-col items-center gap-5 text-center">
          <div className="flex flex-wrap justify-center gap-3">
            <FileKeys target={detected} available={downloads.available} primary />
          </div>
          <p className="max-w-md text-[14px] text-pretty text-muted-foreground">{detected.firstRun}</p>
        </div>
      ) : null}

      <div className="mt-16 sm:mt-24">
        <p className="cap text-muted-foreground">{detected ? 'Other systems' : 'Every system'}</p>
        <div className={cn('mt-6 grid gap-10', others.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
          {others.map((t) => (
            <article key={t.os} className="flex flex-col items-start gap-4 border-t pt-6">
              <h2 className="cap text-foreground">{t.name}</h2>
              <p className="text-[15px] text-muted-foreground">{t.requirement}</p>
              <div className="flex flex-wrap gap-2">
                <FileKeys target={t} available={downloads.available} primary={false} />
              </div>
              <ul className="w-full">
                {t.files.map((f) => (
                  <li key={f.fileName} className="truncate font-mono text-[12px] text-muted-foreground" title={f.fileName}>
                    {f.fileName}
                  </li>
                ))}
              </ul>
              <p className="text-[14px] text-pretty text-muted-foreground">{t.firstRun}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
