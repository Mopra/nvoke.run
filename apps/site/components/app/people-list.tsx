'use client';

import type { CSSProperties } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { VerificationBadge } from '@/components/app/indicators';
import { FLASH_ROW, useFlash } from '@/components/app/results/fresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { foundViaLabel, PEOPLE_VERIFICATION_LABEL, personName, SENIORITY_LABEL, type PersonRow } from '@/lib/app/icp';
import { cn } from '@/lib/utils';

/**
 * The people first results: one row per person (name, title, decision maker,
 * the address and how it was found, the company), with a company's shared
 * inbox only where nobody is named. The rules for who shows are
 * `peopleRows` in lib/app/icp.ts.
 */

export const PEOPLE_COLUMNS =
  'md:grid md:grid-cols-[minmax(11rem,1fr)_minmax(15rem,1.35fr)_minmax(9rem,0.85fr)_3.5rem] md:gap-6';

export async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error('Couldn’t copy to the clipboard');
  }
}

/** A light tag, never the accent: the accent is for actions and live work. */
export function DecisionMakerBadge() {
  return (
    <Badge data-decision-maker className="shrink-0 self-center">
      Decision maker
    </Badge>
  );
}

function FitScore({ fit }: { fit: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span data-fit className="cap inline-flex shrink-0 cursor-default items-center gap-1.5 text-muted-foreground">
          <span className="h-[3px] w-10 overflow-hidden rounded-[1px] bg-foreground/10">
            <span className="block h-full bg-foreground/45" style={{ width: `${fit}%` }} />
          </span>
          Fit {fit}
        </span>
      </TooltipTrigger>
      <TooltipContent>How well the company matches your description, 0 to 100, judged from its own words.</TooltipContent>
    </Tooltip>
  );
}

function Who({ row }: { row: PersonRow }) {
  const { person } = row;
  if (!person) {
    return (
      <div className="min-w-0 leading-5">
        <div className="text-[15px] text-muted-foreground">{row.fallback ? 'Shared inbox' : 'No name on the site'}</div>
        {row.fallback && <div className="text-xs text-muted-foreground/75">No named person found yet</div>}
      </div>
    );
  }
  return (
    <div className="min-w-0 leading-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 truncate text-[15px]" title={personName(person)}>
          {personName(person)}
        </span>
        {row.decisionMaker && <DecisionMakerBadge />}
      </div>
      <div className="truncate text-xs text-muted-foreground" title={person.title ?? undefined}>
        {person.title ?? (person.seniority ? SENIORITY_LABEL[person.seniority] : 'No title on the site')}
      </div>
    </div>
  );
}

function Address({ row, live, lit }: { row: PersonRow; live: boolean; lit: boolean }) {
  const { email } = row;
  const how = foundViaLabel(email);
  const [local, ...rest] = email.address.split('@');
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="group/email flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void copy(email.address, email.address)}
          className={cn(
            '-my-1.5 flex min-w-0 items-center gap-1.5 rounded-sm py-1.5 text-left font-mono text-xs outline-none transition-colors duration-1000 hover:text-primary hover:duration-150 focus-visible:ring-2 focus-visible:ring-ring/50 sm:my-0 sm:py-0 dark:hover:text-primary',
            lit ? 'text-primary' : 'text-foreground/85 dark:text-foreground/70',
          )}
          title={`Copy ${email.address}`}
        >
          {/* Phones show the whole address over two lines rather than cutting it. */}
          <span className="wrap-anywhere sm:truncate">
            {local}@<wbr />
            {rest.join('@')}
          </span>
          <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover/email:opacity-60" />
        </button>
        <span className="ml-auto" />
        <VerificationBadge
          value={email.verification ?? 'unknown'}
          pending={live && email.verification === null}
          label={PEOPLE_VERIFICATION_LABEL[email.verification ?? 'unknown']}
        />
      </div>
      {how && (
        <div className="truncate text-2xs text-muted-foreground" title={email.confidence != null ? `${how}, confidence ${email.confidence} of 100` : how}>
          {email.sourceUrl && (email.foundVia === 'page' || email.foundVia === 'cache' || !email.foundVia) ? (
            <a
              href={email.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {how}
            </a>
          ) : (
            how
          )}
        </div>
      )}
    </div>
  );
}

export function PersonRowView({
  row,
  live,
  onOpenCompany,
  style,
  fresh = false,
}: {
  row: PersonRow;
  live: boolean;
  /** Found by a poll while the search runs: the row lights up as it lands. */
  fresh?: boolean;
  /** Carries the row's stagger index (`--i`). */
  style?: CSSProperties;
  /** Shows the company with all its addresses, openers and crawl state. */
  onOpenCompany: (domain: string) => void;
}) {
  const { company } = row;
  const lit = useFlash(fresh);
  return (
    <div
      data-person-row
      data-fresh={lit || undefined}
      style={style}
      className={cn(
        PEOPLE_COLUMNS,
        // A hairline row on the chassis.
        'group flex flex-col gap-2.5 border-t border-border py-4 transition-[background-color,box-shadow] duration-[1200ms] last:border-b hover:bg-foreground/[0.035] hover:duration-150 md:items-start sm:px-3',
        lit && FLASH_ROW,
      )}
    >
      <Who row={row} />
      <Address row={row} live={live} lit={lit} />
      <div className="min-w-0 leading-5">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenCompany(company.domain)}
            title={`Show ${company.name} with all its addresses`}
            className="min-w-0 truncate rounded-sm text-left text-[13px] text-foreground/85 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {company.name}
          </button>
          {company.fit != null && <FitScore fit={company.fit} />}
        </div>
        <a
          href={company.website}
          target="_blank"
          rel="noreferrer"
          title={company.domain}
          className="block max-w-full truncate rounded-sm font-mono text-2xs text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {company.domain}
        </a>
      </div>
      <div className="-my-0.5 hidden justify-end gap-0.5 transition-opacity duration-150 pointer-fine:opacity-0 group-hover:opacity-100 focus-within:opacity-100 md:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6 text-muted-foreground"
              aria-label={`Copy ${row.email.address}`}
              onClick={() => void copy(row.email.address, row.email.address)}
            >
              <Copy className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy email</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-sm" className="size-6 text-muted-foreground">
              <a href={company.website} target="_blank" rel="noreferrer" aria-label={`Open ${company.domain}`}>
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open website</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export function PeopleSkeleton() {
  return (
    <div>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={cn(PEOPLE_COLUMNS, 'flex flex-col gap-3 border-t border-border py-5 sm:px-3')}>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-[18px] w-16 rounded-[3px]" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <span />
        </div>
      ))}
    </div>
  );
}
