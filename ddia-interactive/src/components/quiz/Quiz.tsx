"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { IconSpark, IconCheck, IconX, IconReset, IconLink } from "@/components/icons";

type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  concept: string;
};

type Status = "idle" | "loading" | "ready" | "graded" | "error";
const LETTERS = ["A", "B", "C", "D"];

/** Asks the on-page AskClaude panel to discuss something (via a DOM event). */
function askClaude(prompt: string) {
  window.dispatchEvent(new CustomEvent("ddia:ask", { detail: { prompt, autosend: true } }));
  document.getElementById("ask-claude")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Accent "sticker" pill button — Archivo, uppercase, hard-offset shadow, hover-lift. */
function PillButton({
  children,
  onClick,
  variant = "solid",
  size = "md",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "solid" | "outline" | "ghost";
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const variants: Record<string, string> = {
    solid:
      "bg-accent text-ink-950 accent-glow hover:translate-x-[-2px] hover:translate-y-[-2px] hover:brightness-110",
    outline:
      "border-2 accent-border accent-text hover:accent-soft-bg hover:translate-x-[-2px] hover:translate-y-[-2px]",
    ghost:
      "border-2 border-line text-fg-muted hover:text-fg hover:border-line-strong",
  };
  const sizes: Record<string, string> = {
    sm: "px-4 py-2 text-[10px]",
    md: "px-5 py-2.5 text-[11px]",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-mono font-extrabold uppercase tracking-[0.12em] transition-all duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0",
        variants[variant],
        sizes[size],
      )}
    >
      {children}
    </button>
  );
}

/** Difficulty selector rendered as rounded accent pills. */
function DifficultyPills({
  value,
  onChange,
}: {
  value: "intro" | "core" | "advanced";
  onChange: (v: "intro" | "core" | "advanced") => void;
}) {
  const options: { label: string; value: "intro" | "core" | "advanced" }[] = [
    { label: "Intro", value: "intro" },
    { label: "Core", value: "core" },
    { label: "Advanced", value: "advanced" },
  ];
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full border-2 border-line bg-ink-800 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full px-3.5 py-1.5 font-mono text-[10px] font-extrabold uppercase tracking-[0.12em] transition-all duration-300",
              active ? "bg-accent text-ink-950" : "text-fg-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Quiz({ chapterTitle, concepts }: { chapterTitle: string; concepts: string }) {
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState<Status>("idle");
  const [difficulty, setDifficulty] = useState<"intro" | "core" | "advanced">("core");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");

  async function generate() {
    setStatus("loading");
    setSelected({});
    setMessage("");
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chapterTitle, concepts, difficulty, count: 4 }),
      });
      const data = await res.json();
      if (data.error || !Array.isArray(data.questions)) {
        setStatus("error");
        setMessage(data.message || "Something went wrong generating the quiz.");
        return;
      }
      setQuestions(data.questions);
      setStatus("ready");
    } catch {
      setStatus("error");
      setMessage("Network error — could not reach the quiz service.");
    }
  }

  const allAnswered = questions.length > 0 && questions.every((q) => selected[q.id] !== undefined);
  const score = questions.reduce((n, q) => n + (selected[q.id] === q.correctIndex ? 1 : 0), 0);

  function discuss(q: QuizQuestion) {
    const opts = q.options.map((o, i) => `${LETTERS[i]}. ${o}`).join("\n");
    const mine = selected[q.id] !== undefined ? ` I chose ${LETTERS[selected[q.id]]}.` : "";
    askClaude(
      `I'm working through a quiz question on "${chapterTitle}":\n\n${q.question}\n\n${opts}\n\nThe correct answer is ${LETTERS[q.correctIndex]}.${mine} Can you explain the reasoning, and why the tempting wrong answers are wrong?`,
    );
  }

  return (
    <div className="instrument overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-line bg-ink-900/50 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <IconSpark size={16} className="accent-text" />
          <span className="font-mono text-[11px] font-extrabold uppercase tracking-[0.18em] text-fg-muted">
            AI Quiz · fresh every time
          </span>
        </div>
        <DifficultyPills value={difficulty} onChange={(v) => setDifficulty(v)} />
      </div>

      <div className="p-5 sm:p-6">
        {status === "idle" && (
          <div className="flex flex-col items-start gap-5">
            <h3 className="font-display text-3xl font-medium leading-tight text-fg">
              Test yourself, then talk it through
            </h3>
            <p className="max-w-xl text-[15px] leading-relaxed text-fg-muted">
              Generate a multiple-choice quiz on <span className="accent-text">{chapterTitle}</span>.
              Every quiz is written fresh by Claude — never the same twice — and you can ask the tutor
              to explain any question.
            </p>
            <PillButton onClick={generate} variant="solid">
              <IconSpark size={15} /> Generate quiz
            </PillButton>
          </div>
        )}

        {status === "loading" && (
          <div className="flex items-center gap-3 py-8 text-fg-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-accent anim-pulse-glow" />
            <span className="font-mono text-xs font-bold uppercase tracking-[0.12em]">
              Writing a fresh {difficulty} quiz…
            </span>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-start gap-4 py-2">
            <p className="max-w-xl rounded-[13px] border-2 border-fault/40 bg-fault/10 p-4 text-sm text-fg">
              {message}
            </p>
            <PillButton onClick={generate} variant="outline">
              <IconReset size={15} /> Try again
            </PillButton>
          </div>
        )}

        {(status === "ready" || status === "graded") && (
          <div className="space-y-6">
            {questions.map((q, qi) => {
              const choice = selected[q.id];
              const graded = status === "graded";
              return (
                <motion.div
                  key={q.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.96 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: "0px 0px -8% 0px" }}
                  transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1], delay: qi * 0.05 }}
                  className="rounded-[16px] border-2 border-line bg-ink-900/40 p-4 sm:p-5"
                >
                  <div className="mb-3 flex items-start gap-3">
                    <span className="mt-0.5 font-mono text-base font-extrabold tabular-nums accent-text">
                      {qi + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-[15px] font-medium leading-relaxed text-fg">{q.question}</p>
                      {q.concept && (
                        <span className="mt-1.5 inline-block rounded-full border border-line px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-fg-faint">
                          {q.concept}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {q.options.map((opt, oi) => {
                      const isChoice = choice === oi;
                      const isCorrect = q.correctIndex === oi;
                      const showCorrect = graded && isCorrect;
                      const showWrong = graded && isChoice && !isCorrect;
                      return (
                        <button
                          key={oi}
                          type="button"
                          disabled={graded}
                          onClick={() => setSelected((s) => ({ ...s, [q.id]: oi }))}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-full border-2 px-4 py-2.5 text-left text-sm transition-all duration-200",
                            !graded && isChoice && "accent-border accent-soft-bg text-fg",
                            !graded &&
                              !isChoice &&
                              "border-line text-fg-muted hover:translate-x-[-2px] hover:translate-y-[-2px] hover:border-line-strong hover:text-fg",
                            showCorrect && "border-ok/70 bg-ok/10 text-fg",
                            showWrong && "border-fault/70 bg-fault/10 text-fg",
                            graded && !isCorrect && !isChoice && "border-line text-fg-faint",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-extrabold",
                              !graded && isChoice && "accent-border accent-text",
                              !graded && !isChoice && "border-line text-fg-faint",
                              showCorrect && "border-ok/70 text-ok",
                              showWrong && "border-fault/70 text-fault",
                              graded && !isCorrect && !isChoice && "border-line text-fg-faint",
                            )}
                          >
                            {LETTERS[oi]}
                          </span>
                          <span className="flex-1">{opt}</span>
                          {showCorrect && <IconCheck size={16} className="shrink-0 text-ok" />}
                          {showWrong && <IconX size={16} className="shrink-0 text-fault" />}
                        </button>
                      );
                    })}
                  </div>
                  <AnimatePresence>
                    {graded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 rounded-[13px] border-2 border-line bg-ink-850 p-3.5 text-sm leading-relaxed text-fg-muted">
                          {q.explanation}
                        </div>
                        <button
                          type="button"
                          onClick={() => discuss(q)}
                          className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg-faint transition-colors hover:text-accent"
                        >
                          <IconLink size={13} /> Discuss this with the tutor
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}

            <div className="flex flex-wrap items-center gap-3 border-t-2 border-line pt-4">
              {status === "ready" ? (
                <PillButton onClick={() => setStatus("graded")} disabled={!allAnswered} variant="solid">
                  Check answers
                </PillButton>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-fg-muted">
                    Score
                  </span>
                  <span
                    className={cn(
                      "font-mono text-2xl font-extrabold tabular-nums",
                      score === questions.length ? "text-ok" : "accent-text",
                    )}
                  >
                    {score}/{questions.length}
                  </span>
                </div>
              )}
              <PillButton onClick={generate} variant="ghost" size="sm">
                <IconReset size={14} /> New quiz
              </PillButton>
              {status === "ready" && !allAnswered && (
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg-faint">
                  Answer all {questions.length} to check.
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
