import type { Enums } from "@sahva/types";
import type { IconName } from "@/components/icons";

export type NavItem = {
  href: string;
  label: string;
  /** Shorter label for the mobile tab bar. */
  short?: string;
  icon: IconName;
  roles?: Enums<"staff_role">[];
  badge?: "actions";
  /** Appears in the mobile bottom bar rather than behind "More". */
  primary?: boolean;
};

/**
 * One nav definition for every surface: the desktop rail, the mobile tab bar
 * and the "More" sheet all read from here, so they cannot drift apart.
 */
export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "overview", primary: true },
  { href: "/dashboard/actions", label: "Action Required", short: "Actions", icon: "actions", badge: "actions", primary: true },
  { href: "/dashboard/appointments", label: "Appointments", short: "Diary", icon: "appointments", primary: true },
  { href: "/dashboard/calls", label: "Calls", icon: "calls", primary: true },
  { href: "/dashboard/patients", label: "Patients", icon: "patients" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "analytics" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings", roles: ["owner", "manager"] },
];

export const visibleNav = (role: Enums<"staff_role"> | null) =>
  NAV.filter((i) => !i.roles || (role !== null && i.roles.includes(role)));

export const primaryNav = (role: Enums<"staff_role"> | null) =>
  visibleNav(role).filter((i) => i.primary);

export const secondaryNav = (role: Enums<"staff_role"> | null) =>
  visibleNav(role).filter((i) => !i.primary);

/** Exact match for the index route, prefix match for the rest. */
export function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}
