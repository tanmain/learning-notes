"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { CHAPTERS, PARTS, TOTAL_CHAPTERS, type Part } from "@/lib/chapters";
import {
  IconArrowRight,
  IconBook,
  IconPlay,
  IconBolt,
  IconSpark,
  IconDatabase,
  IconBeaker,
} from "@/components/icons";

const accentStyle = (hex: string) =>
  ({ ["--accent"]: hex } as React.CSSProperties);

const FEATURES = [
  { icon: IconBook, title: "Plain-English explanation", body: "Each concept unpacked for a CS grad — precise, no hand-waving." },
  { icon: IconPlay, title: "Live demo", body: "Watch the mechanism actually run, step by step." },
  { icon: IconBolt, title: "Interactive controls", body: "Turn the knobs — latency, replicas, isolation — and see what breaks." },
  { icon: IconSpark, title: "Analogy that sticks", body: "A mental model you'll still remember next week." },
  { icon: IconDatabase, title: "In the wild", body: "Where it shows up: Postgres, Kafka, Cassandra, Spanner & more." },
  { icon: IconBeaker, title: "AI tutor + live quiz", body: "A quiz that's never the same twice, and a tutor you can argue with." },
];

/** Specimen-style metrics for the hero — the bold "data voice". */
const SPECIMEN = [
  { k: "Chapters", v: "12", accentVar: "--color-fault" },
  { k: "Parts", v: "03", accentVar: "--color-warn" },
  { k: "Demos", v: "30+", accentVar: "--color-ok" },
  { k: "AI tutor", v: "Live", accentVar: "--color-info" },
];

/* Prose / headlines: graceful fade-up. Figures / cards: springy pop. */
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } },
};
const pop = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: [0.34, 1.56, 0.64, 1] as const } },
};

export default function HomePage() {
  const partIds = Object.keys(PARTS) as Part["id"][];
  const reduce = useReducedMotion();
  // Honour reduced-motion: collapse the springy/offset transforms to a plain fade.
  const popVariants = reduce ? fadeUp : pop;

  return (
    <div className="relative">
      {/* ============================================ HERO */}
      <section className="relative mx-auto max-w-6xl px-6 pb-14 pt-16 sm:pt-24">
        <motion.div initial="hidden" animate="show" variants={container}>
          <motion.div
            variants={fadeUp}
            className="kicker mb-6 inline-flex items-center gap-3 text-accent"
            style={accentStyle(CHAPTERS[0].accent)}
          >
            <span className="h-[3px] w-8 rounded-full bg-accent" />
            Interactive Companion · {TOTAL_CHAPTERS} Chapters
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="font-display text-6xl font-medium leading-[0.94] tracking-tight sm:text-7xl lg:text-8xl"
          >
            The mechanics of{" "}
            <span className="accent-gradient-text" style={accentStyle(CHAPTERS[0].accent)}>
              data-intensive
            </span>{" "}
            systems, made tangible<span className="text-ok">.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-7 max-w-[34ch] font-display text-2xl font-medium italic leading-snug text-fg-muted sm:text-3xl"
          >
            A hands-on tour through Martin Kleppmann&apos;s{" "}
            <span className="text-fg">Designing Data-Intensive Applications</span> — explained,
            demoed, and argued with.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href={`/chapters/${CHAPTERS[0].slug}`}
              style={accentStyle(CHAPTERS[0].accent)}
              className="group pop-shadow accent-shadow inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-[0.1em] text-white"
            >
              Start with Chapter 1
              <IconArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#chapters"
              className="pop-shadow inline-flex items-center gap-2 rounded-full border-2 border-line-strong px-6 py-3 font-mono text-xs font-bold uppercase tracking-[0.1em] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              Browse all chapters
            </a>
          </motion.div>
        </motion.div>

        {/* Specimen metric grid — bold Archivo data voice, sticker cards */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          variants={container}
          className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {SPECIMEN.map((s) => (
            <motion.div
              key={s.k}
              variants={popVariants}
              className="instrument relative overflow-hidden p-5"
            >
              <div
                className="absolute inset-x-0 top-0 h-[5px]"
                style={{ backgroundColor: `var(${s.accentVar})` }}
              />
              <div className="label">{s.k}</div>
              <div
                className="mt-2 font-mono text-4xl font-black leading-none"
                style={{ color: `var(${s.accentVar})` }}
              >
                {s.v}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Accent spectrum spine — the per-chapter palette, in book order */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="mt-10 flex h-2 w-full overflow-hidden rounded-full border border-line"
        >
          {CHAPTERS.map((c) => (
            <div key={c.slug} className="h-full flex-1" style={{ backgroundColor: c.accent }} />
          ))}
        </motion.div>
      </section>

      {/* ============================================ FEATURES */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="mb-2 flex items-baseline gap-3">
          <span className="kicker">What every chapter gives you</span>
          <span className="hairline flex-1" />
        </div>
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={container}
          className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              variants={popVariants}
              className="panel pop-shadow group flex gap-4 p-5"
            >
              <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-line-strong bg-ink-800 text-fg-muted transition-colors group-hover:text-fg">
                <f.icon size={20} />
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold leading-tight">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">{f.body}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ============================================ CHAPTER INDEX */}
      <section id="chapters" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-14">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={container}
        >
          <motion.h2
            variants={fadeUp}
            className="font-display text-5xl font-medium tracking-tight sm:text-6xl"
          >
            The Chapters
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-3 max-w-2xl text-lg text-fg-muted">
            Three parts, twelve chapters — from a single machine&apos;s storage engine
            out to globally distributed consensus.
          </motion.p>
        </motion.div>

        {partIds.map((pid) => {
          const part = PARTS[pid];
          const chapters = CHAPTERS.filter((c) => c.part === pid);
          return (
            <div key={pid} className="mt-14">
              <div className="mb-6 flex items-baseline gap-4">
                <span className="kicker">{part.label}</span>
                <span className="hairline flex-1" />
                <span className="font-display text-2xl font-medium text-fg-muted">{part.title}</span>
              </div>

              <motion.div
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px" }}
                variants={container}
                className="grid gap-5 md:grid-cols-2"
              >
                {chapters.map((c) => (
                  <motion.div key={c.slug} variants={popVariants} style={accentStyle(c.accent)}>
                    <Link
                      href={`/chapters/${c.slug}`}
                      className="instrument pop-shadow accent-shadow group relative block h-full overflow-hidden p-6 hover:border-accent"
                    >
                      <div className="absolute inset-x-0 top-0 h-[5px] bg-accent" />
                      <div className="relative flex items-start justify-between gap-4">
                        <div className="flex items-baseline gap-3">
                          <span className="font-mono text-base font-black text-accent">
                            {String(c.number).padStart(2, "0")}
                          </span>
                          <h3 className="font-display text-2xl font-semibold leading-tight tracking-tight">
                            {c.title}
                          </h3>
                        </div>
                        <IconArrowRight
                          size={20}
                          className="mt-1.5 shrink-0 text-fg-faint transition-all group-hover:translate-x-1 group-hover:text-accent"
                        />
                      </div>
                      <p className="relative mt-3 text-sm leading-relaxed text-fg-muted">{c.blurb}</p>
                      <div className="relative mt-4 flex flex-wrap gap-1.5">
                        {c.sections.map((s) => (
                          <span
                            key={s}
                            className="rounded-full border border-line bg-ink-850 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-fg-faint"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          );
        })}
      </section>

      {/* ============================================ FOOTER */}
      <footer className="mx-auto mt-14 max-w-6xl px-6 pb-20">
        <div
          className="instrument accent-shadow flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between"
          style={accentStyle(CHAPTERS[0].accent)}
        >
          <div>
            <div className="label mb-1 text-accent">Enable the AI tutor</div>
            <p className="text-sm text-fg-muted">
              The live quiz and chat tutor call Claude. Add{" "}
              <code className="rounded bg-ink-800 px-1.5 py-0.5 font-code text-xs text-accent">
                ANTHROPIC_API_KEY
              </code>{" "}
              to <code className="font-code text-xs text-fg">.env.local</code> to switch them on.
            </p>
          </div>
          <span className="label shrink-0 text-[9px]">Built as an interactive companion · not affiliated with the author</span>
        </div>
      </footer>
    </div>
  );
}
