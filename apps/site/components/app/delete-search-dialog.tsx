'use client';

import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatNumber, searchTitle } from '@/lib/app/desktop';
import { useDeleteSearch } from '@/lib/app/queries';
import type { Search } from '@nvoke/shared';

export function DeleteSearchDialog({
  search,
  open,
  onOpenChange,
  onDeleted,
}: {
  search: Search;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const remove = useDeleteSearch();

  function doDelete(): void {
    remove.mutate(search.id, {
      onSuccess: () => {
        toast.success('Search deleted', { description: searchTitle(search) });
        onDeleted?.();
      },
      onError: (err) => toast.error('Couldn’t delete the search', { description: err.message }),
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {searchTitle(search)}?</AlertDialogTitle>
          <AlertDialogDescription>
            {formatNumber(search.companiesFound)} companies and {formatNumber(search.emailsFound)} emails, gone for
            good. Emails already counted against your plan stay counted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={doDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
