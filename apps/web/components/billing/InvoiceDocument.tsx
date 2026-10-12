"use client";

import { rupeesInWords } from "@/lib/numberWords";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";

export type Invoice = {
  id: string;
  kind: "invoice" | "credit_note";
  number: string;
  issued_at: string;
  seller: { legal_name: string; address: string; state: string; state_code: string; gstin: string | null; pan: string | null; email: string; phone: string };
  buyer: { name: string; address: string; state: string; state_code: string | null; gstin: string | null };
  description: string;
  sac_code: string;
  period_start: string | null;
  period_end: string | null;
  is_tax_invoice: boolean;
  gst_rate_bps: number;
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_paise: number;
};

const money = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/**
 * A tax invoice, bill of supply or credit note, laid out to print on A4
 * (the browser's Print → Save as PDF). Everything shown comes from the
 * document's own snapshot, never from today's clinic or SAHVA details.
 */
export function InvoiceDocument({ inv }: { inv: Invoice }) {
  const title =
    inv.kind === "credit_note" ? "Credit note" : inv.is_tax_invoice ? "Tax invoice" : "Bill of supply";
  const rate = inv.gst_rate_bps / 100;
  const intra = inv.igst_paise === 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-2 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          <Icon name="printer" className="h-4 w-4" /> Print or save as PDF
        </Button>
      </div>

      <article
        aria-label={`${title} ${inv.number}`}
        className="mx-auto max-w-[800px] rounded-2xl border border-line bg-surface-raised p-6 text-sm text-ink md:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0"
      >
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
          <div>
            <p className="font-display text-xl font-semibold text-brand-700">SAHVA</p>
            <p className="mt-2 font-medium">{inv.seller.legal_name}</p>
            <p className="max-w-xs whitespace-pre-line text-ink-muted">{inv.seller.address}</p>
            <p className="text-ink-muted">
              {inv.seller.state} (code {inv.seller.state_code})
            </p>
            {inv.seller.gstin && <p className="mt-1">GSTIN: <span className="font-mono">{inv.seller.gstin}</span></p>}
            {inv.seller.pan && <p>PAN: <span className="font-mono">{inv.seller.pan}</span></p>}
            {(inv.seller.email || inv.seller.phone) && (
              <p className="text-ink-muted">{[inv.seller.email, inv.seller.phone].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <div className="text-right">
            <h1 className="font-display text-2xl font-semibold">{title}</h1>
            <dl className="mt-2 space-y-0.5">
              <div><dt className="inline text-ink-subtle">Number </dt><dd className="inline font-mono font-medium">{inv.number}</dd></div>
              <div><dt className="inline text-ink-subtle">Date </dt><dd className="inline">{date(inv.issued_at)}</dd></div>
              {inv.kind === "credit_note" && (
                <div className="max-w-[16rem] text-xs text-ink-muted">{inv.description.split(" — ")[0]}</div>
              )}
            </dl>
          </div>
        </header>

        <section className="grid gap-6 border-b border-line py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Billed to</p>
            <p className="mt-1 font-medium">{inv.buyer.name}</p>
            <p className="text-ink-muted">{inv.buyer.address}</p>
            {inv.buyer.gstin && <p className="mt-1">GSTIN: <span className="font-mono">{inv.buyer.gstin}</span></p>}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Place of supply</p>
            <p className="mt-1">
              {inv.buyer.state}
              {inv.buyer.state_code ? ` (${inv.buyer.state_code})` : ""}
            </p>
          </div>
        </section>

        <table className="mt-6 w-full text-left">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-ink-subtle">
            <tr>
              <th className="py-2 pr-3 font-medium">Description</th>
              <th className="py-2 pr-3 font-medium">SAC</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line align-top">
              <td className="py-3 pr-3">
                {inv.kind === "credit_note" ? inv.description.split(" — ").slice(1).join(" — ") || inv.description : inv.description}
                {inv.period_start && inv.period_end && (
                  <span className="block text-xs text-ink-muted">
                    {date(inv.period_start)} – {date(inv.period_end)}
                  </span>
                )}
              </td>
              <td className="py-3 pr-3 font-mono">{inv.sac_code}</td>
              <td className="py-3 text-right tabular-nums">{money(inv.taxable_paise)}</td>
            </tr>
          </tbody>
        </table>

        <dl className="ml-auto mt-4 w-full max-w-xs space-y-1 tabular-nums">
          <Row label={inv.is_tax_invoice ? "Taxable value" : "Amount"} value={money(inv.taxable_paise)} />
          {inv.is_tax_invoice && intra && (
            <>
              <Row label={`CGST @ ${rate / 2}%`} value={money(inv.cgst_paise)} />
              <Row label={`SGST @ ${rate / 2}%`} value={money(inv.sgst_paise)} />
            </>
          )}
          {inv.is_tax_invoice && !intra && <Row label={`IGST @ ${rate}%`} value={money(inv.igst_paise)} />}
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
            <dt>{inv.kind === "credit_note" ? "Total credited" : "Total"}</dt>
            <dd>{money(inv.total_paise)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-right text-xs text-ink-muted">{rupeesInWords(inv.total_paise)}</p>

        <footer className="mt-10 space-y-1 border-t border-line pt-4 text-xs text-ink-subtle">
          {!inv.is_tax_invoice && <p>Supplier not registered under GST; no tax is charged.</p>}
          <p>Tax payable on reverse charge: No.</p>
          <p>Paid through Razorpay. This is a computer-generated document and needs no signature.</p>
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
