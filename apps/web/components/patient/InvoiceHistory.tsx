import { type Lang, patientDate } from "@/lib/portal/i18n";
import { Badge, Card, EmptyState } from "@/components/ui";
import type { Invoice } from "./types";
import { rupees } from "./logic";

export function InvoiceHistory({ invoices, L, lang }: { invoices: Invoice[]; L: boolean; lang: Lang }) {
  if (invoices.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          icon="rupee"
          title={L ? "బిల్లులు లేవు" : "No bills"}
          body={L ? "ఇంకా ఏమీ జారీ కాలేదు." : "Nothing has been issued yet."}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.map((inv) => {
        const paid = inv.status === "paid";
        return (
          <Card key={inv.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-sm font-semibold tracking-tight text-ink">
                  {inv.invoice_number}
                </p>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {inv.issued_at ? patientDate(inv.issued_at, "Asia/Kolkata", lang) : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg font-bold tracking-tight text-ink">
                  {rupees(inv.total_paise)}
                </p>
                <Badge tone={paid ? "good" : "warn"}>
                  {paid
                    ? L
                      ? "చెల్లించారు"
                      : "Paid"
                    : L
                      ? "చెల్లించాలి"
                      : "Due"}
                </Badge>
              </div>
            </div>

            <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
              {inv.items.map((it, i) => (
                <li key={`${it.description}-${i}`} className="flex justify-between gap-3 text-[13px]">
                  <span className="text-ink-muted">
                    {it.description}
                    {it.quantity > 1 && ` × ${it.quantity}`}
                  </span>
                  <span className="shrink-0 text-ink">
                    {rupees(it.unit_price_paise * it.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            {!paid && (
              <p className="mt-4 rounded-xl bg-accent-amber/[0.08] p-3 text-[13px] text-ink-muted">
                {L
                  ? "క్లినిక్‌లో చెల్లించండి. ఆన్‌లైన్ చెల్లింపు ఇంకా అందుబాటులో లేదు."
                  : "Pay at the clinic. Online payment is not available yet."}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
