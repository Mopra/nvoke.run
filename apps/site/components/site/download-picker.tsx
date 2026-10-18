'use client';

import { useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
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

function FileButton({ file, primary }: { file: DownloadTarget['files'][number]; primary: boolean }) {
  if (!file.url) {
    return (
      <Button variant="secondary" size="lg" disabled className="w-full">
        Coming soon
      </Button>
    );
  }
  return (
    <Button asChild size="lg" variant={primary ? 'dark' : 'secondary'} className="w-full">
      <a href={file.url} download>
        <Download />
        {file.label}
      </a>
    </Button>
  );
}

/**
 * One plate per system, its keys under an LED. The visitor's system comes
 * first with its LED lit and its first download as the dark key.
 */
export function DownloadPicker({ downloads }: { downloads: Downloads }) {
  const os = useOs();
  const detected = downloads.targets.find((t) => t.os === os) ?? null;
  const ordered = detected ? [detected, ...downloads.targets.filter((t) => t !== detected)] : downloads.targets;

  return (
    <div className="flex flex-col gap-5">
      <p className="cap min-h-4 text-center text-muted-foreground" aria-live="polite">
        {detected ? `You are on ${detected.name}` : 'Pick your system'}
        {downloads.available ? ` · Version ${downloads.version}` : null}
      </p>
      <div className="grid w-full gap-4 md:grid-cols-3">
        {ordered.map((t) => {
          const isDetected = t === detected;
          return (
            <article key={t.os} className="panel flex flex-col gap-6 p-5 sm:p-6">
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-2">
                  <span className={cn('led', isDetected && 'led-on')} />
                  <h2 className="cap text-foreground">{t.name}</h2>
                </span>
                <p className="text-[15px] text-muted-foreground">{t.requirement}</p>
              </div>
              <div className="flex flex-col gap-2">
                {downloads.available ? (
                  t.files.map((f, i) => <FileButton key={f.fileName} file={f} primary={isDetected && i === 0} />)
                ) : (
                  <Button variant="secondary" size="lg" disabled className="w-full">
                    Coming soon
                  </Button>
                )}
              </div>
              <ul className="border-b">
                {t.files.map((f) => (
                  <li
                    key={f.fileName}
                    className="truncate border-t py-2 font-mono text-[12px] text-muted-foreground"
                    title={f.fileName}
                  >
                    {f.fileName}
                  </li>
                ))}
              </ul>
              <p className="mt-auto text-[14px] text-pretty text-muted-foreground">{t.firstRun}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
