import { Link } from "react-router-dom";
import { Code2 } from "lucide-react";

type Props = {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  footer: React.ReactNode;
};

export function AuthLayout({ children, title, subtitle, footer }: Props) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-6 md:px-10 md:py-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar text-sidebar-foreground">
            <Code2 className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">nvoke</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              run
            </div>
          </div>
        </Link>

        <a
          href="https://nvoke.run"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Back to nvoke.run &rarr;
        </a>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm space-y-10">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
          <div className="text-sm text-muted-foreground">{footer}</div>
        </div>
      </main>
    </div>
  );
}
