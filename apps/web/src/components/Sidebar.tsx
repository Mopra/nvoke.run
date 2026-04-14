import { Link } from "react-router-dom";
import { Code2, CreditCard, History, KeyRound, Settings } from "lucide-react";
import { SidebarNavItem } from "./SidebarNavItem";
import { UserBlock } from "./UserBlock";

export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground p-3">
      <Link to="/functions" className="mb-6 flex items-center gap-2 px-2 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20 text-primary">
          <Code2 className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-base font-semibold text-sidebar-foreground">nvoke</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            run
          </div>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        <SidebarNavItem
          to="/functions"
          icon={<Code2 className="h-4 w-4" />}
          label="Functions"
        />
        <SidebarNavItem
          to="/runs"
          icon={<History className="h-4 w-4" />}
          label="Runs"
        />
        <SidebarNavItem
          to="/keys"
          icon={<KeyRound className="h-4 w-4" />}
          label="API Keys"
        />
        <SidebarNavItem
          to="/billing"
          icon={<CreditCard className="h-4 w-4" />}
          label="Billing"
        />
        <SidebarNavItem
          to="/settings"
          icon={<Settings className="h-4 w-4" />}
          label="Settings"
        />
      </nav>

      <div className="mt-3 border-t border-sidebar-border pt-3">
        <UserBlock />
      </div>
    </aside>
  );
}
