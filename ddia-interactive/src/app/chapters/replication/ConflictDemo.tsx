"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SegmentedControl, Button } from "@/components/chapter";

/* ----------------------------------------------------------------------------
   Multi-leader write-conflict resolution.

   Two datacenters each have a leader. A user edits the same field (the page
   title) on both, concurrently, before replication catches up. Each leader
   accepts its local write immediately. When the writes cross the link, both
   leaders must converge to ONE value. We show three convergent strategies.
---------------------------------------------------------------------------- */

type Strategy = "lww" | "id" | "merge";

const WRITE_DC1 = { value: "B/H Frosting", ts: 1003, id: "dc-1" };
const WRITE_DC2 = { value: "B & H Frosting", ts: 1001, id: "dc-2" };

function resolve(strategy: Strategy): { winner: string; explain: string } {
  switch (strategy) {
    case "lww":
      // highest timestamp wins; DC1 has the later ts → its value survives
      return {
        winner: WRITE_DC1.value,
        explain: `Last-write-wins: the write with the higher timestamp (${WRITE_DC1.ts} > ${WRITE_DC2.ts}) is kept. DC-2's edit is silently discarded — data loss.`,
      };
    case "id":
      // higher replica id wins (dc-2 > dc-1 lexically)
      return {
        winner: WRITE_DC2.value,
        explain: "Higher-replica-ID-wins: writes from the higher-numbered replica (dc-2) always take precedence. Deterministic, but still throws away the loser — data loss.",
      };
    case "merge":
      return {
        winner: `${WRITE_DC2.value}  |  ${WRITE_DC1.value}`,
        explain: "Merge / keep siblings: both concurrent values are preserved and surfaced to the application (Riak siblings, CouchDB conflicts) to resolve later — no data is silently dropped.",
      };
  }
}

export function ConflictDemo() {
  const [strategy, setStrategy] = useState<Strategy>("lww");
  const [phase, setPhase] = useState<0 | 1 | 2>(0); // 0 local, 1 conflict, 2 resolved
  const res = resolve(strategy);

  const dc1Value = phase === 0 ? WRITE_DC1.value : phase === 1 ? WRITE_DC1.value : res.winner;
  const dc2Value = phase === 0 ? WRITE_DC2.value : phase === 1 ? WRITE_DC2.value : res.winner;
  const converged = phase === 2;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={strategy}
          onChange={(v) => {
            setStrategy(v);
            setPhase(0);
          }}
          options={[
            { label: "Last-write-wins", value: "lww" },
            { label: "Replica-ID wins", value: "id" },
            { label: "Merge (siblings)", value: "merge" },
          ]}
        />
        <span
          className="rounded-full border px-3 py-1 font-mono text-[11px]"
          style={{
            borderColor: converged ? "var(--color-ok)" : "var(--color-warn)",
            color: converged ? "var(--color-ok)" : "var(--color-warn)",
          }}
        >
          {phase === 0 ? "local writes" : phase === 1 ? "conflict in flight" : "converged"}
        </span>
      </div>

      <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <DC name="Datacenter 1" sub="leader · ts 1003" value={dc1Value} converged={converged} />
        <div className="flex items-center justify-center">
          <svg viewBox="0 0 60 80" className="h-20 w-14" aria-hidden>
            <line x1={6} y1={40} x2={54} y2={40} stroke="var(--color-line-strong)" strokeWidth={1.5} strokeDasharray="4 5" />
            <AnimatePresence>
              {phase >= 1 && (
                <>
                  <motion.circle
                    key="p-right"
                    r={4}
                    fill="var(--accent)"
                    initial={{ cx: 8, cy: 40, opacity: 0 }}
                    animate={{ cx: 52, opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
                  />
                  <motion.circle
                    key="p-left"
                    r={4}
                    fill="var(--color-info)"
                    initial={{ cx: 52, cy: 40, opacity: 0 }}
                    animate={{ cx: 8, opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: 0.4 }}
                  />
                </>
              )}
            </AnimatePresence>
            <text x={30} y={64} textAnchor="middle" className="font-mono" fontSize={7} fill="var(--color-fg-faint)">
              async
            </text>
          </svg>
        </div>
        <DC name="Datacenter 2" sub="leader · ts 1001" value={dc2Value} converged={converged} />
      </div>

      <AnimatePresence mode="wait">
        {phase === 2 && (
          <motion.div
            key={strategy}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border px-4 py-3"
            style={{
              borderColor: strategy === "merge" ? "var(--color-ok)" : "var(--color-fault)",
              background:
                strategy === "merge"
                  ? "color-mix(in oklab, var(--color-ok) 9%, var(--color-ink-900))"
                  : "color-mix(in oklab, var(--color-fault) 10%, var(--color-ink-900))",
            }}
          >
            <div
              className="font-mono text-[10px] uppercase tracking-wider"
              style={{ color: strategy === "merge" ? "var(--color-ok)" : "var(--color-fault)" }}
            >
              {strategy === "merge" ? "No data lost" : "Convergent — but lossy"}
            </div>
            <p className="mt-1 font-body text-[14px] leading-relaxed text-fg-muted">{res.explain}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap gap-2">
        {phase < 2 ? (
          <Button onClick={() => setPhase((p) => (p === 0 ? 1 : 2) as 0 | 1 | 2)}>
            {phase === 0 ? "Replicate across the link →" : "Resolve the conflict →"}
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setPhase(0)}>
            Replay
          </Button>
        )}
      </div>
    </div>
  );
}

function DC({ name, sub, value, converged }: { name: string; sub: string; value: string; converged: boolean }) {
  return (
    <div
      className="rounded-lg border p-4 transition-colors"
      style={{
        borderColor: converged ? "var(--color-ok)" : "var(--color-line-strong)",
        background: "var(--color-ink-850)",
      }}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">{name}</span>
        <span className="font-mono text-[10px] text-fg-faint">{sub}</span>
      </div>
      <div className="mt-3 rounded-md border border-line bg-ink-950/60 px-3 py-2.5">
        <div className="font-mono text-[9px] uppercase tracking-wider text-fg-faint">title =</div>
        <AnimatePresence mode="wait">
          <motion.div
            key={value}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-0.5 break-words font-mono text-[13px] font-semibold"
            style={{ color: converged ? "var(--color-ok)" : "var(--color-fg)" }}
          >
            {value}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
