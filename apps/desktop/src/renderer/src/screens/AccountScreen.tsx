import { useState, type ReactNode } from 'react';
import { CreditCard, Loader2, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/AppShell';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatNumber, percent, periodLabel, PLAN_LABEL, resetDate } from '@/lib/format';
import { useMe } from '@/lib/queries';
import { setThemePreference, useTheme, type ThemePreference } from '@/lib/theme';
import type { Me } from '@/lib/types';
import { cn } from '@/lib/utils';

const BILLING_URL = 'https://nvoke.run/account/billing';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[13rem_minmax(0,1fr)] gap-8 border-b py-6 last:border-b-0">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function initials(me: Me): string {
  const source = me.user.name ?? me.user.email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function UsageMeter({ me }: { me: Me }) {
  const { emailsFound, limit, period } = me.usage;
  const share = percent(emailsFound, limit);
  const left = Math.max(0, limit - emailsFound);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">{formatNumber(emailsFound)}</span>
        <span className="text-sm text-muted-foreground">of {formatNumber(limit)} emails</span>
      </div>
      <div
        role="meter"
        aria-label="Emails used this month"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={emailsFound}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700', share >= 90 ? 'bg-destructive' : 'bg-ring')}
          style={{ width: `${share}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {left === 0
          ? `You have used every email for ${periodLabel(period)}. New searches stop at the limit until ${resetDate(period)}.`
          : `${formatNumber(left)} left in ${periodLabel(period)}. Resets on ${resetDate(period)}.`}
      </p>
    </div>
  );
}

function ThemePicker() {
  const { preference } = useTheme();
  const options: [ThemePreference, string, typeof Sun][] = [
    ['system', 'System', Monitor],
    ['light', 'Light', Sun],
    ['dark', 'Dark', Moon],
  ];
  return (
    <div role="radiogroup" aria-label="Appearance" className="inline-flex rounded-lg bg-muted p-[3px]">
      {options.map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          onClick={() => setThemePreference(value)}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
            preference === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="flex flex-col gap-10 py-6">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="grid grid-cols-[13rem_minmax(0,1fr)] gap-8">
          <Skeleton className="h-4 w-24" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AccountScreen() {
  const { data: me, error, isPending, refetch } = useMe();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut(): Promise<void> {
    setSigningOut(true);
    try {
      await api.signOut();
    } catch (err) {
      toast.error('Could not sign out', { description: err instanceof Error ? err.message : undefined });
      setSigningOut(false);
    }
  }

  return (
    <>
      <PageHeader title="Account" />
      <main className="flex-1 overflow-auto px-6">
        <div className="mx-auto max-w-3xl">
          {isPending ? (
            <AccountSkeleton />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : (
            <>
              <Section title="Profile">
                <div className="flex items-center gap-3">
                  {me.user.imageUrl ? (
                    <img src={me.user.imageUrl} alt="" className="size-10 rounded-full" />
                  ) : (
                    <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
                      {initials(me)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{me.user.name ?? me.user.email}</div>
                    {me.user.name && <div className="truncate text-sm text-muted-foreground">{me.user.email}</div>}
                  </div>
                </div>
              </Section>

              <Section title="Plan" description="Billing happens on nvoke.run in your browser.">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">{PLAN_LABEL[me.plan]}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(me.usage.limit)} emails a month
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void api.openExternal(BILLING_URL)}>
                    <CreditCard />
                    Manage billing
                  </Button>
                </div>
              </Section>

              <Section title="Usage" description="Every email nvoke finds counts once, valid or not.">
                <UsageMeter me={me} />
              </Section>

              <Section title="Appearance">
                <ThemePicker />
              </Section>

              <Section title="Session" description="Signing out removes the session from this computer.">
                <Button variant="outline" size="sm" onClick={() => void signOut()} disabled={signingOut}>
                  {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
                  Sign out
                </Button>
              </Section>
            </>
          )}
        </div>
      </main>
    </>
  );
}
