"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { IconSpark, IconSend } from "@/components/icons";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Explain the core idea as simply as possible.",
  "Give me an analogy I won't forget.",
  "What's a real-world system that does this?",
  "What's the most common misconception here?",
];

export function AskClaude({ chapterTitle, concepts }: { chapterTitle: string; concepts: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const messagesRef = useRef<Msg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  messagesRef.current = messages;

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;
      setInput("");
      setBusy(true);
      const history = [...messagesRef.current, { role: "user", content } as Msg];
      setMessages([...history, { role: "assistant", content: "" }]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chapterTitle, concepts, messages: history }),
        });
        if (!res.body) {
          const txt = await res.text();
          setMessages((m) => replaceLast(m, txt || "No response."));
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((m) => replaceLast(m, acc));
        }
      } catch {
        setMessages((m) => replaceLast(m, "Sorry — I lost the connection. Please try again."));
      } finally {
        setBusy(false);
      }
    },
    [busy, chapterTitle, concepts],
  );

  // Listen for "discuss this" requests dispatched by the Quiz.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { prompt?: string; autosend?: boolean };
      if (!detail?.prompt) return;
      if (detail.autosend) void send(detail.prompt);
      else setInput(detail.prompt);
    };
    window.addEventListener("ddia:ask", handler);
    return () => window.removeEventListener("ddia:ask", handler);
  }, [send]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div id="ask-claude" className="instrument flex h-[32rem] flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b-2 border-line bg-ink-900/50 px-5 py-3.5">
        <IconSpark size={16} className="accent-text" />
        <span className="font-mono text-[11px] font-extrabold uppercase tracking-[0.18em] text-fg-muted">
          Ask the tutor · <span className="accent-text">{chapterTitle}</span>
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-start justify-center gap-5">
            <p className="font-display text-2xl font-medium italic leading-snug text-fg-muted">
              Ask anything about <span className="accent-text not-italic">{chapterTitle}</span> — get a
              worked explanation, push back on the answer, or ask for another analogy.
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border-2 border-line bg-ink-850 px-3.5 py-1.5 text-left text-[13px] text-fg-muted transition-all duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:border-accent hover:text-fg"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-[16px] border-2 px-4 py-2.5 text-[15px] leading-relaxed",
                  m.role === "user"
                    ? "rounded-br-md accent-border accent-soft-bg text-fg"
                    : "rounded-bl-md border-line bg-ink-850 text-fg/90",
                )}
              >
                {m.content || (busy && i === messages.length - 1 ? <Dots /> : "")}
              </div>
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2.5 border-t-2 border-line p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this chapter…"
          disabled={busy}
          className="flex-1 rounded-full border-2 border-line bg-ink-900 px-4 py-2.5 text-sm text-fg transition-colors placeholder:text-fg-faint focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-ink-950 accent-glow transition-all duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:brightness-110 disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0"
          aria-label="Send"
        >
          <IconSend size={17} />
        </button>
      </form>
    </div>
  );
}

function replaceLast(list: Msg[], content: string): Msg[] {
  if (!list.length) return list;
  const copy = [...list];
  copy[copy.length - 1] = { role: "assistant", content };
  return copy;
}

function Dots() {
  return (
    <span className="inline-flex gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-fg-faint anim-pulse-glow" />
      <span className="h-1.5 w-1.5 rounded-full bg-fg-faint anim-pulse-glow" style={{ animationDelay: "0.2s" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-fg-faint anim-pulse-glow" style={{ animationDelay: "0.4s" }} />
    </span>
  );
}
