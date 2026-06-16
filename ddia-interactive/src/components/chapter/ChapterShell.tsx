"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { getChapter, getAdjacentChapters, PARTS, TOTAL_CHAPTERS, type Chapter } from "@/lib/chapters";
import { ReadingProgress } from "./ReadingProgress";
import { IconArrowLeft, IconArrowRight } from "@/components/icons";

const accentVars = (ch: Chapter) =>
  ({ ["--accent"]: ch.accent, ["--accent-2"]: ch.accent2 } as React.CSSProperties);

/** Spell small counts as Cormorant words; fall back to digits past twelve. */
const NUMBER_WORDS = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six",
  "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
];
const spellOut = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** Springy reveal preset for figures / cards (scale .96 → 1). */
const popReveal = {
  hidden: { opacity: 0, y: 28, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1 },
};
const popTransition = { duration: 0.7, ease: [0.34, 1.56, 0.64, 1] as const };

function PrevNext({ chapter, dir }: { chapter: Chapter; dir: "prev" | "next" }) {
  const isNext = dir === "next";
  return (
    <Link
      href={`/chapters/${chapter.slug}`}
      style={accentVars(chapter)}
      className="panel pop-shadow group flex flex-col p-6 transition-colors hover:border-accent hover:accent-glow"
    >
      <div className={`label flex items-center gap-2 text-[10px] text-fg-faint ${isNext ? "justify-end" : ""}`}>
        {!isNext && <IconArrowLeft size={14} className="shrink-0 group-hover:text-accent" />}
        {isNext ? "Next" : "Previous"}
        {isNext && <IconArrowRight size={14} className="shrink-0 group-hover:text-accent" />}
      </div>
      <div
        className={`mt-2 font-display text-2xl font-medium leading-tight text-fg transition-colors group-hover:text-accent ${
          isNext ? "text-right" : ""
        }`}
      >
        {chapter.title}
      </div>
    </Link>
  );
}

/**
 * Wraps every chapter page: sets the per-chapter accent, renders the editorial
 * title header + specimen grid, the hero diagram framed as a catalogued object,
 * the body, and playful prev/next cards.
 */
export function ChapterShell({
  slug,
  diagram,
  children,
}: {
  slug: string;
  diagram?: ReactNode;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const ch = getChapter(slug);
  if (!ch) return null;
  const part = PARTS[ch.part];
  const { prev, next } = getAdjacentChapters(slug);

  // Staggered header reveal — graceful fade-up for editorial type.
  const headerContainer = {
    hidden: {},
    show: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
  };
  const headerItem = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  // "Specimen" cells — value + label, each with its own coloured top accent bar.
  const specimens: { k: string; v: ReactNode; bar: string }[] = [
    {
      k: "Chapter",
      v: (
        <>
          <i className="not-italic text-accent">{String(ch.number).padStart(2, "0")}</i> / {TOTAL_CHAPTERS}
        </>
      ),
      bar: "bg-fault",
    },
    { k: "Sections", v: spellOut(ch.sections.length), bar: "bg-warn" },
    { k: "Reading", v: <>{Math.max(6, ch.sections.length * 4)}<small className="ml-1 font-body text-base font-normal not-italic text-fg-muted">min</small></>, bar: "bg-ok" },
    { k: "Concepts", v: spellOut(ch.concepts.length), bar: "bg-info" },
  ];

  return (
    <div style={accentVars(ch)} className="relative">
      <ReadingProgress />

      {/* Per-chapter ambient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute left-1/2 top-0 h-[520px] w-[1000px] -translate-x-1/2 rounded-full opacity-[0.12] blur-[130px]"
          style={{ background: "var(--accent)" }}
        />
      </div>

      <article className="mx-auto max-w-5xl px-6 pb-24">
        {/* Header — staggered editorial reveal */}
        <motion.header
          className="pt-12 sm:pt-20"
          variants={headerContainer}
          initial="hidden"
          animate="show"
        >
          <motion.div variants={headerItem} className="kicker flex items-center gap-3 text-accent">
            <span aria-hidden className="h-[3px] w-8 rounded-full bg-accent" />
            {part.label} · {part.title}
          </motion.div>

          <motion.h1
            variants={headerItem}
            className="accent-gradient-text mt-5 font-display text-6xl font-medium leading-[0.92] tracking-tight sm:text-7xl lg:text-8xl"
          >
            {ch.title}
          </motion.h1>

          <motion.p
            variants={headerItem}
            className="mt-5 max-w-[32ch] font-display text-2xl italic leading-snug text-fg-muted sm:text-3xl"
          >
            {ch.subtitle}
          </motion.p>

          {/* Specimen metadata grid */}
          <motion.div
            variants={headerItem}
            className="mt-12 grid grid-cols-2 gap-3.5 sm:grid-cols-4"
          >
            {specimens.map((s) => (
              <div
                key={s.k}
                className="panel relative overflow-hidden border-2 border-line-strong p-5"
              >
                <span aria-hidden className={`absolute inset-x-0 top-0 h-[5px] ${s.bar}`} />
                <div className="label mt-1.5 text-[10px] text-fg-faint">{s.k}</div>
                <div className="mt-2 font-display text-3xl font-semibold leading-none text-fg">
                  {s.v}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.header>

        {/* Hero diagram — framed as a catalogued museum object */}
        {diagram && (
          <motion.figure
            className="instrument mt-14 overflow-hidden"
            variants={popReveal}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            transition={reduceMotion ? { duration: 0.2 } : popTransition}
          >
            <div className="bg-blueprint px-6 py-12 sm:px-9 sm:py-14">{diagram}</div>
            <figcaption className="flex items-baseline gap-4 border-t-2 border-line-strong px-6 py-4 sm:px-9">
              <span className="font-display text-lg italic text-accent">Fig. {ch.number}.0</span>
              <span className="font-display text-lg italic leading-snug text-fg-muted">
                {ch.subtitle}.
              </span>
            </figcaption>
          </motion.figure>
        )}

        <div className="hairline my-12" />

        {children}

        {/* Prev / Next — playful lift-on-hover cards */}
        <nav className="mt-20 grid gap-4 sm:grid-cols-2">
          {prev ? <PrevNext chapter={prev} dir="prev" /> : <span />}
          {next ? <PrevNext chapter={next} dir="next" /> : <span />}
        </nav>

        <div className="mt-12 text-center">
          <Link href="/" className="label text-xs text-fg-faint transition-colors hover:text-accent">
            ← All chapters
          </Link>
        </div>
      </article>
    </div>
  );
}
