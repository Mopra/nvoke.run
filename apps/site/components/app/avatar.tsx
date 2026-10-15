'use client';

import { cn } from '@/lib/utils';
import type { User } from '@nvoke/shared';

function initials(user: User): string {
  const source = user.name ?? user.email ?? '?';
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Avatar({ user, className }: { user: User; className?: string }) {
  if (user.imageUrl) {
    return <img src={user.imageUrl} alt="" className={cn('size-7 shrink-0 rounded-full object-cover', className)} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-foreground/10 to-foreground/20 text-2xs font-semibold text-foreground/80',
        className,
      )}
    >
      {initials(user)}
    </span>
  );
}
