'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { LogoLoader } from '@/components/app/motion';
import { CampaignFields } from '@/components/app/sending/campaign-form';
import { SendingNotice } from '@/components/app/sending/parts';
import { APP_FRAME, APP_INSET, BackLink, DisplayTitle, PageHeader } from '@/components/app/shell';
import { Button } from '@/components/ui/button';
import {
  buildCreateCampaign,
  campaignFormProblem,
  campaignPath,
  CAMPAIGNS_PATH,
  newCampaignForm,
  sendingError,
  type CampaignForm,
  type SourcePick,
} from '@/lib/app/sending';
import { useCreateCampaign, useDrops, useMailboxes, useSearches } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

/**
 * A new campaign. `pick` opens it on a search or a drop (`?search=` or
 * `?drop=`). Creating it enrolls the leads and starts Claude writing; the
 * campaign's page shows them for review, and nothing goes out before Start.
 */
export function CampaignNew({ pick }: { pick: SourcePick | null }) {
  const mailboxes = useMailboxes();
  if (mailboxes.isPending) {
    return (
      <main className={cn(APP_FRAME, 'app-view')}>
        <LogoLoader page label="Loading the mailboxes" />
      </main>
    );
  }
  return <NewForm pick={pick} />;
}

function NewForm({ pick }: { pick: SourcePick | null }) {
  const mailboxes = useMailboxes().data?.mailboxes ?? [];
  const searches = useSearches();
  const drops = useDrops();
  const [form, setForm] = useState<CampaignForm>(() => newCampaignForm(mailboxes, pick));
  const [touched, setTouched] = useState(false);
  const create = useCreateCampaign();
  const router = useRouter();
  const problem = touched ? campaignFormProblem(form) : null;

  // A mailbox connected in another tab shows up checked once the list refetches.
  const known = mailboxes.map((m) => m.id).join();
  useEffect(() => {
    if (!known) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((f) => (f.mailboxIds.length > 0 ? f : { ...f, mailboxIds: newCampaignForm(mailboxes).mailboxIds }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known]);

  function submit(event: FormEvent): void {
    event.preventDefault();
    setTouched(true);
    const input = buildCreateCampaign(form, searches.data, drops.data?.drops);
    if (!input || create.isPending) return;
    create.mutate(input, {
      onSuccess: (campaign) => {
        toast.success('Campaign created', { description: `${campaign.name}: Claude is writing the emails. Read them, then Start.` });
        router.replace(campaignPath(campaign.id));
      },
      onError: (err) => toast.error('Couldn’t create the campaign', { description: sendingError(err) }),
    });
  }

  return (
    <main className={cn(APP_FRAME, 'app-view pb-24')}>
      <PageHeader leading={<BackLink href={CAMPAIGNS_PATH} label="Campaigns" />} />
      <div className={APP_INSET}>
        <DisplayTitle subtitle="Written per lead by Claude, sent from your mailboxes">New campaign</DisplayTitle>
      </div>
      <SendingNotice className="mb-8" />
      <form onSubmit={submit} className={cn(APP_INSET, 'max-w-4xl')} noValidate>
        <CampaignFields form={form} setForm={setForm} mailboxes={mailboxes} searches={searches.data} drops={drops.data?.drops} />
        <div className="mt-12 flex flex-col items-start gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:gap-5">
          <Button type="submit" size="lg" variant="dark" disabled={create.isPending} className="min-w-44">
            {create.isPending ? <Loader2 className="motion-safe:animate-spin" /> : null}
            Write the emails
            {!create.isPending && <CornerDownLeft className="size-3.5 opacity-70" />}
          </Button>
          {problem ? (
            <span className="text-sm text-destructive">{problem}</span>
          ) : (
            <p className="max-w-md text-sm text-muted-foreground">Nothing is sent yet. You read what Claude wrote, edit or stop any lead, then press Start.</p>
          )}
        </div>
      </form>
    </main>
  );
}
