import { useEffect, useState } from "react";
import { Lock, Plus, Trash2, Check, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ApiError, useApi, type SecretSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { useConfirm } from "@/components/ConfirmDialog";

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function EnvVarsPanel({ functionId }: { functionId: string }) {
  const { request } = useApi();
  const confirm = useConfirm();
  const [secrets, setSecrets] = useState<SecretSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await request<{ secrets: SecretSummary[] }>(
        `/api/functions/${functionId}/secrets`,
      );
      setSecrets(r.secrets);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [functionId]);

  async function addSecret() {
    const name = newName.trim();
    const value = newValue;
    if (!name || !value) return;
    if (!NAME_PATTERN.test(name)) {
      toast.error("Name must start with a letter/underscore and contain only letters, digits, underscores");
      return;
    }
    setBusy(true);
    try {
      await request(`/api/functions/${functionId}/secrets`, {
        method: "POST",
        body: JSON.stringify({ name, value }),
      });
      setNewName("");
      setNewValue("");
      toast.success("Secret added");
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "name_taken") {
        toast.error("A secret with this name already exists");
      } else {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    if (!editValue) return;
    setBusy(true);
    try {
      await request(`/api/functions/${functionId}/secrets/${id}`, {
        method: "PUT",
        body: JSON.stringify({ value: editValue }),
      });
      setEditingId(null);
      setEditValue("");
      toast.success("Secret updated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeSecret(s: SecretSummary) {
    const ok = await confirm({
      title: `Delete ${s.name}?`,
      description: "This secret will be removed from all future invocations of this function.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await request(`/api/functions/${functionId}/secrets/${s.id}`, {
      method: "DELETE",
    });
    toast.success("Secret deleted");
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Add environment variable
        </div>
        <form
          className="flex flex-wrap items-center gap-2"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            void addSecret();
          }}
        >
          <Input
            className="h-8 flex-1 min-w-[160px] font-mono text-xs"
            placeholder="API_KEY"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={busy}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
          />
          <Input
            className="h-8 flex-[2] min-w-[200px] font-mono text-xs"
            placeholder="value"
            type="password"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            disabled={busy}
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
          />
          <Button
            type="submit"
            size="sm"
            className="h-8"
            disabled={busy || !newName.trim() || !newValue}
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Values are encrypted at rest and exposed to your function as{" "}
          <code className="rounded bg-muted px-1 font-mono text-[11px]">ctx.env</code>.
        </p>
      </div>

      <div>
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Configured secrets
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : secrets.length === 0 ? (
          <EmptyState
            icon={<Lock className="h-6 w-6" />}
            title="No secrets yet"
            body="Add API tokens, database URLs, or webhook secrets. They'll be injected into ctx.env at run time."
          />
        ) : (
          <div className="divide-y divide-border rounded border border-border bg-card">
            {secrets.map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-foreground">{s.name}</span>
                {editingId === s.id ? (
                  <>
                    <Input
                      className="h-7 w-44 font-mono text-xs"
                      type="password"
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveEdit(s.id);
                        if (e.key === "Escape") {
                          setEditingId(null);
                          setEditValue("");
                        }
                      }}
                      disabled={busy}
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-1p-ignore
                      data-lpignore="true"
                      data-form-type="other"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => void saveEdit(s.id)}
                      disabled={busy || !editValue}
                      title="Save"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground"
                      onClick={() => {
                        setEditingId(null);
                        setEditValue("");
                      }}
                      title="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="font-mono text-xs text-muted-foreground" title="Masked value">
                      {s.preview}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditingId(s.id);
                        setEditValue("");
                      }}
                      title="Update value"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => void removeSecret(s)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
