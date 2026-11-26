import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { store } from "./index";

/** Everything here is namespaced by the data source's user key, so demo notes and real notes never mix. */

export const SourceLinkSchema = z.object({ title: z.string().max(300), url: z.string().max(2000) });

export const NoteInputSchema = z.object({
  title: z.string().trim().min(1, "Give the note a title").max(200),
  body: z.string().max(100_000),
  courseId: z.number().int().optional().nullable(),
  week: z.number().int().min(0).max(60).optional().nullable(),
  lecture: z.string().trim().max(120).optional().nullable(),
  topic: z.string().trim().max(200).optional().nullable(),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
  pinned: z.boolean().optional(),
  /** Set for concise revision notes tied to one lecture or seminar. */
  sessionKey: z.string().regex(/^[A-Za-z0-9:_-]{1,100}$/).optional().nullable(),
});
export type NoteInput = z.infer<typeof NoteInputSchema>;

export interface Note extends NoteInput {
  id: string;
  /** "ai" notes were generated from Moodle materials; "personal" ones are yours. */
  origin: "personal" | "ai";
  /** Set once you edit an AI-generated note. */
  editedByUser?: boolean;
  /** For automatic notes: fingerprint of the Moodle materials they were made from. */
  autoFingerprint?: string;
  sources?: { title: string; url: string }[];
  createdAt: number;
  updatedAt: number;
}

const notesKey = (user: string) => `${user}:notes`;

export async function listNotes(user: string): Promise<Note[]> {
  const notes = (await store().get<Note[]>(notesKey(user))) ?? [];
  return notes.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
}

export async function getNote(user: string, id: string) {
  return (await listNotes(user)).find((n) => n.id === id) ?? null;
}

export async function createNote(user: string, input: NoteInput, extra: Partial<Pick<Note, "origin" | "sources">> = {}) {
  const notes = (await store().get<Note[]>(notesKey(user))) ?? [];
  const now = Date.now();
  const note: Note = { ...input, id: randomUUID(), origin: extra.origin ?? "personal", sources: extra.sources, createdAt: now, updatedAt: now };
  notes.push(note);
  await store().set(notesKey(user), notes);
  return note;
}

export async function updateNote(user: string, id: string, input: NoteInput) {
  const notes = (await store().get<Note[]>(notesKey(user))) ?? [];
  const i = notes.findIndex((n) => n.id === id);
  if (i < 0) return null;
  notes[i] = { ...notes[i], ...input, editedByUser: notes[i].origin === "ai" ? true : undefined, updatedAt: Date.now() };
  await store().set(notesKey(user), notes);
  return notes[i];
}

export async function deleteNote(user: string, id: string) {
  const notes = (await store().get<Note[]>(notesKey(user))) ?? [];
  const next = notes.filter((n) => n.id !== id);
  await store().set(notesKey(user), next);
  return next.length !== notes.length;
}

// ---- Assessment checklists ---------------------------------------------------
export const ChecklistItemSchema = z.object({
  id: z.string().max(64),
  text: z.string().trim().min(1).max(500),
  detail: z.string().max(2000).optional(),
  done: z.boolean(),
  /** generic = template step; ai = generated from the brief; custom = added by you. */
  origin: z.enum(["generic", "ai", "custom"]),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export interface Checklist {
  items: ChecklistItem[];
  aiMissingInfo?: string[];
  aiGeneratedAt?: number;
  updatedAt: number;
}

const checklistKey = (user: string, key: string) => `${user}:checklist:${key}`;

export async function getChecklist(user: string, key: string) {
  return store().get<Checklist>(checklistKey(user, key));
}
export async function saveChecklist(user: string, key: string, list: Checklist) {
  await store().set(checklistKey(user, key), { ...list, updatedAt: Date.now() });
}
export async function allChecklists(user: string, keys: string[]) {
  const entries = await Promise.all(keys.map(async (k) => [k, await getChecklist(user, k)] as const));
  return new Map(entries.filter(([, v]) => v) as [string, Checklist][]);
}

export function genericChecklist(kind: "assignment" | "quiz" | "event"): ChecklistItem[] {
  const steps =
    kind === "quiz"
      ? ["Check when the quiz opens and closes on Moodle", "Review the lecture materials it covers", "Do any practice questions", "Set aside uninterrupted time for the attempt", "Attempt the quiz before it closes"]
      : kind === "assignment"
        ? ["Read the brief and any attachments in full", "Note the word limit, format and submission method from the brief", "Research and gather sources", "Write an outline", "Write a first draft", "Revise against the brief and marking criteria", "Proofread and check referencing", "Submit on Moodle and check the confirmation"]
        : ["Open the item on Moodle and read what it asks", "Plan when you'll do it", "Complete it on Moodle"];
  return steps.map((text, i) => ({ id: `g${i}`, text, done: false, origin: "generic" }));
}

// ---- Settings -----------------------------------------------------------------
export interface UserSettings {
  /** Personal timetable feed (e.g. Tabula's calendar subscription link). Never sent back to the browser. */
  timetableIcsUrl?: string;
}
export async function getSettings(user: string) {
  return (await store().get<UserSettings>(`${user}:settings`)) ?? {};
}
export async function saveSettings(user: string, s: UserSettings) {
  await store().set(`${user}:settings`, s);
}

// ---- Study sets (flashcards + quizzes per unit) --------------------------------
export const FlashcardSchema = z.object({
  id: z.string().max(64),
  front: z.string().trim().min(1).max(500),
  back: z.string().trim().min(1).max(2000),
  /** Titles of the Moodle materials this card came from (AI/sample cards). */
  sources: z.array(z.string().max(300)).max(10).default([]),
  origin: z.enum(["ai", "custom", "sample"]),
});
export type Flashcard = z.infer<typeof FlashcardSchema>;

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  sources: string[];
  origin: "ai" | "sample";
}

export interface StudySet {
  cards: Flashcard[];
  quiz: QuizQuestion[];
  sourceLinks?: { title: string; url: string }[];
  gaps?: string[];
  generatedAt?: number;
  updatedAt: number;
}

export interface StudyProgress {
  /** Leitner box (1-5) and next review time per card. */
  cards: Record<string, { box: number; due: number }>;
  quizRuns: { at: number; score: number; total: number; mode: "ai" | "cards" }[];
}

const studyKey = (user: string, courseId: number, sectionId: number) => `${user}:study:${courseId}:${sectionId}`;
const progressKey = (user: string, courseId: number, sectionId: number) => `${user}:study-progress:${courseId}:${sectionId}`;

export async function getStudySet(user: string, courseId: number, sectionId: number) {
  return store().get<StudySet>(studyKey(user, courseId, sectionId));
}
export async function saveStudySet(user: string, courseId: number, sectionId: number, set: StudySet) {
  await store().set(studyKey(user, courseId, sectionId), { ...set, updatedAt: Date.now() });
}
export async function getStudyProgress(user: string, courseId: number, sectionId: number): Promise<StudyProgress> {
  return (await store().get<StudyProgress>(progressKey(user, courseId, sectionId))) ?? { cards: {}, quizRuns: [] };
}
export async function saveStudyProgress(user: string, courseId: number, sectionId: number, p: StudyProgress) {
  await store().set(progressKey(user, courseId, sectionId), p);
}

const BOX_DAYS = [0, 0, 1, 3, 7, 14];
export function reviewCard(p: StudyProgress, cardId: string, result: "again" | "good", now = Date.now()): StudyProgress {
  const prev = p.cards[cardId]?.box ?? 1;
  const box = result === "good" ? Math.min(5, prev + 1) : 1;
  return { ...p, cards: { ...p.cards, [cardId]: { box, due: now + BOX_DAYS[box] * 86_400_000 } } };
}
export function dueCount(set: StudySet | null, p: StudyProgress, now = Date.now()) {
  if (!set) return 0;
  return set.cards.filter((c) => (p.cards[c.id]?.due ?? 0) <= now).length;
}

/** Replace (or create) the AI revision note for one lecture/seminar. */
export async function upsertSessionNote(user: string, sessionKey: string, input: NoteInput, sources: { title: string; url: string }[], autoFingerprint?: string) {
  const notes = (await store().get<Note[]>(notesKey(user))) ?? [];
  const now = Date.now();
  const i = notes.findIndex((n) => n.sessionKey === sessionKey);
  const note: Note = {
    ...(i >= 0 ? notes[i] : { id: randomUUID(), createdAt: now }),
    ...input,
    sessionKey,
    origin: "ai",
    editedByUser: false,
    sources,
    autoFingerprint,
    updatedAt: now,
  } as Note;
  if (i >= 0) notes[i] = note;
  else notes.push(note);
  await store().set(notesKey(user), notes);
  return note;
}

// ---- Automatic notes state ------------------------------------------------------
export interface AutoNotesState {
  lastRunAt?: number;
  lastRunSummary?: string;
  /** Per session: the materials fingerprint last handled and what happened. */
  sessions: Record<string, { fp: string; status: "done" | "unreadable" | "kept-yours" | "error"; at: number; error?: string }>;
}
export async function getAutoNotesState(user: string): Promise<AutoNotesState> {
  return (await store().get<AutoNotesState>(`${user}:auto-notes`)) ?? { sessions: {} };
}
export async function saveAutoNotesState(user: string, s: AutoNotesState) {
  await store().set(`${user}:auto-notes`, s);
}
