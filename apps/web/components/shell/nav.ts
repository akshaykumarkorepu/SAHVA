import type { Enums } from "@sahva/types";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Omit to allow every active member. */
  roles?: Enums<"staff_role">[];
  /** Show the open-action-items count on this item. */
  badge?: "actions";
};

/**
 * One nav definition, rendered by both the desktop sidebar and the mobile
 * drawer. On `main` these were separate and the mobile one simply did not
 * exist, so the whole app was unreachable below 768px.
 */
export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "▤" },
  { href: "/dashboard/actions", label: "Action Required", icon: "⚑", badge: "actions" },
  { href: "/dashboard/appointments", label: "Appointments", icon: "▦" },
  { href: "/dashboard/calls", label: "Calls", icon: "☎" },
  { href: "/dashboard/patients", label: "Patients", icon: "◉" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "◔" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙", roles: ["owner", "manager"] },
];

export function visibleNav(role: Enums<"staff_role"> | null): NavItem[] {
  return NAV.filter((i) => !i.roles || (role !== null && i.roles.includes(role)));
}
