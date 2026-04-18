import { useEffect, useState } from "react";
import { Check, Zap } from "lucide-react";
import { CheckoutButton, usePlans } from "@clerk/clerk-react/experimental";
import { useApi, type Usage } from "../lib/api";

type PlanKey = "free" | "nano" | "scale";

interface Tier {
  key: PlanKey;
  name: string;
  price: string;
  annual?: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    tagline: "Always free",
    features: [
      "100 executions/day",
      "15s execution timeout",
      "1 concurrent execution",
      "1-day run history",
    ],
  },
  {
    key: "nano",
    name: "Nano",
    price: "$7 /mo",
    annual: "or $60/year (save ~29%)",
    tagline: "For solo builders",
    features: [
      "1,000 executions/day",
      "30s execution timeout",
      "3 concurrent executions",
      "7-day run history",
    ],
    highlight: true,
  },
  {
    key: "scale",
    name: "Scale",
    price: "$29 /mo",
    annual: "or $288/year (2 months free)",
    tagline: "Production workloads",
    features: [
      "10,000 executions/day",
      "30s execution timeout",
      "10 concurrent executions",
      "30-day run history",
      "Overage pricing available",
    ],
  },
];

export default function BillingPage() {
  const { request } = useApi();
  const [usage, setUsage] = useState<Usage | null>(null);
  const { data: plans, isLoading: plansLoading } = usePlans({ for: "user" });

  useEffect(() => {
    let cancelled = false;
    request<Usage>("/api/usage")
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch(() => {
        /* non-blocking */
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  const currentPlan = usage?.plan ?? "free";

  const planIdFor = (key: PlanKey): string | undefined => {
    if (!plans) return undefined;
    return plans.find(
      (p) =>
        p.slug?.toLowerCase() === key ||
        p.name.toLowerCase() === key,
    )?.id;
  };

  return (
    <div className="flex h-full flex-col bg-card text-card-foreground">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
        <div className="text-sm font-semibold text-foreground">Billing</div>
        <span className="text-muted-foreground/50">•</span>
        <div className="text-xs text-muted-foreground">
          Pick a plan that matches how much you invoke.
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-8">
        {usage && (
          <div className="mb-8 flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
            <Zap className="h-4 w-4 text-primary" />
            <div className="text-sm">
              You're on the{" "}
              <span className="font-semibold text-foreground capitalize">
                {usage.plan}
              </span>{" "}
              plan — used{" "}
              <span className="font-semibold text-foreground">
                {usage.daily.used.toLocaleString()}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-foreground">
                {usage.daily.limit.toLocaleString()}
              </span>{" "}
              executions today.
              {usage.daily.overage > 0 && (
                <>
                  {" "}
                  <span className="font-semibold text-amber-400">
                    +{usage.daily.overage.toLocaleString()} overage
                  </span>{" "}
                  will be billed this cycle.
                </>
              )}{" "}
              Run history is kept for{" "}
              <span className="font-semibold text-foreground">
                {usage.retentionDays} {usage.retentionDays === 1 ? "day" : "days"}
              </span>
              .
            </div>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-3">
          {TIERS.map((tier) => {
            const isCurrent = tier.key === currentPlan;
            return (
              <div
                key={tier.key}
                className={`relative flex flex-col rounded-xl border p-6 ${
                  tier.highlight
                    ? "border-primary/60 bg-primary/5"
                    : "border-border bg-muted/10"
                }`}
              >
                {tier.highlight && !isCurrent && (
                  <div className="absolute -top-2 right-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                    Popular
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-2 right-4 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
                    Current
                  </div>
                )}
                <div className="mb-1 text-sm font-semibold text-foreground">
                  {tier.name}
                </div>
                <div className="mb-3 text-xs text-muted-foreground">
                  {tier.tagline}
                </div>
                <div className="mb-1 text-2xl font-bold text-foreground">
                  {tier.price}
                </div>
                {tier.annual && (
                  <div className="mb-4 text-xs text-muted-foreground">
                    {tier.annual}
                  </div>
                )}
                {!tier.annual && <div className="mb-4" />}
                <ul className="flex flex-1 flex-col gap-2">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-foreground"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {(() => {
                  const planId = planIdFor(tier.key);
                  const buttonClass = `mt-6 h-9 w-full rounded-md text-sm font-medium transition ${
                    isCurrent
                      ? "cursor-default bg-muted text-muted-foreground"
                      : tier.highlight
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        : "border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50"
                  }`;
                  const label = isCurrent
                    ? "Current plan"
                    : `Upgrade to ${tier.name}`;
                  if (isCurrent || tier.key === "free" || !planId) {
                    return (
                      <button
                        type="button"
                        disabled
                        className={buttonClass}
                      >
                        {label}
                      </button>
                    );
                  }
                  return (
                    <CheckoutButton planId={planId} planPeriod="month">
                      <button
                        type="button"
                        disabled={plansLoading}
                        className={buttonClass}
                      >
                        {label}
                      </button>
                    </CheckoutButton>
                  );
                })()}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
