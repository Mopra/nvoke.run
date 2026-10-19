'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { SignIn, useAuth, useUser } from '@clerk/nextjs';
import { CheckoutButton, SubscriptionDetailsButton, usePlans } from '@clerk/nextjs/experimental';
import { FREE_PLAN, MeResponse, PAID_PLANS, PLAN_ORDER, planLabel, type Plan } from '@nvoke/shared';
import { LogoLoader } from '@/components/app/motion';
import { PlanLadder } from '@/components/app/account/plan-ladder';
import { useInView } from '@/components/site/home/motion';
import { useRunTo } from '@/components/site/pricing/motion';
import { Button } from '@/components/ui/button';
import { CLERK_APPEARANCE } from '@/components/app/clerk-appearance';
import { Card, CardContent, CardDescription, CardHeader, CardLabel, CardTitle } from '@/components/app/plate';
import { resetDate } from '@/lib/app/desktop';
import { apiUrl } from '@/lib/api';
import { formatCount, pricing } from '@/lib/pricing';
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
  const [ref, inView] = useInView<HTMLDivElement>('0px 0px -10% 0px', true);
  // The screen climbs from Free to the plan held, then the row picks.
  const [picked, setPicked] = useState<number | null>(null);
  const climbed = useRunTo(current, 260, inView && picked === null);
  const at = picked ?? climbed;
  const index = picked ?? current;

  const plan = PLAN_ORDER[index] ?? FREE_PLAN;
  const planIdBySlug = useClerkPlanIds();
  const { emailsVerified, emailsLimit, period } = me.usage;

  return (
    <div className="flex w-full flex-col">
      {title ? (
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <h1 className="font-display text-4xl font-light tracking-[-0.02em] motion-safe:animate-rise sm:text-5xl">Your plan</h1>
          {who ? (
            <p className="cap text-muted-foreground">
              Signed in as <span className="normal-case">{who}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <PlanLadder at={at} current={current} onPick={setPicked} screenRef={ref} live={picked !== null} />

      <div className="mt-12 flex flex-col gap-5 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="cap text-muted-foreground tabular-nums">
            {formatCount(emailsVerified)} of {formatCount(emailsLimit)} used · resets {resetDate(period)}
          </span>
          <span className="text-sm text-pretty text-muted-foreground">Every feature on every plan. Changes apply at once.</span>
        </div>
        <PlanAction
          plan={plan}
          current={me.plan}
          direction={index > current ? 'up' : 'down'}
          planId={planIdBySlug.get(plan)}
          onChanged={onChanged}
          returnUrl={returnUrl}
        />
      </div>

      <p className={cn('mt-6 text-sm text-pretty text-muted-foreground', title && 'text-center')}>
        {pricing.vatNote} {doneHint}
      </p>
    </div>
  );
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
        Current plan
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
        <Button size="lg" variant="dark" className="w-full" disabled>
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
      <Button size="lg" variant="dark" className={wide}>
        {label}
      </Button>
    </CheckoutButton>
  );
}
