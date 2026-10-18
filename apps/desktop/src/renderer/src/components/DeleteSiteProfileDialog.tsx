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
import { useDeleteSiteProfile } from '@/lib/queries';
import type { SiteProfile } from '@nvoke/shared';

/** Removes the website read and its planned searches. `onRemoving` runs before the request, so a screen can leave first. */
export function DeleteSiteProfileDialog({
  profile,
  open,
  onOpenChange,
  onRemoving,
}: {
  profile: SiteProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoving?: () => void;
}) {
  const remove = useDeleteSiteProfile();
  const planned = profile.suggestions.length;

  function doDelete(): void {
    onRemoving?.();
    remove.mutate(undefined, {
      onSuccess: () => toast.success('Website removed', { description: profile.domain }),
      onError: (err) => toast.error('Couldn’t remove the website', { description: err.message }),
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {profile.profile.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The read of {profile.domain} and its {planned === 1 ? 'planned search' : `${planned} planned searches`} go. Searches
            you started from it stay.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={doDelete}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
