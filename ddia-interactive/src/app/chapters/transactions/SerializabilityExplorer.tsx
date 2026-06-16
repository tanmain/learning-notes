"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SegmentedControl, Stat } from "@/components/chapter";

/**
 * Serializability Explorer — three techniques that all achieve the same
 * guarantee by very different means. Pick one and watch how two conflicting
 * transactions are handled: serialized on a single thread, blocked on locks,
 * or run optimistically and aborted on conflict.
 */

type Technique = "serial" | "2pl" | "ssi";

const TECHNIQUES: { label: string; value: Technique }[] = [
  { label: "Serial execution", value: "serial" },
  { label: "Two-phase locking", value: "2pl" },
  { label: "Serializable snapshot (SSI)", value: "ssi" },
];

type Info = {
  family: "Pessimistic" | "Optimistic";
  blurb: string;
  used: string;
  concurrency: string;
  scaling: string;
  abortRate: string;
  /** lane segments for T1 and T2: 'run' | 'wait' | 'abort' over a 0..1 track */
  t1: Seg[];
  t2: Seg[];
};

type Seg = { from: number; to: number; state: "run" | "wait" | "abort" };

const INFO: Record<Technique, Info> = {
  serial: {
    family: "Pessimistic",
    blurb:
      "Remove concurrency entirely: one transaction at a time, on a single thread. Each must be submitted as a stored procedure so it never waits on the network mid-flight. VoltDB, Redis and Datomic work this way.",
    used: "VoltDB / H-Store, Redis, Datomic",
    concurrency: "none (1 at a time)",
    scaling: "1 CPU core / partition",
    abortRate: "none",
    t1: [{ from: 0, to: 0.5, state: "run" }],
    t2: [
      { from: 0, to: 0.5, state: "wait" },
      { from: 0.5, to: 1, state: "run" },
    ],
  },
  "2pl": {
    family: "Pessimistic",
    blurb:
      "Readers block writers and writers block readers, via shared/exclusive locks held until commit. Correct but slow: one long transaction can stall everything, and deadlocks must be detected and resolved. The traditional serializable implementation.",
    used: "MySQL (InnoDB) SERIALIZABLE, SQL Server",
    concurrency: "readers share; writers exclusive",
    scaling: "limited by lock contention",
    abortRate: "low (deadlocks only)",
    t1: [{ from: 0, to: 0.55, state: "run" }],
    t2: [
      { from: 0, to: 0.55, state: "wait" },
      { from: 0.55, to: 1, state: "run" },
    ],
  },
  ssi: {
    family: "Optimistic",
    blurb:
      "Run on a snapshot and hope for the best. The database tracks read-write dependencies and, at commit, aborts any transaction that acted on a premise another committed transaction invalidated. No blocking — but a high abort rate under contention hurts.",
    used: "PostgreSQL SERIALIZABLE, FoundationDB",
    concurrency: "full — no blocking",
    scaling: "multi-core, multi-partition",
    abortRate: "rises with contention",
    t1: [{ from: 0, to: 0.7, state: "run" }],
    t2: [
      { from: 0, to: 0.85, state: "run" },
      { from: 0.85, to: 1, state: "abort" },
    ],
  },
};

const STATE_COLOR: Record<Seg["state"], string> = {
  run: "var(--accent)",
  wait: "var(--color-warn)",
  abort: "var(--color-fault)",
};

export function SerializabilityExplorer() {
  const [tech, setTech] = useState<Technique>("serial");
  const info = INFO[tech];
  const optimistic = info.family === "Optimistic";

  return (
    <div className="space-y-5">
      <SegmentedControl value={tech} onChange={setTech} options={TECHNIQUES} />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* timeline lanes */}
        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="kicker">Two conflicting transactions</span>
            <span
              className="rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
              style={{
                color: optimistic ? "var(--color-special)" : "var(--color-info)",
                background: `color-mix(in oklab, ${optimistic ? "var(--color-special)" : "var(--color-info)"} 14%, transparent)`,
              }}
            >
              {info.family}
            </span>
          </div>

          <Lane label="T1" segs={info.t1} />
          <div className="h-3" />
          <Lane label="T2" segs={info.t2} />

          {/* legend */}
          <div className="mt-5 flex flex-wrap gap-4">
            {(["run", "wait", "abort"] as const).map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATE_COLOR[s] }} />
                <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                  {s === "run" ? "running" : s === "wait" ? "blocked" : "aborted → retry"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* properties */}
        <div className="space-y-3">
          <AnimatePresence mode="wait">
            <motion.p
              key={tech}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm leading-relaxed text-fg-muted"
            >
              {info.blurb}
            </motion.p>
          </AnimatePresence>
          <div className="grid grid-cols-2 gap-2.5">
            <Stat label="Concurrency" value={<span className="text-sm">{info.concurrency}</span>} />
            <Stat label="Scaling" value={<span className="text-sm">{info.scaling}</span>} />
            <Stat label="Abort rate" value={<span className="text-sm">{info.abortRate}</span>} tone={optimistic ? "warn" : "default"} />
            <Stat label="Family" value={<span className="text-sm">{info.family}</span>} tone={optimistic ? "special" : "info"} />
          </div>
          <div className="rounded-md border border-line bg-ink-850 px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">In the wild · </span>
            <span className="font-mono text-xs text-fg">{info.used}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Lane({ label, segs }: { label: string; segs: Seg[] }) {
  const color = label === "T1" ? "var(--accent)" : "var(--color-special)";
  return (
    <div className="flex items-center gap-3">
      <span className="w-7 shrink-0 font-mono text-xs uppercase" style={{ color }}>
        {label}
      </span>
      <div className="relative h-8 flex-1 overflow-hidden rounded-md border border-line bg-ink-950">
        {/* tick marks */}
        <div className="pointer-events-none absolute inset-0 flex">
          {[0.25, 0.5, 0.75].map((t) => (
            <span key={t} className="absolute top-0 h-full w-px bg-line/60" style={{ left: `${t * 100}%` }} />
          ))}
        </div>
        {segs.map((s, i) => (
          <motion.div
            key={`${s.state}-${i}`}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.4, delay: i * 0.15, ease: "easeOut" }}
            className="absolute top-1/2 -translate-y-1/2 rounded-sm"
            style={{
              left: `${s.from * 100}%`,
              width: `${(s.to - s.from) * 100}%`,
              height: "60%",
              transformOrigin: "left center",
              background:
                s.state === "wait"
                  ? `repeating-linear-gradient(45deg, ${STATE_COLOR.wait}, ${STATE_COLOR.wait} 3px, transparent 3px, transparent 7px)`
                  : STATE_COLOR[s.state],
              opacity: s.state === "wait" ? 0.7 : 0.9,
            }}
          >
            {s.state === "abort" && (
              <span className="flex h-full items-center justify-center font-mono text-[9px] uppercase tracking-wider text-ink-950">
                abort
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
