import { ApiKeys, ConnectAgent } from '@/components/ApiKeys';
import { Webhooks } from '@/components/Webhooks';
import { BackButton, PageHeader, Panel } from '@/components/AppShell';
import { Avatar } from '@/components/Avatar';
import { ErrorState } from '@/components/states';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe, usePlanSync } from '@/lib/queries';
import { AppearanceSetting } from './account/AppearanceSetting';
import { ClaudeKey } from './account/ClaudeKey';
import { DropNotifications } from './account/DropNotifications';
import { InboxFolder } from './account/InboxFolder';
import { LocalCrawl } from './account/LocalCrawl';
import { LocalMcpSection } from './account/LocalMcpSection';
import { OpenAtLogin } from './account/OpenAtLogin';
import { PlanSetting } from './account/PlanSetting';
import { QuickHotkey } from './account/QuickHotkey';
import { ThisComputer } from './account/ThisComputer';
import { Updates } from './account/Updates';
import { Usage } from './account/Usage';
import { RevealWords } from '@/components/Reveal';

function AccountSkeleton() {
  return (
    <div className="flex flex-col gap-14">
      <div className="flex items-center gap-5">
        <Skeleton className="size-16 rounded-[4px]" />
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <Skeleton className="h-14 w-64" />
      <Skeleton className="h-24 w-full rounded-[4px]" />
    </div>
  );
}

/** Account. Each feature's setting is its own component in `account/`, listed here one per line. */
export function AccountScreen() {
  const { data: me, error, isPending, refetch } = useMe();
  usePlanSync();

  return (
    <>
      <PageHeader leading={<BackButton />} />
      <Panel className="px-8 pb-24">
        <div className="mx-auto flex max-w-[620px] flex-col pt-14 motion-safe:animate-view-in">
          {isPending ? (
            <AccountSkeleton />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : (
            <>
              <div className="flex items-center gap-5">
                <Avatar user={me.user} className="size-16 text-lg" />
                <div className="min-w-0">
                  <h1 className="truncate font-display text-3xl font-light" title={me.user.name ?? me.user.email ?? undefined}>
                    <RevealWords text={me.user.name ?? me.user.email ?? 'Your account'} />
                  </h1>
                  {me.user.name && me.user.email && (
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground" title={me.user.email} data-selectable>
                      {me.user.email}
                    </div>
                  )}
                </div>
              </div>

              {me.account.createdBy === 'agent' && (
                <p className="mt-6 font-mono text-xs text-muted-foreground">
                  {me.account.agentName ? `An agent, ${me.account.agentName},` : 'An agent'} created this account for
                  you.
                </p>
              )}

              <div className="mt-16">
                <Usage me={me} />
              </div>

              <div className="mt-14 flex flex-col divide-y divide-border">
                <PlanSetting me={me} />
                <ClaudeKey />
                <AppearanceSetting />
                <OpenAtLogin />
                <QuickHotkey />
                <InboxFolder />
                <DropNotifications />
                <LocalCrawl />
                <Updates />
                <ThisComputer />
              </div>

              <LocalMcpSection />
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
      </Panel>
    </>
  );
}
