import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowUpRight, Loader2, Monitor, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { ApiKeys, ConnectAgent } from '@/components/ApiKeys';
import type { DesktopSettings } from '../../../ipc/contract';
import { Webhooks } from '@/components/Webhooks';
import { BackButton, PageHeader } from '@/components/AppShell';
import { Avatar } from '@/components/Avatar';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { acceleratorFromEvent, acceleratorLabel } from '../../../ipc/accelerator';
import { api } from '@/lib/api';
import { FREE_PLAN, PLANS, planLabel } from '@nvoke/shared';
import { desktopApi, trayPlace } from '@/lib/desktop';
import { BILLING_URL } from '@/lib/env';
import { formatNumber, percent, periodLabel, resetDate } from '@/lib/format';
import { isMac } from '@/lib/hotkeys';
import { useMe, usePlanSync } from '@/lib/queries';
import { setThemePreference, useTheme, type ThemePreference } from '@/lib/theme';
import type { Me } from '@/lib/types';
import { cn } from '@/lib/utils';

/** The month's verified emails as one large number over a hairline meter. */
function Usage({ me }: { me: Me }) {
  const { emailsVerified, emailsLimit: limit, period } = me.usage;
  const share = percent(emailsVerified, limit);
  const left = Math.max(0, limit - emailsVerified);
  return (
    <section>
      <div className="flex items-baseline gap-3">
        <span className="font-display text-5xl font-extralight tabular-nums">{formatNumber(emailsVerified)}</span>
        <span className="text-base text-muted-foreground">of {formatNumber(limit)} verified emails</span>
      </div>
      <div
        role="meter"
        aria-label="Verified emails used this month"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={emailsVerified}
        className="mt-6 h-[3px] overflow-hidden rounded-full bg-foreground/[0.08]"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-1000 ease-out-soft',
            share >= 90 ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${share}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {left === 0
          ? `Out of verified emails for ${periodLabel(period)}. Searches stop at the limit until ${resetDate(period)}. Or upgrade.`
          : `${formatNumber(left)} left in ${periodLabel(period)}. Resets on ${resetDate(period)}.`}
      </p>
    </section>
  );
}

/** A setting: what it is on the left, its control on the right. No box around it. */
function Setting({ label, description, children }: { label: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-8 py-5">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium">{label}</div>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
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

/** Start at login, hidden in the tray. Only in the desktop app, where there is a tray. */
function OpenAtLogin() {
  const [desktop] = useState(desktopApi);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    desktop
      ?.getSettings()
      .then((s) => setEnabled(s.openAtLogin))
      .catch(() => undefined);
  }, [desktop]);

  if (!desktop || enabled === null) return null;

  function change(next: boolean): void {
    setEnabled(next);
    desktop
      ?.setOpenAtLogin(next)
      .then((s) => setEnabled(s.openAtLogin))
      .catch((err: unknown) => {
        setEnabled(!next);
        toast.error('Couldn’t change start at login', { description: err instanceof Error ? err.message : undefined });
      });
  }

  return (
    <Setting
      label="Open at login"
      description={`Starts quietly in the ${trayPlace()}, so drops and searches can reach you. Closing the window keeps it there.`}
    >
      <Switch checked={enabled} onCheckedChange={change} aria-label="Open at login" />
    </Setting>
  );
}

/** The global shortcut that opens the quick window over any app. Click Change, then press the new keys. */
function QuickHotkey() {
  const [desktop] = useState(desktopApi);
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    desktop
      ?.getSettings()
      .then(setSettings)
      .catch(() => undefined);
  }, [desktop]);

  if (!desktop || !settings) return null;

  function record(event: KeyboardEvent<HTMLButtonElement>): void {
    event.preventDefault();
    if (event.key === 'Escape') {
      setRecording(false);
      return;
    }
    const accelerator = acceleratorFromEvent(event, isMac);
    if (!accelerator) return;
    setRecording(false);
    desktop
      ?.setHotkey(accelerator)
      .then(setSettings)
      .catch((err: unknown) =>
        toast.error('Couldn’t change the shortcut', { description: err instanceof Error ? err.message : undefined }),
      );
  }

  return (
    <Setting
      label="Quick search shortcut"
      description={
        <>
          Opens a small search bar over any app, even while nvoke is in the {trayPlace()}.
          {settings.hotkeyError && <span className="mt-1 block text-destructive">{settings.hotkeyError}</span>}
        </>
      }
    >
      <Button
        variant="outline"
        onClick={() => setRecording(true)}
        onKeyDown={recording ? record : undefined}
        onBlur={() => setRecording(false)}
        aria-label="Change quick search shortcut"
      >
        {recording ? 'Press the new keys' : acceleratorLabel(settings.hotkey, isMac)}
      </Button>
    </Setting>
  );
}

function AccountSkeleton() {
  return (
    <div className="flex flex-col gap-14">
      <div className="flex items-center gap-5">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <Skeleton className="h-14 w-64" />
      <Skeleton className="h-24 w-full rounded-[20px]" />
    </div>
  );
}

export function AccountScreen() {
  const { data: me, error, isPending, refetch } = useMe();
  const [signingOut, setSigningOut] = useState(false);
  usePlanSync();

  async function signOut(): Promise<void> {
    setSigningOut(true);
    try {
      await api.signOut();
    } catch (err) {
      toast.error('Couldn’t sign out', { description: err instanceof Error ? err.message : undefined });
      setSigningOut(false);
    }
  }

  return (
    <>
      <PageHeader leading={<BackButton />} />
      <main className="fade-edges flex-1 overflow-auto px-8 pb-24">
        <div className="mx-auto flex max-w-[620px] flex-col pt-14 motion-safe:animate-rise">
          {isPending ? (
            <AccountSkeleton />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : (
            <>
              <div className="flex items-center gap-5">
                <Avatar user={me.user} className="size-16 text-lg" />
                <div className="min-w-0">
                  <h1 className="truncate font-display text-3xl font-semibold">
                    {me.user.name ?? me.user.email ?? 'Your account'}
                  </h1>
                  {me.user.name && me.user.email && (
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{me.user.email}</div>
                  )}
                </div>
              </div>

              {me.account.createdBy === 'agent' && (
                <p className="mt-6 text-sm text-muted-foreground">
                  {me.account.agentName ? `An agent, ${me.account.agentName},` : 'An agent'} created this account for
                  you.
                </p>
              )}

              <div className="mt-16">
                <Usage me={me} />
              </div>

              <div className="mt-14 flex flex-col divide-y divide-border">
                <Setting
                  label={me.plan === FREE_PLAN ? 'Free plan' : `${planLabel(me.plan)} plan, $${PLANS[me.plan].priceUsd} a month`}
                  description="Only valid emails count, each address once. Billing lives on nvoke.run."
                >
                  <Button
                    variant={me.plan === FREE_PLAN ? 'default' : 'outline'}
                    onClick={() => void api.openExternal(BILLING_URL)}
                  >
                    {me.plan === FREE_PLAN ? 'Upgrade' : 'Manage billing'}
                    <ArrowUpRight className="size-3.5 opacity-60" />
                  </Button>
                </Setting>
                <Setting label="Appearance" description="System follows your computer.">
                  <ThemePicker />
                </Setting>
                <OpenAtLogin />
                <QuickHotkey />
                <Setting label="This computer" description="Sign out anytime. Your searches stay in your account.">
                  <Button variant="ghost" onClick={() => void signOut()} disabled={signingOut}>
                    {signingOut && <Loader2 className="motion-safe:animate-spin" />}
                    Sign out
                  </Button>
                </Setting>
              </div>

              <div className="mt-16">
                <ApiKeys />
              </div>
              <div className="mt-16">
                <Webhooks />
              </div>
              <div className="mt-16">
                <ConnectAgent />
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
