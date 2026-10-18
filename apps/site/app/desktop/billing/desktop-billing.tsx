'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { SignIn, useAuth, useUser } from '@clerk/nextjs';
import { CheckoutButton, SubscriptionDetailsButton, usePlans } from '@clerk/nextjs/experimental';
import { FREE_PLAN, MeResponse, PAID_PLANS, PLAN_ORDER, planLabel, type Plan } from '@nvoke/shared';
import { LogoLoader } from '@/components/app/motion';
import { PlanSlider } from '@/components/site/plan-slider';
import { Button } from '@/components/ui/button';
import { CLERK_APPEARANCE } from '@/components/app/clerk-appearance';
import { Card, CardContent, CardDescription, CardHeader, CardLabel, CardTitle } from '@/components/app/plate';
import { Badge } from '@/components/ui/badge';
import { apiUrl } from '@/lib/api';
import { formatCount, formatPrice, pricing } from '@/lib/pricing';
import { cn } from '@/lib/utils';

type Load = { kind: 'loading' } | { kind: 'ready'; me: MeResponse } | { kind: 'error'; message: string };

interface BillingProps {
  /** Where checkout and sign-in come back to. */
  returnUrl?: string;
  /** The line under the plans: what to do once the plan is changed. */
  doneHint?: string;
  /** Called after a checkout or cancel, so the page around it can refresh too. */
  onPlanChange?: () => void;
  /** False when the page around it sets its own title, like the web app. */
  title?: boolean;
}

/**
 * Plan, usage and Clerk Billing checkout. The desktop app opens it at
 * /desktop/billing; the web app shows it at /app/billing.
 */
export function DesktopBilling({
  returnUrl = '/desktop/billing',
  doneHint = 'Done? Go back to nvoke. It picks up the new plan on its own.',
  onPlanChange,
  title = true,
}: BillingProps) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LogoLoader />;
  if (!isSignedIn) {
    return <SignIn appearance={CLERK_APPEARANCE} fallback={<LogoLoader />} routing="hash" withSignUp forceRedirectUrl={returnUrl} signUpForceRedirectUrl={returnUrl} />;
  }
  return <Billing returnUrl={returnUrl} doneHint={doneHint} onPlanChange={onPlanChange} title={title} />;
}

function Billing({
  returnUrl,
  doneHint,
  onPlanChange,
  title,
}: Required<Omit<BillingProps, 'onPlanChange'>> & Pick<BillingProps, 'onPlanChange'>) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    onPlanChange?.();
  }, [onPlanChange]);

  useEffect(() => {
    let live = true;
    void fetchMe(getToken).then((next) => {
      if (live) setLoad(next);
    });
    return () => {
      live = false;
    };
  }, [getToken, version]);

  if (load.kind === 'loading') return <LogoLoader label="Loading your plan" />;
  if (load.kind === 'error') {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardLabel className="flex items-center gap-2">
            <span className="led bg-destructive" />
            Failed
          </CardLabel>
          <CardTitle>Couldn’t load your plan</CardTitle>
          <CardDescription>{load.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" className="w-full" onClick={refresh}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const who = user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? null;
  // Keyed by plan so the picker starts on the new plan after a checkout.
  return <PlanPicker key={load.me.plan} me={load.me} who={title ? who : null} onChanged={refresh} returnUrl={returnUrl} doneHint={doneHint} title={title} />;
}

/**
 * Reads plan and usage. sync=1 makes the server read the plan from Clerk
 * Billing first, so a checkout or cancel that just finished shows up right away.
 */
async function fetchMe(getToken: () => Promise<string | null>): Promise<Load> {
  try {
    const token = await getToken();
    if (!token) throw new Error('Your session expired. Sign in again.');
    const res = await fetch(`${apiUrl}/v1/me?sync=1`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`The server said no (${res.status}). Try again.`);
    return { kind: 'ready', me: MeResponse.parse(await res.json()) };
  } catch (err) {
    // fetch throws a TypeError when the server is unreachable.
    if (err instanceof TypeError) {
      return { kind: 'error', message: 'Couldn’t reach our server. Check your connection and try again.' };
    }
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

function PlanPicker({
  me,
  who,
  onChanged,
  returnUrl,
  doneHint,
  title,
}: {
  me: MeResponse;
  who: string | null;
  onChanged: () => void;
  returnUrl: string;
  doneHint: string;
  title: boolean;
}) {
  const current = Math.max(0, PLAN_ORDER.indexOf(me.plan));
  const [index, setIndex] = useState(current);

  const picked = PLAN_ORDER[index] ?? FREE_PLAN;
  const planIdBySlug = useClerkPlanIds();
  const { emailsVerified, emailsLimit } = me.usage;
  const share = Math.min(100, Math.round((emailsVerified / Math.max(1, emailsLimit)) * 100));

  return (
    <div className="flex w-full flex-col gap-6">
      {title ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-display text-4xl font-light tracking-[-0.02em]">Your plan</h1>
          {who ? <p className="cap text-muted-foreground">Signed in as <span className="normal-case">{who}</span></p> : null}
        </div>
      ) : null}

      {/* This month on a screen: the figure lit over ghost digits, the meter in segments. */}
      <section className="screen p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <div className="cap text-screen-foreground/50">
              {me.plan === FREE_PLAN ? 'Free plan' : `${planLabel(me.plan)} plan, ${formatPrice(tierPrice(me.plan))} a month`}
            </div>
            <div className="relative mt-2 inline-block font-lcd text-[40px] leading-none">
              <span aria-hidden className="absolute inset-y-0 right-0 font-extrabold text-screen-dim">
                {'8'.repeat(Math.max(3, formatCount(emailsVerified).length))}
              </span>
              <span className="lcd relative tabular-nums">{formatCount(emailsVerified)}</span>
            </div>
          </div>
          <span className="cap pb-1 text-screen-foreground/50">
            Of {formatCount(emailsLimit)} verified this month
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={emailsLimit}
          aria-valuenow={emailsVerified}
          aria-label="Verified emails used this month"
          className="mt-4 flex gap-[2px]"
        >
          {Array.from({ length: 16 }, (_, i) => (
            <span
              key={i}
              className={cn('h-2.5 min-w-0 flex-1 rounded-[1px]', i < Math.round((share / 100) * 16) ? 'bg-primary' : 'bg-screen-dim')}
            />
          ))}
        </div>
      </section>

      <PlanSlider
        tiers={pricing.tiers}
        index={index}
        onIndexChange={setIndex}
        className="max-w-none"
        badge={
          index === current ? (
            <Badge variant="secondary">Current</Badge>
          ) : null
        }
      >
        <div className="flex flex-col items-center gap-3 border-t border-border pt-7 sm:flex-row sm:justify-between">
          <p className="text-sm text-pretty text-muted-foreground">
            Every feature on every plan. Changes apply immediately.
          </p>
          <PlanAction
            plan={picked}
            current={me.plan}
            direction={index > current ? 'up' : 'down'}
            planId={planIdBySlug.get(picked)}
            onChanged={onChanged}
            returnUrl={returnUrl}
          />
        </div>
      </PlanSlider>

      <p className={cn('text-sm text-pretty text-muted-foreground', title && 'text-center')}>
        {pricing.vatNote} {doneHint}
      </p>
    </div>
  );
}

function tierPrice(plan: Plan): number {
  return pricing.tiers.find((t) => t.plan === plan)?.price ?? 0;
}

/**
 * Clerk's user plans by slug. Our plan key IS the Clerk slug, so this resolves
 * each tier to the Clerk plan id that CheckoutButton needs. A paid tier with
 * no Clerk plan is a dashboard misconfiguration: log it once, loudly.
 */
function useClerkPlanIds(): Map<string, string> {
  const { data } = usePlans({ for: 'user', pageSize: 50 });
  const plans = data ?? [];
  const bySlug = new Map(plans.map((p) => [p.slug, p.id] as const));
  const fingerprint = plans.map((p) => p.slug).join(',');
  const loaded = data !== undefined && data.length > 0;
  useEffect(() => {
    if (!loaded) return;
    const have = new Set(fingerprint.split(','));
    const missing = PAID_PLANS.filter((p) => !have.has(p));
    if (missing.length > 0) {
      console.error(
        `[plans] Clerk has no user plan for: ${missing.join(', ')}. Checkout is disabled for those tiers. ` +
          'The Clerk plan slug must exactly match the key in packages/shared/src/plans.ts.',
      );
    }
  }, [loaded, fingerprint]);
  return bySlug;
}

function PlanAction({
  plan,
  current,
  direction,
  planId,
  onChanged,
  returnUrl,
}: {
  plan: Plan;
  current: Plan;
  direction: 'up' | 'down';
  planId: string | undefined;
  onChanged: () => void;
  returnUrl: string;
}) {
  const wide = 'w-full sm:w-auto';
  if (plan === current) {
    return (
      <Button size="lg" variant="secondary" className={wide} disabled>
        Your current plan
      </Button>
    );
  }

  // Free has no Clerk checkout: moving to it means cancelling the paid plan,
  // which Clerk handles in its subscription details drawer.
  if (plan === FREE_PLAN) {
    return (
      <SubscriptionDetailsButton for="user" onSubscriptionCancel={onChanged}>
        <Button size="lg" variant="secondary" className={wide}>
          Move to Free
        </Button>
      </SubscriptionDetailsButton>
    );
  }

  const label: ReactNode = `${direction === 'up' ? 'Upgrade' : 'Switch'} to ${planLabel(plan)}`;
  if (!planId) {
    return (
      // A disabled button takes no pointer events, so the reason sits on a wrapper.
      <span title={`This plan is not available for checkout: no Clerk plan matches "${plan}".`} className={cn('inline-flex', wide)}>
        <Button size="lg" className="w-full" disabled>
          {label}
        </Button>
      </span>
    );
  }
  return (
    <CheckoutButton
      planId={planId}
      planPeriod="month"
      for="user"
      onSubscriptionComplete={onChanged}
      // Without it, "Continue" after paying lands on the home page.
      newSubscriptionRedirectUrl={returnUrl}
    >
      <Button size="lg" className={wide}>
        {label}
      </Button>
    </CheckoutButton>
  );
}
