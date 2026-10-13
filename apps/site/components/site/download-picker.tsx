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
      <Button variant="outline" disabled className="w-full justify-center">
        Coming soon
      </Button>
    );
  }
  return (
    <Button asChild variant={primary ? 'default' : 'outline'} className="w-full justify-center">
      <a href={file.url} download>
        <Download />
        {file.label}
      </a>
    </Button>
  );
}

export function DownloadPicker({ downloads }: { downloads: Downloads }) {
  const os = useOs();
  const detected = downloads.targets.find((t) => t.os === os) ?? null;
  const ordered = detected ? [detected, ...downloads.targets.filter((t) => t !== detected)] : downloads.targets;

  return (
    <div className="flex flex-col gap-6">
      <p className="min-h-6 text-muted-foreground" aria-live="polite">
        {detected
          ? `You are on ${detected.name}. That download is first.`
          : 'Pick the download for your computer.'}{' '}
        {downloads.available ? `Version ${downloads.version}.` : null}
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {ordered.map((t) => {
          const isDetected = t === detected;
          return (
            <article
              key={t.os}
              className={cn(
                'flex flex-col gap-5 rounded-xl border bg-card p-6 text-card-foreground',
                isDetected && 'border-ring ring-1 ring-ring',
              )}
            >
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">{t.name}</h2>
                <p className="text-sm text-muted-foreground">{t.requirement}</p>
              </div>
              <div className="flex flex-col gap-2">
                {downloads.available ? (
                  t.files.map((f, i) => <FileButton key={f.fileName} file={f} primary={isDetected && i === 0} />)
                ) : (
                  <Button variant="outline" disabled className="w-full justify-center">
                    Coming soon
                  </Button>
                )}
              </div>
              <ul className="flex flex-col gap-1">
                {t.files.map((f) => (
                  <li key={f.fileName} className="truncate font-mono text-xs text-muted-foreground" title={f.fileName}>
                    {f.fileName}
                  </li>
                ))}
              </ul>
              <p className="mt-auto border-t pt-4 text-sm text-pretty text-muted-foreground">{t.firstRun}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
