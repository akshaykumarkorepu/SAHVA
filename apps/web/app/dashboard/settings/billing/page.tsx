"use client";

import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { pay, type BillingStatus } from "@/lib/billing";
import { daysLeft, inr, perMonthOnYearly, subscriptionState, yearlySaving } from "@/lib/pricing";
import { formatDate } from "@/lib/format";
import { Badge, Button, Card, ErrorState, LoadingRows, cn } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * Plan and payments. A payment is shown as made only after the API has
 * verified Razorpay's signature and extended the subscription.
 */
export default function BillingPage() {
  const { clinic } = useSession();
  const tz = clinic?.timezone;
  const client = useQueryClient();
  const q = useApi<BillingStatus>("/billing");
  const [busy, setBusy] = React.useState<null | "monthly" | "yearly">(null);

  if (q.loading) return <LoadingRows rows={3} />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error("No billing data")} onRetry={q.reload} />;

  const { plan, subscription: sub, payments, payments_enabled } = q.data;
  const state = subscriptionState(sub);
  const yearly = plan.yearly_price_paise ?? 0;
  const saving = yearlySaving(plan.monthly_price_paise, yearly);

  async function choose(cycle: "monthly" | "yearly") {
    setBusy(cycle);
    try {
      const outcome = await pay(cycle, (msg) => toast.error(msg));
      if (outcome.kind === "paid") {
        toast.success("Payment received — thank you. Your plan is active.");
        void client.invalidateQueries({ queryKey: ["api"] });
      } else if (outcome.kind === "pending") {
        // Not "active": the money is being checked. Say exactly that.
        toast(outcome.message);
        void client.invalidateQueries({ queryKey: ["api"] });
      } else if (outcome.kind === "cancelled") {
        toast("Payment window closed. Nothing was charged.");
      } else {
        toast.error(outcome.message);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the payment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <StatusCard state={state} sub={sub} tz={tz} />

      {!payments_enabled && (
        <p role="status" className="rounded-2xl border border-accent-amber/30 bg-accent-amber/[0.07] p-4 text-sm text-ink">
          Online payment is not set up on this server yet, so plans cannot be bought here. Your trial is unaffected.
        </p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">
          {state === "active" ? "Pay ahead" : "Choose a plan"}
          <span className="ml-2 font-normal text-ink-subtle">
            {state === "trial" ? "— paid time starts when your trial ends, so you lose no trial days" : ""}
          </span>
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <PlanCard
            title="Monthly"
            price={inr(plan.monthly_price_paise)}
            per="/month"
            note="One month at a time. Not renewed automatically."
            busy={busy === "monthly"}
            disabled={!payments_enabled || busy !== null}
            onPay={() => void choose("monthly")}
          />
          {yearly > 0 && (
            <PlanCard
              title="Yearly"
              price={inr(yearly)}
              per="/year"
              note={`${inr(perMonthOnYearly(yearly))} a month — save ${inr(saving.paise)} (${saving.percent}%).`}
              highlight
              busy={busy === "yearly"}
              disabled={!payments_enabled || busy !== null}
              onPay={() => void choose("yearly")}
            />
          )}
        </div>
        <p className="mt-3 text-xs text-ink-subtle">
          Paid securely through Razorpay — UPI, cards or netbanking. Prices include everything in {plan.name}; taxes as
          applicable.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Payments</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-ink-muted">No payments yet.</p>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="block font-medium text-ink">
                    {inr(p.amount_paise)} · {p.billing_cycle === "yearly" ? "1 year" : "1 month"}
                  </span>
                  <span className="block text-xs text-ink-subtle">
                    Covers {formatDate(p.period_start, tz)} – {formatDate(p.period_end, tz)} · paid{" "}
                    {formatDate(p.paid_at, tz)}
                  </span>
                </span>
                <span className="font-mono text-xs text-ink-subtle" title="Quote this reference for any billing question">
                  {p.razorpay_payment_id}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function StatusCard({ state, sub, tz }: { state: ReturnType<typeof subscriptionState>; sub: BillingStatus["subscription"]; tz?: string }) {
  if (!sub) return null;
  const left = daysLeft(sub.current_period_end);
  const content = {
    trial: {
      tone: "info" as const,
      label: "Free trial",
      title: `${left} day${left === 1 ? "" : "s"} left in your free trial`,
      body: `Ends ${formatDate(sub.current_period_end, tz)}. Choose a plan any time before then.`,
    },
    trial_ended: {
      tone: "warn" as const,
      label: "Trial ended",
      title: "Your free trial has ended",
      body: "Choose a plan to keep using SAHVA. Your data is safe and waiting.",
    },
    active: {
      tone: "good" as const,
      label: sub.billing_cycle === "yearly" ? "Yearly" : "Monthly",
      title: "Your plan is active",
      body: `Paid until ${formatDate(sub.current_period_end, tz)}. Nothing renews automatically — pay again before then to continue.`,
    },
    lapsed: {
      tone: "warn" as const,
      label: "Expired",
      title: "Your plan has expired",
      body: "Pay for a new period to keep using SAHVA.",
    },
    none: null,
  }[state];
  if (!content) return null;
  return (
    <Card className="flex items-start gap-4 p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-500/10 text-brand-700">
        <Icon name="rupee" className="h-5 w-5" />
      </span>
      <div>
        <Badge tone={content.tone}>{content.label}</Badge>
        <p className="mt-2 font-display text-lg font-semibold text-ink">{content.title}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{content.body}</p>
      </div>
    </Card>
  );
}

function PlanCard({
  title,
  price,
  per,
  note,
  highlight,
  busy,
  disabled,
  onPay,
}: {
  title: string;
  price: string;
  per: string;
  note: string;
  highlight?: boolean;
  busy: boolean;
  disabled: boolean;
  onPay: () => void;
}) {
  return (
    <Card className={cn("flex flex-col p-5", highlight && "ring-2 ring-brand-600/40")}>
      <p className="text-sm font-semibold text-ink">
        {title}
        {highlight && <span className="ml-2 rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] text-brand-700">Best value</span>}
      </p>
      <p className="mt-2">
        <span className="font-display text-3xl font-bold text-ink">{price}</span>
        <span className="text-sm text-ink-subtle">{per}</span>
      </p>
      <p className="mt-1 flex-1 text-sm text-ink-muted">{note}</p>
      <Button className="mt-4" loading={busy} disabled={disabled} onClick={onPay}>
        Pay {price}
      </Button>
    </Card>
  );
}
