import { useRef, useState } from 'react';
import { ArrowUpRight, Loader2, Monitor, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/AppShell';
import { Avatar } from '@/components/Avatar';
import { Group, Row } from '@/components/grouped';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { FREE_PLAN, PLANS, planLabel } from '@nvoke/shared';
import { BILLING_URL } from '@/lib/env';
import { formatNumber, percent, periodLabel, resetDate } from '@/lib/format';
import { useMe, usePlanSync } from '@/lib/queries';
import { setThemePreference, useTheme, type ThemePreference } from '@/lib/theme';
import type { Me } from '@/lib/types';
import { useScrolled } from '@/lib/use-scrolled';
import { cn } from '@/lib/utils';

function UsageMeter({ me }: { me: Me }) {
  const { emailsVerified, emailsLimit: limit, period } = me.usage;
  const share = percent(emailsVerified, limit);
  const left = Math.max(0, limit - emailsVerified);
  return (
    <div className="flex flex-col gap-3 px-3.5 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{formatNumber(emailsVerified)}</span>
          <span className="text-sm text-muted-foreground">of {formatNumber(limit)} verified emails</span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{Math.round(share)}%</span>
      </div>
      <div
        role="meter"
        aria-label="Verified emails used this month"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={emailsVerified}
        className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 ease-out-soft',
            share >= 90 ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${share}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {left === 0
          ? `You have used every verified email for ${periodLabel(period)}. Searches stop at the limit until ${resetDate(period)}, or upgrade to keep going.`
          : `${formatNumber(left)} left in ${periodLabel(period)}. Resets on ${resetDate(period)}.`}
      </p>
    </div>
  );
}

function ThemePicker() {
  const { preference } = useTheme();
  return (
    <Segmented<ThemePreference>
      label="Appearance"
      size="sm"
      value={preference}
      onChange={setThemePreference}
      options={[
        { value: 'system', label: 'System', icon: Monitor },
        { value: 'light', label: 'Light', icon: Sun },
        { value: 'dark', label: 'Dark', icon: Moon },
      ]}
    />
  );
}

function AccountSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-3 pt-2">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-48" />
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function AccountScreen() {
  const { data: me, error, isPending, refetch } = useMe();
  const [signingOut, setSigningOut] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  const scrolled = useScrolled(scrollRef);
  usePlanSync();

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
      <PageHeader title="Account" divider={scrolled} />
      <main ref={scrollRef} className="flex-1 overflow-auto px-6 pb-10">
        <div className="mx-auto flex max-w-[560px] flex-col gap-7 pt-4 motion-safe:animate-page-in">
          {isPending ? (
            <AccountSkeleton />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : (
            <>
              <div className="flex flex-col items-center gap-1 text-center">
                <Avatar user={me.user} className="mb-2 size-16 text-lg" />
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{me.user.name ?? me.user.email ?? 'Your account'}</h2>
                  <Badge variant="default">{planLabel(me.plan)}</Badge>
                </div>
                {me.user.name && me.user.email && <div className="font-mono text-xs text-muted-foreground">{me.user.email}</div>}
              </div>

              <Group
                title="Plan"
                footer="Only valid emails count, and each address only once. Invalid, risky and catch-all results are free. Billing happens on nvoke.run."
              >
                <Row
                  label={me.plan === FREE_PLAN ? 'Free plan' : `${planLabel(me.plan)} plan, $${PLANS[me.plan].priceUsd}/month`}
                  description={`${formatNumber(me.usage.emailsLimit)} verified emails a month. Every feature included.`}
                >
                  <Button
                    variant={me.plan === FREE_PLAN ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => void api.openExternal(BILLING_URL)}
                  >
                    {me.plan === FREE_PLAN ? 'Upgrade' : 'Manage billing'}
                    <ArrowUpRight className="size-3.5 opacity-60" />
                  </Button>
                </Row>
                <div className="relative before:absolute before:top-0 before:right-0 before:left-3.5 before:h-px before:bg-border">
                  <UsageMeter me={me} />
                </div>
              </Group>

              <Group title="Appearance">
                <Row label="Theme" description="System follows your computer's setting.">
                  <ThemePicker />
                </Row>
              </Group>

              <Group footer="Signing out removes the session from this computer. Your searches stay in your account.">
                <Row label="Signed in on this computer">
                  <Button variant="outline" size="sm" onClick={() => void signOut()} disabled={signingOut}>
                    {signingOut && <Loader2 className="motion-safe:animate-spin" />}
                    Sign out
                  </Button>
                </Row>
              </Group>
            </>
          )}
        </div>
      </main>
    </>
  );
}
