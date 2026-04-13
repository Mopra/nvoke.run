import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

export function SearchTrigger({
  onClick,
  shortcut,
  placeholder = "Search or jump to…",
  className,
}: {
  onClick: () => void;
  shortcut?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-72 cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Search className="h-4 w-4" />
      <span className="flex-1">{placeholder}</span>
      {shortcut && (
        <kbd className="rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
