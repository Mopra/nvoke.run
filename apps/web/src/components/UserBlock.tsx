import { useUser, useClerk } from "@clerk/clerk-react";
import { useState, useRef, useEffect } from "react";
import { LogOut } from "lucide-react";

export function UserBlock() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user) return null;
  const name =
    user.fullName ?? user.primaryEmailAddress?.emailAddress ?? "User";
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-border bg-popover text-popover-foreground p-1 shadow-xl">
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-sidebar-accent"
      >
        {user.imageUrl ? (
          <img src={user.imageUrl} alt="" className="h-8 w-8 rounded-full" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-sidebar-foreground">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{email}</div>
        </div>
      </button>
    </div>
  );
}
