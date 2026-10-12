import { LegalPage } from "@/components/site/LegalPage";
import { biz } from "@/lib/site";

export const metadata = { title: "Privacy policy · SAHVA" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="12 October 2026">
      <p>
        This explains what {biz("legalName")} (&ldquo;SAHVA&rdquo;) does with personal data. Clinics using SAHVA
        decide why their patients&rsquo; data is collected; we process it on their behalf.
      </p>
      <h2>What we hold</h2>
      <ul>
        <li>Clinic staff: name, email, phone, role.</li>
        <li>Patients, as entered by the clinic or given on a call: name, phone, age, language, appointments, and — where the clinic records them — visit notes, prescriptions, vaccinations and bills.</li>
        <li>Calls handled by the AI receptionist: the conversation, so staff can review it.</li>
        <li>Payments: Razorpay processes card, UPI and bank details. We receive only the payment&rsquo;s status and reference, never your card or bank credentials.</li>
      </ul>
      <h2>How it is protected</h2>
      <ul>
        <li>Each clinic&rsquo;s data is walled off from every other clinic&rsquo;s at the database.</li>
        <li>Every opening of a patient&rsquo;s medical record is logged with who opened it; clinic owners can see that log.</li>
        <li>Patient appointment links show appointments only — never diagnoses or prescriptions — and expire.</li>
        <li>Data is encrypted in transit and stored with our cloud database provider.</li>
      </ul>
      <h2>Who it is shared with</h2>
      <p>
        Only service providers needed to run SAHVA — cloud hosting and database, payment processing (Razorpay), and,
        where a clinic uses them, telephony, speech and messaging providers. We do not sell personal data or use it for
        advertising.
      </p>
      <h2>How long we keep it</h2>
      <p>
        For as long as the clinic&rsquo;s account is active and as required by law. When a clinic leaves, we delete its
        data after providing an export, unless the law requires us to keep it longer.
      </p>
      <h2>Your rights</h2>
      <p>
        Patients should contact their clinic to see, correct or delete their information; we will help the clinic do
        so. You can also write to us at {biz("email")}.
      </p>
      <h2>Contact</h2>
      <p>
        {biz("legalName")}, {biz("address")}. Email {biz("email")}.
      </p>
    </LegalPage>
  );
}
