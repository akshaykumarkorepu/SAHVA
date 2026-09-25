import { Card } from "@/components/ui";

export function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const accent = {
    neutral: "text-ink-900",
    good: "text-primary-700",
    warn: "text-amber-600",
    bad: "text-rose-600",
  }[tone];

  return (
    <Card className="p-4 md:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight md:text-3xl ${accent}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
    </Card>
  );
}
