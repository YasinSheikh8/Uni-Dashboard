import "server-only";
import { cache } from "react";
import { MoodleError, moodleConfig } from "@/lib/moodle/client";
import type { Assessment, DataMode, FileRef, Module, ModuleDetail, Resource, SourceInfo, TimetableItem } from "./model";

export interface StudySource {
  readonly mode: DataMode;
  info(): Promise<SourceInfo>;
  /** Namespace for this person's saved notes/checklists. Demo and live never share one. */
  userKey(): Promise<string>;
  modules(): Promise<Module[]>;
  module(id: number): Promise<ModuleDetail | null>;
  resources(): Promise<Resource[]>;
  assessments(): Promise<Assessment[]>;
  calendar(from: number, to: number): Promise<TimetableItem[]>;
  pageText(courseId: number, cmid: number): Promise<string | null>;
  download(file: FileRef, maxBytes: number): Promise<{ data: Buffer; type: string } | null>;
}

/**
 * Decide the data source for this deployment:
 * - DEMO_MODE=1, or no MOODLE_TOKEN → clearly labelled demo data.
 * - MOODLE_TOKEN set → live Moodle only. If Moodle fails we show an error
 *   state; we never fall back to sample data, so the two can't be mixed.
 */
export function configuredMode(): DataMode {
  if (process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true") return "demo";
  return moodleConfig().token ? "live" : "demo";
}

/**
 * Wraps a source so modules you've hidden disappear from every tab: module
 * lists, materials, deadlines, the calendar, study units and automatic notes.
 * A hidden module's own page still opens, so it can be shown again.
 */
export class FilteredSource implements StudySource {
  readonly mode: DataMode;
  private hidden?: Promise<Set<number>>;
  constructor(readonly inner: StudySource) {
    this.mode = inner.mode;
  }
  hiddenIds() {
    this.hidden ??= (async () => {
      const { getSettings } = await import("@/lib/store/user-data");
      const s = await getSettings(await this.inner.userKey()).catch(() => ({ hiddenModules: [] as number[] }));
      return new Set(s.hiddenModules ?? []);
    })();
    return this.hidden;
  }
  async hiddenCodes() {
    const ids = await this.hiddenIds();
    return (await this.inner.modules()).filter((m) => ids.has(m.id)).map((m) => m.code);
  }
  /** Every module, including hidden ones (for the Modules page). */
  allModules() {
    return this.inner.modules();
  }
  info() {
    return this.inner.info();
  }
  userKey() {
    return this.inner.userKey();
  }
  async modules() {
    const ids = await this.hiddenIds();
    return (await this.inner.modules()).filter((m) => !ids.has(m.id));
  }
  module(id: number) {
    return this.inner.module(id);
  }
  async resources() {
    const ids = await this.hiddenIds();
    return (await this.inner.resources()).filter((r) => !ids.has(r.courseId));
  }
  async assessments() {
    const ids = await this.hiddenIds();
    return (await this.inner.assessments()).filter((a) => !ids.has(a.courseId));
  }
  async calendar(from: number, to: number) {
    const ids = await this.hiddenIds();
    return (await this.inner.calendar(from, to)).filter((e) => !e.courseId || !ids.has(e.courseId));
  }
  pageText(courseId: number, cmid: number) {
    return this.inner.pageText(courseId, cmid);
  }
  download(file: FileRef, maxBytes: number) {
    return this.inner.download(file, maxBytes);
  }
}

export const getSource = cache(async (): Promise<FilteredSource> => {
  if (configuredMode() === "demo") {
    const { DemoSource } = await import("./demo-source");
    return new FilteredSource(new DemoSource());
  }
  const { MoodleSource } = await import("./moodle-source");
  return new FilteredSource(new MoodleSource());
});

export type SourceProblem = { kind: MoodleError["code"] | "unknown"; message: string };

export function describeError(e: unknown): SourceProblem {
  if (e instanceof MoodleError) return { kind: e.code, message: e.message };
  return { kind: "unknown", message: "Something went wrong while loading your data." };
}

/** Run a loader and turn failures into a displayable problem instead of a crash. */
export async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; problem: SourceProblem }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (!(e instanceof MoodleError)) console.error("[dashboard] loader failed:", e instanceof Error ? e.message : e);
    return { ok: false, problem: describeError(e) };
  }
}
