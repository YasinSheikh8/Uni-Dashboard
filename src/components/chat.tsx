"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, MessageCircle, RotateCcw, Square } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import { cx } from "./ui";

interface Msg {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

const KEY = "w1_chat_history";
const SUGGESTIONS = [
  "What's due in the next two weeks?",
  "What classes do I have tomorrow?",
  "Summarise my notes for this week",
  "Quiz me on my latest lecture notes",
  "How do I book a study space in the library?",
  "Help me plan a revision timetable",
];

export function Chat({ ready, demo }: { ready: boolean; demo: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(saved)) setMessages(saved.slice(-40));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(messages.filter((m) => !m.error).slice(-40)));
    } catch {}
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const history = [...messages.filter((m) => !m.error), { role: "user" as const, content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-12) }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Something went wrong.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += dec.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: answer }]);
      }
      if (!answer.trim()) throw new Error("No answer came back. Try again.");
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setMessages((m) => (m[m.length - 1]?.content ? m : m.slice(0, -1)));
      } else {
        setMessages([...history, { role: "assistant", content: (e as Error).message, error: true }]);
      }
    } finally {
      setBusy(false);
      abort.current = null;
      inputRef.current?.focus();
    }
  };

  if (!ready)
    return (
      <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
        The chatbot needs an AI key on the server. Add <code>GROQ_API_KEY</code> in Vercel&apos;s environment variables and redeploy.
      </div>
    );

  return (
    <div className="flex min-h-[calc(100dvh-16rem)] flex-col">
      <div className="flex-1" aria-live="polite">
        {!messages.length ? (
          <div className="flex flex-col items-center pt-6 text-center">
            <span className="logo-3d mb-4 flex size-14 items-center justify-center rounded-2xl text-on-accent" aria-hidden>
              <MessageCircle size={26} />
            </span>
            <h2 className="text-lg font-semibold">Ask anything about uni</h2>
            <p className="mt-1 max-w-sm text-sm text-muted">
              I can see your modules, deadlines, timetable and notes{demo ? " (sample data in demo mode)" : ""}. For official details I&apos;ll point you to the right Warwick service.
            </p>
            <div className="mt-6 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="min-h-12 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm text-muted hover:border-line-strong hover:text-fg">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-4 pb-4">
            {messages.map((m, i) => (
              <li key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[0.95rem] text-on-accent">{m.content}</div>
                ) : m.error ? (
                  <div className="max-w-[90%] rounded-2xl border border-danger/40 bg-danger-soft px-4 py-2.5 text-sm text-fg" role="alert">{m.content}</div>
                ) : m.content ? (
                  <div className="prose-w1 max-w-[90%] rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 text-[0.95rem]" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                ) : (
                  <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-subtle">
                    <Loader2 size={15} className="animate-spin" aria-hidden /> Thinking…
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-20 z-10 mt-2 lg:bottom-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 rounded-2xl border border-line bg-surface/95 p-2 shadow-card backdrop-blur"
        >
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Ask anything about uni"
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base text-fg outline-none placeholder:text-subtle"
          />
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line text-muted hover:text-fg" aria-label="Stop">
              <Square size={16} aria-hidden />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-40" aria-label="Send">
              <ArrowUp size={18} aria-hidden />
            </button>
          )}
        </form>
        <div className="mt-1.5 flex items-center justify-between px-1 text-xs text-subtle">
          <span>AI answers can be wrong — check official dates on Moodle or Tabula.</span>
          {messages.length > 0 && !busy && (
            <button type="button" onClick={() => setMessages([])} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 hover:text-fg">
              <RotateCcw size={13} aria-hidden /> New chat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
