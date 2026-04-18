import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useApi, type Fn, type WebhookVerifyKind } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  fn: Fn;
  onUpdated: (fn: Fn) => void;
}

const KIND_OPTIONS: Array<{
  value: WebhookVerifyKind;
  label: string;
  hint: string;
}> = [
  { value: "none", label: "None", hint: "Any request is accepted." },
  {
    value: "stripe",
    label: "Stripe",
    hint: "Verifies Stripe-Signature using your webhook signing secret (whsec_…).",
  },
  {
    value: "github",
    label: "GitHub",
    hint: "Verifies X-Hub-Signature-256 using your webhook secret.",
  },
  {
    value: "hmac_sha256",
    label: "HMAC-SHA256 (generic)",
    hint: "HMAC-SHA256 of the raw body, compared against your configured header.",
  },
];

export function WebhookVerifyPanel({ fn, onUpdated }: Props) {
  const { request } = useApi();
  const [kind, setKind] = useState<WebhookVerifyKind>(fn.webhook_verify_kind);
  const [secret, setSecret] = useState("");
  const [signatureHeader, setSignatureHeader] = useState<string>(
    fn.webhook_signature_header ?? "x-signature",
  );
  const [busy, setBusy] = useState(false);

  const option = KIND_OPTIONS.find((o) => o.value === kind) ?? KIND_OPTIONS[0];
  const hasSecret = fn.webhook_verify_kind !== "none" && fn.webhook_secret_preview != null;
  const needSecret = kind !== "none" && !hasSecret;

  async function save() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { kind };
      if (secret.length > 0) payload.secret = secret;
      if (kind === "hmac_sha256") payload.signature_header = signatureHeader;
      const r = await request<{ function: Fn }>(
        `/api/functions/${fn.id}/webhook-verify`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );
      onUpdated(r.function);
      setSecret("");
      toast.success("Webhook verification updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <div>
          <div className="text-sm font-medium text-foreground">
            Webhook verification
          </div>
          <p className="text-xs text-muted-foreground">
            Reject incoming requests to{" "}
            <code className="rounded bg-muted px-1 font-mono text-[11px]">/f/{fn.slug ?? ":slug"}</code>{" "}
            whose signature does not match.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Scheme
        </label>
        <select
          className="mt-1 h-8 w-full rounded border border-border bg-card px-2 text-foreground outline-none focus:border-primary"
          value={kind}
          onChange={(e) => setKind(e.target.value as WebhookVerifyKind)}
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">{option.hint}</p>
      </div>

      {kind !== "none" && (
        <>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
              Signing secret{" "}
              {hasSecret && (
                <span className="text-muted-foreground">
                  (stored: {fn.webhook_secret_preview})
                </span>
              )}
            </label>
            <Input
              className="mt-1 h-8 font-mono"
              type="password"
              placeholder={hasSecret ? "Leave blank to keep current" : "whsec_…"}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              disabled={busy}
            />
          </div>
          {kind === "hmac_sha256" && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Signature header
              </label>
              <Input
                className="mt-1 h-8 font-mono"
                placeholder="x-signature"
                value={signatureHeader}
                onChange={(e) => setSignatureHeader(e.target.value)}
                disabled={busy}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                The hex digest can optionally be prefixed with{" "}
                <code className="rounded bg-muted px-1 font-mono text-[11px]">sha256=</code>.
              </p>
            </div>
          )}
        </>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-8"
          onClick={() => void save()}
          disabled={busy || needSecret}
          title={needSecret ? "Enter a signing secret first" : undefined}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
