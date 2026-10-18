'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { THEME_STORAGE_KEY } from '@/components/site/theme-script';

/** The finish: a small light key that flips between the light and the black edition. */
export function ThemeToggle() {
  function toggle() {
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      // Storage can be blocked. The choice then lasts for this page view only.
    }
  }

  return (
    <Button
      variant="secondary"
      size="icon-sm"
      onClick={toggle}
      aria-label="Switch between light and dark appearance"
    >
      <Sun className="size-3.5 dark:hidden" />
      <Moon className="hidden size-3.5 dark:block" />
    </Button>
  );
}
