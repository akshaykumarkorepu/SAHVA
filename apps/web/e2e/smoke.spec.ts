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
