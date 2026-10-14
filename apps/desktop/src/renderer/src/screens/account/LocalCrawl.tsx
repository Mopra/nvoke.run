import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { desktopApi, desktopSettingsKey, useDesktopSettings } from '@/lib/desktop';
import { Setting } from './Setting';

/**
 * The local render crawl: sites that refuse our servers or need JavaScript,
 * read from this computer while it is idle. Off by default, and the copy says
 * plainly that it uses the user's connection.
 */
export function LocalCrawl() {
  const client = useQueryClient();
  const { data: settings } = useDesktopSettings();
  const desktop = desktopApi();
  if (!desktop || !settings) return null;

  function change(next: boolean): void {
    if (!settings) return;
    client.setQueryData(desktopSettingsKey, { ...settings, localCrawl: next });
    desktop
      ?.setLocalCrawl(next)
      .then((s) => client.setQueryData(desktopSettingsKey, s))
      .catch((err: unknown) => {
        client.setQueryData(desktopSettingsKey, settings);
        toast.error('Couldn’t change reading from this computer', { description: err instanceof Error ? err.message : undefined });
      });
  }

  return (
    <Setting
      label="Read blocked sites from this computer"
      description="Some sites refuse our servers or only show an address with JavaScript. When your computer is idle and plugged in, nvoke reads those from here, over your connection, as nvokebot: robots.txt, one page a second, no logins. Only the addresses leave this computer."
    >
      <Switch checked={settings.localCrawl} onCheckedChange={change} aria-label="Read blocked sites from this computer" />
    </Setting>
  );
}
