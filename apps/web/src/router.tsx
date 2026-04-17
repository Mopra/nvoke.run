import { createBrowserRouter, Navigate } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import App from "./App";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import SsoCallbackPage from "./pages/SsoCallbackPage";
import FunctionsListPage from "./pages/FunctionsListPage";
import FunctionDetailPage from "./pages/FunctionDetailPage";
import RunsPage from "./pages/RunsPage";
import RunDetailPage from "./pages/RunDetailPage";
import ApiKeysPage from "./pages/ApiKeysPage";
import SettingsPage from "./pages/SettingsPage";
import { ProfileSection, DangerSection } from "./pages/settings/sections";
import BillingPage from "./pages/BillingPage";
import { RouteError } from "./components/RouteError";

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
  { path: "/sign-in/sso-callback", element: <SsoCallbackPage />, errorElement: <RouteError /> },
  { path: "/sign-up/sso-callback", element: <SsoCallbackPage />, errorElement: <RouteError /> },
  { path: "/sign-in/*", element: <SignInPage />, errorElement: <RouteError /> },
  { path: "/sign-up/*", element: <SignUpPage />, errorElement: <RouteError /> },
  {
    path: "/",
    element: <Protected />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/functions" replace /> },
      { path: "functions", element: <FunctionsListPage />, errorElement: <RouteError /> },
      { path: "functions/:id", element: <FunctionDetailPage />, errorElement: <RouteError /> },
      { path: "runs", element: <RunsPage />, errorElement: <RouteError /> },
      { path: "runs/:id", element: <RunDetailPage />, errorElement: <RouteError /> },
      { path: "keys", element: <ApiKeysPage />, errorElement: <RouteError /> },
      {
        path: "settings",
        element: <SettingsPage />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Navigate to="profile" replace /> },
          { path: "profile", element: <ProfileSection /> },
          { path: "danger", element: <DangerSection /> },
        ],
      },
      { path: "billing", element: <BillingPage />, errorElement: <RouteError /> },
      { path: "*", element: <RouteError /> },
    ],
  },
]);
