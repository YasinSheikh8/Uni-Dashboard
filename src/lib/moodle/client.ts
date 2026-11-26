import "server-only";
import { DEFAULT_MOODLE_URL } from "@/config/app";

/**
 * Minimal Moodle Web Services (REST) client.
 *
 * - The token only ever lives here, on the server. It is sent in the POST body
 *   (not the URL) so it never appears in proxy or access logs.
 * - Only the read-only functions below can be called. Even if the token was
 *   issued for the broad "Moodle mobile web service", this app cannot post,
 *   submit, delete or message anything on the student's behalf.
 */
export const ALLOWED_FUNCTIONS = [
  "core_webservice_get_site_info",
  "core_enrol_get_users_courses",
  "core_course_get_contents",
  "core_calendar_get_action_events_by_timesort",
  "core_calendar_get_calendar_events",
  "mod_assign_get_assignments",
  "mod_assign_get_submission_status",
  "mod_quiz_get_quizzes_by_courses",
  "mod_quiz_get_user_attempts",
  "mod_page_get_pages_by_courses",
] as const;
export type MoodleFunction = (typeof ALLOWED_FUNCTIONS)[number];

export class MoodleError extends Error {
  constructor(
    message: string,
    readonly code: "not-configured" | "invalid-token" | "access-denied" | "network" | "moodle" | "bad-response",
    readonly moodleCode?: string,
  ) {
    super(message);
    this.name = "MoodleError";
  }
}

export function moodleConfig() {
  const token = process.env.MOODLE_TOKEN?.trim();
  const baseUrl = (process.env.MOODLE_URL?.trim() || DEFAULT_MOODLE_URL).replace(/\/+$/, "");
  return { token: token || undefined, baseUrl };
}

type Params = Record<string, string | number | boolean | undefined | (string | number)[] | Record<string, unknown>>;

/** Flatten nested params to Moodle's `a[0]=x&b[key]=y` form encoding. */
export function encodeParams(params: Params, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") encodeParams(item as Params, `${key}[${i}]`, out);
        else out.append(`${key}[${i}]`, String(item));
      });
    } else if (v !== null && typeof v === "object") {
      encodeParams(v as Params, key, out);
    } else {
      out.append(key, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
    }
  }
  return out;
}

function scrub(text: string, token: string): string {
  return token ? text.split(token).join("[redacted]") : text;
}

// Small in-memory cache: Moodle data changes slowly and the dashboard fans out
// to several calls. `bustMoodleCache()` is wired to the Refresh button.
const cache = new Map<string, { at: number; value: Promise<unknown> }>();
const TTL_MS = Number(process.env.MOODLE_CACHE_SECONDS ?? 300) * 1000;

export function bustMoodleCache() {
  cache.clear();
}

export async function moodleCall<T>(fn: MoodleFunction, params: Params = {}, opts: { cache?: boolean } = {}): Promise<T> {
  if (!ALLOWED_FUNCTIONS.includes(fn)) throw new MoodleError(`Function ${fn} is not allowed`, "access-denied");
  const { token, baseUrl } = moodleConfig();
  if (!token) throw new MoodleError("Moodle is not connected", "not-configured");

  const body = encodeParams(params);
  const cacheKey = `${fn}?${body.toString()}`;
  const useCache = opts.cache !== false && TTL_MS > 0;
  const hit = useCache ? cache.get(cacheKey) : undefined;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;

  const promise = (async () => {
    body.set("wstoken", token);
    body.set("wsfunction", fn);
    body.set("moodlewsrestformat", "json");
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/webservice/rest/server.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      throw new MoodleError(`Could not reach Moodle (${scrub(String((e as Error).message), token)})`, "network");
    }
    if (!res.ok) throw new MoodleError(`Moodle responded with HTTP ${res.status}`, "network");
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new MoodleError("Moodle returned something that was not JSON", "bad-response");
    }
    if (json && typeof json === "object" && "exception" in json) {
      const err = json as { errorcode?: string; message?: string };
      const code = err.errorcode ?? "";
      const message = scrub(err.message ?? "Moodle error", token);
      if (code === "invalidtoken" || code === "invalidtokenexpired") throw new MoodleError(message, "invalid-token", code);
      if (code === "accessexception" || code === "webservicefunctionnotfound" || code === "servicerequireslogin")
        throw new MoodleError(message, "access-denied", code);
      throw new MoodleError(message, "moodle", code);
    }
    return json as T;
  })();

  if (useCache) {
    cache.set(cacheKey, { at: Date.now(), value: promise });
    promise.catch(() => cache.delete(cacheKey));
  }
  return promise;
}

/**
 * Download a Moodle file server-side (used only to give lecture PDFs to the
 * study-guide generator). Only Moodle's own pluginfile endpoint is accepted.
 */
export async function moodleDownload(fileUrl: string, maxBytes: number): Promise<{ data: Buffer; type: string } | null> {
  const { token, baseUrl } = moodleConfig();
  if (!token) return null;
  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    return null;
  }
  const base = new URL(baseUrl);
  if (url.origin !== base.origin) return null;
  if (!/\/(webservice\/)?pluginfile\.php\//.test(url.pathname)) return null;
  url.pathname = url.pathname.replace(/^(.*?)\/pluginfile\.php\//, "$1/webservice/pluginfile.php/").replace("/webservice/webservice/", "/webservice/");
  url.searchParams.set("token", token);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res || !res.ok) return null;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len && len > maxBytes) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) return null;
  return { data: buf, type: res.headers.get("content-type") ?? "application/octet-stream" };
}
