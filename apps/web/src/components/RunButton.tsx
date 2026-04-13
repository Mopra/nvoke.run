import { Play, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";

type RunState = "idle" | "running" | "success" | "error";

export function RunButton({
  state,
  duration,
  onClick,
  disabled,
}: {
  state: RunState;
  duration?: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-md px-4 h-9 text-sm font-medium transition-colors disabled:opacity-50";
  if (state === "running") {
    return (
      <button disabled className={cn(base, "bg-primary/20 text-primary")}>
        <Loader2 className="h-4 w-4 animate-spin" /> Running…
      </button>
    );
  }
  if (state === "success") {
    return (
      <button
        onClick={onClick}
        className={cn(base, "bg-secondary text-secondary-foreground")}
      >
        <Check className="h-4 w-4" /> {duration}ms
      </button>
    );
  }
  if (state === "error") {
    return (
      <button onClick={onClick} className={cn(base, "bg-destructive/20 text-destructive")}>
        <X className="h-4 w-4" /> Failed
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(base, "bg-primary text-primary-foreground hover:bg-primary/90")}
    >
      <Play className="h-4 w-4" /> Run
    </button>
  );
}
