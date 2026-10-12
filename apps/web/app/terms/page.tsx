import { LegalPage } from "@/components/site/LegalPage";
import { biz } from "@/lib/site";
import { PRICE, inr } from "@/lib/pricing";

export const metadata = { title: "Terms of service · SAHVA" };

export default function Terms() {
  return (
    <LegalPage title="Terms of service" updated="12 October 2026">
      <p>
        These terms are between {biz("legalName")} (&ldquo;SAHVA&rdquo;, &ldquo;we&rdquo;) and the clinic that signs up
        (&ldquo;you&rdquo;). By creating an account you agree to them.
      </p>
      <h2>The service</h2>
      <p>
        SAHVA provides clinic software: an AI receptionist, appointment diary, patient records, patient appointment
        links and related tools. You are responsible for the medical care you provide and for the accuracy of what you
        enter. SAHVA does not give medical advice and is not a substitute for clinical judgement.
      </p>
      <h2>Trial, price and payment</h2>
      <ul>
        <li>New clinics get a {PRICE.trialDays}-day free trial. No card is needed to start it.</li>
        <li>
          After the trial the price is {inr(PRICE.monthlyPaise)} per month or {inr(PRICE.yearlyPaise)} per year, plus
          applicable taxes, paid in advance through Razorpay.
        </li>
        <li>Each payment covers one period. Payments are not renewed or debited automatically.</li>
        <li>We will give at least 30 days&rsquo; notice of any price change; it applies from your next payment.</li>
      </ul>
      <h2>Your data</h2>
      <p>
        You own your clinic&rsquo;s and your patients&rsquo; data. We process it only to provide the service, as
        described in the <a className="text-brand-700 underline" href="/privacy">privacy policy</a>. You are responsible
        for having a lawful basis to record your patients&rsquo; information and for keeping your staff accounts secure.
      </p>
      <h2>Acceptable use</h2>
      <p>
        Do not use SAHVA to send unsolicited messages, to store data you have no right to hold, or to attempt to access
        another clinic&rsquo;s data.
      </p>
      <h2>Availability</h2>
      <p>
        We work to keep SAHVA available but do not guarantee uninterrupted service. Where the AI receptionist cannot
        complete a request it hands it to your staff rather than guessing.
      </p>
      <h2>Ending the service</h2>
      <p>
        You may stop at any time by not paying for the next period. We may suspend an account that breaches these
        terms. On request we will export your data for you within 30 days of the account ending.
      </p>
      <h2>Liability</h2>
      <p>
        To the extent the law allows, our total liability is limited to the amount you paid us in the 12 months before
        the claim.
      </p>
      <h2>Law</h2>
      <p>These terms are governed by the laws of India. Courts in {biz("jurisdiction")} have jurisdiction.</p>
      <h2>Contact</h2>
      <p>
        {biz("legalName")}, {biz("address")}. Email {biz("email")}.
      </p>
    </LegalPage>
  );
}
