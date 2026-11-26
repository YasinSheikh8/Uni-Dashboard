import { APP_NAME } from "@/config/app";
import { lockConfigured } from "@/lib/auth/session";
import { Logo } from "@/components/nav";
import { Notice } from "@/components/ui";

export const metadata = { title: "Unlock" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-canvas p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="mb-5 flex items-center gap-2.5">
          <Logo />
          <span className="text-lg font-semibold">{APP_NAME}</span>
        </div>
        {!lockConfigured() ? (
          <Notice tone="warn" title="App lock not set up">
            Set <code>APP_PASSCODE</code> (and ideally <code>SESSION_SECRET</code>) on the server, then reload. The app stays locked until then so your Moodle data isn&apos;t public.
          </Notice>
        ) : (
          <form action="/api/auth/login" method="post" className="flex flex-col gap-3">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="passcode" className="text-sm font-medium text-muted">Passcode</label>
            <input id="passcode" name="passcode" type="password" required autoFocus autoComplete="current-password" className="min-h-12 rounded-xl border border-line bg-surface-2 px-3 text-base text-fg" aria-describedby={sp.error ? "pc-error" : undefined} aria-invalid={!!sp.error} />
            {sp.error && <p id="pc-error" className="text-sm text-danger" role="alert">{sp.error === "rate" ? "Too many attempts. Wait a minute and try again." : "That passcode isn't right."}</p>}
            <button type="submit" className="min-h-12 rounded-xl bg-accent font-medium text-on-accent hover:bg-accent-strong">Unlock</button>
          </form>
        )}
      </div>
    </div>
  );
}
