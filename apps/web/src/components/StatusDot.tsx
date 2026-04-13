import { cn } from "@/lib/cn";

type Status = "success" | "error" | "timeout" | "idle" | "running";

const COLORS: Record<Status, string> = {
  success: "bg-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_15%,transparent)]",
  error: "bg-destructive shadow-[0_0_0_3px_color-mix(in_oklab,var(--destructive)_15%,transparent)]",
  timeout: "bg-secondary shadow-[0_0_0_3px_color-mix(in_oklab,var(--secondary)_15%,transparent)]",
  running: "bg-primary animate-pulse",
  idle: "bg-muted-foreground/40",
};

export function StatusDot({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", COLORS[status], className)}
    />
  );
}
