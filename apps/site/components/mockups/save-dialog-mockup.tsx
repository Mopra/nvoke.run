import { FileSpreadsheet, Folder, HardDrive, Monitor } from 'lucide-react';
import { MockWindow } from '@/components/mockups/window';
import { cn } from '@/lib/utils';

const PLACES = [
  { icon: Monitor, label: 'Desktop' },
  { icon: Folder, label: 'Documents', active: true },
  { icon: Folder, label: 'Sales' },
  { icon: HardDrive, label: 'Shared drive' },
];

const FILES = ['label-printers-germany.csv', 'physio-aarhus.csv', 'launches-week-40.csv'];

/** A native save dialog with a CSV export about to be written. */
export function SaveDialogMockup({ className }: { className?: string }) {
  return (
    <MockWindow title="Save leads" className={className}>
      <div className="flex text-xs">
        <ul className="hidden w-36 shrink-0 flex-col gap-0.5 border-r border-sidebar-border bg-sidebar p-2 sm:flex">
          {PLACES.map(({ icon: Icon, label, active }) => (
            <li
              key={label}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5',
                active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground',
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </li>
          ))}
        </ul>
        <div className="flex min-w-0 flex-1 flex-col">
          <ul className="flex flex-col p-2">
            {FILES.map((f) => (
              <li key={f} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground">
                <FileSpreadsheet className="size-3.5 shrink-0" />
                <span className="truncate">{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-col gap-3 border-t bg-muted/40 p-3">
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-muted-foreground">Save as</span>
              <span className="min-w-0 flex-1 truncate rounded-md border border-ring bg-background px-2 py-1.5 ring-[3px] ring-ring/25">
                dentists-copenhagen.csv
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <span className="rounded-md border bg-background px-3 py-1.5">Cancel</span>
              <span className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground">Save</span>
            </div>
          </div>
        </div>
      </div>
    </MockWindow>
  );
}
