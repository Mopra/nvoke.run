import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { desktopApi, trayPlace } from '@/lib/desktop';
import type { DesktopSettings } from '../../../../ipc/contract';
import { Setting } from './Setting';

/** The watched inbox: a CSV put in this folder is enriched in the background. Only in the desktop app. */
export function InboxFolder() {
  const [desktop] = useState(desktopApi);
  const [settings, setSettings] = useState<DesktopSettings | null>(null);

  useEffect(() => {
    desktop
      ?.getSettings()
      .then(setSettings)
      .catch(() => undefined);
  }, [desktop]);

  if (!desktop || !settings) return null;

  function run(change: Promise<DesktopSettings>): void {
    change
      .then(setSettings)
      .catch((err: unknown) =>
        toast.error('Couldn’t change the inbox', { description: err instanceof Error ? err.message : undefined }),
      );
  }

  return (
    <Setting
      label="Inbox folder"
      description={
        <>
          Put a CSV of domains or company names in the folder and nvoke enriches it in the background, even while it sits in the{' '}
          {trayPlace()}. The result and the original move to a done folder next to it, and you get a notification.
          <span className="mt-1 block truncate font-mono text-xs" title={settings.inboxFolder}>
            {settings.inboxFolder}
          </span>
          {settings.inboxEnabled && settings.inboxError && <span className="mt-1 block text-destructive">{settings.inboxError}</span>}
        </>
      }
    >
      <div className="flex items-center gap-3">
        {settings.inboxEnabled && (
          <>
            <Button variant="ghost" onClick={() => void desktop.openInboxFolder()}>
              Open
            </Button>
            <Button variant="outline" onClick={() => run(desktop.chooseInboxFolder())}>
              Change
            </Button>
          </>
        )}
        <Switch
          checked={settings.inboxEnabled}
          onCheckedChange={(on) => run(desktop.setInboxEnabled(on))}
          aria-label="Watch the inbox folder"
        />
      </div>
    </Setting>
  );
}
