import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider, THEME_SCRIPT } from "@/components/theme/ThemeProvider";

/**
 * Fonts are vendored, not fetched.
 *
 * next/font/google downloads from Google at BUILD time, which makes every
 * build — and every deploy — depend on a third party being reachable and
 * returning CSS in the shape the loader expects. It is not hypothetical: CI
 * failed on exactly that, with a null regex match rather than a clean network
 * error. Self-hosted variable fonts make the build deterministic and offline.
 *
 * One variable file per family covers the whole weight range in ~30-50KB.
 */
const display = localFont({
  src: "./fonts/PlusJakartaSans-Variable.woff2",
  variable: "--font-display",
  weight: "200 800",
  display: "swap",
});

const sans = localFont({
  src: "./fonts/Inter-Variable.woff2",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SAHVA — AI receptionist for clinics",
  description:
    "Telugu-and-English AI receptionist for solo and small clinics. Answers every call, books off live availability, and never lets a schedule change silently cancel a patient.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0e0d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${sans.variable}`}>
      <head>
        {/* Sets the theme class before first paint, so there is no light flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
