import "server-only";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Tiny key-value store for things only this app owns: your notes, checklist
 * progress, AI study guides and settings. Moodle data is never copied here.
 *
 * - Default: a JSON file in ./.data (good for local use and any server with a disk).
 * - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_*): Upstash / Vercel KV over REST
 * - REDIS_URL (redis:// or rediss://): any Redis server, e.g. Vercel's Redis integration
 *   (needed on serverless hosts such as Vercel, whose disk is not persistent).
 */
interface KV {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
}

class FileKV implements KV {
  // Serverless hosts (Vercel, Netlify, AWS Lambda) only allow writing to the temp folder.
  private file = path.join(
    process.env.DATA_DIR || (isServerless() ? path.join(os.tmpdir(), "dashboard-data") : path.join(process.cwd(), ".data")),
    "store.json",
  );
  private chain: Promise<unknown> = Promise.resolve();

  private async load(): Promise<Record<string, unknown>> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw e;
    }
  }
  private async save(data: Record<string, unknown>) {
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
    await fs.rename(tmp, this.file);
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }
  async get<T>(key: string) {
    return ((await this.load())[key] as T) ?? null;
  }
  set<T>(key: string, value: T) {
    return this.serial(async () => {
      const d = await this.load();
      d[key] = value;
      await this.save(d);
    });
  }
  del(key: string) {
    return this.serial(async () => {
      const d = await this.load();
      delete d[key];
      await this.save(d);
    });
  }
}

class UpstashKV implements KV {
  constructor(
    private url: string,
    private token: string,
  ) {}
  private async cmd(args: unknown[]) {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Storage error (HTTP ${res.status})`);
    return (await res.json()) as { result: unknown };
  }
  async get<T>(key: string) {
    const { result } = await this.cmd(["GET", key]);
    return typeof result === "string" ? (JSON.parse(result) as T) : null;
  }
  async set<T>(key: string, value: T) {
    await this.cmd(["SET", key, JSON.stringify(value)]);
  }
  async del(key: string) {
    await this.cmd(["DEL", key]);
  }
}

/** Plain Redis over TCP (REDIS_URL), e.g. Vercel's Redis / Redis Cloud integration. */
class RedisKV implements KV {
  private client: Promise<import("redis").RedisClientType> | null = null;
  constructor(private url: string) {}
  private conn() {
    if (!this.client) {
      this.client = (async () => {
        const { createClient } = await import("redis");
        const c = createClient({ url: this.url, socket: { connectTimeout: 10_000, reconnectStrategy: (n) => (n > 3 ? false : 500) } });
        c.on("error", (e) => console.error("[dashboard] redis:", e instanceof Error ? e.message : e));
        await c.connect();
        return c as import("redis").RedisClientType;
      })();
      // If connecting fails, try again on the next request rather than staying broken.
      this.client.catch(() => (this.client = null));
    }
    return this.client;
  }
  async get<T>(key: string) {
    const v = await (await this.conn()).get(key);
    return v ? (JSON.parse(v) as T) : null;
  }
  async set<T>(key: string, value: T) {
    await (await this.conn()).set(key, JSON.stringify(value));
  }
  async del(key: string) {
    await (await this.conn()).del(key);
  }
}

/** Find a redis:// connection string (REDIS_URL, KV_URL, or a prefixed variant). */
export function findRedisUrl(env: Record<string, string | undefined> = process.env): string | null {
  const keys = ["REDIS_URL", "KV_URL", ...Object.keys(env).filter((k) => /(_REDIS_URL|_KV_URL)$/.test(k)).sort()];
  for (const k of keys) {
    const v = env[k];
    if (v && /^rediss?:\/\//.test(v)) return v;
  }
  return null;
}

function isServerless() {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}

/**
 * Find Upstash REST credentials. Vercel's Upstash integration names them
 * KV_REST_API_URL / KV_REST_API_TOKEN, sometimes with a custom prefix
 * (e.g. STORAGE_KV_REST_API_URL); Upstash itself uses UPSTASH_REDIS_REST_URL.
 */
export function findRedisRest(env: Record<string, string | undefined> = process.env): { url: string; token: string } | null {
  const pairs: [string, string][] = [
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ];
  for (const key of Object.keys(env).sort()) {
    const m = /^(.*?)(UPSTASH_REDIS_REST_URL|KV_REST_API_URL)$/.exec(key);
    if (m && m[1]) pairs.push([key, `${m[1]}${m[2].replace(/URL$/, "TOKEN")}`]);
  }
  for (const [u, t] of pairs) {
    const url = env[u];
    const token = env[t];
    if (url && token && /^https:\/\//.test(url)) return { url, token };
  }
  return null;
}

let kv: KV | undefined;
export function store(): KV {
  if (kv) return kv;
  const rest = findRedisRest();
  const tcp = findRedisUrl();
  kv = rest ? new UpstashKV(rest.url, rest.token) : tcp ? new RedisKV(tcp) : new FileKV();
  return kv;
}

export function storageInfo(): { kind: "file" | "upstash" | "redis"; persistentWarning?: string } {
  if (findRedisRest()) return { kind: "upstash" };
  if (findRedisUrl()) return { kind: "redis" };
  return {
    kind: "file",
    persistentWarning: isServerless()
      ? "No database is connected, so notes are kept in temporary storage and will disappear. In Vercel, connect a Redis database (Storage → Redis or Upstash for Redis) to this project, then redeploy."
      : undefined,
  };
}
