"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, RotateCcw, Shuffle, Sparkles, Trash2, X } from "lucide-react";
import type { Flashcard, QuizQuestion, StudyProgress } from "@/lib/store/user-data";
import { AiTag, cx } from "./ui";

type Mode = "cards" | "quiz" | "manage";

interface Props {
  courseId: number;
  sectionId: number;
  cards: Flashcard[];
  quiz: QuizQuestion[];
  progress: StudyProgress;
  canGenerate: boolean;
  generateLabel: string;
  gaps: string[];
  sourceLinks: { title: string; url: string }[];
}

function originLabel(o: Flashcard["origin"] | QuizQuestion["origin"]) {
  return o === "ai" ? "AI from Moodle materials" : o === "sample" ? "Sample" : "Your card";
}

export function StudyPlayer(props: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(props.cards.length ? "cards" : "manage");
  const [cards, setCards] = useState(props.cards);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = (body: object) =>
    fetch(`/api/study/${props.courseId}/${props.sectionId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const generate = async () => {
    if (cards.some((c) => c.origin !== "custom") && !confirm("Replace the generated cards and quiz? Your own cards are kept.")) return;
    setGenerating(true);
    setError(null);
    const res = await api({ action: "generate" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setGenerating(false);
    if (!res?.ok) return setError(data.error ?? "Couldn't generate.");
    setCards(data.set.cards);
    setMode("cards");
    router.refresh();
  };

  const tabs: { key: Mode; label: string }[] = [
    { key: "cards", label: `Flashcards (${cards.length})` },
    { key: "quiz", label: "Quiz" },
    { key: "manage", label: "Edit cards" },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Study mode" className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={mode === t.key} onClick={() => setMode(t.key)} className={cx("min-h-10 rounded-lg px-3 text-sm", mode === t.key ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}>
              {t.label}
            </button>
          ))}
        </div>
        {props.canGenerate && (
          <button type="button" onClick={generate} disabled={generating} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-dashed border-accent-line px-4 text-sm text-accent hover:bg-accent-soft disabled:opacity-60">
            {generating ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
            {generating ? "Reading the unit's materials… (up to a minute)" : props.generateLabel}
          </button>
        )}
      </div>
      {error && <p className="mb-4 rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm text-fg" role="alert">{error}</p>}

      {mode === "cards" && <Flashcards courseId={props.courseId} sectionId={props.sectionId} cards={cards} progress={props.progress} api={api} onEmpty={() => setMode("manage")} />}
      {mode === "quiz" && <Quiz cards={cards} aiQuiz={props.quiz} api={api} />}
      {mode === "manage" && <ManageCards cards={cards} setCards={setCards} api={api} />}

      {(props.gaps.length > 0 || props.sourceLinks.length > 0) && (
        <details className="mt-8 rounded-2xl border border-line p-4 text-sm">
          <summary className="cursor-pointer font-medium text-muted">What the AI read (and couldn&apos;t read)</summary>
          {props.sourceLinks.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-muted">
              {props.sourceLinks.map((s) => (
                <li key={s.url + s.title}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">{s.title}</a></li>
              ))}
            </ul>
          )}
          {props.gaps.length > 0 && <ul className="mt-2 list-disc pl-5 text-subtle">{props.gaps.map((g) => <li key={g}>{g}</li>)}</ul>}
        </details>
      )}
    </div>
  );
}

function Flashcards({ cards, progress, api, onEmpty }: { courseId: number; sectionId: number; cards: Flashcard[]; progress: StudyProgress; api: (b: object) => Promise<Response>; onEmpty: () => void }) {
  const now = Date.now();
  const [onlyDue, setOnlyDue] = useState(() => cards.some((c) => (progress.cards[c.id]?.due ?? 0) <= now));
  const [order, setOrder] = useState<string[]>(() => cards.map((c) => c.id));
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [boxes, setBoxes] = useState(progress.cards);
  const deck = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.id, c]));
    const all = order.map((id) => byId.get(id)).filter((c): c is Flashcard => !!c);
    return onlyDue ? all.filter((c) => (boxes[c.id]?.due ?? 0) <= now) : all;
  }, [cards, order, onlyDue, boxes, now]);
  const card = deck[Math.min(i, deck.length - 1)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlipped((f) => !f); }
      if (e.key === "ArrowRight") { setFlipped(false); setI((x) => Math.min(x + 1, deck.length - 1)); }
      if (e.key === "ArrowLeft") { setFlipped(false); setI((x) => Math.max(x - 1, 0)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deck.length]);

  if (!cards.length)
    return (
      <div className="rounded-2xl border border-dashed border-line p-8 text-center">
        <p className="font-medium">No flashcards for this unit yet</p>
        <button type="button" onClick={onEmpty} className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm hover:bg-surface-2"><Plus size={16} aria-hidden /> Add your own</button>
      </div>
    );

  const rate = async (result: "again" | "good") => {
    if (!card) return;
    const prev = boxes[card.id]?.box ?? 1;
    const box = result === "good" ? Math.min(5, prev + 1) : 1;
    setBoxes((b) => ({ ...b, [card.id]: { box, due: Date.now() + [0, 0, 1, 3, 7, 14][box] * 86400000 } }));
    api({ action: "review", cardId: card.id, result }).catch(() => undefined);
    setFlipped(false);
    if (!onlyDue) setI((x) => Math.min(x + 1, deck.length - 1));
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span aria-live="polite">{deck.length ? `Card ${Math.min(i, deck.length - 1) + 1} of ${deck.length}` : "All caught up"}</span>
        <div className="flex gap-2">
          <label className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2">
            <input type="checkbox" checked={onlyDue} onChange={(e) => { setOnlyDue(e.target.checked); setI(0); setFlipped(false); }} className="size-4 accent-[var(--accent)]" />
            Only cards due
          </label>
          <button type="button" onClick={() => { setOrder((o) => [...o].sort(() => Math.random() - 0.5)); setI(0); setFlipped(false); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 hover:text-fg">
            <Shuffle size={15} aria-hidden /> Shuffle
          </button>
        </div>
      </div>

      {card ? (
        <>
          <div className="flashcard-scene mx-auto max-w-2xl">
            <button type="button" onClick={() => setFlipped((f) => !f)} aria-label={flipped ? "Show question" : "Show answer"} className={cx("flashcard", flipped && "is-flipped")}>
              <span className="flashcard-face flashcard-front" aria-hidden={flipped}>
                <span className="text-xs font-medium uppercase tracking-wide text-subtle">Question</span>
                <span className="mt-3 text-xl font-medium leading-snug text-fg sm:text-2xl">{card.front}</span>
                <span className="mt-auto pt-4 text-xs text-subtle">Tap or press Space to flip</span>
              </span>
              <span className="flashcard-face flashcard-back" aria-hidden={!flipped}>
                <span className="text-xs font-medium uppercase tracking-wide text-accent">Answer</span>
                <span className="mt-3 text-lg leading-relaxed text-fg sm:text-xl">{card.back}</span>
                <span className="mt-auto pt-4 text-xs text-subtle">{originLabel(card.origin)}{card.sources.length ? ` · ${card.sources.join(", ")}` : ""}</span>
              </span>
            </button>
          </div>
          <div className="mx-auto mt-5 flex max-w-2xl items-center justify-between gap-2">
            <button type="button" onClick={() => { setFlipped(false); setI((x) => Math.max(x - 1, 0)); }} disabled={i === 0} className="flex size-12 items-center justify-center rounded-xl border border-line text-muted hover:text-fg disabled:opacity-40" aria-label="Previous card">
              <ChevronLeft size={20} aria-hidden />
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => rate("again")} className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-4 text-sm font-medium hover:border-danger/50">
                <RotateCcw size={16} className="text-danger" aria-hidden /> Again
              </button>
              <button type="button" onClick={() => rate("good")} className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong">
                <Check size={16} aria-hidden /> Got it
              </button>
            </div>
            <button type="button" onClick={() => { setFlipped(false); setI((x) => Math.min(x + 1, deck.length - 1)); }} disabled={i >= deck.length - 1} className="flex size-12 items-center justify-center rounded-xl border border-line text-muted hover:text-fg disabled:opacity-40" aria-label="Next card">
              <ChevronRight size={20} aria-hidden />
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-subtle">“Got it” spaces the card out (1, 3, 7, 14 days). “Again” brings it back today.</p>
        </>
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="font-medium">Nothing due — nice work.</p>
          <button type="button" onClick={() => setOnlyDue(false)} className="mt-3 min-h-11 rounded-xl border border-line px-4 text-sm hover:bg-surface-2">Review all cards anyway</button>
        </div>
      )}
    </div>
  );
}

function buildCardQuiz(cards: Flashcard[]): QuizQuestion[] {
  if (cards.length < 4) return [];
  return [...cards].sort(() => Math.random() - 0.5).slice(0, 10).map((c) => {
    const options = [...cards.filter((o) => o.id !== c.id && o.back !== c.back).sort(() => Math.random() - 0.5).slice(0, 3).map((o) => o.back), c.back].sort(() => Math.random() - 0.5);
    return { id: `fc-${c.id}`, question: c.front, options, answer: options.indexOf(c.back), explanation: c.back, sources: c.sources, origin: c.origin === "ai" ? "ai" : "sample" };
  });
}

function Quiz({ cards, aiQuiz, api }: { cards: Flashcard[]; aiQuiz: QuizQuestion[]; api: (b: object) => Promise<Response> }) {
  const [kind, setKind] = useState<"ai" | "cards">(aiQuiz.length ? "ai" : "cards");
  const [questions, setQuestions] = useState<QuizQuestion[]>(() => (aiQuiz.length ? aiQuiz : buildCardQuiz(cards)));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const restart = (k = kind) => {
    setKind(k);
    setQuestions(k === "ai" ? [...aiQuiz].sort(() => Math.random() - 0.5) : buildCardQuiz(cards));
    setI(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  };

  if (!questions.length)
    return (
      <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
        No quiz yet. Generate one from the unit&apos;s materials, or add at least 4 flashcards to get a quiz built from your cards.
      </div>
    );

  const q = questions[i];
  const next = () => {
    if (i + 1 >= questions.length) {
      setDone(true);
      api({ action: "quizResult", score, total: questions.length, mode: kind }).catch(() => undefined);
    } else {
      setI(i + 1);
      setPicked(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {aiQuiz.length > 0 && cards.length >= 4 ? (
          <div role="radiogroup" aria-label="Quiz type" className="inline-flex rounded-xl border border-line bg-surface-2 p-1 text-sm">
            <button type="button" role="radio" aria-checked={kind === "ai"} onClick={() => restart("ai")} className={cx("min-h-9 rounded-lg px-3", kind === "ai" ? "bg-surface text-fg" : "text-muted")}>Unit quiz</button>
            <button type="button" role="radio" aria-checked={kind === "cards"} onClick={() => restart("cards")} className={cx("min-h-9 rounded-lg px-3", kind === "cards" ? "bg-surface text-fg" : "text-muted")}>From my cards</button>
          </div>
        ) : (
          <span className="text-sm text-subtle">{kind === "cards" ? "Built from your flashcards" : "Unit quiz"}</span>
        )}
        <AiTag label={kind === "cards" ? "Practice — not an official test" : q.origin === "sample" ? "Sample questions" : "AI practice — not an official test"} />
      </div>

      {done ? (
        <div className="depth-card rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="text-sm text-muted">You scored</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight">{score}<span className="text-2xl text-subtle">/{questions.length}</span></p>
          <p className="mt-2 text-sm text-muted">{score === questions.length ? "Perfect." : score / questions.length >= 0.7 ? "Solid — review the ones you missed." : "Worth another pass through the flashcards."}</p>
          <button type="button" onClick={() => restart()} className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong"><RotateCcw size={16} aria-hidden /> Try again</button>
        </div>
      ) : (
        <div className="depth-card rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="mb-1 flex justify-between text-xs text-subtle">
            <span>Question {i + 1} of {questions.length}</span>
            <span>Score {score}</span>
          </div>
          <div className="mb-4 h-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-accent transition-all" style={{ width: `${(i / questions.length) * 100}%` }} /></div>
          <h3 className="text-lg font-medium leading-snug">{q.question}</h3>
          <ul className="mt-4 flex flex-col gap-2" role="list">
            {q.options.map((o, idx) => {
              const state = picked === null ? "idle" : idx === q.answer ? "right" : idx === picked ? "wrong" : "idle";
              return (
                <li key={idx}>
                  <button
                    type="button"
                    disabled={picked !== null}
                    onClick={() => { setPicked(idx); if (idx === q.answer) setScore((s) => s + 1); }}
                    className={cx(
                      "flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition-colors",
                      state === "right" && "border-ok/50 bg-ok-soft text-fg",
                      state === "wrong" && "border-danger/50 bg-danger-soft text-fg",
                      state === "idle" && "border-line bg-surface-2 hover:border-line-strong",
                    )}
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line text-xs">{String.fromCharCode(65 + idx)}</span>
                    <span className="flex-1">{o}</span>
                    {state === "right" && <Check size={16} className="text-ok" aria-label="Correct answer" />}
                    {state === "wrong" && <X size={16} className="text-danger" aria-label="Your answer — incorrect" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {picked !== null && (
            <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3 text-sm" role="status">
              <p className="font-medium">{picked === q.answer ? "Correct." : "Not quite."}</p>
              {kind === "ai" && <p className="mt-1 text-muted">{q.explanation}</p>}
              {q.sources.length > 0 && <p className="mt-1 text-xs text-subtle">From: {q.sources.join(", ")}</p>}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={next} disabled={picked === null} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:opacity-40">
              {i + 1 >= questions.length ? "See score" : "Next"} <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ManageCards({ cards, setCards, api }: { cards: Flashcard[]; setCards: (c: Flashcard[]) => void; api: (b: object) => Promise<Response> }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const save = async (next: Flashcard[]) => {
    setCards(next);
    const res = await api({ action: "saveCards", cards: next }).catch(() => null);
    setStatus(res?.ok ? "Saved" : "Couldn't save — check your connection.");
  };
  const field = "min-h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-fg placeholder:text-subtle";
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <form
        className="depth-card flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 lg:col-span-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!front.trim() || !back.trim()) return;
          save([...cards, { id: `c${Date.now().toString(36)}`, front: front.trim(), back: back.trim(), sources: [], origin: "custom" }]);
          setFront("");
          setBack("");
        }}
      >
        <h3 className="font-semibold">Add a flashcard</h3>
        <div>
          <label htmlFor="fc-front" className="mb-1 block text-xs text-subtle">Question or term</label>
          <input id="fc-front" value={front} onChange={(e) => setFront(e.target.value)} maxLength={500} className={field} placeholder="e.g. What is price elasticity?" />
        </div>
        <div>
          <label htmlFor="fc-back" className="mb-1 block text-xs text-subtle">Answer</label>
          <textarea id="fc-back" value={back} onChange={(e) => setBack(e.target.value)} maxLength={2000} rows={3} className={cx(field, "py-2")} placeholder="Short and in your own words" />
        </div>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent text-sm font-medium text-on-accent hover:bg-accent-strong"><Plus size={16} aria-hidden /> Add card</button>
        {status && <p className="text-xs text-subtle" role="status">{status}</p>}
      </form>
      <ul className="flex flex-col gap-2 lg:col-span-3">
        {!cards.length && <li className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">No cards yet.</li>}
        {cards.map((c) => (
          <li key={c.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{c.front}</p>
              <p className="mt-0.5 text-sm text-muted">{c.back}</p>
              <p className="mt-1 text-[0.7rem] uppercase tracking-wide text-subtle">{originLabel(c.origin)}</p>
            </div>
            <button type="button" onClick={() => save(cards.filter((x) => x.id !== c.id))} aria-label={`Delete card “${c.front}”`} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-subtle hover:bg-surface-2 hover:text-danger">
              <Trash2 size={15} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
