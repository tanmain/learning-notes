"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Stat } from "@/components/chapter";

/**
 * Quorum / majority-vote demo for "Knowledge, Truth & Lies".
 *
 * Five nodes each hold an opinion about whether the leader is alive. A single
 * node can't trust its own judgement — so the cluster decides by majority.
 * Click nodes to flip their vote (declare leader DEAD vs ALIVE). The verdict
 * is whatever > n/2 nodes agree on. This shows why a node on the minority side
 * of a partition must step down: it has lost the quorum, and the truth is
 * defined by the majority, not by any one node's local view.
 */

type Vote = "alive" | "dead";
const N = 5;
const MAJORITY = Math.floor(N / 2) + 1; // 3

const POS = [
  { x: 200, y: 40 },
  { x: 330, y: 110 },
  { x: 280, y: 230 },
  { x: 120, y: 230 },
  { x: 70, y: 110 },
];

export function QuorumDemo() {
  const [votes, setVotes] = useState<Vote[]>(["alive", "alive", "alive", "dead", "dead"]);

  const flip = (i: number) =>
    setVotes((v) => v.map((x, j) => (j === i ? (x === "alive" ? "dead" : "alive") : x)));

  const deadCount = votes.filter((v) => v === "dead").length;
  const aliveCount = N - deadCount;
  const verdict: Vote | "split" =
    deadCount >= MAJORITY ? "dead" : aliveCount >= MAJORITY ? "alive" : "split";

  const tone = verdict === "dead" ? "var(--color-fault)" : verdict === "alive" ? "var(--color-ok)" : "var(--color-warn)";

  return (
    <div className="space-y-5">
      <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto]">
        <div className="overflow-hidden rounded-lg border border-line bg-ink-950/60 p-4">
          <svg viewBox="0 0 400 280" className="w-full">
            {/* edges */}
            {POS.map((a, i) =>
              POS.slice(i + 1).map((b, k) => (
                <line
                  key={`${i}-${k}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--color-line)"
                  strokeWidth={1}
                />
              ))
            )}

            {/* central verdict ring */}
            <circle cx={200} cy={140} r={46} fill="none" stroke={tone} strokeWidth={1.4} strokeDasharray="3 5" opacity={0.6} />
            <text x={200} y={134} textAnchor="middle" className="font-mono" fontSize={9} fill={tone}>
              VERDICT
            </text>
            <text x={200} y={150} textAnchor="middle" className="font-display" fontSize={13} fill={tone} fontWeight={700}>
              {verdict === "split" ? "NO QUORUM" : verdict === "dead" ? "DEAD" : "ALIVE"}
            </text>

            {/* nodes */}
            {POS.map((p, i) => {
              const v = votes[i];
              const c = v === "dead" ? "var(--color-fault)" : "var(--color-ok)";
              return (
                <g key={i} style={{ cursor: "pointer" }} onClick={() => flip(i)}>
                  <motion.circle
                    cx={p.x}
                    cy={p.y}
                    r={22}
                    fill="var(--color-ink-800)"
                    stroke={c}
                    strokeWidth={2}
                    whileHover={{ scale: 1.08 }}
                  />
                  <text x={p.x} y={p.y - 1} textAnchor="middle" className="font-mono" fontSize={8} fill={c}>
                    N{i + 1}
                  </text>
                  <text x={p.x} y={p.y + 10} textAnchor="middle" className="font-mono" fontSize={6.5} fill="var(--color-fg-faint)">
                    {v === "dead" ? "✗ dead" : "✓ alive"}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="mt-1 text-center font-mono text-[10px] text-fg-faint">click any node to flip its vote</p>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:grid-cols-1">
          <Stat label="Votes: alive" value={aliveCount} tone="ok" />
          <Stat label="Votes: dead" value={deadCount} tone="fault" />
          <Stat label="Majority needs" value={`${MAJORITY} / ${N}`} tone="accent" />
        </div>
      </div>

      <p className="rounded-lg border border-line bg-ink-900/40 p-3 text-sm leading-relaxed text-fg-muted">
        {verdict === "split" ? (
          <>
            <strong className="text-warn">Deadlocked.</strong> No side has {MAJORITY} votes, so the cluster
            refuses to act — better paralysis than a wrong decision made by a minority that can&apos;t see the
            whole picture.
          </>
        ) : (
          <>
            The majority says the leader is <strong style={{ color: tone }}>{verdict}</strong>. Any node on the
            losing side — even one that&apos;s perfectly healthy but partitioned away — must accept the verdict and
            stand down. <em>Truth in a distributed system is defined by the quorum, not by any single node.</em>
          </>
        )}
      </p>
    </div>
  );
}
