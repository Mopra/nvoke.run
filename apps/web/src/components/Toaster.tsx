import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      theme="dark"
      toastOptions={{
        style: {
          background: "#18181b",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "#fafafa",
        },
      }}
    />
  );
}
