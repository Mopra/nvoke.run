import { Play, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  if (state === "running") {
    return (
      <Button disabled variant="success">
        <Loader2 className="h-4 w-4 animate-spin" /> Running…
      </Button>
    );
  }
  if (state === "success") {
    return (
      <Button onClick={onClick} variant="soft">
        <Check className="h-4 w-4" /> {duration}ms
      </Button>
    );
  }
  if (state === "error") {
    return (
      <Button onClick={onClick} variant="softDestructive">
        <X className="h-4 w-4" /> Failed
      </Button>
    );
  }
  return (
    <Button onClick={onClick} disabled={disabled}>
      <Play className="h-4 w-4" /> Run
    </Button>
  );
}
