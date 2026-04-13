import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-muted/40 px-8 py-12 text-center">
      {icon && <div className="text-primary">{icon}</div>}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {body && <p className="text-sm text-muted-foreground">{body}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
