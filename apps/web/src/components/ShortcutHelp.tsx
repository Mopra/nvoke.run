import { useEffect, useState } from "react";

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "Ctrl/Cmd + S", label: "Save function" },
  { keys: "Ctrl/Cmd + Enter", label: "Run function" },
  { keys: "Ctrl/Cmd + K", label: "Open command palette" },
  { keys: "Ctrl/Cmd + Shift + F", label: "Format code" },
  { keys: "?", label: "Show this help" },
  { keys: "Esc", label: "Close dialogs" },
];

export function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (e.key === "?" && !isTyping) {
        e.preventDefault();
        setOpen((x) => !x);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
          Keyboard shortcuts
        </div>
        <div className="divide-y divide-border">
          {SHORTCUTS.map((s) => (
            <div
              key={s.keys}
              className="flex items-center justify-between px-4 py-2.5 text-sm"
            >
              <span className="text-muted-foreground">{s.label}</span>
              <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
