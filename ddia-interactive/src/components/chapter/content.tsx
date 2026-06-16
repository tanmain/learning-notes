"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { cn } from "@/lib/cn";
import { IconSpark, IconBook, IconAlert, IconScale, IconCheck, IconDatabase } from "@/components/icons";

/* ---------------------------------------------------------------- motion ---
   Two shared reveal personalities, matching the design spec:
   - `fadeUp`  : graceful editorial rise for prose / headlines.
   - `pop`     : springy sticker pop (scale .96→1) for figures / cards.
   Both collapse to a no-op when the user prefers reduced motion. */

const REVEAL_VIEWPORT = { once: true, margin: "0px 0px -8% 0px" } as const;

// Editorial / springy cubic-beziers as readonly 4-tuples (framer-motion BezierDefinition).
const EASE_EDITORIAL = [0.22, 1, 0.36, 1] as const;
const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const;

function useReveal() {
  const reduce = useReducedMotion();

  const fadeUp: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 16 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? 0 : 0.7, ease: EASE_EDITORIAL },
    },
  };

  const pop: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 24, scale: reduce ? 1 : 0.96 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: reduce ? 0 : 0.6, ease: EASE_SPRING },
    },
  };

  return { fadeUp, pop };
}

/* ------------------------------------------------------------------ Section */

export function Section({
  id,
  kicker,
  title,
  intro,
  children,
  className,
}: {
  id?: string;
  kicker?: string;
  title?: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { fadeUp } = useReveal();
  const hasMeta = Boolean(kicker || title || intro);

  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-28 border-t border-line py-14 first:border-t-0",
        "grid items-start gap-x-14 gap-y-7 md:grid-cols-[240px_minmax(0,1fr)]",
        className,
      )}
    >
      {/* Left meta column — sticky on desktop, stacked on mobile */}
      {hasMeta ? (
        <motion.header
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={REVEAL_VIEWPORT}
          className="top-28 self-start md:sticky"
        >
          {kicker && (
            <span className="label inline-flex items-center rounded-md border border-accent/40 accent-soft-bg px-2.5 py-1 accent-text">
              {kicker}
            </span>
          )}
          {title && (
            <h2 className="mt-4 font-display text-3xl font-medium leading-[1.08] tracking-tight text-fg sm:text-[2rem]">
              {title}
            </h2>
          )}
          {intro && (
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{intro}</p>
          )}
        </motion.header>
      ) : (
        // Keep the grid intact (preserve the content column) when there's no meta.
        <div aria-hidden className="hidden md:block" />
      )}

      {/* Right content column — min-w-0 so wide demos/tables never overflow */}
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------- Prose */

export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  const { fadeUp } = useReveal();
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={REVEAL_VIEWPORT}
      className={cn("prose-ddia", className)}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ Callout */

type CalloutVariant = "insight" | "warning" | "tradeoff" | "note";

const CALLOUT: Record<CalloutVariant, { label: string; color: string; Icon: typeof IconSpark }> = {
  insight: { label: "Key insight", color: "var(--accent)", Icon: IconSpark },
  warning: { label: "Watch out", color: "var(--color-warn)", Icon: IconAlert },
  tradeoff: { label: "Trade-off", color: "var(--color-special)", Icon: IconScale },
  note: { label: "Note", color: "var(--color-info)", Icon: IconBook },
};

export function Callout({
  variant = "insight",
  title,
  children,
}: {
  variant?: CalloutVariant;
  title?: string;
  children: ReactNode;
}) {
  const { fadeUp } = useReveal();
  const { label, color, Icon } = CALLOUT[variant];
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={REVEAL_VIEWPORT}
      className="my-6 flex gap-4 rounded-[16px] rounded-l-md border-l-2 p-5"
      style={{
        borderColor: color,
        background: `color-mix(in oklab, ${color} 9%, var(--color-ink-850))`,
      }}
    >
      <div className="mt-0.5 shrink-0" style={{ color }}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <div className="kicker mb-1.5" style={{ color }}>
          {title ?? label}
        </div>
        <div className="text-[15px] leading-relaxed text-fg">{children}</div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ Analogy */

export function Analogy({ title = "Analogy", children }: { title?: string; children: ReactNode }) {
  const { fadeUp } = useReveal();
  return (
    <motion.figure
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={REVEAL_VIEWPORT}
      className="my-9 border-l-4 border-accent pl-6"
    >
      <figcaption className="kicker mb-3 flex items-center gap-2 accent-text">
        <IconSpark size={16} />
        <span>{title}</span>
      </figcaption>
      <blockquote className="max-w-[30ch] font-display text-[1.6rem] font-medium italic leading-[1.35] text-fg sm:text-[1.75rem]">
        {children}
      </blockquote>
    </motion.figure>
  );
}

/* ---------------------------------------------------------------- RealWorld */

export function RealWorld({
  title = "In the wild",
  examples,
  children,
}: {
  title?: string;
  examples?: { system: string; detail: ReactNode }[];
  children?: ReactNode;
}) {
  const { fadeUp } = useReveal();
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={REVEAL_VIEWPORT}
      className="my-7"
    >
      <div className="kicker mb-4 flex items-center gap-2 text-info">
        <IconDatabase size={16} />
        <span>{title}</span>
      </div>
      {examples && (
        <ul className="space-y-3.5">
          {examples.map((e, i) => (
            <li key={i} className="flex flex-col gap-1 sm:flex-row sm:gap-5">
              <span className="shrink-0 font-mono text-sm font-bold uppercase tracking-wide accent-text sm:w-40">
                {e.system}
              </span>
              <span className="text-[15px] leading-relaxed text-fg-muted">{e.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {children && <div className="mt-2 text-[15px] leading-relaxed text-fg-muted">{children}</div>}
    </motion.div>
  );
}

/* ------------------------------------------------------------- KeyTakeaways */

export function KeyTakeaways({ title = "Key takeaways", points }: { title?: string; points: string[] }) {
  const { pop } = useReveal();
  return (
    <motion.div
      variants={pop}
      initial="hidden"
      whileInView="show"
      viewport={REVEAL_VIEWPORT}
      className="panel accent-glow my-8 p-7"
    >
      <div className="kicker mb-5 accent-text">{title}</div>
      <ul className="space-y-3.5">
        {points.map((p, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full accent-bg text-ink-950">
              <IconCheck size={13} />
            </span>
            <span className="text-[15px] leading-relaxed text-fg">{p}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/* ------------------------------------------------------------------- Figure */

export function Figure({ caption, children }: { caption?: ReactNode; children: ReactNode }) {
  const { pop } = useReveal();
  return (
    <motion.figure
      variants={pop}
      initial="hidden"
      whileInView="show"
      viewport={REVEAL_VIEWPORT}
      className="my-8"
    >
      <div className="instrument overflow-hidden p-6">{children}</div>
      {caption && (
        <figcaption className="mt-4 font-display text-[1.05rem] italic leading-snug text-accent">
          {caption}
        </figcaption>
      )}
    </motion.figure>
  );
}

/* ----------------------------------------------------------- DefinitionGrid */

export function DefinitionGrid({ items }: { items: { term: string; def: ReactNode }[] }) {
  const { pop } = useReveal();
  return (
    <motion.dl
      variants={pop}
      initial="hidden"
      whileInView="show"
      viewport={REVEAL_VIEWPORT}
      className="my-8 grid gap-px overflow-hidden rounded-[16px] border-2 border-line-strong bg-line-strong sm:grid-cols-2"
    >
      {items.map((it, i) => (
        <div key={i} className="bg-ink-850 p-5">
          <dt className="mb-1.5 font-mono text-sm font-bold uppercase tracking-wide accent-text">{it.term}</dt>
          <dd className="text-sm leading-relaxed text-fg-muted">{it.def}</dd>
        </div>
      ))}
    </motion.dl>
  );
}

/* ------------------------------------------------------------- CompareTable */

export function CompareTable({
  columns,
  rows,
  caption,
}: {
  columns: string[];
  rows: { feature: string; values: ReactNode[] }[];
  caption?: string;
}) {
  const { pop } = useReveal();
  return (
    <motion.figure
      variants={pop}
      initial="hidden"
      whileInView="show"
      viewport={REVEAL_VIEWPORT}
      className="my-8"
    >
      <div className="instrument overflow-x-auto p-0">
        <table className="w-full min-w-[480px] border-collapse text-left">
          <thead>
            <tr>
              <th className="border-b-2 border-line-strong px-4 py-3.5" />
              {columns.map((c, i) => (
                <th
                  key={i}
                  className="border-b-2 border-line-strong px-4 py-3.5 font-display text-lg font-semibold text-fg"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="align-top">
                <th className="border-b border-line px-4 py-3.5 text-left font-mono text-xs font-bold uppercase tracking-wide text-fg-faint">
                  {r.feature}
                </th>
                {r.values.map((v, j) => (
                  <td key={j} className="border-b border-line px-4 py-3.5 text-sm leading-relaxed text-fg-muted">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption && (
        <figcaption className="mt-4 font-display text-[1.05rem] italic leading-snug text-accent">
          {caption}
        </figcaption>
      )}
    </motion.figure>
  );
}
