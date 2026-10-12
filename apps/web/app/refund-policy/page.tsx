import { LegalPage } from "@/components/site/LegalPage";
import { biz } from "@/lib/site";
import { PRICE } from "@/lib/pricing";

export const metadata = { title: "Refund and cancellation policy · SAHVA" };

export default function Refunds() {
  return (
    <LegalPage title="Refund and cancellation policy" updated="12 October 2026">
      <h2>Try before you pay</h2>
      <p>
        Every clinic starts with a {PRICE.trialDays}-day free trial. No card is needed, so nothing is charged unless you
        choose a plan.
      </p>
      <h2>Cancellation</h2>
      <p>
        Plans are paid in advance for one month or one year and are never renewed automatically. To cancel, simply do
        not pay for the next period; your account stays active until the end of the period you have paid for.
      </p>
      <h2>Refunds</h2>
      <ul>
        <li>If you are charged twice for the same period, or charged in error, we refund the extra payment in full.</li>
        <li>If you ask within 7 days of a payment, we refund it in full.</li>
        <li>After 7 days, monthly payments are not refunded. For a yearly payment we refund the unused whole months.</li>
      </ul>
      <p>
        Approved refunds go back to the original payment method through Razorpay, usually within 5–7 working days.
      </p>
      <h2>How to ask</h2>
      <p>
        Email {biz("email")} from the address on your account with the payment reference shown on your Billing page.
      </p>
    </LegalPage>
  );
}
