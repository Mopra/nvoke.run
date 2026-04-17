import { NavLink, Outlet } from "react-router-dom";

const navItemBase =
  "border-l-2 px-4 py-2 transition-colors";
const navItemInactive =
  "border-transparent text-muted-foreground hover:text-foreground";
const navItemActive =
  "border-primary bg-accent text-accent-foreground";

function itemClass({ isActive }: { isActive: boolean }) {
  return `${navItemBase} ${isActive ? navItemActive : navItemInactive}`;
}

export default function SettingsPage() {
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
          <NavLink to="profile" className={itemClass}>
            Profile
          </NavLink>
          <NavLink to="danger" className={itemClass}>
            Danger zone
          </NavLink>
        </nav>

        <div className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
