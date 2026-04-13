import { useEffect, useState } from "react";
import { Search } from "lucide-react";

export function TopBar() {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(navigator.platform.toLowerCase().includes("mac"));
  }, []);

  function openPalette() {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: !mac, metaKey: mac }),
    );
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-center bg-sidebar px-5">
      <button
        onClick={openPalette}
        className="flex w-72 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1">Search or jump to…</span>
        <kbd className="rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
    </header>
  );
}
