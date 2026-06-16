"use client";

import { useMemo, useReducer } from "react";
import { motion } from "framer-motion";
import { Button, Slider, Stat } from "@/components/chapter";

/* ----------------------------------------------------------------------------
   Leaderless (Dynamo-style) quorum visualizer.

   There are n replicas. A write goes to all n in parallel and succeeds once w
   nodes ack. A read queries all n and succeeds once r nodes respond; the client
   keeps the value with the highest version number. The durability guarantee
   "you read the latest write" holds iff w + r > n, because then the write set
   and the read set MUST overlap on at least one node carrying the fresh value.

   We pick a concrete write-set (the w fastest acks) and read-set (the r fastest
   responders) and show whether they intersect on a fresh node.
---------------------------------------------------------------------------- */

type State = {
  n: number;
  w: number;
  r: number;
  /** indices [0..n) that acked the latest write (carry the fresh value) */
  written: number[];
  /** indices [0..n) that the read contacted */
  readSet: number[];
  seed: number;
};

type Action =
  | { type: "SET_N"; n: number }
  | { type: "SET_W"; w: number }
  | { type: "SET_R"; r: number }
  | { type: "RESHUFFLE" };

function sample(n: number, k: number, seed: number): number[] {
  // deterministic-ish pick of k distinct indices from [0..n), perturbed by seed
  const idx = Array.from({ length: n }, (_, i) => i);
  // Fisher-Yates with a tiny LCG so RESHUFFLE changes the picture
  let s = seed * 9301 + 49297;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, k).sort((a, b) => a - b);
}

function recompute(n: number, w: number, r: number, seed: number): Pick<State, "written" | "readSet"> {
  return {
    written: sample(n, Math.min(w, n), seed),
    readSet: sample(n, Math.min(r, n), seed + 7),
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function reducer(state: State, action: Action): State {
  let { n, w, r, seed } = state;
  switch (action.type) {
    case "SET_N":
      n = action.n;
      w = clamp(w, 1, n);
      r = clamp(r, 1, n);
      break;
    case "SET_W":
      w = clamp(action.w, 1, n);
      break;
    case "SET_R":
      r = clamp(action.r, 1, n);
      break;
    case "RESHUFFLE":
      seed = state.seed + 1;
      break;
  }
  return { n, w, r, seed, ...recompute(n, w, r, seed) };
}

function init(): State {
  const n = 5,
    w = 3,
    r = 3,
    seed = 1;
  return { n, w, r, seed, ...recompute(n, w, r, seed) };
}

export function QuorumDemo() {
  const [s, dispatch] = useReducer(reducer, undefined, init);

  const writtenSet = useMemo(() => new Set(s.written), [s.written]);
  const readSetS = useMemo(() => new Set(s.readSet), [s.readSet]);
  const overlap = useMemo(() => s.written.filter((i) => readSetS.has(i)), [s.written, readSetS]);

  const guaranteed = s.w + s.r > s.n; // the theorem
  const gotFresh = overlap.length > 0; // this particular sample
  const sum = s.w + s.r;

  // layout nodes on a circle
  const cx = 150,
    cy = 130,
    radius = 95;
  const nodes = Array.from({ length: s.n }, (_, i) => {
    const ang = (i / s.n) * Math.PI * 2 - Math.PI / 2;
    return { i, x: cx + Math.cos(ang) * radius, y: cy + Math.sin(ang) * radius };
  });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Slider label="n · replicas" value={s.n} min={3} max={7} step={1} onChange={(v) => dispatch({ type: "SET_N", n: v })} />
        <Slider label="w · write quorum" value={s.w} min={1} max={s.n} step={1} onChange={(v) => dispatch({ type: "SET_W", w: v })} />
        <Slider label="r · read quorum" value={s.r} min={1} max={s.n} step={1} onChange={(v) => dispatch({ type: "SET_R", r: v })} />
      </div>

      <div className="grid items-center gap-4 sm:grid-cols-[300px_1fr]">
        <div className="rounded-lg border border-line bg-ink-950/50 p-2">
          <svg viewBox="0 0 300 260" className="w-full" role="img" aria-label="Quorum overlap of write set and read set">
            {/* legend dot guides drawn behind */}
            {nodes.map((node) => {
              const inW = writtenSet.has(node.i);
              const inR = readSetS.has(node.i);
              const both = inW && inR;
              // base fill conveys staleness: written nodes hold the fresh value
              const fill = inW ? "color-mix(in oklab, var(--accent) 26%, var(--color-ink-800))" : "var(--color-ink-800)";
              const stroke = both ? "var(--color-ok)" : inR ? "var(--color-info)" : inW ? "var(--accent)" : "var(--color-line-strong)";
              return (
                <g key={node.i}>
                  {/* read-set ring (outer, blue) */}
                  {inR && (
                    <circle cx={node.x} cy={node.y} r={24} fill="none" stroke="var(--color-info)" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.85} />
                  )}
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={18}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={both ? 2.5 : 1.75}
                    initial={false}
                    animate={both ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                    transition={{ duration: 0.6 }}
                    style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                  />
                  <text x={node.x} y={node.y - 1} textAnchor="middle" className="font-mono font-semibold" fontSize={8} fill="var(--color-fg)">
                    N{node.i + 1}
                  </text>
                  <text x={node.x} y={node.y + 8} textAnchor="middle" className="font-mono" fontSize={6} fill={inW ? "var(--accent)" : "var(--color-fg-faint)"}>
                    {inW ? "v2" : "v1"}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-2 pb-1 font-mono text-[10px] text-fg-faint">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} /> wrote (v2)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full border" style={{ borderColor: "var(--color-info)" }} /> read query
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--color-ok)" }} /> overlap
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="w + r" value={sum} tone={guaranteed ? "ok" : "fault"} />
            <Stat label="vs n" value={`> ${s.n}?`} tone={guaranteed ? "ok" : "fault"} />
          </div>

          <div
            className="rounded-lg border px-4 py-4"
            style={{
              borderColor: guaranteed ? "var(--color-ok)" : "var(--color-fault)",
              background: guaranteed
                ? "color-mix(in oklab, var(--color-ok) 9%, var(--color-ink-900))"
                : "color-mix(in oklab, var(--color-fault) 10%, var(--color-ink-900))",
            }}
          >
            <div className="font-mono text-xs font-semibold uppercase tracking-wider" style={{ color: guaranteed ? "var(--color-ok)" : "var(--color-fault)" }}>
              {guaranteed ? `w + r = ${sum} > ${s.n} — overlap guaranteed` : `w + r = ${sum} ≤ ${s.n} — no overlap guarantee`}
            </div>
            <p className="mt-1.5 font-body text-[14px] leading-relaxed text-fg-muted">
              {guaranteed ? (
                <>
                  Any read set of {s.r} nodes must share at least one node with any write set of {s.w}. The read is
                  guaranteed to see the latest version. This sample overlaps on{" "}
                  <span className="accent-text">{overlap.map((i) => `N${i + 1}`).join(", ")}</span>.
                </>
              ) : (
                <>
                  The {s.r}-node read set can entirely miss the {s.w} nodes that hold the new value, so the read may
                  return a stale <code className="rounded bg-ink-800 px-1 py-0.5">v1</code>.{" "}
                  {gotFresh ? (
                    <span className="text-warn">This sample happened to overlap — but you can&apos;t rely on luck.</span>
                  ) : (
                    <span className="text-fault">This sample missed entirely: the read sees only stale v1.</span>
                  )}
                </>
              )}
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={() => dispatch({ type: "RESHUFFLE" })}>
            Re-roll which nodes responded
          </Button>
        </div>
      </div>
    </div>
  );
}
