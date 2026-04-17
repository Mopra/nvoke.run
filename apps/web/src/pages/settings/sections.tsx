import { useClerk, useUser } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";

function SectionHeader({ label, tone = "default" }: { label: string; tone?: "default" | "destructive" }) {
  if (tone === "destructive") {
    return (
      <div className="flex h-8 items-center border-b border-destructive/20 bg-destructive/5 px-4 text-[10px] font-medium uppercase tracking-wider text-destructive">
        {label}
      </div>
    );
  }
  return (
    <div className="flex h-8 items-center border-b border-border bg-muted/20 px-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
  );
}

export function ProfileSection() {
  const { user } = useUser();
  return (
    <section>
      <SectionHeader label="Profile" />
      <div className="grid grid-cols-[160px_1fr] gap-y-3 px-6 py-5 text-sm">
        <div className="text-muted-foreground">Name</div>
        <div className="text-foreground">{user?.fullName ?? "—"}</div>
        <div className="text-muted-foreground">Email</div>
        <div className="text-foreground">
          {user?.primaryEmailAddress?.emailAddress ?? "—"}
        </div>
      </div>
    </section>
  );
}

export function DangerSection() {
  const { openUserProfile } = useClerk();
  return (
    <section>
      <SectionHeader label="Danger zone" tone="destructive" />
      <div className="flex flex-col gap-4 px-6 py-5 text-sm text-muted-foreground">
        <p>
          Account deletion is handled through your account profile. Open it and
          go to <span className="text-foreground">Security → Delete account</span>.
        </p>
        <div>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => openUserProfile()}
          >
            Open account profile
          </Button>
        </div>
      </div>
    </section>
  );
}
