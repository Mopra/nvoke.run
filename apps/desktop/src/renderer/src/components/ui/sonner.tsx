import { CircleAlert, CircleCheck, Info, Loader2, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/lib/theme';

/** Toasts float as small glass capsules at the bottom center, like a HUD. */
function Toaster(props: ToasterProps) {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      position="bottom-center"
      offset={20}
      gap={8}
      icons={{
        success: <CircleCheck className="size-4 text-chart-1" />,
        error: <CircleAlert className="size-4 text-destructive" />,
        warning: <TriangleAlert className="size-4 text-chart-2" />,
        info: <Info className="size-4 text-muted-foreground" />,
        loading: <Loader2 className="size-4 text-muted-foreground motion-safe:animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-[360px] items-start gap-2.5 rounded-xl border bg-popover px-3.5 py-3 text-popover-foreground shadow-lg backdrop-blur-2xl',
          icon: 'mt-px flex size-4 shrink-0 items-center justify-center',
          content: 'flex min-w-0 flex-1 flex-col gap-0.5',
          title: 'text-sm font-medium',
          description: 'truncate text-xs text-muted-foreground',
          actionButton: 'ml-auto h-6 shrink-0 rounded-sm bg-primary px-2 text-xs font-medium text-primary-foreground',
          cancelButton: 'ml-auto h-6 shrink-0 rounded-sm bg-muted px-2 text-xs font-medium',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
