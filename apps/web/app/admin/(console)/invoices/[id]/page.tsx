"use client";

import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { ErrorState, LoadingRows } from "@/components/ui";
import { Icon } from "@/components/icons";
import { InvoiceDocument, type Invoice } from "@/components/billing/InvoiceDocument";

export default function AdminInvoice({ params }: { params: { id: string } }) {
  const q = useApi<Invoice & { clinic_id: string }>(`/admin/invoices/${params.id}`, [params.id]);
  if (q.loading) return <LoadingRows rows={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error("Invoice not found")} onRetry={q.reload} />;
  return (
    <>
      <Link href={`/admin/clinics/${q.data.clinic_id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink print:hidden">
        <Icon name="chevronLeft" className="h-4 w-4" /> {q.data.buyer.name}
      </Link>
      <InvoiceDocument inv={q.data} />
    </>
  );
}
