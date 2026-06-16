"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * Animated hero for "The Future of Data Systems".
 *
 * Visualizes the central idea of the chapter: a single immutable, totally-ordered
 * event log (the source of truth) at the centre, fanning out to several
 * asynchronously-maintained DERIVED views (search index, cache, aggregate,
 * analytics). Events are minted on the left, appended to the log, then flow
 * down deterministic derivation functions into each view. This is "unbundling
 * the database" and "dataflow" in one picture.
 */

type Sink = {
  id: string;
  label: string;
  sub: string;
  y: number;
  color: string;
};

const SINKS: Sink[] = [
  { id: "search", label: "search index", sub: "full-text", y: 38, color: "var(--accent)" },
  { id: "cache", label: "cache", sub: "materialized", y: 96, color: "var(--accent-2)" },
  { id: "agg", label: "aggregate", sub: "roll-up", y: 154, color: "var(--color-special)" },
  { id: "ml", label: "analytics", sub: "derived", y: 212, color: "var(--color-info)" },
];

// Geometry of the log "spine".
const LOG_X = 250;
const LOG_TOP = 40;
const SLOT_H = 26;
const SLOT_COUNT = 7;
const SINK_X = 470;

export function Hero() {
  const [seq, setSeq] = useState(0);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) return;
    const id = setInterval(() => setSeq((s) => s + 1), 1500);
    return () => clearInterval(id);
  }, []);

  // The most recent SLOT_COUNT offsets currently shown in the log.
  const offsets = Array.from({ length: SLOT_COUNT }, (_, i) => seq + i);

  return (
    <div className="instrument relative overflow-hidden p-5 sm:p-7">
      <div className="bg-dotgrid pointer-events-none absolute inset-0 opacity-40" />

      {/* caption row */}
      <div className="relative mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-accent anim-pulse-glow" />
          <span className="kicker">Dataflow · one log, many derived views</span>
        </div>
        <span className="font-mono text-[10px] text-fg-faint">
          append-only · deterministic · idempotent
        </span>
      </div>

      <svg viewBox="0 0 620 280" className="relative w-full" role="img" aria-label="An immutable event log fanning out to multiple derived views">
        <defs>
          <linearGradient id="logGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.04} />
          </linearGradient>
          <radialGradient id="srcGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* ---- writers / source of new events ---- */}
        <g>
          <circle cx={70} cy={140} r={46} fill="url(#srcGlow)" />
          <rect x={34} y={104} width={72} height={72} rx={10} fill="var(--color-ink-900)" stroke="var(--accent)" strokeWidth={1.4} />
          <text x={70} y={134} textAnchor="middle" className="font-mono" fontSize={10} fontWeight={700} fill="var(--accent)">
            writes
          </text>
          <text x={70} y={150} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-muted)">
            events
          </text>
          <text x={70} y={164} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">
            (truth)
          </text>
        </g>

        {/* writer -> log feeder */}
        <line
          x1={106}
          y1={140}
          x2={LOG_X - 8}
          y2={140}
          stroke="var(--accent)"
          strokeWidth={1.4}
          strokeOpacity={0.5}
          className="flow-line"
        />

        {/* animated event token entering the log */}
        {!reduced.current && (
          <motion.circle
            key={`tok-${seq}`}
            r={5}
            fill="var(--accent)"
            initial={{ cx: 110, cy: 140, opacity: 0 }}
            animate={{ cx: [110, LOG_X - 8], cy: [140, 140], opacity: [0, 1, 1] }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
        )}

        {/* ---- the log spine ---- */}
        <rect
          x={LOG_X - 8}
          y={LOG_TOP - 8}
          width={84}
          height={SLOT_H * SLOT_COUNT + 16}
          rx={8}
          fill="url(#logGrad)"
          stroke="var(--accent)"
          strokeWidth={1.2}
          strokeOpacity={0.55}
        />
        <text x={LOG_X + 34} y={LOG_TOP - 14} textAnchor="middle" className="font-mono" fontSize={9} fontWeight={700} fill="var(--accent)">
          EVENT LOG
        </text>

        {offsets.map((off, i) => {
          const y = LOG_TOP + i * SLOT_H;
          const isNewest = i === 0;
          return (
            <motion.g
              key={off}
              initial={isNewest ? { opacity: 0, x: -10 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <rect
                x={LOG_X}
                y={y}
                width={68}
                height={SLOT_H - 6}
                rx={4}
                fill="var(--color-ink-850)"
                stroke={isNewest ? "var(--accent)" : "var(--color-line-strong)"}
                strokeWidth={isNewest ? 1.4 : 1}
                strokeOpacity={isNewest ? 0.9 : 0.5}
              />
              <text
                x={LOG_X + 9}
                y={y + 14}
                className="font-mono"
                fontSize={9}
                fill={isNewest ? "var(--accent)" : "var(--color-fg-faint)"}
              >
                #{String(off).padStart(4, "0")}
              </text>
            </motion.g>
          );
        })}

        {/* ---- derived views (sinks) ---- */}
        {SINKS.map((s, si) => {
          // origin point on the log spine (stagger so the lines don't overlap)
          const srcY = LOG_TOP + 18 + si * 40;
          return (
            <g key={s.id}>
              {/* derivation pipe from log to sink */}
              <path
                d={`M ${LOG_X + 68} ${srcY} C ${LOG_X + 130} ${srcY}, ${SINK_X - 60} ${s.y + 18}, ${SINK_X} ${s.y + 18}`}
                fill="none"
                stroke={s.color}
                strokeWidth={1.3}
                strokeOpacity={0.45}
                className="flow-line"
                style={{ strokeDasharray: "5 7" } as React.CSSProperties}
              />

              {/* a token flowing down each derivation pipe, phase-offset per sink */}
              {!reduced.current && (
                <motion.circle
                  key={`flow-${s.id}-${seq}`}
                  r={3.5}
                  fill={s.color}
                  initial={{ offsetDistance: "0%", opacity: 0 }}
                  animate={{ offsetDistance: "100%", opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 1.1, delay: 0.5 + si * 0.12, ease: "easeInOut" }}
                  style={
                    {
                      offsetPath: `path("M ${LOG_X + 68} ${srcY} C ${LOG_X + 130} ${srcY}, ${SINK_X - 60} ${s.y + 18}, ${SINK_X} ${s.y + 18}")`,
                    } as React.CSSProperties
                  }
                />
              )}

              {/* the derived view box */}
              <motion.rect
                x={SINK_X}
                y={s.y}
                width={118}
                height={38}
                rx={7}
                fill="var(--color-ink-900)"
                stroke={s.color}
                strokeWidth={1.3}
                animate={
                  reduced.current
                    ? {}
                    : { strokeOpacity: [0.45, 0.95, 0.45] }
                }
                transition={{ duration: 1.5, delay: 0.9 + si * 0.12, repeat: Infinity, repeatDelay: 0 }}
                style={{ strokeOpacity: 0.55 }}
              />
              <text x={SINK_X + 12} y={s.y + 17} className="font-mono" fontSize={10} fontWeight={700} fill={s.color}>
                {s.label}
              </text>
              <text x={SINK_X + 12} y={s.y + 30} className="font-mono" fontSize={8} fill="var(--color-fg-faint)">
                {s.sub} view
              </text>
            </g>
          );
        })}

        {/* read-path label */}
        <text x={SINK_X + 59} y={268} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-fg-muted)">
          read paths ← each view optimised for its query
        </text>
      </svg>
    </div>
  );
}
