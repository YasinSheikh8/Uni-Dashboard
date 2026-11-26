"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Loader2, Monitor, Moon, RefreshCw, Sun } from "lucide-react";
import { cx } from "./ui";

export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}

export function RefreshButton({ label = "Refresh" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const spinning = pending || busy;
  return (
    <button
      type="button"
      onClick={async () => {
        setBusy(true);
        await fetch("/api/refresh", { method: "POST" }).catch(() => undefined);
        setBusy(false);
        start(() => router.refresh());
      }}
      disabled={spinning}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3.5 text-sm font-medium text-fg hover:bg-surface-3 disabled:opacity-60"
    >
      <RefreshCw size={16} className={cx(spinning && "animate-spin")} aria-hidden />
      {spinning ? "Refreshing…" : label}
    </button>
  );
}

type Theme = "dark" | "light" | "system";
export function ThemeControl({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const choose = (t: Theme) => {
    setTheme(t);
    document.documentElement.dataset.theme = t;
    document.cookie = `w1_theme=${t}; path=/; max-age=31536000; samesite=lax`;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", t === "light" ? "#f5f5f7" : "#0c0d10");
  };
  const opts: { v: Theme; label: string; Icon: typeof Moon }[] = [
    { v: "dark", label: "Dark", Icon: Moon },
    { v: "light", label: "Light", Icon: Sun },
    { v: "system", label: "System", Icon: Monitor },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
      {opts.map(({ v, label, Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={theme === v}
          onClick={() => choose(v)}
          className={cx("inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm", theme === v ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}
        >
          <Icon size={16} aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}

// ---- Deadline reminders -------------------------------------------------------
// Opt-in, per device. While the app is open (or installed and resumed), it
// checks for unfinished Moodle items due within the chosen window and shows a
// browser notification once per item. Nothing runs if you haven't opted in.
const PREF = "w1_reminders";
const SEEN = "w1_reminders_seen";

function readPref(): { enabled: boolean; hours: number } {
  try {
    return { enabled: false, hours: 24, ...JSON.parse(localStorage.getItem(PREF) ?? "{}") };
  } catch {
    return { enabled: false, hours: 24 };
  }
}

export function ReminderAgent() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    const check = async () => {
      const pref = readPref();
      if (!pref.enabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const res = await fetch(`/api/reminders?hours=${pref.hours}`).catch(() => null);
      if (!res?.ok) return;
      const { items } = (await res.json()) as { items: { key: string; title: string; when: string; href: string }[] };
      let seen: string[] = [];
      try {
        seen = JSON.parse(localStorage.getItem(SEEN) ?? "[]");
      } catch {}
      for (const it of items) {
        if (seen.includes(it.key)) continue;
        const n = new Notification(it.title, { body: it.when, tag: it.key });
        n.onclick = () => {
          window.focus();
          location.href = it.href;
        };
        seen.push(it.key);
      }
      try {
        localStorage.setItem(SEEN, JSON.stringify(seen.slice(-200)));
      } catch {}
    };
    check();
    timer = setInterval(check, 30 * 60_000);
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return null;
}

export function ReminderSettings() {
  const [pref, setPref] = useState<{ enabled: boolean; hours: number } | null>(null);
  const [perm, setPerm] = useState<string>("default");
  useEffect(() => {
    setPref(readPref());
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);
  if (!pref) return <Loader2 className="animate-spin text-subtle" size={18} aria-label="Loading" />;
  const save = (p: { enabled: boolean; hours: number }) => {
    setPref(p);
    try {
      localStorage.setItem(PREF, JSON.stringify(p));
    } catch {}
  };
  if (perm === "unsupported") return <p className="text-sm text-muted">This browser doesn&apos;t support notifications. On iPhone, add the app to your Home Screen first.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-pressed={pref.enabled}
          onClick={async () => {
            if (!pref.enabled && Notification.permission !== "granted") {
              const r = await Notification.requestPermission();
              setPerm(r);
              if (r !== "granted") return;
            }
            save({ ...pref, enabled: !pref.enabled });
          }}
          className={cx("inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium", pref.enabled ? "border-accent-line bg-accent-soft text-accent" : "border-line bg-surface-2 text-fg")}
        >
          {pref.enabled ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
          {pref.enabled ? "Reminders on" : "Turn on reminders"}
        </button>
        <label className="flex items-center gap-2 text-sm text-muted">
          Remind me
          <select
            value={pref.hours}
            onChange={(e) => save({ ...pref, hours: Number(e.target.value) })}
            className="min-h-11 rounded-xl border border-line bg-surface-2 px-3 text-fg"
          >
            <option value={6}>6 hours before</option>
            <option value={24}>1 day before</option>
            <option value={72}>3 days before</option>
          </select>
        </label>
      </div>
      {perm === "denied" && <p className="text-sm text-warn">Notifications are blocked for this site in your browser settings.</p>}
      <p className="text-sm text-subtle">Only for unfinished items with an official Moodle date. Checked while the app is open on this device.</p>
    </div>
  );
}
