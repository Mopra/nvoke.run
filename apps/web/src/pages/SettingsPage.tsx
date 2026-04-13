import { useUser } from "@clerk/clerk-react";

export default function SettingsPage() {
  const { user } = useUser();

  return (
    <div className="flex h-full flex-col bg-card text-card-foreground">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
        <div className="text-sm font-semibold text-foreground">Settings</div>
        <span className="text-muted-foreground/50">•</span>
        <div className="text-xs text-muted-foreground">Your account and preferences.</div>
      </div>

      {/* Body: nav rail + content */}
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/20 py-2 text-sm">
          <a
            href="#profile"
            className="border-l-2 border-primary bg-accent px-4 py-2 text-accent-foreground"
          >
            Profile
          </a>
          <a
            href="#appearance"
            className="border-l-2 border-transparent px-4 py-2 text-muted-foreground hover:text-foreground"
          >
            Appearance
          </a>
          <a
            href="#danger"
            className="border-l-2 border-transparent px-4 py-2 text-muted-foreground hover:text-foreground"
          >
            Danger zone
          </a>
        </nav>

        <div className="min-h-0 flex-1 overflow-auto">
          <section id="profile" className="border-b border-border">
            <div className="flex h-8 items-center border-b border-border bg-muted/20 px-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Profile
            </div>
            <div className="grid grid-cols-[160px_1fr] gap-y-3 px-6 py-5 text-sm">
              <div className="text-muted-foreground">Name</div>
              <div className="text-foreground">{user?.fullName ?? "—"}</div>
              <div className="text-muted-foreground">Email</div>
              <div className="text-foreground">
                {user?.primaryEmailAddress?.emailAddress ?? "—"}
              </div>
            </div>
          </section>

          <section id="appearance" className="border-b border-border">
            <div className="flex h-8 items-center border-b border-border bg-muted/20 px-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Appearance
            </div>
            <div className="px-6 py-5 text-sm text-muted-foreground">
              Theme: <span className="text-foreground">Dark</span>.{" "}
              <span className="text-muted-foreground/70">(Light mode coming soon.)</span>
            </div>
          </section>

          <section id="danger">
            <div className="flex h-8 items-center border-b border-destructive/20 bg-destructive/5 px-4 text-[10px] font-medium uppercase tracking-wider text-destructive">
              Danger zone
            </div>
            <div className="px-6 py-5 text-sm text-muted-foreground">
              Account deletion is handled through your Clerk account profile.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
