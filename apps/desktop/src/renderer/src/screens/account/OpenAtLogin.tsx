import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { desktopApi, trayPlace } from '@/lib/desktop';
import { Setting } from './Setting';

/** Start at login, hidden in the tray. Only in the desktop app, where there is a tray. */
export function OpenAtLogin() {
  const [desktop] = useState(desktopApi);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    desktop
      ?.getSettings()
      .then((s) => setEnabled(s.openAtLogin))
      .catch(() => undefined);
  }, [desktop]);

  if (!desktop || enabled === null) return null;

  function change(next: boolean): void {
    setEnabled(next);
    desktop
      ?.setOpenAtLogin(next)
      .then((s) => setEnabled(s.openAtLogin))
      .catch((err: unknown) => {
        setEnabled(!next);
        toast.error('Couldn’t change start at login', { description: err instanceof Error ? err.message : undefined });
      });
  }

  return (
    <Setting
      label="Open at login"
      description={`Starts quietly in the ${trayPlace()}, so drops and searches can reach you. Closing the window keeps it there.`}
    >
      <Switch checked={enabled} onCheckedChange={change} aria-label="Open at login" />
    </Setting>
  );
}
