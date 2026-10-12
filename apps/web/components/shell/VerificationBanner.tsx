"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";
import { ownerStatus, type VerificationStatus } from "@/lib/verification";
import { cn } from "@/components/ui";

/** Above every page until the clinic is approved, saying what is happening. */
export function VerificationBanner() {
  const { clinic } = useSession();
  const s = clinic?.verification_status as VerificationStatus | undefined;
  if (!s || s === "approved") return null;
  const copy = ownerStatus(s);
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-[13px] text-ink",
        copy.tone === "bad" ? "bg-accent-rose/12" : copy.tone === "warn" ? "bg-accent-amber/15" : "bg-accent-sky/10",
      )}
    >
      <span className="font-medium">{copy.title}.</span>
      <Link href="/dashboard/verification" className="font-semibold text-brand-700 underline">
        {s === "needs_info" ? "See what is needed" : "Details"}
      </Link>
    </div>
  );
}
