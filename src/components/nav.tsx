"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Brain, BookOpen, CalendarDays, ClipboardCheck, FileText, Home, LayoutGrid, Link2, NotebookPen, Search, Settings } from "lucide-react";
import { APP_NAME } from "@/config/app";
import { cx } from "./ui";
import { openSearch } from "./search-palette";

const NAV = [
  { href: "/", label: "Home", icon: Home, mobile: true },
  { href: "/modules", label: "Modules", icon: BookOpen, mobile: true },
  { href: "/study", label: "Study", icon: Brain, mobile: true },
  { href: "/ask", label: "Ask", icon: MessageCircle, mobile: true },
  { href: "/materials", label: "Materials", icon: FileText },
  { href: "/assessments", label: "Deadlines", icon: ClipboardCheck },
  { href: "/timetable", label: "Timetable", icon: CalendarDays, mobile: true },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/links", label: "Warwick links", icon: Link2 },
];

function isActive(pathname: string, href: string) {
  if (href === "/modules" && /^\/modules\/\d+\/study\//.test(pathname)) return false;
  if (href === "/study" && /^\/modules\/\d+\/study\//.test(pathname)) return true;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ modeChip }: { modeChip: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-canvas px-3 py-5 lg:flex">
      <Link href="/" className="mb-6 flex items-center gap-2.5 px-3">
        <Logo />
        <span className="text-[1.05rem] font-semibold tracking-tight">{APP_NAME}</span>
      </Link>
      <button
        type="button"
        onClick={openSearch}
        className="mb-4 flex min-h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-subtle hover:border-line-strong hover:text-muted"
      >
        <Search size={16} aria-hidden />
        <span className="flex-1 text-left">Search</span>
        <kbd className="rounded border border-line px-1.5 text-[0.7rem] font-medium">⌘K</kbd>
      </button>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-10 items-center gap-3 rounded-xl px-3 text-[0.93rem] transition-colors",
                active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface hover:text-fg",
              )}
            >
              <Icon size={18} aria-hidden className={active ? "text-accent" : undefined} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-2">
        {modeChip}
        <Link
          href="/settings"
          aria-current={isActive(pathname, "/settings") ? "page" : undefined}
          className={cx("flex min-h-10 items-center gap-3 rounded-xl px-3 text-[0.93rem] text-muted hover:bg-surface hover:text-fg", isActive(pathname, "/settings") && "bg-surface-2 text-fg")}
        >
          <Settings size={18} aria-hidden /> Settings
        </Link>
      </div>
    </aside>
  );
}

export function TopBar({ modeChip }: { modeChip: React.ReactNode }) {
  return (
    // The safe-area padding sits outside the 56px row, so in iPhone home-screen
    // mode the bar grows below the status bar instead of being squashed under it.
    <header
      className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur lg:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
    >
      <div className="flex h-14 items-center gap-2 px-4">
      <Link href="/" className="flex min-w-0 items-center gap-2">
        <Logo />
        <span className="truncate whitespace-nowrap font-semibold tracking-tight">{APP_NAME}</span>
      </Link>
      <div className="ml-auto flex items-center gap-1">
        {modeChip}
        <button type="button" onClick={openSearch} className="flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label="Search">
          <Search size={20} aria-hidden />
        </button>
        <Link href="/more" className="flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label="More: materials, deadlines, notes, links and settings">
          <LayoutGrid size={20} aria-hidden />
        </Link>
      </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const items = NAV.filter((n) => n.mobile);
  const moreActive = ["/materials", "/assessments", "/notes", "/links", "/more", "/search"].some((p) => isActive(pathname, p));
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/more" ? moreActive : isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx("flex h-16 flex-col items-center justify-center gap-1 text-[0.72rem] font-medium", active ? "text-fg" : "text-subtle")}
              >
                <span className={cx("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-accent-soft text-accent")}>
                  <Icon size={20} aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Logo() {
  return (
    <span className="logo-3d flex size-8 items-center justify-center rounded-[10px] text-on-accent" aria-hidden>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 5.5L12 12.5l5.5-7M12 12.5V19" />
      </svg>
    </span>
  );
}
