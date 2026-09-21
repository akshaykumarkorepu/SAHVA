import * as React from "react";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-ink-100 bg-white shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "good" | "warn" | "neutral" | "bad" | "info";
}) {
  const tones: Record<string, string> = {
    good: "bg-primary-50 text-primary-700 border-primary-100",
    warn: "bg-amber-50 text-amber-700 border-amber-100",
    bad: "bg-rose-50 text-rose-700 border-rose-100",
    info: "bg-sky-50 text-sky-700 border-sky-100",
    neutral: "bg-ink-100 text-ink-700 border-ink-100",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  className = "",
  variant = "primary",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
}) {
  const variants: Record<string, string> = {
    primary:
      "bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-soft",
    ghost: "bg-transparent text-ink-700 hover:bg-ink-100",
    outline:
      "border border-ink-300 bg-white text-ink-700 hover:bg-ink-100",
  };
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}
