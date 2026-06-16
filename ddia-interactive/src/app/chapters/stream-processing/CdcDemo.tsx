"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button, SegmentedControl, Stat } from "@/components/chapter";

/**
 * Dual-writes vs change-data-capture demo.
 *
 * Two derived systems must reflect a primary key's value: a search INDEX and a
 * CACHE. Two concurrent writers set X = "A" and X = "B".
 *
 *  - DUAL WRITES: each writer writes to the DB *and* to each derived store
 *    directly. Because the two writers interleave per-destination, the index can
 *    end on "A" while the cache ends on "B" — silently inconsistent. (DDIA's
 *    canonical race condition.)
 *  - CDC: both writers write only to the DB. The DB's replication log imposes a
 *    single total order; every derived store consumes that one ordered stream, so
 *    they all converge to the same final value. One leader, many followers.
 *
 * Click "Run" to play the interleaving and watch the stores' final state.
 */

type Mode = "dual" | "cdc";
type Store = "db" | "index" | "cache";

type Step = { writer: "A" | "B"; target: Store };

// A deliberately adversarial interleaving for dual writes: writers race per store.
const DUAL_SEQUENCE: Step[] = [
  { writer: "A", target: "db" },
  { writer: "B", target: "db" }, // DB ends on B
  { writer: "B", target: "index" },
  { writer: "A", target: "index" }, // index ends on A  (diverges!)
  { writer: "A", target: "cache" },
  { writer: "B", target: "cache" }, // cache ends on B
];

// CDC: writers only touch the DB; the log then fans out to derived stores in order.
const CDC_SEQUENCE: Step[] = [
  { writer: "A", target: "db" },
  { writer: "B", target: "db" }, // DB log order: A then B → final B
  { writer: "B", target: "index" },
  { writer: "B", target: "cache" }, // followers replay the SAME order → B everywhere
];

const VAL: Record<"A" | "B", string> = { A: '"A"', B: '"B"' };

export function CdcDemo() {
  const [mode, setMode] = useState<Mode>("dual");
  const [step, setStep] = useState(0); // number of steps applied
  const [playing, setPlaying] = useState(false);

  const seq = mode === "dual" ? DUAL_SEQUENCE : CDC_SEQUENCE;

  // Replay the sequence up to `step` to compute each store's current value.
  const stores: Record<Store, "A" | "B" | null> = { db: null, index: null, cache: null };
  for (let i = 0; i < step && i < seq.length; i++) {
    stores[seq[i].target] = seq[i].writer;
  }

  const done = step >= seq.length;
  const consistent = stores.db === stores.index && stores.index === stores.cache && stores.db !== null;

  const play = () => {
    if (playing) return;
    setPlaying(true);
    setStep(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setStep(i);
      if (i >= seq.length) {
        clearInterval(id);
        setPlaying(false);
      }
    }, 700);
  };

  const reset = () => {
    setStep(0);
    setPlaying(false);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setStep(0);
    setPlaying(false);
  };

  const activeStep = step > 0 && step <= seq.length ? seq[step - 1] : null;

  const StoreBox = ({ id, label, color }: { id: Store; label: string; color: string }) => {
    const v = stores[id];
    const isActive = activeStep?.target === id;
    return (
      <motion.div
        className="flex-1 rounded-lg border bg-ink-900/60 p-3 text-center"
        style={{ borderColor: isActive ? color : "var(--color-line)" }}
        animate={isActive ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">{label}</div>
        <div
          className="mt-1.5 font-mono text-2xl font-semibold tabular-nums"
          style={{ color: v ? color : "var(--color-fg-faint)" }}
        >
          {v ? `X = ${VAL[v]}` : "X = —"}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<Mode>
          value={mode}
          onChange={switchMode}
          options={[
            { label: "Dual writes", value: "dual" },
            { label: "Change data capture", value: "cdc" },
          ]}
        />
        <Button onClick={play} variant="solid" size="sm" disabled={playing}>
          {playing ? "Running…" : "Run interleaving"}
        </Button>
        <Button onClick={reset} variant="ghost" size="sm" disabled={playing}>
          Reset
        </Button>
      </div>

      {/* writers */}
      <div className="flex items-center justify-center gap-4">
        <div className="rounded-lg border border-[var(--color-info)]/50 bg-ink-850 px-4 py-2 text-center">
          <div className="font-mono text-[10px] text-[var(--color-info)]">WRITER A</div>
          <div className="font-mono text-sm text-fg">sets X = {VAL.A}</div>
        </div>
        <div className="rounded-lg border border-[var(--color-special)]/50 bg-ink-850 px-4 py-2 text-center">
          <div className="font-mono text-[10px] text-[var(--color-special)]">WRITER B</div>
          <div className="font-mono text-sm text-fg">sets X = {VAL.B}</div>
        </div>
      </div>

      {/* flow schematic */}
      <div className="rounded-lg border border-line bg-ink-950/60 p-4">
        {mode === "cdc" && (
          <div className="mb-3 flex items-center justify-center gap-2 font-mono text-[10px] text-accent">
            <span>writers → DB only → replication log → fan-out</span>
          </div>
        )}
        {mode === "dual" && (
          <div className="mb-3 flex items-center justify-center gap-2 font-mono text-[10px] text-[var(--color-warn)]">
            <span>each writer writes to all three stores directly (racy)</span>
          </div>
        )}
        <div className="flex gap-3">
          <StoreBox id="db" label="Primary DB" color="var(--accent)" />
          <StoreBox id="index" label="Search index" color="var(--accent-2)" />
          <StoreBox id="cache" label="Cache" color="var(--color-special)" />
        </div>
      </div>

      {/* step trace */}
      <div className="rounded-lg border border-line bg-ink-900/40 p-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-faint">operation trace</div>
        <div className="flex flex-wrap gap-1.5">
          {seq.map((s, i) => {
            const applied = i < step;
            const isCurrent = i === step - 1;
            const color = s.writer === "A" ? "var(--color-info)" : "var(--color-special)";
            return (
              <span
                key={i}
                className="rounded border px-2 py-1 font-mono text-[10px] transition-all"
                style={{
                  borderColor: applied ? color : "var(--color-line)",
                  color: applied ? color : "var(--color-fg-faint)",
                  background: isCurrent ? `color-mix(in oklab, ${color} 18%, transparent)` : "transparent",
                  opacity: applied ? 1 : 0.4,
                }}
              >
                {s.writer}→{s.target}={VAL[s.writer]}
              </span>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Steps applied" value={`${Math.min(step, seq.length)} / ${seq.length}`} tone="default" />
        <Stat
          label="Final state"
          value={!done ? <span className="text-base">running…</span> : consistent ? <span className="text-base">CONSISTENT</span> : <span className="text-base">DIVERGED</span>}
          tone={!done ? "default" : consistent ? "ok" : "fault"}
        />
      </div>

      {done && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[13px] leading-relaxed text-fg-muted"
        >
          {consistent ? (
            <>
              Under <span className="accent-text">CDC</span> every store consumed the DB&apos;s single ordered log,
              so the index and cache replayed writes in the <em>same order</em> the DB committed them — they all
              converge to <span className="text-accent">{stores.db && VAL[stores.db]}</span>. One leader, many
              deterministic followers.
            </>
          ) : (
            <>
              With <span className="text-[var(--color-warn)]">dual writes</span> the two writers raced on each
              destination independently. The DB ended on{" "}
              <span className="text-accent">{stores.db && VAL[stores.db]}</span> but the index ended on{" "}
              <span className="text-[var(--accent-2)]">{stores.index && VAL[stores.index]}</span> — a permanent
              silent inconsistency that no retry fixes. Switch to CDC and run it again.
            </>
          )}
        </motion.p>
      )}
    </div>
  );
}
