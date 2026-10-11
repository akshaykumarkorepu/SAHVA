"use client";

import * as React from "react";

type Theme = "light" | "dark" | "system";

const Ctx = React.createContext<{
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
} | null>(null);

const STORAGE_KEY = "sahva.theme";

/**
 * Light, not "system".
 *
 * The audience is clinic owners and patients on mid-range Android handsets,
 * often outdoors. Light is the legible default for them, and the marketing
 * page is designed light. Staff who sit with the dashboard all evening can
 * still choose dark, and "system" remains a choice — it is just not the
 * default, because inheriting a phone's night mode is not a design decision.
 */
const DEFAULT_THEME: Theme = "light";

/**
 * Theme state. The first paint is handled by the inline script in the root
 * layout, so this provider only has to keep React in sync after hydration —
 * which is what avoids a flash and a hydration mismatch.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("light");
  const [resolved, setResolved] = React.useState<"light" | "dark">("light");

  const apply = React.useCallback((next: Theme) => {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = next === "dark" || (next === "system" && systemDark);
    document.documentElement.classList.toggle("dark", isDark);
    setResolved(isDark ? "dark" : "light");
  }, []);

  React.useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? DEFAULT_THEME;
    setThemeState(stored);
    apply(stored);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (((localStorage.getItem(STORAGE_KEY) as Theme | null) ?? DEFAULT_THEME) === "system") {
        apply("system");
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [apply]);

  const setTheme = React.useCallback(
    (next: Theme) => {
      localStorage.setItem(STORAGE_KEY, next);
      setThemeState(next);
      apply(next);
    },
    [apply],
  );

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useTheme must be used inside <ThemeProvider>");
  return v;
}

/** Runs before paint to set the class, so there is never a light flash. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}")||"light";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
