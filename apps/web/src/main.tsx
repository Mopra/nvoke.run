import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { RouterProvider } from "react-router-dom";
import "./index.css";
import { router } from "./router";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
if (!publishableKey) throw new Error("VITE_CLERK_PUBLISHABLE_KEY missing");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{ variables: { colorBackground: "#09090b" } }}
    >
      <RouterProvider router={router} />
    </ClerkProvider>
  </React.StrictMode>,
);
