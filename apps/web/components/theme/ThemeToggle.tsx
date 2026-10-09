"use client";

import { useTheme } from "./ThemeProvider";
import { Icon } from "@/components/icons";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolved, setTheme } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`grid h-9 w-9 place-items-center rounded-xl text-ink-muted transition duration-200 ease-spring hover:bg-surface-sunken hover:text-ink active:scale-95 ${className}`}
    >
      <Icon name={resolved === "dark" ? "sun" : "moon"} className="h-[18px] w-[18px]" />
    </button>
  );
}
