import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hotelbook — book in one tap, split with friends",
  description:
    "Every supplier checked, cheapest rate surfaced, one-tap booking and payment splitting built in.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
  ],
};

async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-canvas)]/85 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="text-[0.98rem] font-semibold tracking-tight">
          Hotelbook
        </Link>

        <nav className="flex items-center gap-1">
          {user ? (
            <>
              <Link href="/bookings" className="btn btn-ghost text-sm">
                Trips
              </Link>
              <Link href="/account" className="btn btn-ghost text-sm">
                Account
              </Link>
              <span
                className="ml-1 grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-white"
                style={{ background: user.avatarColor }}
                title={user.name}
              >
                {user.name.slice(0, 1).toUpperCase()}
              </span>
            </>
          ) : (
            <>
              <Link href="/signin" className="btn btn-ghost text-sm">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary text-sm">
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Header />
        <main>{children}</main>
        <footer className="mx-auto mt-20 max-w-6xl px-5 pb-10 text-xs text-[var(--color-ink-faint)]">
          Prices are compared across every connected supplier at search time.
        </footer>
      </body>
    </html>
  );
}
