# Billing Tiers — Plan

Status: Draft
Date: 2026-04-14
Billing provider: Clerk

## Tiers

### Free — `free`
Always free. No card required.

- **100 executions/day** (~3,000/month)
- **15s** execution timeout
- **1** concurrent execution
- Hard cap — requests beyond the daily limit are rejected with 429
- No overages

### Nano — `nano`
$7/month or $60/year (~29% off, ~3.4 months free)

- **1,000 executions/day** (~30,000/month)
- **30s** execution timeout
- **3** concurrent executions
- Hard cap — requests beyond the daily limit are rejected with 429
- No overages

### Scale — `scale`
$29/month or $288/year (~17% off, 2 months free)

- **10,000 executions/day** (~300,000/month)
- **30s** execution timeout
- **10** concurrent executions
- **Overage pricing** — executions beyond the daily limit continue to run and are billed on top
- Future: team seats, longer retention, priority queue

## Display convention

Advertise limits per-day in UI (intuitive), but enforce whichever resolution matches the tier (see "Open questions"). Pricing page copy example:

> **Nano — $7/month**
> 1,000 executions/day · 30s timeout · 3 concurrent

## Enforcement model

Three limits to enforce per request:

1. **Quota** (executions/day) — counter check before accepting the invocation
2. **Timeout** (15s / 30s) — kill the execution if it runs past the cap
3. **Concurrency** (1 / 3 / 10) — reject if the user already has N in-flight

Plus a safety layer applied to **all tiers**:

4. **Per-second rate limit** — prevents a Scale user from burning 10k/day in 10 minutes and DoS'ing the VPS. Suggest starting at ~5 req/s for Free, 10 req/s for Nano, 30 req/s for Scale.

## Implementation plan

### 1. Clerk setup
- [ ] Create three plans in Clerk dashboard: `free`, `nano`, `scale`
- [ ] Configure monthly + annual prices for Nano and Scale
- [ ] Decide how overages are billed on Scale (metered line item vs. post-hoc invoice) — depends on Clerk capabilities
- [ ] Confirm how plan changes propagate (upgrade/downgrade timing, proration)

### 2. Plan resolution in API
- [ ] Add a `getUserPlan(userId)` helper in [apps/api/src/](../apps/api/src/) that reads the active Clerk plan key and maps it to a `PlanLimits` struct
- [ ] Define `PlanLimits` as a single source of truth (executions/day, timeout, concurrency, rate limit) — one config object keyed by `free` / `nano` / `scale`
- [ ] Cache the plan lookup per request (avoid hitting Clerk on every invocation)

### 3. Quota tracking
- [ ] Add a daily counter store (Redis or Postgres row with `user_id` + `date` + `count`)
- [ ] Increment on successful invocation acceptance (not completion — prevents gaming via cancellation)
- [ ] Reset at UTC midnight (or user's timezone — decide)
- [ ] On quota exceeded: 429 with JSON body explaining tier + upgrade link

### 4. Timeout enforcement
- [ ] Wire the per-plan timeout into the existing execution runner
- [ ] Kill + return a structured timeout error when the cap is hit
- [ ] Verify the existing 15s default doesn't accidentally override the 30s paid cap

### 5. Concurrency enforcement
- [ ] Track in-flight executions per user (in-memory set keyed by user_id, or Redis set)
- [ ] Reject with 429 if count >= plan concurrency
- [ ] Release the slot on completion, error, *and* timeout (don't leak slots)

### 6. Per-second rate limit
- [ ] Token bucket keyed by user_id
- [ ] Apply before quota check (cheaper to reject)

### 7. Overages (Scale only)
- [ ] After the daily quota is hit, continue accepting Scale invocations but mark them as "overage"
- [ ] Record overage count for end-of-cycle billing
- [ ] Decide price per overage execution (suggest: $0.0001–0.001 — cheap enough to not feel punishing)
- [ ] Integration with Clerk's metered billing (if supported) or manual invoice adjustment

### 8. Frontend
- [ ] Pricing page with the three tiers and per-day limits
- [ ] In-app usage widget: today's usage vs. daily cap, with a "running low" warning at 80%
- [ ] Upgrade CTA surfaces when quota is exceeded
- [ ] Account/billing page showing current plan, next renewal, annual upgrade option

### 9. Observability
- [ ] Log quota rejections, concurrency rejections, timeouts per user
- [ ] VPS metrics: CPU, memory, req/s — need these *before* promising 10k/day/user at scale
- [ ] Load test with simulated Scale-tier users to find the real capacity ceiling

### 10. Launch checklist
- [ ] Pricing copy reviewed
- [ ] Existing users grandfathered or migrated to `free`
- [ ] Stripe/Clerk webhooks tested for upgrade/downgrade/cancel flows
- [ ] Quota enforcement tested in staging with a throwaway account on each tier
- [ ] Overage billing dry-run

## Open questions

1. **Daily cap vs. monthly pool.** We advertise per-day but a true daily reset is punishing for bursty users. Options:
   - (a) Hard daily cap — simplest, matches the marketing
   - (b) Monthly pool displayed as daily (30× the day number) — more forgiving
   - (c) Daily cap with a small burst allowance (e.g., can spend 2 days' worth in one day)
   - **Recommendation:** start with (a) for simplicity, revisit if users complain
2. **Timezone for daily reset.** UTC is simplest; user-local is friendlier.
3. **Grandfathering.** Do existing users get pushed to `free` automatically, or do we give beta users a comped Nano/Scale plan for N months?
4. **Overage cap.** Should Scale overages have a ceiling (e.g., 2× quota) to prevent runaway bills, or is it unlimited with an email warning?
5. **VPS capacity.** We don't actually know the ceiling yet — need load testing before committing publicly to 10k/day/user.
