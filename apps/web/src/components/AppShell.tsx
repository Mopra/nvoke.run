import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Toaster } from "./Toaster";

export function AppShell() {
  return (
    <div className="flex h-screen bg-sidebar">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-hidden rounded-tl-xl border-l border-t border-border bg-card">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
