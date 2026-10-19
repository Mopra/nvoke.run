'use client';

import { useState } from 'react';
import { ArrowUpRight, Download } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { dismissExportNotice } from '@/lib/app/desktop';

/**
 * A calm note before a CSV export, the same as in the desktop app: outreach
 * rules differ by country and the customer decides how the contacts are used.
 * Ticking the box skips it from then on, in this browser.
 */
export function ExportNoticeDialog({
  open,
  onOpenChange,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: () => void;
}) {
  const [skip, setSkip] = useState(false);

  function proceed(): void {
    if (skip) dismissExportNotice();
    onOpenChange(false);
    onExport();
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[420px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Before you email anyone</AlertDialogTitle>
          <AlertDialogDescription>
            Under EU ePrivacy rules, many countries require prior consent for marketing email, including to
            businesses and addresses like info@. Calls, letters and LinkedIn follow other rules. How you use these
            contacts is on you.
          </AlertDialogDescription>
          <a
            href="/terms"
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Read the terms
            <ArrowUpRight className="size-3.5" />
          </a>
        </AlertDialogHeader>
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={skip}
            onChange={(e) => setSkip(e.target.checked)}
            className="size-3.5 accent-primary"
          />
          Don’t show this again
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="dark" onClick={proceed}>
            <Download />
            Export CSV
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
