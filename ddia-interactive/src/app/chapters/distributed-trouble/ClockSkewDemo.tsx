"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Slider, Button, Stat } from "@/components/chapter";
import { IconReset } from "@/components/icons";

/**
 * Clock skew + Last-Write-Wins data loss.
 *
 * Two nodes (A and B) replicate the same key with LWW conflict resolution:
 * the write carrying the higher wall-clock TIMESTAMP wins. Node B's clock is
 * skewed (you control the offset). You write on A, then write on B; the demo
 * shows real (true) time advancing left-to-right while each node stamps its
 * write with ITS OWN clock. When B is behind, a write that truly happened
 * *later* can carry a *smaller* timestamp and be silently discarded — the
 * classic LWW data-loss bug in Cassandra/Riak-style stores.
 */

type Write = {
  node: "A" | "B";
  value: string;
  trueT: number; // real wall-clock order (ms since demo start)
  stampedT: number; // timestamp the node attached (its own skewed clock)
};

const VALUES_A = ["cart=[milk]", "x=1", "name=Ada", "balance=100"];
const VALUES_B = ["cart=[milk,eggs]", "x=2", "name=Ada Lovelace", "balance=120"];

export function ClockSkewDemo() {
  const [skewB, setSkewB] = useState(-250); // node B clock offset (ms), default behind
  const [writes, setWrites] = useState<Write[]>([]);
  const [clock, setClock] = useState(0); // true-time cursor in ms

  function write(node: "A" | "B") {
    // Each click advances true time by a small step.
    const trueT = clock + 120 + Math.round(Math.random() * 60);
    setClock(trueT);
    const offset = node === "B" ? skewB : 0;
    const idx = writes.filter((w) => w.node === node).length % VALUES_A.length;
    const value = node === "A" ? VALUES_A[idx] : VALUES_B[idx];
    setWrites((w) => [...w, { node, value, trueT, stampedT: trueT + offset }]);
  }

  function reset() {
    setWrites([]);
    setClock(0);
  }

  // LWW winner = highest STAMPED timestamp (ties broken by node id, as Cassandra does).
  const winner =
    writes.length > 0
      ? writes.reduce((best, w) =>
          w.stampedT > best.stampedT || (w.stampedT === best.stampedT && w.node > best.node) ? w : best
        )
      : null;
  // What SHOULD have won if we honoured true causal order.
  const trueLatest =
    writes.length > 0 ? writes.reduce((best, w) => (w.trueT > best.trueT ? w : best)) : null;

  const dataLoss = winner && trueLatest && winner !== trueLatest;

  // Layout: map timestamps onto an x-axis.
  const allStamps = writes.flatMap((w) => [w.stampedT, w.trueT]);
  const minT = allStamps.length ? Math.min(0, ...allStamps) : 0;
  const maxT = allStamps.length ? Math.max(...allStamps, 600) : 600;
  const span = maxT - minT || 1;
  const X = (t: number) => 40 + ((t - minT) / span) * 420;

  return (
    <div className="space-y-5">
      <Slider
        label="Node B clock offset vs true time"
        value={skewB}
        min={-500}
        max={500}
        step={25}
        onChange={setSkewB}
        format={(v) => (v === 0 ? "in sync" : v > 0 ? `+${v} ms ahead` : `${v} ms behind`)}
      />

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => write("A")} variant="outline" size="sm">
          Write on Node A
        </Button>
        <Button onClick={() => write("B")} variant="outline" size="sm">
          Write on Node B (skewed)
        </Button>
        <Button onClick={reset} variant="ghost" size="sm">
          <IconReset size={13} /> Reset
        </Button>
      </div>

      <p className="font-mono text-[11px] leading-relaxed text-fg-faint">
        To reproduce the bug: keep B&apos;s clock behind, then <strong className="text-fg-muted">write on A first, then write on B</strong>.
        B&apos;s newer write gets an older timestamp and loses.
      </p>

      {/* Timeline */}
      <div className="overflow-hidden rounded-lg border border-line bg-ink-950/60 p-4">
        <svg viewBox="0 0 480 200" className="w-full">
          {/* True-time axis */}
          <line x1={30} y1={170} x2={470} y2={170} stroke="var(--color-line-strong)" strokeWidth={1.5} />
          <text x={30} y={188} className="font-mono" fontSize={8} fill="var(--color-fg-faint)">
            true time →
          </text>
          <text x={470} y={188} textAnchor="end" className="font-mono" fontSize={8} fill="var(--accent)">
            (what really happened)
          </text>

          {/* Lanes */}
          <text x={30} y={40} className="font-mono" fontSize={8} fill="var(--color-info)">
            NODE A · clock OK
          </text>
          <text x={30} y={100} className="font-mono" fontSize={8} fill="var(--color-warn)">
            NODE B · skewed clock
          </text>
          <line x1={30} y1={48} x2={470} y2={48} stroke="var(--color-line)" strokeWidth={1} strokeDasharray="3 5" />
          <line x1={30} y1={108} x2={470} y2={108} stroke="var(--color-line)" strokeWidth={1} strokeDasharray="3 5" />

          {writes.map((w, i) => {
            const lane = w.node === "A" ? 48 : 108;
            const tone = w.node === "A" ? "var(--color-info)" : "var(--color-warn)";
            const isWinner = winner === w;
            const isTrueLatest = trueLatest === w;
            return (
              <g key={i}>
                {/* connector: stamped position (on lane) down to true-time tick */}
                <line
                  x1={X(w.stampedT)}
                  y1={lane}
                  x2={X(w.trueT)}
                  y2={170}
                  stroke={tone}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  opacity={0.5}
                />
                {/* true-time tick */}
                <circle cx={X(w.trueT)} cy={170} r={3} fill={tone} />
                {/* stamped marker */}
                <motion.circle
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  cx={X(w.stampedT)}
                  cy={lane}
                  r={isWinner ? 9 : 6}
                  fill={tone}
                  stroke={isWinner ? "var(--color-ok)" : "transparent"}
                  strokeWidth={2.5}
                />
                <text
                  x={X(w.stampedT)}
                  y={lane - 12}
                  textAnchor="middle"
                  className="font-mono"
                  fontSize={7.5}
                  fill="var(--color-fg-muted)"
                >
                  ts={Math.round(w.stampedT)}
                </text>
                {isTrueLatest && !isWinner && (
                  <text
                    x={X(w.trueT)}
                    y={158}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={7}
                    fill="var(--color-fault)"
                  >
                    newest, but lost!
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Outcome */}
      <AnimatePresence mode="wait">
        {winner && trueLatest && (
          <motion.div
            key={`${writes.length}-${dataLoss}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2"
          >
            <div className="bg-ink-900 p-4">
              <div className="kicker mb-1.5">LWW keeps (highest timestamp)</div>
              <div className="font-mono text-sm font-semibold text-ok">
                {winner.value}
              </div>
              <div className="mt-1 font-mono text-[10px] text-fg-faint">
                from Node {winner.node} · ts={Math.round(winner.stampedT)}
              </div>
            </div>
            <div className="bg-ink-900 p-4">
              <div className="kicker mb-1.5">Truly latest write</div>
              <div
                className="font-mono text-sm font-semibold"
                style={{ color: dataLoss ? "var(--color-fault)" : "var(--color-ok)" }}
              >
                {trueLatest.value}
              </div>
              <div className="mt-1 font-mono text-[10px] text-fg-faint">
                from Node {trueLatest.node} · happened last in real time
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Writes" value={writes.length} />
        <Stat label="B clock error" value={skewB === 0 ? "0" : `${skewB > 0 ? "+" : ""}${skewB}`} unit="ms" tone={skewB === 0 ? "ok" : "warn"} />
        <Stat
          label="Silent data loss"
          value={dataLoss ? "YES" : writes.length ? "no" : "—"}
          tone={dataLoss ? "fault" : "ok"}
        />
      </div>

      {dataLoss && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg border-l-2 border-fault bg-fault/10 p-3 text-sm leading-relaxed text-fg"
        >
          <strong className="text-fault">Data lost.</strong> The write that happened last in real time
          carried a smaller timestamp because Node B&apos;s clock disagreed. LWW threw it away and{" "}
          <em>no error was raised</em> — exactly the subtle corruption Kleppmann warns about.
        </motion.p>
      )}
    </div>
  );
}
