"use client";

import { motion } from "framer-motion";

/**
 * Animated hero: the partitioned append-only log as a control-room schematic.
 *
 * A producer appends immutable events to the head of a log. The log keeps
 * everything in order, assigning each record a monotonically increasing offset.
 * Two consumers read the same log independently at their own offsets — one near
 * the head (real-time), one lagging behind (replay/catch-up). This single
 * picture is the spine of the whole chapter: durable ordered log + independent
 * cursors = fan-out, replay, and derived views from one source of truth.
 */

const CELLS = 9;
const CELL_W = 46;
const LOG_X = 116;
const LOG_Y = 96;

export function Hero() {
  return (
    <div className="panel relative overflow-hidden">
      <div className="bg-dotgrid absolute inset-0 opacity-40" />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/3 h-56 w-56 rounded-full opacity-20 blur-[90px]"
        style={{ background: "var(--accent)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-0 h-56 w-56 rounded-full opacity-20 blur-[90px]"
        style={{ background: "var(--accent-2)" }}
      />

      <div className="relative px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="kicker">Append-only log · unbounded stream</span>
          <span className="font-mono text-[10px] text-fg-faint">topic: clicks · partition 0</span>
        </div>

        <svg viewBox="0 0 580 250" className="w-full" role="img" aria-label="Producer appends events to a partitioned log; consumers read at independent offsets">
          <defs>
            <linearGradient id="hero-cell" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.06" />
            </linearGradient>
            <marker id="hero-arrow" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
              <path d="M0 0 L6 3 L0 6 Z" fill="var(--accent)" />
            </marker>
          </defs>

          {/* ---- Producer ---- */}
          <g>
            <rect x={14} y={LOG_Y - 8} width={78} height={56} rx={9} fill="var(--color-ink-850)" stroke="var(--color-info)" strokeOpacity={0.6} />
            <text x={53} y={LOG_Y + 12} textAnchor="middle" className="fill-[var(--color-info)] font-mono" fontSize={10}>
              PRODUCER
            </text>
            <text x={53} y={LOG_Y + 28} textAnchor="middle" className="fill-fg-faint font-mono" fontSize={8}>
              append()
            </text>
          </g>

          {/* appending event particle: producer -> head of log */}
          <motion.circle
            r={6}
            fill="var(--accent)"
            initial={{ cx: 96, cy: LOG_Y + 16, opacity: 0 }}
            animate={{
              cx: [96, LOG_X + CELLS * CELL_W - CELL_W / 2, LOG_X + CELLS * CELL_W - CELL_W / 2],
              cy: [LOG_Y + 16, LOG_Y + 16, LOG_Y + 16],
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", times: [0, 0.55, 1] }}
          />

          {/* ---- Log cells (offsets) ---- */}
          {Array.from({ length: CELLS }).map((_, i) => {
            const x = LOG_X + i * CELL_W;
            const isHead = i === CELLS - 1;
            return (
              <g key={i}>
                <motion.rect
                  x={x + 3}
                  y={LOG_Y}
                  width={CELL_W - 6}
                  height={34}
                  rx={5}
                  fill="url(#hero-cell)"
                  stroke="var(--accent)"
                  initial={{ opacity: isHead ? 0.4 : 1, strokeOpacity: 0.4 }}
                  animate={{
                    opacity: isHead ? [0.4, 1, 1] : 1,
                    strokeOpacity: isHead ? [0.4, 0.9, 0.9] : 0.4,
                  }}
                  transition={isHead ? { duration: 2.4, repeat: Infinity, times: [0, 0.55, 1] } : { duration: 0.3 }}
                />
                <text x={x + CELL_W / 2} y={LOG_Y + 21} textAnchor="middle" className="fill-fg/80 font-mono" fontSize={9}>
                  {i}
                </text>
              </g>
            );
          })}
          {/* head marker */}
          <text x={LOG_X + CELLS * CELL_W - CELL_W / 2} y={LOG_Y - 6} textAnchor="middle" className="fill-accent font-mono" fontSize={8}>
            head
          </text>
          <text x={LOG_X + 4} y={LOG_Y - 6} className="fill-fg-faint font-mono" fontSize={8}>
            offset 0 (old)
          </text>

          {/* ---- Consumer A: real-time, near head ---- */}
          <motion.g
            initial={{ x: 0 }}
            animate={{ x: [0, CELL_W * 3, CELL_W * 3] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", times: [0, 0.5, 1] }}
          >
            <line x1={LOG_X + (CELLS - 1.5) * CELL_W} y1={LOG_Y + 34} x2={LOG_X + (CELLS - 1.5) * CELL_W} y2={LOG_Y + 60} stroke="var(--color-ok)" strokeWidth={2} />
            <rect x={LOG_X + (CELLS - 1.5) * CELL_W - 44} y={LOG_Y + 60} width={88} height={40} rx={8} fill="var(--color-ink-850)" stroke="var(--color-ok)" strokeOpacity={0.7} />
            <text x={LOG_X + (CELLS - 1.5) * CELL_W} y={LOG_Y + 76} textAnchor="middle" className="fill-[var(--color-ok)] font-mono" fontSize={9}>
              CONSUMER A
            </text>
            <text x={LOG_X + (CELLS - 1.5) * CELL_W} y={LOG_Y + 90} textAnchor="middle" className="fill-fg-faint font-mono" fontSize={7.5}>
              live · offset≈head
            </text>
          </motion.g>

          {/* ---- Consumer B: lagging / replay ---- */}
          <motion.g
            initial={{ x: 0 }}
            animate={{ x: [0, CELL_W * 2, CELL_W * 4, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            <line x1={LOG_X + 2.5 * CELL_W} y1={LOG_Y} x2={LOG_X + 2.5 * CELL_W} y2={LOG_Y - 26} stroke="var(--accent-2)" strokeWidth={2} />
            <rect x={LOG_X + 2.5 * CELL_W - 44} y={LOG_Y - 66} width={88} height={40} rx={8} fill="var(--color-ink-850)" stroke="var(--accent-2)" strokeOpacity={0.7} />
            <text x={LOG_X + 2.5 * CELL_W} y={LOG_Y - 50} textAnchor="middle" className="fill-[var(--accent-2)] font-mono" fontSize={9}>
              CONSUMER B
            </text>
            <text x={LOG_X + 2.5 * CELL_W} y={LOG_Y - 36} textAnchor="middle" className="fill-fg-faint font-mono" fontSize={7.5}>
              replay · lagging
            </text>
          </motion.g>

          {/* baseline rail under log */}
          <line x1={LOG_X} y1={LOG_Y + 44} x2={LOG_X + CELLS * CELL_W} y2={LOG_Y + 44} stroke="var(--color-line)" strokeWidth={1} strokeDasharray="2 4" />
        </svg>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 font-mono text-[10px] text-fg-faint">
          <span><span className="text-accent">●</span> event appended</span>
          <span><span className="text-[var(--color-ok)]">┃</span> consumer A · tails the head</span>
          <span><span className="text-[var(--accent-2)]">┃</span> consumer B · own offset, replays</span>
        </div>
      </div>
    </div>
  );
}
