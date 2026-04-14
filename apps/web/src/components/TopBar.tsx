import { TopBarSearch } from "./TopBarSearch";
import { UsageWidget } from "./UsageWidget";

export function TopBar() {
  return (
    <header className="relative flex h-14 shrink-0 items-center justify-center bg-sidebar px-5">
      <TopBarSearch />
      <div className="absolute right-5 top-1/2 -translate-y-1/2">
        <UsageWidget />
      </div>
    </header>
  );
}
