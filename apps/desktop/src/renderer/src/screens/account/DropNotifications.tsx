import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import type { NotificationSettings } from '@/lib/types';
import { Setting } from './Setting';

/** Native notifications and the unseen badge for finished drops. */
export function DropNotifications() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  useEffect(() => {
    let live = true;
    api.getNotificationSettings().then((s) => live && setSettings(s), () => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!settings) return null;

  async function toggle(enabled: boolean): Promise<void> {
    setSettings((s) => (s ? { ...s, enabled } : s));
    try {
      setSettings(await api.setNotificationsEnabled(enabled));
    } catch {
      setSettings((s) => (s ? { ...s, enabled: !enabled } : s));
      toast.error('Couldn’t change that setting');
    }
  }

  return (
    <Setting
      label="Drop notifications"
      description={
        settings.supported
          ? 'A notification and an unseen count on the dock or taskbar when a drop delivers. Your system’s Focus and Do Not Disturb still apply.'
          : 'This system can’t show notifications.'
      }
    >
      <Switch
        checked={settings.enabled}
        onCheckedChange={(v) => void toggle(v)}
        disabled={!settings.supported}
        aria-label="Drop notifications"
      />
    </Setting>
  );
}
