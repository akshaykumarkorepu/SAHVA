"use client";

import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { useCanAdminister } from "@/lib/session";
import type { BillingStatus } from "@/lib/billing";
import { daysLeft, subscriptionState } from "@/lib/pricing";
import { cn } from "@/components/ui";

/**
 * One line above every dashboard page while a clinic is on trial or has
 * lapsed. Quiet while there is time; amber in the last three days and after.
 * Owners and managers get the link to pay; other staff are told who can.
 */
export function TrialBanner() {
  const q = useApi<BillingStatus>("/billing");
  const canPay = useCanAdminister();
  const sub = q.data?.subscription ?? null;
  const state = subscriptionState(sub);
  if (!sub || state === "active" || state === "none") return null;

  const left = daysLeft(sub.current_period_end);
  const urgent = state !== "trial" || left <= 3;
  const text =
    state === "trial"
      ? `Free trial — ${left} day${left === 1 ? "" : "s"} left.`
      : state === "trial_ended"
        ? "Your free trial has ended."
        : "Your plan has expired.";

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-[13px]",
        urgent ? "bg-accent-amber/15 text-ink" : "bg-brand-500/10 text-ink",
      )}
    >
      <span className="font-medium">{text}</span>
      {canPay ? (
        <Link href="/dashboard/settings/billing" className="font-semibold text-brand-700 underline">
          {state === "trial" ? "Choose a plan" : "Pay to continue"}
        </Link>
      ) : (
        <span className="text-ink-muted">Your clinic owner can choose a plan.</span>
      )}
    </div>
  );
}
