"use client";

import * as React from "react";
import { ApiError } from "@/lib/api";
import { Icon, type IconName } from "@/components/icons";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className,
  interactive,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag
      className={cn(
        "rounded-2xl border border-line bg-surface-raised shadow-card",
        interactive && "card-hover",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                      */
/* -------------------------------------------------------------------------- */

export type Tone = "good" | "warn" | "neutral" | "bad" | "info" | "brand";

const TONES: Record<Tone, string> = {
  good: "bg-brand-500/12 text-brand-700 ring-brand-500/25",
  warn: "bg-accent-amber/12 text-accent-amber ring-accent-amber/25",
  bad: "bg-accent-rose/12 text-accent-rose ring-accent-rose/25",
  info: "bg-accent-sky/12 text-accent-sky ring-accent-sky/25",
  brand: "bg-brand-600 text-white ring-brand-600",
  neutral: "bg-surface-sunken text-ink-muted ring-line",
};

export function Badge({
  children,
  tone = "neutral",
  dot,
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
};

const VARIANTS = {
  primary:
    "bg-brand-600 text-white shadow-glow hover:bg-brand-700 active:bg-brand-700 disabled:shadow-none",
  secondary:
    "border border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken active:bg-surface-sunken",
  ghost: "text-ink-muted hover:bg-surface-sunken hover:text-ink",
  danger: "bg-accent-rose text-white hover:brightness-110 active:brightness-95",
} as const;

const SIZES = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-6 text-[15px]",
} as const;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className, variant = "primary", size = "md", icon, iconRight, loading, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      {...rest}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-xl font-medium transition duration-200 ease-spring",
        "active:scale-[.97] disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? (
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current" />
      ) : (
        icon && <Icon name={icon} className="h-4 w-4 shrink-0" />
      )}
      {children}
      {iconRight && !loading && <Icon name={iconRight} className="h-4 w-4 shrink-0" />}
    </button>
  );
});

/* -------------------------------------------------------------------------- */
/* Page furniture                                                              */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-display-md text-ink">{title}</h2>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </header>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("animate-fade-up", className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            {title && <h3 className="text-sm font-semibold text-ink">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                      */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon = "inbox",
  title,
  body,
  action,
  tone = "neutral",
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: React.ReactNode;
  tone?: "neutral" | "good";
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface-raised/60 px-6 py-16 text-center animate-scale-in">
      <div className="pointer-events-none absolute inset-0 aurora opacity-60" aria-hidden />
      <div className="relative">
        <span
          className={cn(
            "mx-auto grid h-12 w-12 place-items-center rounded-2xl ring-1 ring-inset",
            tone === "good"
              ? "bg-brand-500/12 text-brand-600 ring-brand-500/20"
              : "bg-surface-sunken text-ink-subtle ring-line",
          )}
        >
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <p className="mt-4 text-[15px] font-semibold text-ink">{title}</p>
        {body && <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">{body}</p>}
        {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const api = error instanceof ApiError ? error : null;
  return (
    <div
      role="alert"
      className="rounded-2xl border border-accent-rose/25 bg-accent-rose/[0.07] px-5 py-4 animate-scale-in"
    >
      <div className="flex gap-3">
        <Icon name="warning" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent-rose" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{error.message}</p>
          {api?.detail && <p className="mt-1 text-sm text-ink-muted">{api.detail}</p>}
          {api?.hint && <p className="mt-1 text-sm text-ink-muted">{api.hint}</p>}
          {api?.requestId && (
            <p className="mt-2 font-mono text-[11px] text-ink-subtle">request {api.requestId}</p>
          )}
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry} className="mt-3">
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-surface-sunken", className)}>
      <div
        className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent"
        aria-hidden
      />
    </div>
  );
}

/** Skeletons beat spinners: the page does not jump when data lands. */
export function LoadingRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <span
        role="status"
        aria-label={label}
        className="h-7 w-7 animate-spin rounded-full border-2 border-line-strong border-t-brand-600"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Forms                                                                       */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  children,
  required,
  error,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink">
        {label}
        {required && <span className="text-accent-rose"> *</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 text-xs text-accent-rose">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-ink-subtle">{hint}</p>
      )}
    </label>
  );
}

const CONTROL =
  "rounded-xl border border-line-strong bg-surface-raised px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle outline-none transition duration-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 disabled:bg-surface-sunken disabled:text-ink-subtle";

/**
 * Tailwind resolves conflicting width utilities by stylesheet order, not by the
 * order they appear in a className string — so a baked-in `w-full` silently
 * defeats every `w-auto` at a call site. Apply it only when none was given.
 */
const withWidth = (cn_?: string) => cn(CONTROL, /\bw-/.test(cn_ ?? "") ? "" : "w-full", cn_);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    return <input ref={ref} {...props} className={withWidth(props.className)} />;
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea(props, ref) {
  return <textarea ref={ref} {...props} className={withWidth(props.className)} />;
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select(props, ref) {
  return (
    <div className={cn("relative", /\bw-/.test(props.className ?? "") ? "" : "w-full")}>
      <select
        ref={ref}
        {...props}
        className={cn(withWidth(props.className), "w-full appearance-none pr-9")}
      />
      <Icon
        name="chevronRight"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-ink-subtle"
      />
    </div>
  );
});

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  tone = "neutral",
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  tone?: "neutral" | "caution";
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl p-3 transition hover:bg-surface-sunken">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition duration-300 ease-spring",
          checked ? "bg-brand-600" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-xs transition-all duration-300 ease-spring",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && (
          <span
            className={cn(
              "mt-0.5 block text-xs",
              tone === "caution" && checked ? "text-accent-amber" : "text-ink-subtle",
            )}
          >
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal — a sheet on mobile, a dialog on desktop                              */
/* -------------------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg";
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panelRef.current) return;

      // Focus trap: a dialog you can tab out of is not a dialog.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const previouslyFocused = document.activeElement as HTMLElement | null;
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-surface-inverse/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface-raised shadow-lift",
          "animate-slide-up sm:animate-scale-in sm:rounded-3xl",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        {/* Drag affordance for the mobile sheet. */}
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden />

        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-5">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink">{title}</h3>
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-subtle transition hover:bg-surface-sunken hover:text-ink"
          >
            <Icon name="close" className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-6 pb-2">{children}</div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-sunken/50 px-6 py-4 pb-safe sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                        */
/* -------------------------------------------------------------------------- */

/** Horizontal segmented control — used for filters and tabs. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-surface-sunken p-1",
        className,
      )}
      role="tablist"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition duration-200 ease-spring",
            value === o.value
              ? "bg-surface-raised text-ink shadow-xs"
              : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
