import { Outlet } from "react-router-dom";
import { TopBar } from "./components/TopBar";

export default function App() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
