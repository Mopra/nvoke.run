import type { ReactNode } from 'react';

/** A setting: what it is on the left, its control on the right. No box around it. */
export function Setting({ label, description, children }: { label: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-8 py-5">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium">{label}</div>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
