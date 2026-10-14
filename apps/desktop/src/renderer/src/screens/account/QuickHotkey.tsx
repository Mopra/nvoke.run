import { useEffect, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { desktopApi, trayPlace } from '@/lib/desktop';
import { isMac } from '@/lib/hotkeys';
import type { DesktopSettings } from '../../../../ipc/contract';
import { acceleratorFromEvent, acceleratorLabel } from '../../../../ipc/accelerator';
import { Setting } from './Setting';

/** The global shortcut that opens the quick window over any app. Click Change, then press the new keys. */
export function QuickHotkey() {
  const [desktop] = useState(desktopApi);
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    desktop
      ?.getSettings()
      .then(setSettings)
      .catch(() => undefined);
  }, [desktop]);

  if (!desktop || !settings) return null;

  function record(event: KeyboardEvent<HTMLButtonElement>): void {
    event.preventDefault();
    if (event.key === 'Escape') {
      setRecording(false);
      return;
    }
    const accelerator = acceleratorFromEvent(event, isMac);
    if (!accelerator) return;
    setRecording(false);
    desktop
      ?.setHotkey(accelerator)
      .then(setSettings)
      .catch((err: unknown) =>
        toast.error('Couldn’t change the shortcut', { description: err instanceof Error ? err.message : undefined }),
      );
  }

  return (
    <Setting
      label="Quick search shortcut"
      description={
        <>
          Opens a small search bar over any app, even while nvoke is in the {trayPlace()}.
          {settings.hotkeyError && <span className="mt-1 block text-destructive">{settings.hotkeyError}</span>}
        </>
      }
    >
      <Button
        variant="outline"
        onClick={() => setRecording(true)}
        onKeyDown={recording ? record : undefined}
        onBlur={() => setRecording(false)}
        aria-label="Change quick search shortcut"
      >
        {recording ? 'Press the new keys' : acceleratorLabel(settings.hotkey, isMac)}
      </Button>
    </Setting>
  );
}
