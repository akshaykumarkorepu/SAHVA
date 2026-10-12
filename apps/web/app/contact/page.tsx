import { LegalPage } from "@/components/site/LegalPage";
import { biz } from "@/lib/site";

export const metadata = { title: "Contact · SAHVA" };

export default function Contact() {
  return (
    <LegalPage title="Contact us" updated="12 October 2026">
      <p>Questions about SAHVA, billing or your clinic&rsquo;s account — write or call, Monday to Saturday.</p>
      <dl className="mt-8 grid gap-4 sm:grid-cols-2">
        {(
          [
            ["Business", biz("legalName")],
            ["Email", biz("email")],
            ["Phone", biz("phone")],
            ["Address", biz("address")],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-surface-raised p-5">
            <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">{k}</dt>
            <dd className="mt-1 text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8">
        Already a customer? Billing questions are fastest with the payment reference from your Billing page.
      </p>
    </LegalPage>
  );
}
