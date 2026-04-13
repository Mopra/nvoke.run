import { TopBarSearch } from "./TopBarSearch";

export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-center bg-sidebar px-5">
      <TopBarSearch />
    </header>
  );
}
