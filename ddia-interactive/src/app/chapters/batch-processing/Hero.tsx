"use client";

import { motion } from "framer-motion";

/**
 * Animated hero: the batch-processing pipeline as a control-room schematic.
 * Immutable input -> map -> shuffle/sort -> reduce -> immutable output.
 * Data "records" flow left-to-right along the dataflow; the input and output
 * are framed as read-only (lock glyph) to foreground the chapter's core idea:
 * inputs are immutable, jobs are pure functions, so failed tasks re-run safely.
 */

type Stage = {
  x: number;
  label: string;
  sub: string;
  tone: string;
};

const STAGES: Stage[] = [
  { x: 60, label: "INPUT", sub: "immutable", tone: "var(--color-info)" },
  { x: 170, label: "map()", sub: "extract k,v", tone: "var(--accent)" },
  { x: 290, label: "shuffle", sub: "sort by key", tone: "var(--accent-2)" },
  { x: 410, label: "reduce()", sub: "aggregate", tone: "var(--accent)" },
  { x: 520, label: "OUTPUT", sub: "immutable", tone: "var(--color-ok)" },
];

const PARTICLES = [0, 1, 2, 3, 4, 5];

export function Hero() {
  return (
    <div className="panel relative overflow-hidden">
      <div className="bg-dotgrid absolute inset-0 opacity-40" />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full opacity-20 blur-[80px]"
        style={{ background: "var(--accent)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full opacity-20 blur-[80px]"
        style={{ background: "var(--accent-2)" }}
      />

      <div className="relative px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="kicker">Dataflow · bounded input</span>
          <span className="font-mono text-[10px] text-fg-faint">job: word-count · status RUNNING</span>
        </div>

        <svg viewBox="0 0 580 220" className="w-full" role="img" aria-label="MapReduce dataflow pipeline">
          {/* connecting rail */}
          <line
            x1={60}
            y1={110}
            x2={520}
            y2={110}
            stroke="var(--color-line-strong)"
            strokeWidth={2}
          />
          {/* animated dashed flow on top of the rail */}
          <line
            x1={60}
            y1={110}
            x2={520}
            y2={110}
            stroke="var(--accent)"
            strokeWidth={2}
            strokeOpacity={0.55}
            className="flow-line"
            style={{ strokeDasharray: "5 9" } as React.CSSProperties}
          />

          {/* flowing data records */}
          {PARTICLES.map((i) => (
            <motion.circle
              key={i}
              r={4}
              cy={110}
              fill="var(--accent)"
              initial={{ cx: 60, opacity: 0 }}
              animate={{ cx: [60, 520], opacity: [0, 1, 1, 0] }}
              transition={{
                duration: 3.4,
                ease: "linear",
                repeat: Infinity,
                delay: i * 0.55,
              }}
            />
          ))}

          {/* stage nodes */}
          {STAGES.map((s, i) => {
            const isIO = i === 0 || i === STAGES.length - 1;
            return (
              <g key={s.label}>
                <motion.g
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 * i, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                >
                  {isIO ? (
                    <rect
                      x={s.x - 30}
                      y={84}
                      width={60}
                      height={52}
                      rx={6}
                      fill="var(--color-ink-900)"
                      stroke={s.tone}
                      strokeWidth={1.5}
                    />
                  ) : (
                    <circle
                      cx={s.x}
                      cy={110}
                      r={28}
                      fill="var(--color-ink-900)"
                      stroke={s.tone}
                      strokeWidth={1.5}
                    />
                  )}

                  {/* pulsing ring on the compute stages */}
                  {!isIO && (
                    <motion.circle
                      cx={s.x}
                      cy={110}
                      r={28}
                      fill="none"
                      stroke={s.tone}
                      strokeWidth={1.5}
                      initial={{ scale: 1, opacity: 0.5 }}
                      animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                      transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.4 }}
                      style={{ transformOrigin: `${s.x}px 110px` }}
                    />
                  )}

                  <text
                    x={s.x}
                    y={isIO ? 106 : 107}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={isIO ? 9 : 10}
                    fontWeight={700}
                    fill={s.tone}
                  >
                    {s.label}
                  </text>
                  <text
                    x={s.x}
                    y={isIO ? 120 : 120}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={7}
                    fill="var(--color-fg-faint)"
                  >
                    {s.sub}
                  </text>
                </motion.g>

                {/* lock glyph above the immutable I/O boxes */}
                {isIO && (
                  <g transform={`translate(${s.x - 5}, 64)`} stroke={s.tone} strokeWidth={1.2} fill="none">
                    <rect x={0} y={5} width={10} height={8} rx={1.5} />
                    <path d="M2 5 V3.5 A3 3 0 0 1 8 3.5 V5" />
                  </g>
                )}
              </g>
            );
          })}

          {/* caption strip */}
          <text x={290} y={185} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-fg-muted)">
            read whole input · pure functions · write whole output
          </text>
          <text x={290} y={202} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">
            a crashed task just re-runs — inputs never change underneath it
          </text>
        </svg>
      </div>
    </div>
  );
}
