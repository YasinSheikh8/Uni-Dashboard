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

export const getSource = cache(async (): Promise<StudySource> => {
  if (configuredMode() === "demo") {
    const { DemoSource } = await import("./demo-source");
    return new DemoSource();
  }
  const { MoodleSource } = await import("./moodle-source");
  return new MoodleSource();
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
