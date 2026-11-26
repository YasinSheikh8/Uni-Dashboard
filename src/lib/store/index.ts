import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Tiny key-value store for things only this app owns: your notes, checklist
 * progress, AI study guides and settings. Moodle data is never copied here.
 *
 * - Default: a JSON file in ./.data (good for local use and any server with a disk).
 * - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN: Upstash / Vercel KV over REST
 *   (needed on serverless hosts such as Vercel, whose disk is not persistent).
 */
interface KV {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
}

class FileKV implements KV {
  private file = path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), "store.json");
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

let kv: KV | undefined;
export function store(): KV {
  if (kv) return kv;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  kv = url && token ? new UpstashKV(url, token) : new FileKV();
  return kv;
}

export function storageInfo(): { kind: "file" | "upstash"; persistentWarning?: string } {
  const remote = !!((process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) && (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN));
  if (remote) return { kind: "upstash" };
  return {
    kind: "file",
    persistentWarning: process.env.VERCEL
      ? "This deployment stores notes on a temporary disk, so they can disappear. Add an Upstash Redis (Vercel KV) store to keep them."
      : undefined,
  };
}
