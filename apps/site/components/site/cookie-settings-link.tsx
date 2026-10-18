'use client';

import { openCookieSettings } from '@/components/site/analytics';

/** Footer link that reopens the consent bar. Hidden when analytics is off. */
export function CookieSettingsLink() {
  if (!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) return null;
  return (
    <li>
      <button type="button" onClick={openCookieSettings} className="cap flex h-10 w-full cursor-pointer items-center border-t text-foreground/80 transition-colors hover:text-foreground">
        Cookie settings
      </button>
    </li>
  );
}
