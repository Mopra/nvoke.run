import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import { Loader2 } from "lucide-react";

export default function SsoCallbackPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      <p className="text-xs text-muted-foreground">Signing you in…</p>
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/functions"
        signUpForceRedirectUrl="/functions"
      />
    </div>
  );
}
