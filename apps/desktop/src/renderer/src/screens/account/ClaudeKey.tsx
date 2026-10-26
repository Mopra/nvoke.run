import { useState, type FormEvent } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ANTHROPIC_MODELS, DEFAULT_AI_MODELS } from '@nvoke/shared';
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
import { ApiError } from '@/lib/api';
import { useAiKey, useDeleteAiKey, useSaveAiKey } from '@/lib/queries';

const FIELD = 'h-9 rounded-[4px] bg-card px-3 font-mono text-xs shadow-[inset_0_1px_2px_var(--shadow-strong)]';

function modelLabel(id: string): string {
  return ANTHROPIC_MODELS.find((m) => m.id === id)?.label ?? id;
}

/** Plain words for a failed save. `ai_model_unknown` names the model in `detail`. */
function saveError(err: Error): string {
  if (err instanceof ApiError && err.code === 'ai_model_unknown' && err.detail) {
    return `Anthropic doesn’t offer ${modelLabel(err.detail)} on this key. Pick another.`;
  }
  return err.message;
}

function ModelSelect({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  // A model set through the API that the list does not offer still shows.
  const known = ANTHROPIC_MODELS.some((m) => m.id === value);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <Label id={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-labelledby={id} className={`${FIELD} w-full gap-2 text-left focus-visible:ring-[3px] focus-visible:ring-ring/40`}>
          <span className="min-w-0 flex-1 truncate">
            <SelectValue />
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground/60" />
        </SelectTrigger>
        <SelectContent align="start">
          {ANTHROPIC_MODELS.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
          {!known && <SelectItem value={value}>{value}</SelectItem>}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Your own Claude key: the account's Claude calls run on an Anthropic key the
 * user pastes, with a model per tier. The key goes to the server, which checks
 * it with Anthropic and keeps it sealed; only its last 4 characters come back.
 */
export function ClaudeKey() {
  const { data: aiKey, isPending } = useAiKey();
  const save = useSaveAiKey();
  const remove = useDeleteAiKey();
  const [apiKey, setApiKey] = useState('');
  // null follows the stored choice (or the default); a pick overrides it until saved.
  const [bulk, setBulk] = useState<string | null>(null);
  const [quality, setQuality] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const bulkModel = bulk ?? aiKey?.bulkModel ?? DEFAULT_AI_MODELS.bulkModel;
  const qualityModel = quality ?? aiKey?.qualityModel ?? DEFAULT_AI_MODELS.qualityModel;
  const typed = apiKey.trim();
  const modelsChanged = !!aiKey && (bulkModel !== aiKey.bulkModel || qualityModel !== aiKey.qualityModel);
  const canSave = !save.isPending && (typed.length > 0 || modelsChanged);

  function pick(set: (v: string) => void): (v: string) => void {
    return (v) => {
      set(v);
      save.reset();
    };
  }

  function submit(e: FormEvent): void {
    e.preventDefault();
    if (!canSave) return;
    save.mutate(
      { ...(typed ? { apiKey: typed } : {}), bulkModel, qualityModel },
      {
        onSuccess: (saved) => {
          setApiKey('');
          setBulk(null);
          setQuality(null);
          toast.success(typed ? 'Claude key saved' : 'Models saved', { description: `Key ending in ${saved.last4}` });
        },
      },
    );
  }

  function doRemove(): void {
    remove.mutate(undefined, {
      onSuccess: () => {
        setBulk(null);
        setQuality(null);
        toast.success('Key removed', { description: 'Claude calls run on nvoke’s key again.' });
      },
      onError: (err) => toast.error('Couldn’t remove the key', { description: err.message }),
    });
  }

  return (
    <div className="flex flex-col gap-5 py-5">
      <div className="flex items-start gap-8">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] font-medium tracking-[0.08em] uppercase">Your own Claude key</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {isPending ? (
              'Checking…'
            ) : aiKey ? (
              <>
                Anthropic key ending in <span className="font-mono text-foreground">{aiKey.last4}</span>. Bulk on{' '}
                {modelLabel(aiKey.bulkModel)}, quality on {modelLabel(aiKey.qualityModel)}.
              </>
            ) : (
              'Running on nvoke’s Claude.'
            )}
          </div>
        </div>
        {aiKey && (
          <Button variant="outline" className="shrink-0" onClick={() => setConfirming(true)} disabled={remove.isPending}>
            {remove.isPending && <Loader2 className="motion-safe:animate-spin" />}
            Remove key
          </Button>
        )}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="claude-key">{aiKey ? 'Replace key' : 'Anthropic API key'}</Label>
          <Input
            id="claude-key"
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              save.reset();
            }}
            maxLength={400}
            placeholder="sk-ant-..."
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            className={`${FIELD} text-[13px]`}
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <ModelSelect id="claude-bulk" label="Bulk model (fit scoring, people, openers)" value={bulkModel} onChange={pick(setBulk)} />
          <ModelSelect
            id="claude-quality"
            label="Quality model (search plans, site profile)"
            value={qualityModel}
            onChange={pick(setQuality)}
          />
        </div>
        {save.error && (
          <p role="alert" className="text-xs text-destructive">
            {saveError(save.error)}
          </p>
        )}
        <div className="flex items-center gap-4">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Calls on your key are billed by Anthropic. Models other than the defaults are untested.
          </p>
          <Button type="submit" className="shrink-0" disabled={!canSave}>
            {save.isPending && <Loader2 className="motion-safe:animate-spin" />}
            {typed || !aiKey ? 'Save key' : 'Save models'}
          </Button>
        </div>
      </form>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove your Claude key?</AlertDialogTitle>
            <AlertDialogDescription>
              nvoke forgets the key ending in {aiKey?.last4}. Claude calls run on nvoke’s key again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={doRemove}>Remove key</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
