import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hotelbook — one room, one tap, split however you like",
  description:
    "Every supplier priced at once, the cheaper one surfaced, one-tap booking and payment splitting built in.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#08080b" },
  ],
};

async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)]/60 bg-[var(--color-canvas)]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-[0.9375rem] font-semibold tracking-[-0.01em]"
        >
          {/* Mark: three planes converging — the same idea as the hero object,
              reduced to something that survives at 18px. */}
          <span
            className="grid h-[22px] w-[22px] place-items-center rounded-[7px]"
            style={{
              background:
                "linear-gradient(140deg, var(--aurora-1) 0%, var(--aurora-2) 60%, var(--aurora-3) 130%)",
            }}
          >
            <span className="h-[7px] w-[7px] rounded-[2px] bg-white/90" />
          </span>
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
                className="ml-1.5 grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-white"
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
      </body>
    </html>
  );
}
