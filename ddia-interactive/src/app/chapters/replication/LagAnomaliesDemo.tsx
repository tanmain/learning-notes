"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SegmentedControl } from "@/components/chapter";

/* ----------------------------------------------------------------------------
   Replication-lag anomalies. Three classic guarantees that asynchronous
   followers can violate. Pick one; we narrate the exact sequence of events that
   produces the surprising result, on a small two-follower timeline.
---------------------------------------------------------------------------- */

type Anomaly = "ryw" | "mono" | "prefix";

type Frame = {
  // one row per actor
  leader: string;
  followerA: string;
  followerB: string;
  /** the user-visible read in this frame, if any */
  read?: { from: "A" | "B"; value: string; bad: boolean };
  note: string;
};

const SCENARIOS: Record<
  Anomaly,
  { label: string; title: string; blurb: string; guarantee: string; fix: string; frames: Frame[] }
> = {
  ryw: {
    label: "Read-your-writes",
    title: "You submit a comment, then it vanishes",
    blurb:
      "After a user writes, a read routed to a lagging follower can fail to show their own change — as if the write never happened.",
    guarantee: "Read-after-write: a user always sees their own most recent write.",
    fix: "Route reads of data the user just modified to the leader (or to a replica known to be caught up to the user's write).",
    frames: [
      { leader: "—", followerA: "—", followerB: "—", note: "User opens the page. All replicas are empty." },
      { leader: "“nice post!”", followerA: "—", followerB: "—", note: "User POSTs a comment. The leader commits it instantly." },
      {
        leader: "“nice post!”",
        followerA: "—",
        followerB: "—",
        read: { from: "A", value: "(empty)", bad: true },
        note: "The follow-up read is routed to follower A — which hasn't applied the change yet. The user's own comment is missing.",
      },
      {
        leader: "“nice post!”",
        followerA: "“nice post!”",
        followerB: "“nice post!”",
        note: "Moments later the log catches up. The comment reappears — but the user already saw it disappear.",
      },
    ],
  },
  mono: {
    label: "Monotonic reads",
    title: "Time appears to run backward",
    blurb:
      "A user issues two reads in a row. The first hits a fresher replica, the second an older one — so newer data is replaced by older data.",
    guarantee: "Monotonic reads: once you've seen a value, you never see an older one.",
    fix: "Pin each user to one replica (e.g. hash of user ID), so their reads only ever move forward in the log.",
    frames: [
      {
        leader: "comment #1042",
        followerA: "comment #1042",
        followerB: "—",
        note: "The leader has comment #1042. Follower A has applied it; follower B lags behind.",
      },
      {
        leader: "comment #1042",
        followerA: "comment #1042",
        followerB: "—",
        read: { from: "A", value: "#1042 ✓", bad: false },
        note: "Read 1 → follower A. The user sees comment #1042.",
      },
      {
        leader: "comment #1042",
        followerA: "comment #1042",
        followerB: "—",
        read: { from: "B", value: "(empty)", bad: true },
        note: "Read 2 (a refresh) is load-balanced to follower B, which is still behind. The comment the user just saw is gone — time ran backward.",
      },
    ],
  },
  prefix: {
    label: "Consistent prefix",
    title: "The answer arrives before the question",
    blurb:
      "Causally related writes land on different partitions that replicate at different speeds, so an observer sees them out of order.",
    guarantee: "Consistent-prefix reads: writes are seen in the order they were committed.",
    fix: "Keep causally related writes in the same partition, or track causal ordering (e.g. version vectors).",
    frames: [
      {
        leader: "Q: “How far away?”",
        followerA: "—",
        followerB: "—",
        note: "Mr Poons asks a question (partition 1). Mrs Cake answers (partition 2). Question is committed first.",
      },
      {
        leader: "A: “About 10s”",
        followerA: "—",
        followerB: "—",
        note: "Mrs Cake's answer is committed next — causally after the question.",
      },
      {
        leader: "Q then A",
        followerA: "A: “About 10s”",
        followerB: "Q: “How far away?”",
        read: { from: "A", value: "answer first!", bad: true },
        note: "An observer's reads hit partition 2 (fast) before partition 1 (slow). They see the answer “About 10s” before the question it answers.",
      },
    ],
  },
};

export function LagAnomaliesDemo() {
  const [anomaly, setAnomaly] = useState<Anomaly>("ryw");
  const [step, setStep] = useState(0);
  const sc = SCENARIOS[anomaly];
  const frame = sc.frames[step];
  const atEnd = step >= sc.frames.length - 1;

  function pick(a: Anomaly) {
    setAnomaly(a);
    setStep(0);
  }

  const rows: { key: "leader" | "followerA" | "followerB"; label: string; tone: string }[] = [
    { key: "leader", label: "LEADER", tone: "var(--accent)" },
    { key: "followerA", label: "follower A", tone: "var(--color-info)" },
    { key: "followerB", label: "follower B", tone: "var(--color-info)" },
  ];

  return (
    <div className="space-y-5">
      <SegmentedControl
        value={anomaly}
        onChange={pick}
        options={[
          { label: "Read-your-writes", value: "ryw" },
          { label: "Monotonic reads", value: "mono" },
          { label: "Consistent prefix", value: "prefix" },
        ]}
      />

      <div>
        <h4 className="font-display text-lg font-bold">{sc.title}</h4>
        <p className="mt-1 font-body text-[15px] leading-relaxed text-fg-muted">{sc.blurb}</p>
      </div>

      {/* timeline of replica state */}
      <div className="space-y-2.5 rounded-lg border border-line bg-ink-950/50 p-4">
        {rows.map((row) => {
          const val = frame[row.key];
          const empty = val === "—" || val === "";
          const isReadTarget =
            frame.read && ((frame.read.from === "A" && row.key === "followerA") || (frame.read.from === "B" && row.key === "followerB"));
          return (
            <div key={row.key} className="flex items-center gap-3">
              <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wider" style={{ color: row.tone }}>
                {row.label}
              </span>
              <div
                className="relative flex h-10 flex-1 items-center rounded-md border px-3 font-mono text-[13px] transition-colors"
                style={{
                  borderColor: isReadTarget && frame.read?.bad ? "var(--color-fault)" : empty ? "var(--color-line)" : "var(--color-line-strong)",
                  background: empty
                    ? "var(--color-ink-900)"
                    : row.key === "leader"
                      ? "color-mix(in oklab, var(--accent) 12%, var(--color-ink-850))"
                      : "var(--color-ink-850)",
                  color: empty ? "var(--color-fg-faint)" : "var(--color-fg)",
                }}
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={val}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                  >
                    {val}
                  </motion.span>
                </AnimatePresence>
                {isReadTarget && (
                  <span
                    className="absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full whitespace-nowrap pl-3 font-mono text-[11px]"
                    style={{ color: frame.read?.bad ? "var(--color-fault)" : "var(--color-ok)" }}
                  >
                    ← read: {frame.read?.value}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* narration */}
      <div className="flex min-h-[3.5rem] items-start gap-3 rounded-lg border border-line bg-ink-900/50 px-4 py-3">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full accent-soft-bg font-mono text-[11px] accent-text">
          {step + 1}
        </span>
        <p className="font-body text-[15px] leading-relaxed text-fg">{frame.note}</p>
      </div>

      {/* step controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-lg border border-line bg-ink-850 p-1">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-md px-3 py-1.5 font-mono text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-30"
          >
            ‹ back
          </button>
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(sc.frames.length - 1, s + 1))}
            disabled={atEnd}
            className="rounded-md px-3 py-1.5 font-mono text-xs text-accent transition-colors hover:brightness-110 disabled:opacity-30"
          >
            step ›
          </button>
        </div>
        <span className="font-mono text-[11px] text-fg-faint">
          {step + 1} / {sc.frames.length}
        </span>
        {atEnd && (
          <span
            className="rounded-full border px-3 py-1 font-mono text-[11px]"
            style={{ borderColor: "var(--color-ok)", color: "var(--color-ok)" }}
          >
            fix: {sc.fix}
          </span>
        )}
      </div>
    </div>
  );
}
