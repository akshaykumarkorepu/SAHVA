import type { Config } from "tailwindcss";

/**
 * SAHVA design system.
 *
 * Colours are CSS variables so light and dark are one token set rather than two
 * parallel palettes. Anything that reads `surface` / `ink` / `line` flips
 * automatically; nothing needs a `dark:` variant except genuine exceptions.
 */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
        },
        // Warm sand neutrals rather than cold slate — reads human, not clinical.
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          raised: "rgb(var(--surface-raised) / <alpha-value>)",
          sunken: "rgb(var(--surface-sunken) / <alpha-value>)",
          inverse: "rgb(var(--surface-inverse) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          subtle: "rgb(var(--ink-subtle) / <alpha-value>)",
          inverse: "rgb(var(--ink-inverse) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--line) / <alpha-value>)",
          strong: "rgb(var(--line-strong) / <alpha-value>)",
        },
        accent: {
          amber: "rgb(var(--accent-amber) / <alpha-value>)",
          rose: "rgb(var(--accent-rose) / <alpha-value>)",
          sky: "rgb(var(--accent-sky) / <alpha-value>)",
          violet: "rgb(var(--accent-violet) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // Tight tracking on large type is most of what makes a UI feel current.
        "display-xl": ["clamp(2.75rem, 7vw, 4.5rem)", { lineHeight: "1.02", letterSpacing: "-0.04em", fontWeight: "700" }],
        "display-lg": ["clamp(2rem, 4.5vw, 3rem)", { lineHeight: "1.06", letterSpacing: "-0.035em", fontWeight: "700" }],
        "display-md": ["clamp(1.5rem, 3vw, 2rem)", { lineHeight: "1.12", letterSpacing: "-0.03em", fontWeight: "650" }],
        stat: ["clamp(1.75rem, 3.2vw, 2.5rem)", { lineHeight: "1", letterSpacing: "-0.035em", fontWeight: "680" }],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(var(--shadow) / 0.05)",
        card: "0 1px 2px rgb(var(--shadow) / 0.04), 0 4px 12px -2px rgb(var(--shadow) / 0.06)",
        lift: "0 2px 4px rgb(var(--shadow) / 0.04), 0 12px 32px -8px rgb(var(--shadow) / 0.14)",
        glow: "0 8px 28px -6px rgb(var(--brand-600) / 0.42)",
        inset: "inset 0 1px 0 0 rgb(255 255 255 / 0.06)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          from: { opacity: "0", transform: "scale(.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "pulse-ring": {
          "0%": { transform: "scale(.9)", opacity: "0.7" },
          "70%": { transform: "scale(1.6)", opacity: "0" },
          "100%": { opacity: "0" },
        },
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
      },
      animation: {
        "fade-up": "fade-up .45s cubic-bezier(.22,1,.36,1) both",
        "fade-in": "fade-in .3s ease both",
        "scale-in": "scale-in .2s cubic-bezier(.22,1,.36,1) both",
        "slide-up": "slide-up .28s cubic-bezier(.22,1,.36,1) both",
        "slide-in-left": "slide-in-left .25s cubic-bezier(.22,1,.36,1) both",
        shimmer: "shimmer 1.8s infinite",
        "pulse-ring": "pulse-ring 2s cubic-bezier(.24,.6,.35,1) infinite",
        marquee: "marquee 28s linear infinite",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(.22,1,.36,1)",
      },
    },
  },
  plugins: [],
};

export default config;
