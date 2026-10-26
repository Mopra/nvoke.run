'use client';

import { useId, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ANTHROPIC_MODELS, DEFAULT_AI_MODELS, type AiKey } from '@nvoke/shared';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { aiKeyErrorMessage, modelLabel, saveAiKeyBody } from '@/lib/app/ai-key';
import { useAiKey, useDeleteAiKey, useSaveAiKey } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

/** The listed models, plus a stored one nvoke no longer lists, so the select never shows blank. */
function modelOptions(current: string): { id: string; label: string }[] {
  const listed: { id: string; label: string }[] = [...ANTHROPIC_MODELS];
  return listed.some((m) => m.id === current) ? listed : [...listed, { id: current, label: current }];
}

function ModelField({ label, help, value, onChange }: { label: string; help: string; value: string; onChange: (id: string) => void }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-1 basis-56 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full text-left">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {modelOptions(value).map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}

function Status({ aiKey }: { aiKey: AiKey | null }) {
  return (
    <div className="flex items-start gap-3 py-5">
      <span className={cn('led mt-1.5', aiKey && 'led-on')} />
      <div className="min-w-0">
        <div className="text-[15px]">{aiKey ? `Anthropic key ending in ${aiKey.last4}` : 'Running on nvoke’s Claude'}</div>
        {aiKey && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[12px] tracking-[0.04em] text-muted-foreground uppercase">
            <span>Bulk {modelLabel(aiKey.bulkModel)}</span>
            <span>Quality {modelLabel(aiKey.qualityModel)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RemoveDialog({ open, onOpenChange, onRemoved }: { open: boolean; onOpenChange: (open: boolean) => void; onRemoved: () => void }) {
  const remove = useDeleteAiKey();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove your Claude key?</AlertDialogTitle>
          <AlertDialogDescription>nvoke forgets it and runs on its own Claude again, with the default models.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: () => {
                  onRemoved();
                  toast.success('Key removed');
                },
                onError: (err) => toast.error('Couldn’t remove the key', { description: err.message }),
              })
            }
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The form. Its models start from what is stored and follow each save and removal. */
function AiKeyForm({ aiKey }: { aiKey: AiKey | null }) {
  const save = useSaveAiKey();
  const keyId = useId();
  const errorId = useId();
  const [apiKey, setApiKey] = useState('');
  const [bulkModel, setBulkModel] = useState<string>(aiKey?.bulkModel ?? DEFAULT_AI_MODELS.bulkModel);
  const [qualityModel, setQualityModel] = useState<string>(aiKey?.qualityModel ?? DEFAULT_AI_MODELS.qualityModel);
  const [removing, setRemoving] = useState(false);

  const typed = apiKey.trim() !== '';
  const modelsChanged = aiKey !== null && (bulkModel !== aiKey.bulkModel || qualityModel !== aiKey.qualityModel);
  const canSave = !save.isPending && (typed || modelsChanged);

  function submit(e: FormEvent): void {
    e.preventDefault();
    if (!canSave) return;
    save.mutate(saveAiKeyBody({ apiKey, bulkModel, qualityModel }), {
      onSuccess: (saved) => {
        // Never keep the key on screen once it is stored.
        setApiKey('');
        setBulkModel(saved.bulkModel);
        setQualityModel(saved.qualityModel);
        toast.success(typed ? 'Key saved' : 'Models saved');
      },
    });
  }

  const error = save.error ? aiKeyErrorMessage(save.error) : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 pt-5 pb-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={keyId}>{aiKey ? 'Replace key' : 'Anthropic API key'}</Label>
        <Input
          id={keyId}
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            if (save.isError) save.reset();
          }}
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-..."
          className="font-mono"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {aiKey && <p className="text-xs text-muted-foreground">Leave it empty to keep the stored key and change only the models.</p>}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-5">
        <ModelField label="Bulk model" help="Fit scoring, people, openers." value={bulkModel} onChange={setBulkModel} />
        <ModelField label="Quality model" help="Search plans, site profile." value={qualityModel} onChange={setQualityModel} />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" variant="dark" disabled={!canSave}>
          {save.isPending && <Loader2 className="motion-safe:animate-spin" />}
          {save.isPending ? 'Checking with Anthropic' : typed || !aiKey ? 'Save key' : 'Save models'}
        </Button>
        {aiKey && (
          <Button type="button" variant="ghost" onClick={() => setRemoving(true)}>
            Remove key
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Anthropic bills the calls made on your key. Models other than the defaults are untested.</p>
      <RemoveDialog
        open={removing}
        onOpenChange={setRemoving}
        onRemoved={() => {
          setBulkModel(DEFAULT_AI_MODELS.bulkModel);
          setQualityModel(DEFAULT_AI_MODELS.qualityModel);
          save.reset();
        }}
      />
    </form>
  );
}

/** "Your own Claude key": run nvoke's Claude calls on the account's Anthropic key. */
export function AiKeySetting() {
  const { data: aiKey, error, isPending, refetch } = useAiKey();

  if (isPending) {
    return (
      <div className="flex flex-col gap-3 py-5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="py-5 text-sm text-muted-foreground">
        Couldn’t load your Claude key.{' '}
        <button
          type="button"
          className="rounded-sm text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => void refetch()}
        >
          Try again
        </button>
      </p>
    );
  }
  return (
    <div className="flex flex-col divide-y divide-border border-y border-border" data-ai-key>
      <Status aiKey={aiKey} />
      <AiKeyForm aiKey={aiKey} />
    </div>
  );
}
