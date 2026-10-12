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
