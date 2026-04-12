import { createBrowserRouter, Navigate } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import App from "./App";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import FunctionsListPage from "./pages/FunctionsListPage";
import FunctionDetailPage from "./pages/FunctionDetailPage";
import SettingsPage from "./pages/SettingsPage";

function Protected() {
  return (
    <>
      <SignedIn>
        <App />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

export const router = createBrowserRouter([
  { path: "/sign-in/*", element: <SignInPage /> },
  { path: "/sign-up/*", element: <SignUpPage /> },
  {
    path: "/",
    element: <Protected />,
    children: [
      { index: true, element: <Navigate to="/functions" replace /> },
      { path: "functions", element: <FunctionsListPage /> },
      { path: "functions/:id", element: <FunctionDetailPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
