"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * Animated hero — "Agreeing on a single truth, despite the chaos."
 *
 * Five replica nodes orbit a central register. Each node holds its own
 * locally-proposed value, but a consensus round periodically commits ONE
 * value to the center and bumps the committed term/index. A travelling pulse
 * runs along the agreed-upon edges to show replication of the decided value.
 */

type Node = {
  id: string;
  angle: number; // degrees
  proposes: string;
};

const RADIUS = 118;
const CX = 200;
const CY = 150;

const NODES: Node[] = [
  { id: "A", angle: -90, proposes: "x=7" },
  { id: "B", angle: -18, proposes: "x=4" },
  { id: "C", angle: 54, proposes: "x=7" },
  { id: "D", angle: 126, proposes: "x=9" },
  { id: "E", angle: 198, proposes: "x=7" },
];

function pos(angle: number, r: number = RADIUS): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

// A deterministic sequence of consensus outcomes the hero cycles through.
const ROUNDS: { value: string; leader: number }[] = [
  { value: "x = 7", leader: 0 },
  { value: "x = 4", leader: 1 },
  { value: "x = 9", leader: 3 },
  { value: "x = 7", leader: 2 },
];

export function Hero() {
  const [round, setRound] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setRound((r) => (r + 1) % ROUNDS.length), 3200);
    return () => clearInterval(t);
  }, []);

  const current = ROUNDS[round];
  const leaderNode = NODES[current.leader];
  const term = round + 1;
  const index = round + 4;

  return (
    <div className="panel relative overflow-hidden">
      <div className="bg-dotgrid pointer-events-none absolute inset-0 opacity-40" />
      {/* sweep shimmer */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 opacity-[0.07]"
        style={{
          background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
          animation: "sweep 7s ease-in-out infinite",
        }}
      />

      <div className="relative grid items-center gap-4 p-5 sm:grid-cols-[1.15fr_0.85fr] sm:p-6">
        {/* ---- Diagram ---- */}
        <svg viewBox="0 0 400 300" className="w-full" role="img" aria-label="Consensus diagram: replica nodes agreeing on a single committed value">
          <defs>
            <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* edges from each node to the core */}
          {NODES.map((n) => {
            const p = pos(n.angle);
            const isLeader = n.id === leaderNode.id;
            return (
              <line
                key={`edge-${n.id}`}
                x1={p.x}
                y1={p.y}
                x2={CX}
                y2={CY}
                stroke={isLeader ? "var(--accent)" : "var(--color-line-strong)"}
                strokeWidth={isLeader ? 1.8 : 1}
                strokeDasharray={isLeader ? undefined : "3 6"}
                opacity={isLeader ? 0.9 : 0.45}
              />
            );
          })}

          {/* replication pulse travelling leader -> core each round */}
          <motion.circle
            key={`pulse-${round}`}
            r={4}
            fill="var(--accent)"
            initial={{ cx: pos(leaderNode.angle).x, cy: pos(leaderNode.angle).y, opacity: 0 }}
            animate={{ cx: CX, cy: CY, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          />

          {/* core glow */}
          <circle cx={CX} cy={CY} r={54} fill="url(#coreGlow)" />
          {/* expanding commit ring */}
          <motion.circle
            key={`ring-${round}`}
            cx={CX}
            cy={CY}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.5}
            initial={{ r: 30, opacity: 0.7 }}
            animate={{ r: 70, opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeOut" }}
          />

          {/* core register */}
          <circle cx={CX} cy={CY} r={34} fill="var(--color-ink-950)" stroke="var(--accent)" strokeWidth={1.75} />
          <text x={CX} y={CY - 4} textAnchor="middle" className="fill-[var(--color-fg)] font-mono" style={{ fontSize: 15, fontWeight: 700 }}>
            {current.value}
          </text>
          <text x={CX} y={CY + 12} textAnchor="middle" className="fill-[var(--color-fg-faint)] font-mono" style={{ fontSize: 8, letterSpacing: "0.12em" }}>
            COMMITTED
          </text>

          {/* nodes */}
          {NODES.map((n) => {
            const p = pos(n.angle);
            const isLeader = n.id === leaderNode.id;
            return (
              <g key={`node-${n.id}`}>
                <motion.circle
                  cx={p.x}
                  cy={p.y}
                  r={18}
                  fill="var(--color-ink-850)"
                  stroke={isLeader ? "var(--accent)" : "var(--color-line-strong)"}
                  strokeWidth={isLeader ? 2 : 1.2}
                  animate={{ scale: isLeader ? [1, 1.12, 1] : 1 }}
                  transition={{ duration: 1.4, ease: "easeInOut" }}
                  style={{ transformOrigin: `${p.x}px ${p.y}px` }}
                />
                <text x={p.x} y={p.y - 1} textAnchor="middle" className="fill-[var(--color-fg)] font-mono" style={{ fontSize: 11, fontWeight: 700 }}>
                  {n.id}
                </text>
                <text x={p.x} y={p.y + 10} textAnchor="middle" className="fill-[var(--color-fg-faint)] font-mono" style={{ fontSize: 7 }}>
                  {n.proposes}
                </text>
                {isLeader && (
                  <text x={p.x} y={p.y - 26} textAnchor="middle" className="fill-[var(--accent)] font-mono" style={{ fontSize: 7, letterSpacing: "0.12em" }}>
                    LEADER
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* ---- Caption / live status ---- */}
        <div className="space-y-4">
          <div className="kicker">One copy of the truth</div>
          <p className="font-body text-[15px] italic leading-relaxed text-fg-muted">
            Five replicas, five opinions. A consensus round elects a leader, replicates its proposal to a
            quorum, and commits a single value — so the whole system behaves as if there were just{" "}
            <span className="accent-text not-italic">one register</span>.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-line bg-ink-900/60 px-3 py-2">
              <div className="font-mono text-[9px] uppercase tracking-wider text-fg-faint">Term</div>
              <div className="font-mono text-lg font-semibold tabular-nums accent-text">{term}</div>
            </div>
            <div className="rounded-lg border border-line bg-ink-900/60 px-3 py-2">
              <div className="font-mono text-[9px] uppercase tracking-wider text-fg-faint">Index</div>
              <div className="font-mono text-lg font-semibold tabular-nums text-fg">{index}</div>
            </div>
            <div className="rounded-lg border border-line bg-ink-900/60 px-3 py-2">
              <div className="font-mono text-[9px] uppercase tracking-wider text-fg-faint">Leader</div>
              <div className="font-mono text-lg font-semibold tabular-nums text-fg">{leaderNode.id}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
