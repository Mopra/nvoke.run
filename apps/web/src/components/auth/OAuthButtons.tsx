import { Button } from "@/components/ui/button";

type Strategy = "oauth_google" | "oauth_github";

type Props = {
  onStrategy: (strategy: Strategy) => void | Promise<void>;
  disabled?: boolean;
};

export function OAuthButtons({ onStrategy, disabled }: Props) {
  return (
    <div className="grid grid-cols-1 gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => onStrategy("oauth_google")}
        className="h-10"
      >
        <GoogleIcon className="h-4 w-4" />
        Continue with Google
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => onStrategy("oauth_github")}
        className="h-10"
      >
        <GithubIcon className="h-4 w-4" />
        Continue with GitHub
      </Button>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.47-1.73 4.3-5.5 4.3a6.4 6.4 0 1 1 0-12.8c2 0 3.36.86 4.13 1.6l2.82-2.72C17.1 2.9 14.77 2 12 2a10 10 0 1 0 0 20c5.77 0 9.6-4.05 9.6-9.77 0-.66-.07-1.17-.16-1.73H12z"
      />
    </svg>
  );
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M12 .5C5.73.5.66 5.58.66 11.86c0 5.02 3.24 9.28 7.75 10.78.57.1.78-.25.78-.55v-1.93c-3.15.69-3.82-1.52-3.82-1.52-.52-1.32-1.27-1.67-1.27-1.67-1.03-.71.08-.7.08-.7 1.14.08 1.74 1.17 1.74 1.17 1.02 1.75 2.67 1.25 3.32.95.1-.74.4-1.25.72-1.54-2.51-.29-5.15-1.26-5.15-5.6 0-1.24.44-2.25 1.16-3.04-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.12 1.16.91-.25 1.88-.38 2.85-.39.97.01 1.94.14 2.85.39 2.17-1.46 3.12-1.16 3.12-1.16.61 1.55.23 2.69.11 2.98.72.79 1.16 1.8 1.16 3.04 0 4.35-2.65 5.3-5.17 5.59.41.36.77 1.06.77 2.14v3.17c0 .31.21.66.79.55 4.5-1.5 7.74-5.77 7.74-10.78C23.34 5.58 18.27.5 12 .5z" />
    </svg>
  );
}
