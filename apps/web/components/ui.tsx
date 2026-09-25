"use client";

import * as React from "react";
import { ApiError } from "@/lib/api";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-ink-100 bg-white shadow-card ${className}`}>
      {children}
    </div>
  );
}

export type Tone = "good" | "warn" | "neutral" | "bad" | "info";

const TONES: Record<Tone, string> = {
  good: "bg-primary-50 text-primary-700 border-primary-100",
  warn: "bg-amber-50 text-amber-700 border-amber-100",
  bad: "bg-rose-50 text-rose-700 border-rose-100",
  info: "bg-sky-50 text-sky-700 border-sky-100",
  neutral: "bg-ink-100 text-ink-700 border-ink-100",
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
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
  variant?: "primary" | "ghost" | "outline" | "danger";
}) {
  const variants: Record<string, string> = {
    primary: "bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-soft",
    ghost: "bg-transparent text-ink-700 hover:bg-ink-100",
    outline: "border border-ink-300 bg-white text-ink-700 hover:bg-ink-100",
    danger: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800",
  };
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight text-ink-900 md:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Empty states are a feature, not filler. "Nothing needs you right now" is
 * genuinely useful information on the Action Required queue.
 */
export function EmptyState({
  icon = "—",
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-300 bg-white/60 px-6 py-14 text-center">
      <span aria-hidden className="text-3xl opacity-60">
        {icon}
      </span>
      <p className="mt-3 text-sm font-medium text-ink-900">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-500">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const api = error instanceof ApiError ? error : null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800"
    >
      <p className="font-medium text-rose-900">{error.message}</p>
      {api?.detail && <p className="mt-1 text-rose-700">{api.detail}</p>}
      {api?.hint && <p className="mt-1 text-rose-700">{api.hint}</p>}
      {api?.requestId && (
        <p className="mt-2 font-mono text-xs text-rose-600">request {api.requestId}</p>
      )}
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="mt-3">
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-ink-100 ${className}`} />;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-14">
      <div
        role="status"
        aria-label={label}
        className="h-7 w-7 animate-spin rounded-full border-2 border-ink-300 border-t-primary-600"
      />
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink-700">
        {label}
        {required && <span className="text-rose-600"> *</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </label>
  );
}

const INPUT =
  "rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-primary-600 focus:ring-1 focus:ring-primary-600 disabled:bg-ink-100";

/**
 * Tailwind decides between `w-full` and `w-auto` by stylesheet order, not by
 * the order they appear in a className string — so baking `w-full` into the
 * base class silently defeated every width override at the call site. Apply
 * the default only when the caller has not asked for a width.
 */
const withWidth = (cn?: string) => `${INPUT} ${/\bw-/.test(cn ?? "") ? "" : "w-full"} ${cn ?? ""}`;

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    return <input ref={ref} {...props} className={withWidth(props.className)} />;
  },
);

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select(props, ref) {
  return <select ref={ref} {...props} className={withWidth(props.className)} />;
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea(props, ref) {
  return <textarea ref={ref} {...props} className={withWidth(props.className)} />;
});

/** Simple accessible modal. Used for booking, time off and batch dispatch. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button aria-label="Close" className="absolute inset-0 bg-ink-900/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-soft sm:rounded-2xl"
      >
        <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
        <div className="mt-4">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
