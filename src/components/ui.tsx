import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, ChevronRight, Info, ShieldCheck, Sparkles, Unplug } from "lucide-react";
import type { SourceProblem } from "@/lib/data/source";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-subtle">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[1.75rem]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-[0.95rem] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className, as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "li" } & Record<string, unknown>) {
  return (
    <As className={cx("depth-card rounded-2xl border border-line bg-surface p-4 sm:p-5", className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, href, linkLabel, icon, count }: { title: string; href?: string; linkLabel?: string; icon?: ReactNode; count?: number }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-[0.95rem] font-semibold text-fg">
        {icon && <span className="text-subtle" aria-hidden>{icon}</span>}
        {title}
        {typeof count === "number" && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium text-muted">{count}</span>}
      </h2>
      {href && (
        <Link href={href} className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap gap-0.5 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
          {linkLabel ?? "See all"}
          <ChevronRight size={16} aria-hidden />
        </Link>
      )}
    </div>
  );
}

type Tone = "neutral" | "accent" | "warn" | "danger" | "ok";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted",
  accent: "bg-accent-soft text-accent",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  ok: "bg-ok-soft text-ok",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone], className)}>{children}</span>;
}

/** Marks information that comes straight from an official source. */
export function OfficialTag({ label = "Official · Moodle" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs font-medium text-muted">
      <ShieldCheck size={13} aria-hidden /> {label}
    </span>
  );
}

/** Marks anything an AI or a template produced. */
export function AiTag({ label = "AI-generated" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-accent-line bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
      <Sparkles size={13} aria-hidden /> {label}
    </span>
  );
}

export function ExternalLink({ href, children, className, service = "Moodle" }: { href: string; children: ReactNode; className?: string; service?: string }) {
  const internal = href.startsWith("/");
  if (internal) return <Link href={href} className={className}>{children}</Link>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <ArrowUpRight size={14} className="ml-0.5 inline shrink-0 align-[-2px] opacity-70" aria-hidden />
      <span className="sr-only"> (opens {service} in a new tab)</span>
    </a>
  );
}

export function ButtonLink({ href, children, variant = "secondary", external, service }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; external?: boolean; service?: string }) {
  const cls = cx(
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-medium transition-colors",
    variant === "primary" && "bg-accent text-on-accent hover:bg-accent-strong",
    variant === "secondary" && "border border-line bg-surface-2 text-fg hover:bg-surface-3",
    variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-fg",
  );
  if (external)
    return (
      <ExternalLink href={href} className={cls} service={service}>
        {children}
      </ExternalLink>
    );
  return <Link href={href} className={cls}>{children}</Link>;
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="mb-3 text-subtle" aria-hidden>{icon}</div>}
      <p className="font-medium text-fg">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "neutral", title, children, icon }: { tone?: "neutral" | "warn" | "danger" | "accent"; title?: string; children: ReactNode; icon?: ReactNode }) {
  const styles = {
    neutral: "border-line bg-surface-2 text-muted",
    warn: "border-warn/30 bg-warn-soft text-fg",
    danger: "border-danger/30 bg-danger-soft text-fg",
    accent: "border-accent-line bg-accent-soft text-fg",
  }[tone];
  const Icon = tone === "warn" || tone === "danger" ? AlertTriangle : Info;
  return (
    <div className={cx("flex gap-3 rounded-xl border p-3.5 text-sm", styles)} role={tone === "danger" ? "alert" : undefined}>
      <span className={cx("mt-0.5 shrink-0", tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : "text-subtle")} aria-hidden>
        {icon ?? <Icon size={18} />}
      </span>
      <div className="min-w-0">
        {title && <p className="font-medium text-fg">{title}</p>}
        <div className={cx(title && "mt-0.5", "text-muted [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2")}>{children}</div>
      </div>
    </div>
  );
}

export function ProblemState({ problem }: { problem: SourceProblem }) {
  const copy: Record<SourceProblem["kind"], { title: string; body: ReactNode }> = {
    "not-configured": { title: "Moodle isn't connected", body: <>Add your Moodle token on the server to see your modules. <Link href="/settings">How to connect</Link></> },
    "invalid-token": { title: "Your Moodle token no longer works", body: <>It may have been reset or expired. Create a new one in Moodle (Preferences → Security keys) and update <code>MOODLE_TOKEN</code>. <Link href="/settings">Connection help</Link></> },
    "access-denied": { title: "Moodle refused this request", body: <>The token doesn&apos;t allow this information. {problem.message}</> },
    network: { title: "Couldn't reach Moodle", body: <>Moodle may be down or unreachable from this server. Try again in a moment. ({problem.message})</> },
    moodle: { title: "Moodle returned an error", body: problem.message },
    "bad-response": { title: "Unexpected response from Moodle", body: problem.message },
    unknown: { title: "Something went wrong", body: problem.message },
  };
  const c = copy[problem.kind];
  return (
    <Notice tone={problem.kind === "network" ? "warn" : "danger"} title={c.title} icon={<Unplug size={18} />}>
      {c.body}
    </Notice>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}
