import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { WhatsNew as WhatsNewData } from '../../../ipc/contract';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { updatesApi } from '@/lib/updates';

/**
 * What changed, shown once on the first start after an update. It drops from
 * the island like the command bar. Closing it in any way marks the version
 * seen; main keeps it pending until then, so an update that installed while
 * nvoke sat in the tray still shows it when the window first opens.
 */
export function WhatsNew() {
  const [data, setData] = useState<WhatsNewData | null>(null);

  useEffect(() => {
    const api = updatesApi();
    if (!api) return;
    let live = true;
    api
      .getWhatsNew()
      .then((next) => live && next && setData(next))
      .catch(() => undefined);
    const off = api.onWhatsNew(setData);
    return () => {
      live = false;
      off();
    };
  }, []);

  function close(): void {
    setData(null);
    void updatesApi()?.dismissWhatsNew();
  }

  const several = (data?.notes.length ?? 0) > 1;

  return (
    <Dialog open={!!data} onOpenChange={(open) => !open && close()}>
      <DialogContent data-whats-new className="top-[56px] max-w-[460px]" aria-describedby={undefined}>
        {data && (
          <div className="flex max-h-[min(560px,calc(100vh-96px))] flex-col">
            <div className="px-8 pt-8">
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <Sparkles className="size-3.5" />
                Updated
              </div>
              <DialogTitle className="mt-2 font-display text-3xl font-semibold">What’s new in {data.version}</DialogTitle>
              {several && (
                <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
                  {data.notes.length} releases since you last looked.
                </DialogDescription>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-8 pt-6 pb-2">
              {data.notes.map((note) => (
                <section key={note.version} className="pb-5">
                  {several && <h3 className="pb-2 font-mono text-xs text-muted-foreground">{note.version}</h3>}
                  <ul className="flex flex-col gap-2.5">
                    {note.items.map((item, i) => (
                      <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                        <span aria-hidden className="mt-[0.7em] size-1 shrink-0 rounded-full bg-foreground/40" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <div className="flex justify-end px-8 pt-2 pb-7">
              <Button onClick={close} autoFocus>
                Got it
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
