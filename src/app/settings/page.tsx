import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CheckCircle2, CircleDashed, Link2Off, XCircle } from "lucide-react";
import { APP_NAME } from "@/config/app";
import { aiConfigured } from "@/lib/ai/generate";
import { lockBypassed, lockConfigured } from "@/lib/auth/session";
import { attempt, configuredMode, getSource } from "@/lib/data/source";
import { ALLOWED_FUNCTIONS, moodleConfig } from "@/lib/moodle/client";
import { storageInfo } from "@/lib/store";
import { getSettings, saveSettings, type UserSettings } from "@/lib/store/user-data";
import { isAllowedFeedUrl } from "@/lib/timetable/source";
import { ReminderSettings, ThemeControl } from "@/components/client-bits";
import { Badge, Card, ExternalLink, Notice, PageHeader, ProblemState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

async function saveFeed(formData: FormData) {
  "use server";
  const source = await getSource();
  if (source.mode === "demo") return;
  const user = await source.userKey();
  const raw = String(formData.get("feed") ?? "").trim();
  const current = await getSettings(user);
  if (formData.get("remove")) {
    await saveSettings(user, { ...current, timetableIcsUrl: undefined });
  } else {
    if (!isAllowedFeedUrl(raw)) redirect("/settings?feed=invalid#timetable");
    await saveSettings(user, { ...current, timetableIcsUrl: raw });
  }
  revalidatePath("/", "layout");
  redirect("/settings?feed=saved#timetable");
}

function Row({ ok, label, children }: { ok: boolean | null; label: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 py-3">
      <span className="mt-0.5 shrink-0" aria-hidden>
        {ok === true ? <CheckCircle2 size={18} className="text-ok" /> : ok === false ? <XCircle size={18} className="text-danger" /> : <CircleDashed size={18} className="text-subtle" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">{label}</p>
        <div className="text-sm text-muted">{children}</div>
      </div>
    </li>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ feed?: string }> }) {
  const sp = await searchParams;
  const mode = configuredMode();
  const source = await getSource();
  const info = await attempt(() => source.info());
  const { baseUrl, token } = moodleConfig();
  const theme = (await cookies()).get("w1_theme")?.value;
  const settings: UserSettings = mode === "live" ? await getSettings(await source.userKey().catch(() => "anon")).catch(() => ({})) : {};
  const envFeed = !!process.env.TIMETABLE_ICS_URL;
  const feedHost = envFeed ? new URL(process.env.TIMETABLE_ICS_URL!).hostname : settings.timetableIcsUrl ? new URL(settings.timetableIcsUrl).hostname : null;
  const storage = storageInfo();

  return (
    <>
      <PageHeader title="Settings" subtitle={`How ${APP_NAME} is connected, and what it can and can't see.`} />
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-1 font-semibold">Moodle connection</h2>
          <ul className="divide-y divide-line">
            <Row ok={mode === "live" ? info.ok : null} label={mode === "live" ? (info.ok ? `Connected to ${info.data.siteName}` : "Moodle token set, but the connection failed") : "Demo mode — not connected"}>
              {mode === "live" && info.ok && <>Signed in to Moodle as <strong className="text-fg">{info.data.userName}</strong> via the Moodle web service API at {new URL(baseUrl).host}. The token stays on the server.</>}
              {mode === "live" && !info.ok && <div className="mt-2"><ProblemState problem={info.problem} /></div>}
              {mode === "demo" && (
                <>
                  {token ? "DEMO_MODE is on, so sample data is shown even though a token is set." : "No MOODLE_TOKEN is set on the server, so sample data is shown."} Sample and real data are never mixed.
                </>
              )}
            </Row>
            <Row ok={mode === "live" ? true : null} label="Read-only access">
              The app can only call these {ALLOWED_FUNCTIONS.length} read-only Moodle functions, even if the token allows more:{" "}
              <span className="text-xs text-subtle">{ALLOWED_FUNCTIONS.join(", ")}</span>
            </Row>
          </ul>
          {mode === "demo" && (
            <details className="mt-3 rounded-xl border border-line p-4">
              <summary className="cursor-pointer text-sm font-medium">How to connect your Moodle account</summary>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
                <li>Sign in to <ExternalLink href="https://moodle.warwick.ac.uk/user/managetoken.php" className="text-accent underline">Moodle → Preferences → Security keys</ExternalLink>.</li>
                <li>Copy the key for the <strong className="text-fg">Moodle mobile web service</strong>. If there isn&apos;t one, open the Moodle mobile app and sign in once — that creates it.</li>
                <li>On the server running this app, set <code>MOODLE_TOKEN</code> to that key (an environment variable — never put it in code or the browser), then restart.</li>
              </ol>
            </details>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">What comes from where</h2>
          <ul className="divide-y divide-line">
            <Row ok={mode === "live" ? true : null} label="Modules, materials, quizzes, Moodle assignments, Moodle calendar">Synced from Moodle.</Row>
            <Row ok={feedHost ? true : false} label="Lectures, seminars and rooms">
              {feedHost ? `Synced from your timetable feed (${feedHost}).` : "Not synced. Warwick timetables live in Tabula — add your Tabula calendar feed below."}
            </Row>
            <Row ok={false} label="Tabula coursework deadlines, marks, attendance">
              Not synced: Tabula has no personal API this app can use. <ExternalLink href="https://tabula.warwick.ac.uk/" service="Tabula" className="text-accent underline">Open Tabula</ExternalLink>
            </Row>
            <Row ok={false} label="Exam timetable, My Warwick alerts, Warwick email">
              Not synced. Use the official sites from <a href="/links" className="text-accent underline">Warwick links</a>.
            </Row>
            <Row ok={aiConfigured() ? true : null} label="AI study guides and action plans">
              {aiConfigured() ? "On. Only text and PDFs from your Moodle are sent to Anthropic's API to generate them, and only when you press the button." : "Off. Set ANTHROPIC_API_KEY on the server to turn them on."}
            </Row>
          </ul>
        </Card>

        <Card>
          <h2 id="timetable" className="mb-1 scroll-mt-24 font-semibold">Timetable feed</h2>
          <p className="mb-3 text-sm text-muted">
            In <ExternalLink href="https://tabula.warwick.ac.uk/profiles" service="Tabula" className="text-accent underline">Tabula</ExternalLink>, open your timetable and copy its calendar subscription (iCal) link. Paste it here. It&apos;s stored on the server and never shown again in the browser — treat it like a password.
          </p>
          {sp.feed === "saved" && <div className="mb-3"><Notice tone="accent">Timetable feed saved.</Notice></div>}
          {sp.feed === "invalid" && <div className="mb-3"><Notice tone="danger">That doesn&apos;t look like an https link from a Warwick host (e.g. tabula.warwick.ac.uk).</Notice></div>}
          {mode === "demo" ? (
            <p className="text-sm text-subtle">Available once Moodle is connected.</p>
          ) : envFeed ? (
            <p className="text-sm text-muted">A feed is set on the server (<code>TIMETABLE_ICS_URL</code>, {feedHost}). Change it there.</p>
          ) : (
            <form action={saveFeed} className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor="feed" className="sr-only">Timetable feed link</label>
              <input id="feed" name="feed" type="url" inputMode="url" autoComplete="off" placeholder={feedHost ? `Saved (${feedHost}) — paste a new link to replace` : "https://tabula.warwick.ac.uk/…ics"} className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg placeholder:text-subtle" />
              <button type="submit" className="min-h-11 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-strong">Save</button>
              {feedHost && (
                <button type="submit" name="remove" value="1" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-sm text-muted hover:text-danger">
                  <Link2Off size={15} aria-hidden /> Remove
                </button>
              )}
            </form>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Appearance</h2>
          <ThemeControl initial={theme === "light" || theme === "system" ? theme : "dark"} />
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Deadline reminders</h2>
          <ReminderSettings />
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Privacy & storage</h2>
          <ul className="divide-y divide-line">
            <Row ok={lockConfigured() ? true : lockBypassed() ? null : false} label="App lock">
              {lockConfigured() ? "Protected by your passcode." : lockBypassed() ? "No APP_PASSCODE set — the app is open because it's running in development. Set one before deploying." : "No APP_PASSCODE set, so the app is locked for everyone."}
            </Row>
            <Row ok={!storage.persistentWarning} label={`Your notes are stored ${storage.kind === "upstash" ? "in your Upstash Redis database" : "in a file on the server"}`}>
              {storage.persistentWarning ?? "Moodle data isn't stored — it's fetched live and cached in memory for a few minutes."}
            </Row>
          </ul>
          {lockConfigured() && (
            <form action="/api/auth/logout" method="post" className="mt-3">
              <button type="submit" className="min-h-11 rounded-xl border border-line px-4 text-sm text-muted hover:text-fg">Sign out on this device</button>
            </form>
          )}
        </Card>
        <p className="text-center text-xs text-subtle">
          {APP_NAME} is a personal tool, not an official University of Warwick service. <Badge>v0.1</Badge>
        </p>
      </div>
    </>
  );
}
