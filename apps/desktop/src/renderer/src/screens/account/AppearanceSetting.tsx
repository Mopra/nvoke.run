import { Monitor, Moon, Sun } from 'lucide-react';
import { Segmented } from '@/components/ui/segmented';
import { setThemePreference, useTheme, type ThemePreference } from '@/lib/theme';
import { Setting } from './Setting';

export function AppearanceSetting() {
  const { preference } = useTheme();
  return (
    <Setting label="Appearance" description="System follows your computer.">
      <Segmented<ThemePreference>
        label="Appearance"
        size="sm"
        value={preference}
        onChange={setThemePreference}
        options={[
          { value: 'system', label: 'System', icon: Monitor },
          { value: 'light', label: 'Light', icon: Sun },
          { value: 'dark', label: 'Dark', icon: Moon },
        ]}
      />
    </Setting>
  );
}
