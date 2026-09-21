const IST = { timeZone: "Asia/Kolkata" } as const;

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...IST,
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...IST,
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...IST,
  });
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "long",
    ...IST,
  });
}

export function todayIso(): string {
  // YYYY-MM-DD in Asia/Kolkata
  const parts = new Intl.DateTimeFormat("en-CA", { ...IST }).format(new Date()).split("-");
  return parts.length === 3 ? parts.join("-") : new Date().toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatPhone(p: string): string {
  // Indian 10-digit → +91 XXXXX XXXXX
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  return p;
}

export function outcomeLabel(o: string | null): { label: string; tone: "good" | "warn" | "neutral" | "bad" } {
  switch (o) {
    case "booked":
      return { label: "Booked", tone: "good" };
    case "rescheduled":
      return { label: "Rescheduled", tone: "warn" };
    case "cancelled":
      return { label: "Cancelled", tone: "bad" };
    case "inquiry":
      return { label: "Inquiry", tone: "neutral" };
    case "missed":
      return { label: "Missed", tone: "bad" };
    default:
      return { label: "—", tone: "neutral" };
  }
}
