import { expect, test, type Page } from "@playwright/test";

/**
 * Lets every in-flight request land before errors are checked.
 *
 * Screens render in stages — /me shows the patient's name before the medical
 * record arrives — so the expected text can be on screen while a later stage
 * is still about to throw. Checking errors the moment the text appears let a
 * deliberately broken component pass. Mock responses are delayed by
 * LATENCY_MS in lib/mock, so a short quiet period covers every stage.
 */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_000);
}

/** Collects uncaught exceptions and console errors the page logs. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

const SCREENS: { path: string; expect: RegExp }[] = [
  { path: "/", expect: /AI receptionist|SAHVA/i },
  { path: "/signin", expect: /Welcome back/ },
  { path: "/dashboard", expect: /today|appointments/i },
  { path: "/dashboard/actions", expect: /action/i },
  { path: "/dashboard/appointments", expect: /appointments/i },
  { path: "/dashboard/calls", expect: /calls/i },
  { path: "/dashboard/patients", expect: /patients/i },
  { path: "/dashboard/analytics", expect: /analytics/i },
  { path: "/dashboard/settings", expect: /settings/i },
  // Returned a 500 once; found by hand.
  { path: "/dashboard/settings/staff", expect: /staff/i },
  { path: "/dashboard/settings/doctors", expect: /doctors/i },
  { path: "/dashboard/settings/hours", expect: /hours/i },
  { path: "/dashboard/settings/knowledge", expect: /knowledge|FAQ/i },
  { path: "/me", expect: /Lakshmi Devi/ },
  { path: "/p/mock-portal-token", expect: /Dr Anitha/ },
];

for (const screen of SCREENS) {
  test(`${screen.path} renders without errors`, async ({ page }) => {
    const errors = watchForErrors(page);
    const res = await page.goto(screen.path);
    expect(res?.status(), "HTTP status").toBeLessThan(400);
    await expect(page.locator("body")).toContainText(screen.expect, { timeout: 15_000 });
    await settle(page);
    await expect(page.locator("body")).not.toContainText(/No mock route|Application error|This page hit a problem/);
    await expect(page.locator("body")).toContainText(screen.expect);
    expect(errors).toEqual([]);
  });
}

test("unknown routes get the SAHVA 404, not the Next default", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn’t find that page" })).toBeVisible();
});

test("patient record: every tab renders its section", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/me");
  await expect(page.getByText("Lakshmi Devi")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "English" }).click();

  const tabs: [string, RegExp][] = [
    ["Visits", /Diagnosis/],
    ["Medicines", /Amlodipine/],
    ["Vaccines", /Pentavalent/],
    ["Bills", /SSC-2026-0418/],
    ["Overview", /Taking now/],
  ];
  for (const [tab, content] of tabs) {
    await page.getByRole("tab", { name: tab }).or(page.getByRole("button", { name: tab, exact: true })).last().click();
    await expect(page.locator("main")).toContainText(content);
  }
  await settle(page);
  expect(errors).toEqual([]);
});

test.describe("as a receptionist", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("sahva.mock.role", "receptionist"));
  });

  test("Settings is not in the nav", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText(/today|appointments/i, { timeout: 15_000 });
    await settle(page);
    await expect(page.locator('a[href="/dashboard/settings"]')).toHaveCount(0);
  });

  for (const path of ["/dashboard/settings", "/dashboard/settings/staff", "/dashboard/settings/doctors"]) {
    test(`${path} is refused, with no admin controls rendered`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText("Settings are owner and manager only")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /invite|save|add doctor/i })).toHaveCount(0);
    });
  }
});

test("resolving an action updates the nav badge without a reload", async ({ page }) => {
  await page.goto("/dashboard/actions");
  const badge = page.locator('a[href="/dashboard/actions"]').first();
  await expect(page.getByRole("heading", { name: "Action Required" })).toBeVisible({ timeout: 15_000 });
  await settle(page);

  const before = Number(await badge.innerText().then((t) => t.match(/\d+/)?.[0] ?? "0"));
  expect(before, "fixture should have open actions").toBeGreaterThan(0);

  await page.getByRole("button", { name: /resolve|done|mark/i }).first().click();
  await expect
    .poll(async () => Number((await badge.innerText()).match(/\d+/)?.[0] ?? "0"), { timeout: 5_000 })
    .toBe(before - 1);
});

test("overview: check a patient in from the side panel", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/dashboard");
  const row = page.locator("ol button", { hasText: "Priya Sharma" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("Booked");

  await row.click();
  const panel = page.getByRole("dialog", { name: "Priya Sharma" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("AI call");
  await panel.getByRole("button", { name: "Check in" }).click();

  await expect(panel).toBeHidden();
  await expect(row).toContainText("Checked in");
  await settle(page);
  expect(errors).toEqual([]);
});

test("reschedule batch: approve, rebook one, mark one unreachable, and it closes", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/dashboard/actions/batch/44444444-4444-4444-8444-444444444401");
  await expect(page.getByText("Nothing has been sent, and nobody has been cancelled.")).toBeVisible({ timeout: 15_000 });
  // No contact controls before approval.
  await expect(page.getByRole("button", { name: "Rebook" })).toHaveCount(0);

  await page.getByRole("button", { name: /Approve rescheduling 2/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/does not send WhatsApp messages yet/)).toBeVisible();

  // Toasts are <li> too; "Was" only appears on a patient card.
  const first = page.locator("li", { hasText: "Srinivas Rao" }).filter({ hasText: "Was" });
  await first.getByRole("button", { name: "Rebook" }).click();
  const slots = page.getByRole("dialog").getByRole("button", { name: /^\d{1,2}:\d{2} (am|pm)$/ });
  await expect(slots.first()).toBeVisible();
  // The doctor is on leave 9:00–13:00; nothing in that window may be offered.
  for (const label of await slots.allInnerTexts()) {
    expect(label, "slot inside the leave window").not.toMatch(/^(9|10|11|12):\d{2} am$|^12:\d{2} pm$/);
  }
  await slots.first().click();
  await expect(first).toContainText("Rebooked");
  await expect(first).toContainText("No message");

  const second = page.locator("li", { hasText: "Priya Sharma" }).filter({ hasText: "Was" });
  await second.getByRole("button", { name: "Couldn’t reach" }).click();
  await expect(page.getByText("Every patient has been handled.")).toBeVisible();
  await settle(page);
  expect(errors).toEqual([]);
});

test("diary: losing a slot to someone else keeps the form and refreshes the times", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/dashboard/appointments");
  await page.getByRole("button", { name: "Book appointment" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Book appointment" });
  const slot = dialog.getByRole("button", { name: /^\d{1,2}:\d{2} (am|pm)$/ }).first();
  await expect(slot).toBeVisible({ timeout: 15_000 });
  const chosen = await slot.innerText();

  await slot.click();
  await dialog.getByPlaceholder("Lakshmi Devi").fill("Ramu");
  await dialog.getByPlaceholder("+919885512345").fill("+919000000001");
  // Someone else takes the slot between seeing it and booking it.
  await page.evaluate(() => localStorage.setItem("sahva.mock.slotTaken", "1"));
  await dialog.getByRole("button", { name: "Book", exact: true }).click();

  await expect(dialog.getByRole("alert")).toContainText("just booked by someone else");
  await expect(dialog.getByPlaceholder("Lakshmi Devi")).toHaveValue("Ramu");
  await expect(dialog.getByRole("button", { name: chosen, exact: true })).toHaveCount(0);

  // Picking another time then books.
  await dialog.getByRole("button", { name: /^\d{1,2}:\d{2} (am|pm)$/ }).first().click();
  await dialog.getByRole("button", { name: "Book", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Ramu booked for/)).toBeVisible();
  await settle(page);
  expect(errors).toEqual([]);
});

test("diary: cancelling asks first", async ({ page }) => {
  await page.goto("/dashboard/appointments");
  // Book one so there is something live to cancel today.
  await page.getByRole("button", { name: "Book appointment" }).first().click();
  const book = page.getByRole("dialog", { name: "Book appointment" });
  await book.getByRole("button", { name: /^\d{1,2}:\d{2} (am|pm)$/ }).first().click({ timeout: 15_000 });
  await book.getByPlaceholder("Lakshmi Devi").fill("Sita");
  await book.getByPlaceholder("+919885512345").fill("+919000000002");
  await book.getByRole("button", { name: "Book", exact: true }).click();
  await expect(book).toBeHidden();

  await page.getByRole("tab", { name: "List", exact: true }).click();
  const cancel = page.getByRole("button", { name: "Cancel", exact: true }).first();
  await expect(cancel).toBeVisible({ timeout: 15_000 });
  await cancel.click();
  const confirm = page.getByRole("dialog", { name: /^Cancel / });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Keep it" }).click();
  await expect(confirm).toBeHidden();
});

test("action list: filter by group, and reschedules have no manual Done", async ({ page }) => {
  await page.goto("/dashboard/actions");
  await expect(page.getByRole("heading", { name: "Action Required" })).toBeVisible({ timeout: 15_000 });
  const reschedule = page.locator("div", { hasText: "Dr Anitha is unavailable" }).filter({ has: page.getByRole("button", { name: /Review/ }) }).last();
  await expect(reschedule.getByRole("button", { name: "Done" })).toHaveCount(0);

  await page.getByRole("tab", { name: /AI quality/ }).or(page.getByRole("button", { name: /AI quality/ })).first().click();
  await expect(page.getByText("Dr Anitha is unavailable")).toHaveCount(0);
  await expect(page.getByText("Booking made from poorly-heard speech")).toBeVisible();
});

test("diary by doctor: leave is shaded, and a block opens the panel with a confirmed cancel", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/dashboard/appointments");
  // Book one today so there is a block to open.
  await page.getByRole("button", { name: "Book appointment" }).first().click();
  const book = page.getByRole("dialog", { name: "Book appointment" });
  await book.getByRole("button", { name: /^\d{1,2}:\d{2} (am|pm)$/ }).first().click({ timeout: 15_000 });
  await book.getByPlaceholder("Lakshmi Devi").fill("Gopal");
  await book.getByPlaceholder("+919885512345").fill("+919000000003");
  await book.getByRole("button", { name: "Book", exact: true }).click();
  await expect(book).toBeHidden();

  const block = page.getByRole("button", { name: /Gopal, Booked/ });
  await expect(block).toBeVisible();
  await block.click();
  const panel = page.getByRole("dialog", { name: "Gopal" });
  await panel.getByRole("button", { name: "Cancel this appointment…" }).click();
  const confirm = page.getByRole("dialog", { name: "Cancel Gopal?" });
  await confirm.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("button", { name: /Gopal, / })).toHaveCount(0);
  await settle(page);
  expect(errors).toEqual([]);
});

test("patients: a name opens the quick view, and family on the same phone is shown", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/dashboard/patients");
  await page.getByRole("button", { name: "Lakshmi Devi", exact: true }).click({ timeout: 15_000 });
  const panel = page.getByRole("dialog", { name: "Lakshmi Devi" });
  await expect(panel).toContainText("Coming up");
  await expect(panel).toContainText("Same phone number");
  await panel.getByRole("button", { name: "Send appointment link" }).click();
  await expect(page.getByRole("dialog", { name: "Send appointment link" })).toBeVisible();
  await settle(page);
  expect(errors).toEqual([]);
});

test("patient pages send no referrer, are not indexed, and are not cached", async ({ request }) => {
  for (const path of ["/p/mock-portal-token", "/me"]) {
    const r = await request.get(path);
    expect(r.headers()["referrer-policy"], path).toBe("no-referrer");
    expect(r.headers()["x-robots-tag"], path).toContain("noindex");
  }
  // Dynamic, so Next itself refuses caching; checked rather than assumed.
  const portal = await request.get("/p/mock-portal-token");
  expect(portal.headers()["cache-control"]).toContain("no-store");
});

test("portal: the family share carries the appointment, never the link", async ({ page }) => {
  await page.goto("/p/mock-portal-token");
  const share = page.locator('a[href^="https://wa.me/?text="]').first();
  await expect(share).toBeVisible({ timeout: 15_000 });
  const text = decodeURIComponent((await share.getAttribute("href"))!.split("text=")[1]);
  expect(text).toContain("Dr Anitha");
  expect(text).not.toContain("mock-portal-token");
  expect(text).not.toMatch(/https?:|\/p\//);
});

/** Today in the clinic's timezone at a fixed local time, so slot tests do not depend on when CI runs. */
function clinicToday(hhmm: string): Date {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Date(`${day}T${hhmm}:00+05:30`);
}

test("walk-in: name, number, Enter — and a token to read out", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.clock.install({ time: clinicToday("09:00") });
  await page.goto("/dashboard/appointments");
  await page.getByRole("button", { name: "Walk-in" }).click({ timeout: 15_000 });
  const dialog = page.getByRole("dialog", { name: "Walk-in" });
  // The name field has focus: the receptionist just types.
  await page.keyboard.type("Ramu");
  await dialog.getByPlaceholder("98765 43210").fill("98765 43210");
  await page.keyboard.press("Enter");

  const issued = page.getByRole("dialog", { name: "Token issued" });
  await expect(issued.getByRole("status")).toContainText(/\d+/);
  await expect(issued).toContainText("Ramu");

  // The next one starts clean, same doctor.
  await issued.getByRole("button", { name: "Next walk-in" }).click();
  await expect(page.getByRole("dialog", { name: "Walk-in" }).getByPlaceholder("Ramu")).toHaveValue("");
  await settle(page);
  expect(errors).toEqual([]);
});

test("walk-in: late in the day it says there is no time left, plainly", async ({ page }) => {
  await page.clock.install({ time: clinicToday("23:00") });
  await page.goto("/dashboard/appointments");
  await page.getByRole("button", { name: "Walk-in" }).click({ timeout: 15_000 });
  await page.keyboard.type("Late");
  await page.getByRole("dialog", { name: "Walk-in" }).getByPlaceholder("98765 43210").fill("9876543210");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Walk-in" }).getByRole("alert")).toContainText("no free time left today");
});

test("waiting-room screen shows tokens per doctor and never a patient's name", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/display");
  await page.getByRole("button", { name: /Tap to start/ }).click({ timeout: 15_000 });
  const main = page.locator("main");
  await expect(main).toContainText("Dr Ramesh");
  // Aarav is checked in with Dr Ramesh as token 2.
  await expect(main.locator("article", { hasText: "Dr Ramesh" })).toContainText("2");
  for (const name of ["Lakshmi", "Aarav", "Priya"]) await expect(main).not.toContainText(name);
  await settle(page);
  expect(errors).toEqual([]);
});

test("patient record: the dosage chart reads the prescription, and keeps the doctor's words", async ({ page }) => {
  await page.goto("/me");
  await page.getByRole("button", { name: "English" }).click({ timeout: 15_000 });
  const metformin = page.locator("div", { hasText: /^Metformin/ }).filter({ has: page.getByRole("list", { name: "When to take" }) }).first();
  const chart = metformin.getByRole("list", { name: "When to take" });
  await expect(chart.getByLabel("Morning: yes")).toBeVisible();
  await expect(chart.getByLabel("Afternoon: no")).toBeVisible();
  await expect(chart.getByLabel("Night: yes")).toBeVisible();
  await expect(metformin).toContainText("After food");
  await expect(metformin).toContainText("Take after breakfast and after dinner.");
});

test("patient record: a prescription prints on its own, without the page's buttons", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/me");
  await page.getByRole("button", { name: "English" }).click({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Medicines" }).click();
  await page.getByRole("link", { name: "Print" }).first().click();
  await expect(page.locator("table")).toContainText("Metformin");
  await expect(page.locator("header")).toContainText(/\d{4}/); // the year
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: /Print or save/ })).toBeHidden();
  await settle(page);
  expect(errors).toEqual([]);
});

test("patient quick view: owners see who opened the record; receptionists do not", async ({ page }) => {
  await page.goto("/dashboard/patients");
  await page.getByRole("button", { name: "Lakshmi Devi", exact: true }).click({ timeout: 15_000 });
  const panel = page.getByRole("dialog", { name: "Lakshmi Devi" });
  await expect(panel).toContainText("Who opened this record");
  await expect(panel).toContainText("The patient");
});

test("as a receptionist, the record access log is not shown", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sahva.mock.role", "receptionist"));
  await page.goto("/dashboard/patients");
  await page.getByRole("button", { name: "Lakshmi Devi", exact: true }).click({ timeout: 15_000 });
  const panel = page.getByRole("dialog", { name: "Lakshmi Devi" });
  await expect(panel).toContainText("Coming up");
  await expect(panel).not.toContainText("Who opened this record");
});

test("landing: real prices with a monthly/yearly switch, and no dead phone number", async ({ page }) => {
  await page.goto("/");
  const price = page.locator("#pricing [aria-live]");
  await expect(price).toContainText("₹9,999", { timeout: 15_000 });
  await page.getByRole("tab", { name: "Monthly" }).click();
  await expect(price).toContainText("₹1,999");
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Start 14-day free trial/ }).first()).toHaveAttribute(
    "href",
    "/signin?mode=signup&role=staff",
  );
});

test("signup as a clinic starts a free trial", async ({ page }) => {
  await page.goto("/signin?mode=signup&role=staff");
  await expect(page.getByRole("heading", { name: "Start your 14-day free trial" })).toBeVisible({ timeout: 15_000 });
});

for (const path of ["/terms", "/privacy", "/refund-policy", "/contact"]) {
  test(`${path} renders, and does not invent business details`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible({ timeout: 15_000 });
    // Until lib/site.ts is filled in, the page must say so visibly.
    if (path !== "/refund-policy") await expect(page.locator("main")).toContainText("set in apps/web/lib/site.ts");
  });
}

test("billing: trial shown, pay yearly, plan becomes active and the banner goes", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/dashboard/settings/billing");
  await expect(page.getByText(/days left in your free trial/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("status").filter({ hasText: "Free trial" })).toBeVisible();

  await page.getByRole("button", { name: "Pay ₹9,999" }).click();
  await expect(page.getByText("Your plan is active", { exact: true })).toBeVisible();
  await expect(page.locator("main")).toContainText("pay_mock_");
  await expect(page.getByRole("status").filter({ hasText: "Free trial" })).toHaveCount(0);
  await settle(page);
  expect(errors).toEqual([]);
});

test("admin console: overview figures and the audit log render", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/admin");
  await expect(page.getByText("MRR", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("main")).toContainText("Paying clinics");
  await page.goto("/admin/audit");
  await expect(page.locator("main")).toContainText("admin.sign_in");
  await settle(page);
  expect(errors).toEqual([]);
});

test("admin sign-in is its own page, and nothing on the public site links to the console", async ({ page }) => {
  await page.goto("/admin/signin");
  await expect(page.getByText("SAHVA Admin")).toBeVisible({ timeout: 15_000 });
  for (const path of ["/", "/signin", "/terms", "/contact"]) {
    await page.goto(path);
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  }
});

test("the admin console is never indexed", async ({ request }) => {
  const r = await request.get("/admin/signin");
  expect(r.headers()["x-robots-tag"]).toContain("noindex");
});

test("admin: review an application — checks gate approval, reasons are required, decisions are recorded", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/admin/applications");
  await expect(page.getByText("Padma Children's Clinic")).toBeVisible({ timeout: 15_000 });
  await page.getByText("Padma Children's Clinic").click();

  // Same doctor registration as another applicant.
  await expect(page.getByRole("alert").filter({ hasText: "Possible duplicates" })).toContainText("same doctor");

  const approve = page.getByRole("button", { name: /Approve/ });
  await expect(approve).toBeDisabled();

  // Asking for information without a reason is refused on the page.
  await page.getByRole("button", { name: "Ask for more information" }).click();
  await expect(page.getByText(/Write the reason first/)).toBeVisible();

  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.locator("main")).toContainText("clinic.approve");
  await settle(page);
  expect(errors).toEqual([]);
});

test("clinic under review: banner, and the verification page shows the reviewer's note", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sahva.mock.verification", "needs_info"));
  await page.goto("/dashboard");
  const banner = page.getByRole("status").filter({ hasText: "SAHVA needs a little more information" });
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await banner.getByRole("link").click();
  await expect(page.locator("main")).toContainText("certificate photo is unreadable");
  await expect(page.getByRole("button", { name: "Upload PDF or photo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save and send for review" })).toBeVisible();
});

test("an approved clinic shows no verification banner", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Your clinic is being verified")).toHaveCount(0);
});

test("admin clinics: stages, the attention filter, and extending a trial with a reason", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/admin/clinics");
  await expect(page.getByRole("link", { name: "Sri Sai Clinic" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("tab", { name: /Needs attention/ }).click();
  const table = page.locator("table");
  await expect(table).toContainText("Krishna Clinic"); // ended yesterday: grace
  await expect(table).toContainText("Grace");
  await expect(table).toContainText("Lotus Clinic"); // ended 9 days ago: read-only
  await expect(table).toContainText("Read-only");
  await expect(table).not.toContainText("Sri Sai Clinic");

  await page.getByRole("link", { name: "Lotus Clinic" }).click();
  await expect(page.getByText("Not live for patients")).toBeVisible();
  await page.getByRole("button", { name: /Extend by 7 days/ }).click();
  await expect(page.getByText(/Write the reason/)).toBeVisible();
  await page.getByLabel("Reason").fill("Owner asked for more time to set up");
  await page.getByRole("button", { name: /Extend by 7 days/ }).click();
  await expect(page.getByText("Extended by 7 days.")).toBeVisible();
  await expect(page.locator("main")).toContainText("subscription.extend_trial");
  await settle(page);
  expect(errors).toEqual([]);
});

test("admin clinic detail shows patient counts, never patient names", async ({ page }) => {
  await page.goto("/admin/clinics/a0000000-0000-4000-8000-000000000001");
  await expect(page.getByText("214")).toBeVisible({ timeout: 15_000 });
  for (const name of ["Lakshmi", "Aarav", "Priya", "Srinivas"]) await expect(page.locator("main")).not.toContainText(name);
});

test("admin payments: refund a duplicate from the policy suggestion, then close the exception", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/admin/payments");
  await expect(page.locator("table")).toContainText("Krishna Clinic", { timeout: 15_000 });

  // The second Krishna payment (paid twice) — refund it in full.
  const dupRow = page.locator("tr", { hasText: "pay_mock_m2" });
  await dupRow.getByRole("button", { name: "Refund" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Policy suggests ₹1,999");
  await expect(dialog).toContainText("Within 7 days");
  const go = dialog.getByRole("button", { name: /^Refund/ });
  await expect(go).toBeDisabled(); // reason still empty
  await dialog.getByLabel("Reason").fill("Paid twice by mistake");
  await go.click();
  await expect(page.getByText("Refunded ₹1,999 through Razorpay.")).toBeVisible();
  await expect(dupRow).toContainText("refunded");

  await page.getByRole("tab", { name: /Exceptions/ }).click();
  await expect(page.getByText("Paid twice")).toBeVisible();
  await page.getByRole("button", { name: "Resolved" }).click();
  await expect(page.getByText(/Say what was done/)).toBeVisible();
  await page.getByLabel("What was done").fill("Refunded the second payment");
  await page.getByRole("button", { name: "Resolved" }).click();
  await expect(page.getByText("Nothing needs attention")).toBeVisible();

  await page.getByRole("tab", { name: "Webhook events" }).click();
  await expect(page.getByText("bad signature", { exact: true })).toBeVisible();
  await settle(page);
  expect(errors).toEqual([]);
});

test("admin overview points at waiting applications and payment problems", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: /waiting for verification/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: /payment problem/ })).toBeVisible();
});

test("admin analytics: monthly charts, the table view, and clinics that need a call", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/admin/analytics");
  await expect(page.getByRole("img", { name: "MRR by month" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("img", { name: "Bookings by month" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await expect(page.getByText("1 of 3 live clinics healthy")).toBeVisible();
  await expect(page.getByRole("link", { name: /Lotus Clinic/ })).toHaveAttribute("href", "/admin/clinics/a0000000-0000-4000-8000-000000000003");
  await page.getByRole("tab", { name: "12 months" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(12);
  await settle(page);
  expect(errors).toEqual([]);
});

test("billing: a payment gets a GST invoice, printable, with the total in words", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/dashboard/settings/billing");
  await page.getByRole("button", { name: "Pay ₹9,999" }).click({ timeout: 15_000 });
  await expect(page.getByText("Your plan is active", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Invoice INV\/26-27\/00001/ }).click();
  const inv = page.getByRole("article", { name: /Tax invoice INV\/26-27\/00001/ });
  await expect(inv).toBeVisible();
  await expect(inv).toContainText("CGST @ 9%");
  await expect(inv).toContainText("SGST @ 9%");
  await expect(inv).toContainText("₹9,999.00");
  await expect(inv).toContainText("Rupees Nine Thousand Nine Hundred Ninety Nine Only");
  await expect(inv).toContainText("GSTIN: 36AAACS1234A1Z1");
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
  await settle(page);
  expect(errors).toEqual([]);
});

test("support access: the owner opens it for a few hours with a reason, and closes it", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/dashboard/settings/support");
  await expect(page.getByText("Support has never had access to this clinic.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open access for support" }).click();
  await expect(page.getByText("Say what SAHVA support should look at.")).toBeVisible();
  await page.getByLabel("What should support look at?").fill("Lakshmi's booking shows twice");
  await page.getByLabel("For how long").selectOption("4");
  await page.getByRole("button", { name: "Open access for support" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Open until/ })).toContainText("Lakshmi's booking shows twice");
  await page.getByRole("button", { name: "Close access now" }).click();
  await expect(page.getByText("Support access closed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open access for support" })).toBeVisible();
  await expect(page.locator("main")).toContainText(/closed/);
  await settle(page);
  expect(errors).toEqual([]);
});

test("support access: a manager sees the history but cannot open it", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sahva.mock.role", "manager"));
  await page.goto("/dashboard/settings/support");
  await expect(page.getByText("Only the clinic owner can open access for SAHVA support.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Open access for support" })).toHaveCount(0);
});

test("admin: a refund above ₹2,000 needs a second admin, who approves it", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/admin/payments");
  await expect(page.locator("table")).toContainText("Sri Sai Clinic", { timeout: 15_000 });
  await page.locator("tr", { hasText: "pay_mock_y1" }).getByRole("button", { name: "Refund" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount (₹)").fill("9999");
  await expect(dialog.getByRole("note")).toContainText("a second finance admin must approve");
  await expect(dialog.getByRole("button", { name: "Ask for approval" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("tab", { name: /Refund approvals 1/ }).click();
  await expect(page.getByText("Asked by Finance Two")).toBeVisible();
  await page.getByRole("button", { name: "Approve and refund ₹8,332" }).click();
  await expect(page.getByText("Approved and refunded ₹8,332.")).toBeVisible();
  await expect(page.locator("main")).toContainText("Approved by Ops Admin");
  await settle(page);
  expect(errors).toEqual([]);
});

test("admin: the ledger links each paid payment to its invoice", async ({ page }) => {
  await page.goto("/admin/payments");
  await page.locator("tr", { hasText: "pay_mock_m1" }).getByRole("link", { name: "Invoice" }).click({ timeout: 15_000 });
  await expect(page.getByRole("article", { name: /Tax invoice INV\/26-27/ })).toContainText("Krishna Clinic");
});

test("admin settings: invoicing status, and the refund approval limit", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/admin/settings");
  await expect(page.getByText(/Invoicing on/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Legal name")).toHaveValue("SAHVA Health Technologies Pvt Ltd");
  await page.getByLabel("Second approval above (₹)").fill("5000");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  await settle(page);
  expect(errors).toEqual([]);
});

test("admin support: patients only while the clinic has access open, and emails sent to the owner", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/admin/clinics/a0000000-0000-4000-8000-000000000001");
  await expect(page.getByText("The clinic asked: “A patient's booking shows twice — please check”")).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Find a patient").fill("Lak");
  await page.getByRole("button", { name: "Find" }).click();
  await page.getByRole("button", { name: "Open" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Lakshmi Devi");
  await expect(dialog).toContainText("token 7");
  await dialog.getByRole("button", { name: /close/i }).first().click();
  await expect(page.locator("main")).toContainText("Payment received");

  await page.goto("/admin/clinics/a0000000-0000-4000-8000-000000000002");
  await expect(page.getByText(/Closed\. Patients are visible only if the clinic owner opens access/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Find a patient")).toHaveCount(0);
  await settle(page);
  expect(errors).toEqual([]);
});

test("privacy: the owner sets how long transcripts are kept and who reads them", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/dashboard/settings/support");
  const keep = page.getByLabel("Keep transcripts for");
  await expect(keep).toHaveValue("90", { timeout: 15_000 });
  await keep.selectOption("30");
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.getByLabel(/Receptionists can read transcripts/).uncheck();
  await expect(page.getByLabel(/Receptionists can read transcripts/)).not.toBeChecked();
  await settle(page);
  expect(errors).toEqual([]);
});

test("privacy: a manager sees the transcript settings but cannot change them", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sahva.mock.role", "manager"));
  await page.goto("/dashboard/settings/support");
  await expect(page.getByLabel("Keep transcripts for")).toBeDisabled({ timeout: 15_000 });
  await expect(page.getByText("Only the clinic owner can change these.")).toBeVisible();
});

test("privacy: when the owner hides transcripts, a receptionist sees the call but not its words", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sahva.mock.role", "receptionist");
    localStorage.setItem("sahva.mock.hideTranscripts", "1");
  });
  await page.goto("/dashboard/calls");
  await page.getByRole("button", { name: "View →" }).first().click({ timeout: 15_000 });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("note")).toContainText("owners, managers and doctors only");
});

test("admin security: refused requests by kind and address, and staff role changes", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/admin/security");
  await expect(page.getByText("Most refused addresses")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("main")).toContainText("203.0.113.9");
  await expect(page.locator("main")).toContainText("receptionist → manager");
  await expect(page.locator("main")).not.toContainText("/api/portal/ey"); // never a patient link
  await page.getByRole("tab", { name: "24 hours" }).click();
  await expect(page.locator("main")).not.toContainText("receptionist → manager");
  await settle(page);
  expect(errors).toEqual([]);
});

test("patient: Your clinic lists the doctors with speciality and timings, and books a free slot", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/me");
  await page.getByRole("button", { name: "English" }).click({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Your clinic" }).click();
  const main = page.locator("main");
  await expect(main).toContainText("Dr. Anitha Reddy");
  await expect(main).toContainText("General Physician");
  await expect(main).toContainText(/\d(:\d{2})? AM – \d+(:\d{2})? PM/);
  await expect(main).toContainText("Clinic hours");

  await page.getByRole("button", { name: "Book with Dr. Anitha Reddy" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Book with");
  const firstTime = dialog.getByRole("radiogroup", { name: "Time" }).getByRole("radio").first();
  await firstTime.waitFor();
  await firstTime.click();
  await dialog.getByRole("button", { name: /^Book \d/ }).click();
  await expect(page.getByText(/^Booked with /)).toBeVisible();
  await settle(page);
  expect(errors).toEqual([]);
});

test("patient: a slot someone else just took is reported, not double-booked", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sahva.mock.slotTaken", "1"));
  await page.goto("/me");
  await page.getByRole("button", { name: "English" }).click({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Your clinic" }).click();
  await page.getByRole("button", { name: "Book with Dr. Anitha Reddy" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radiogroup", { name: "Time" }).getByRole("radio").first().click();
  await dialog.getByRole("button", { name: /^Book \d/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("just taken");
});

test("patient: the Book quick action opens Your clinic", async ({ page }) => {
  await page.goto("/me");
  await page.getByRole("button", { name: "English" }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "Book", exact: true }).first().click();
  await expect(page.getByRole("tab", { name: "Your clinic" })).toHaveAttribute("aria-selected", "true");
});

test("patient: a patient at two SAHVA clinics can switch between them", async ({ page }) => {
  await page.goto("/me");
  await page.getByRole("button", { name: "English" }).click({ timeout: 15_000 });
  await expect(page.getByRole("navigation", { name: "Choose clinic" })).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem("sahva.mock.twoClinics", "1"));
  await page.reload();
  const nav = page.getByRole("navigation", { name: /Choose clinic|క్లినిక్ ఎంచుకోండి/ });
  await expect(nav).toContainText("Krishna Clinic", { timeout: 15_000 });
});

/** In the booking sheet, pick the first day that has a free time, then that time. */
async function pickFirstFreeTime(dialog: import("@playwright/test").Locator) {
  const days = dialog.getByRole("radiogroup", { name: "Day" }).getByRole("radio");
  const n = await days.count();
  for (let i = 0; i < n; i++) {
    await days.nth(i).click();
    const times = dialog.getByRole("radiogroup", { name: "Time" }).getByRole("radio");
    try {
      await times.first().waitFor({ timeout: 2_000 });
      await times.first().click();
      return;
    } catch {
      /* no free time this day: try the next */
    }
  }
  throw new Error("no free time in the booking window");
}

test("public clinic page: anyone sees the doctors and requests a time; the clinic calls back", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/c/sri-sai-warangal");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sri Sai Clinic", { timeout: 15_000 });
  await expect(page.locator("main")).toContainText("Dr. Anitha Reddy");
  await expect(page.locator("main")).toContainText("New here? Pick a time below");

  await page.getByRole("button", { name: "Book with Dr. Anitha Reddy" }).click();
  const dialog = page.getByRole("dialog");
  await pickFirstFreeTime(dialog);
  await dialog.getByRole("button", { name: /^Request \d/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("name and 10-digit mobile");

  await dialog.getByLabel("Your name").fill("Suma Reddy");
  await dialog.getByLabel("Mobile number").fill("98765 43210");
  await dialog.getByRole("button", { name: /^Request \d/ }).click();
  await expect(page.getByRole("dialog", { name: "Request sent" })).toContainText("will call +919876543210 to confirm");
  await settle(page);
  expect(errors).toEqual([]);
});

test("public clinic page: a landline or short number is refused", async ({ page }) => {
  await page.goto("/c/sri-sai-warangal");
  await page.getByRole("button", { name: "Book with Dr. Anitha Reddy" }).click({ timeout: 15_000 });
  const dialog = page.getByRole("dialog");
  await pickFirstFreeTime(dialog);
  await dialog.getByLabel("Your name").fill("Suma Reddy");
  await dialog.getByLabel("Mobile number").fill("040 2345 6789");
  await dialog.getByRole("button", { name: /^Request \d/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("10-digit Indian mobile");
});

test("public clinic page: an unknown clinic says so plainly", async ({ page }) => {
  await page.goto("/c/no-such-clinic");
  await expect(page.getByText("This clinic page is not available")).toBeVisible({ timeout: 15_000 });
});

test("settings: the clinic's public link, and the online booking switches", async ({ page }) => {
  await page.goto("/dashboard/settings");
  await expect(page.locator("code").filter({ hasText: "/c/sri-sai-warangal" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel(/New patients can request a time/)).toBeChecked();
  await page.getByLabel(/New patients can request a time/).uncheck();
  await expect(page.getByLabel(/New patients can request a time/)).not.toBeChecked();
});
