import { UserButton } from "@clerk/clerk-react";
import { Link } from "react-router-dom";

export function TopBar() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
      <Link to="/functions" className="font-semibold">
        nvoke
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link to="/functions">Functions</Link>
        <Link to="/settings">Settings</Link>
        <UserButton />
      </nav>
    </header>
  );
}
