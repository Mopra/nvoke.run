'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Plus, X } from 'lucide-react';
import { MAX_STEPS, type Drop, type Mailbox, type Search } from '@nvoke/shared';
import { FieldRow, MailboxLed, PlateInput, PlateTextarea, ToggleKey } from '@/components/app/sending/parts';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { formatNumber, searchTitle } from '@/lib/app/desktop';
import {
  addStep,
  autoCampaignName,
  MAILBOXES_PATH,
  parsePick,
  pickValue,
  removeStep,
  sourceFor,
  sourceSearches,
  toggleDay,
  toggleId,
  weekdayLabel,
  type CampaignForm,
} from '@/lib/app/sending';
import { cn } from '@/lib/utils';

const GRID = 'grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-[180px_minmax(0,1fr)]';

/** A section of the form: a hairline, a cap title, its rows. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-6">
      <h2 className="cap mb-5 text-foreground">{title}</h2>
      <div className={GRID}>{children}</div>
    </section>
  );
}

const numberValue = (n: number): number | string => (Number.isNaN(n) ? '' : n);

/**
 * A campaign's settings as a form: what it sends to (new campaigns only),
 * the emails with their briefs and waits, when and from where, and who gets
 * enrolled. The same form edits a campaign; its source stays.
 */
export function CampaignFields({
  form,
  setForm,
  mailboxes,
  searches,
  drops,
  editing = false,
}: {
  form: CampaignForm;
  setForm: (update: (form: CampaignForm) => CampaignForm) => void;
  mailboxes: Mailbox[];
  searches: Search[] | undefined;
  drops: Drop[] | undefined;
  editing?: boolean;
}) {
  const set = <K extends keyof CampaignForm>(key: K) => (value: CampaignForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const options = sourceSearches(searches);
  const source = form.pick ? sourceFor(form.pick, searches) : null;
  const autopilot = source === 'search' || source === 'drop';

  return (
    <div className="flex flex-col gap-10">
      <Section title="Campaign">
        <FieldRow label="Name" htmlFor="cf-name">
          <PlateInput
            id="cf-name"
            value={form.name}
            onChange={(e) => set('name')(e.target.value)}
            placeholder={autoCampaignName(form.pick, searches, drops)}
            maxLength={80}
            className="max-w-md"
          />
        </FieldRow>
        {!editing && (
          <FieldRow
            label="Send to"
            hint="An ongoing search or a drop keeps going: every new verified lead is written and sent"
            htmlFor="cf-source"
          >
            <Select value={pickValue(form.pick)} onValueChange={(v) => set('pick')(parsePick(v))}>
              <SelectTrigger
                id="cf-source"
                className="h-8 w-full max-w-md justify-between gap-2 rounded-[4px] bg-card px-2.5 text-left font-mono text-xs shadow-[inset_0_1px_2px_var(--shadow-strong)] focus-visible:ring-[3px] focus-visible:ring-ring/25"
              >
                <SelectValue placeholder="Pick a search or a drop" />
              </SelectTrigger>
              <SelectContent>
                {options.map((s) => (
                  <SelectItem key={s.id} value={pickValue({ kind: 'search', id: s.id })}>
                    {searchTitle(s)} · {s.ongoing ? 'ongoing' : `${formatNumber(s.emailsValid)} valid`}
                  </SelectItem>
                ))}
                {(drops ?? []).map((d) => (
                  <SelectItem key={d.id} value={pickValue({ kind: 'drop', id: d.id })}>
                    Drop: {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {options.length === 0 && (drops ?? []).length === 0 ? (
              <p className="mt-1.5 text-xs text-muted-foreground">No finished search with verified emails yet. Run a search or make a drop first.</p>
            ) : source ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {source === 'list'
                  ? 'Sends to the verified leads this search holds now.'
                  : source === 'search'
                    ? 'Autopilot: follows the search and sends to every new verified lead it finds.'
                    : 'Autopilot: follows the drop and sends to the leads of every run it makes from now on.'}
              </p>
            ) : null}
          </FieldRow>
        )}
      </Section>

      <Section title="Emails">
        {form.steps.map((step, i) => (
          <FieldRow
            key={i}
            label={i === 0 ? 'Email 1' : `Email ${i + 1}`}
            hint={i === 0 ? 'Goes out first' : 'Same thread, unless they replied'}
            htmlFor={`cf-brief-${i}`}
          >
            <div className="flex flex-col gap-2">
              {i > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>After</span>
                  <PlateInput
                    aria-label={`Days before email ${i + 1}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={30}
                    value={numberValue(step.waitDays)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, waitDays: e.target.valueAsNumber } : s)) }))
                    }
                    className="w-16"
                  />
                  <span>days</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    aria-label={`Remove email ${i + 1}`}
                    onClick={() => set('steps')(removeStep(form.steps, i))}
                  >
                    <X />
                  </Button>
                </div>
              )}
              <PlateTextarea
                id={`cf-brief-${i}`}
                rows={4}
                maxLength={1000}
                value={step.brief}
                onChange={(e) => setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, brief: e.target.value } : s)) }))}
                placeholder="What this email should do. Claude writes it per lead from this, the company’s site and your site profile."
              />
            </div>
          </FieldRow>
        ))}
        <div className="sm:col-start-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => set('steps')(addStep(form.steps))} disabled={form.steps.length >= MAX_STEPS}>
            <Plus />
            Add a follow up
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Plain text, under 120 words, no links. Your signature and a line on why they get it and how to stop go under every email.
          </p>
        </div>
      </Section>

      <Section title="When and from where">
        <FieldRow label="Days" hint="In each recipient’s time zone">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Sending days">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <ToggleKey key={d} on={form.schedule.days.includes(d)} onClick={() => set('schedule')({ ...form.schedule, days: toggleDay(form.schedule.days, d) })}>
                {weekdayLabel(d)}
              </ToggleKey>
            ))}
          </div>
        </FieldRow>
        <FieldRow label="Hours" htmlFor="cf-start">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>From</span>
            <PlateInput
              id="cf-start"
              type="number"
              inputMode="numeric"
              min={0}
              max={23}
              value={numberValue(form.schedule.startHour)}
              onChange={(e) => set('schedule')({ ...form.schedule, startHour: e.target.valueAsNumber })}
              className="w-16"
            />
            <span>to</span>
            <PlateInput
              aria-label="Sending ends at"
              type="number"
              inputMode="numeric"
              min={1}
              max={24}
              value={numberValue(form.schedule.endHour)}
              onChange={(e) => set('schedule')({ ...form.schedule, endHour: e.target.valueAsNumber })}
              className="w-16"
            />
            <span>o’clock</span>
          </div>
        </FieldRow>
        <FieldRow label="Mailboxes" hint="Each lead stays with one, so the thread does">
          {mailboxes.length === 0 ? (
            <p className="pt-2 text-sm text-muted-foreground">
              No mailbox yet.{' '}
              <Link href={MAILBOXES_PATH} className="text-primary underline-offset-4 hover:underline">
                Connect one
              </Link>{' '}
              first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Mailboxes">
              {mailboxes.map((m) => {
                const usable = m.status === 'active' || m.status === 'checking' || form.mailboxIds.includes(m.id);
                return (
                  <ToggleKey
                    key={m.id}
                    on={form.mailboxIds.includes(m.id)}
                    disabled={!usable}
                    title={m.statusReason ?? undefined}
                    onClick={() => set('mailboxIds')(toggleId(form.mailboxIds, m.id))}
                    className="normal-case tracking-normal"
                  >
                    {m.address}
                    {m.status !== 'active' && <MailboxLed status={m.status} />}
                  </ToggleKey>
                );
              })}
            </div>
          )}
        </FieldRow>
      </Section>

      <Section title="Who gets it">
        <FieldRow label="Named people only" hint="Skip info@ and other shared inboxes" htmlFor="cf-people">
          <div className="flex h-8 items-center">
            <Switch id="cf-people" checked={form.peopleOnly} onCheckedChange={set('peopleOnly')} />
          </div>
        </FieldRow>
        <FieldRow label="Catch-all addresses" hint="The server accepts every address, so these may bounce" htmlFor="cf-catchall">
          <div className="flex h-8 items-center">
            <Switch id="cf-catchall" checked={form.allowCatchAll} onCheckedChange={set('allowCatchAll')} />
          </div>
        </FieldRow>
        <FieldRow label="People per company" hint="The most senior first" htmlFor="cf-per">
          <PlateInput
            id="cf-per"
            type="number"
            inputMode="numeric"
            min={1}
            max={5}
            value={numberValue(form.perCompany)}
            onChange={(e) => set('perCompany')(e.target.valueAsNumber)}
            className="w-16"
          />
        </FieldRow>
        {(autopilot || editing) && (
          <>
            <FieldRow label="New leads a day" hint="At most, so a big drop does not queue weeks of sends" htmlFor="cf-daily">
              <PlateInput
                id="cf-daily"
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                value={numberValue(form.dailyNew)}
                onChange={(e) => set('dailyNew')(e.target.valueAsNumber)}
                className="w-20"
              />
            </FieldRow>
            <FieldRow label="Hold" hint="Hours between writing and the first send, to read and stop any" htmlFor="cf-hold">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <PlateInput
                  id="cf-hold"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={72}
                  value={numberValue(form.holdHours)}
                  onChange={(e) => set('holdHours')(e.target.valueAsNumber)}
                  className="w-16"
                />
                <span>hours</span>
              </div>
            </FieldRow>
          </>
        )}
        <p className={cn('text-xs text-muted-foreground sm:col-start-2')}>
          Only verified addresses. Never Denmark or Germany, never anyone who opted out, never an address one of your campaigns wrote to in the last 90 days.
        </p>
      </Section>
    </div>
  );
}
