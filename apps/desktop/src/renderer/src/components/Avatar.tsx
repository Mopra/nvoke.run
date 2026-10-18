import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

function initials(user: User): string {
  const source = user.name ?? user.email ?? '?';
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Avatar({ user, className }: { user: User; className?: string }) {
  if (user.imageUrl) {
    return <img src={user.imageUrl} alt="" className={cn('size-7 shrink-0 rounded-[4px] object-cover', className)} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        'key flex size-7 shrink-0 items-center justify-center bg-secondary font-mono text-2xs font-medium tracking-[0.08em] text-secondary-foreground',
        className,
      )}
    >
      {initials(user)}
    </span>
  );
}
