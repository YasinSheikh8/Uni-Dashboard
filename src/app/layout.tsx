import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { FlaskConical, Radio } from "lucide-react";
import { APP_DESCRIPTION, APP_NAME } from "@/config/app";
import { configuredMode } from "@/lib/data/source";
import { BottomNav, Sidebar, TopBar } from "@/components/nav";
import { SearchPalette } from "@/components/search-palette";
import { RegisterServiceWorker, ReminderAgent } from "@/components/client-bits";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c0d10",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const t = jar.get("w1_theme")?.value;
  const theme = t === "light" || t === "system" ? t : "dark";
  const mode = configuredMode();

  const chip =
    mode === "demo" ? (
      <Link href="/settings" className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-warn/40 bg-warn-soft px-3 text-xs font-medium text-warn">
        <FlaskConical size={14} aria-hidden /> Demo
      </Link>
    ) : (
      <Link href="/settings" className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-3 text-xs font-medium text-muted" title="Connected to Moodle">
        <Radio size={14} className="text-ok" aria-hidden /> <span className="hidden sm:inline">Live ·</span> Moodle
      </Link>
    );

  return (
    <html lang="en-GB" data-theme={theme}>
      <body>
        <a href="#main" className="skip-link rounded-lg bg-accent px-4 py-2 font-medium text-on-accent">
          Skip to content
        </a>
        <div className="flex min-h-dvh">
          <Sidebar modeChip={<div className="px-3">{chip}</div>} />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar modeChip={chip} />
            {mode === "demo" && (
              <div className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-center text-sm text-fg" role="status">
                You&apos;re viewing <strong>sample data</strong>. Nothing here is from your Moodle account.{" "}
                <Link href="/settings" className="text-warn underline underline-offset-2">Connect Moodle</Link>
              </div>
            )}
            <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
              {children}
            </main>
          </div>
        </div>
        <BottomNav />
        <SearchPalette />
        <RegisterServiceWorker />
        <ReminderAgent />
      </body>
    </html>
  );
}
