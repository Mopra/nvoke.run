'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';

// Placeholder until the opt-out list has its own endpoint: the form opens a
// prefilled email to the bot address, so a request always reaches a person.
export function OptOutForm({ to }: { to: string }) {
  const [domain, setDomain] = useState('');
  const [note, setNote] = useState('');

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const clean = domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const subject = `Opt out: ${clean}`;
    const body = [`Please stop nvokebot from crawling ${clean}.`, '', note.trim()].join('\n').trim();
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const field =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border bg-card p-6 text-card-foreground">
      <div className="flex flex-col gap-2">
        <label htmlFor="optout-domain" className="text-sm font-medium">
          Your domain
        </label>
        <input
          id="optout-domain"
          name="domain"
          required
          inputMode="url"
          autoComplete="url"
          placeholder="example.dk"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className={field}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="optout-note" className="text-sm font-medium">
          Anything else we should know <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="optout-note"
          name="note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={field}
        />
      </div>
      <Button type="submit" className="w-fit">
        Write opt-out email
      </Button>
      <p className="text-xs text-muted-foreground">
        This opens your email program with a message to {to}. Send it from an address on the domain, or tell us how
        to confirm you run the site.
      </p>
    </form>
  );
}
