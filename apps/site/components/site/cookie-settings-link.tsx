'use client';

import { openCookieSettings } from '@/components/site/analytics';

/** Footer link that reopens the consent bar. Hidden when analytics is off. */
export function CookieSettingsLink() {
  if (!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) return null;
  return (
    <li>
      <button type="button" onClick={openCookieSettings} className="cursor-pointer hover:text-foreground">
        Cookie settings
      </button>
    </li>
  );
}
