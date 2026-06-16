"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Animated hero: visualizes the central idea of a transaction — several small
 * operations on different objects are wrapped in BEGIN…COMMIT and behave as a
 * single atomic unit. The loop cycles COMMIT (all writes land) and ABORT (a
 * fault strikes mid-flight and every write is rolled back, leaving no trace).
 */

type Op = { id: string; label: string; target: string };

const OPS: Op[] = [
  { id: "w1", label: "−$100", target: "accounts:alice" },
  { id: "w2", label: "+$100", target: "accounts:bob" },
  { id: "w3", label: "log entry", target: "ledger:txn" },
];

type Phase = "begin" | "writing" | "commit" | "fault" | "abort";

export function Hero() {
  const [phase, setPhase] = useState<Phase>("begin");
  const [outcome, setOutcome] = useState<"commit" | "abort">("commit");

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    function run(kind: "commit" | "abort") {
      if (!alive) return;
      setOutcome(kind);
      setPhase("begin");
      at(700, () => setPhase("writing"));
      if (kind === "commit") {
        at(2400, () => setPhase("commit"));
        at(4100, () => run("abort"));
      } else {
        at(2000, () => setPhase("fault"));
        at(2700, () => setPhase("abort"));
        at(4400, () => run("commit"));
      }
    }
    run("commit");
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  const isWriting = phase === "writing" || phase === "commit" || phase === "fault" || phase === "abort";
  const committed = phase === "commit";
  const aborting = phase === "abort";
  const faulting = phase === "fault";

  const statusLabel =
    phase === "begin"
      ? "BEGIN TRANSACTION"
      : phase === "writing"
        ? "buffering writes…"
        : phase === "commit"
          ? "COMMIT — all-or-nothing satisfied"
          : phase === "fault"
            ? "fault detected mid-transaction"
            : "ROLLBACK — every write undone";

  const statusColor = committed
    ? "var(--color-ok)"
    : aborting || faulting
      ? "var(--color-fault)"
      : "var(--accent)";

  return (
    <div className="instrument relative overflow-hidden p-6 sm:p-8">
      <div className="bg-dotgrid pointer-events-none absolute inset-0 opacity-30" />

      <div className="relative">
        {/* status bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: statusColor }}
            />
            <span className="font-mono text-xs uppercase tracking-[0.2em]" style={{ color: statusColor }}>
              {statusLabel}
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint">
            atomic unit of execution
          </span>
        </div>

        <svg viewBox="0 0 720 240" className="w-full" role="img" aria-label="Transaction grouping animation">
          <defs>
            <linearGradient id="txn-envelope" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
            <marker id="txn-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M1 1 L7 4 L1 7 Z" fill="var(--accent)" />
            </marker>
          </defs>

          {/* the transaction envelope wrapping the operations */}
          <motion.rect
            x={40}
            y={40}
            width={300}
            height={160}
            rx={14}
            fill="url(#txn-envelope)"
            stroke={statusColor}
            strokeWidth={1.5}
            className="flow-line"
            initial={{ opacity: aborting ? 0.35 : 1 }}
            animate={{ opacity: aborting ? 0.35 : 1 }}
            transition={{ duration: 0.4 }}
          />
          <text x={56} y={64} className="font-mono" fontSize={11} fill="var(--color-fg-muted)">
            BEGIN
          </text>
          <text x={324} y={188} textAnchor="end" className="font-mono" fontSize={11} fill="var(--color-fg-muted)">
            {outcome === "commit" ? "COMMIT" : "ABORT"}
          </text>

          {/* the three buffered operations */}
          {OPS.map((op, i) => {
            const y = 78 + i * 42;
            const active = isWriting;
            return (
              <g key={op.id}>
                <motion.rect
                  x={64}
                  y={y}
                  width={252}
                  height={30}
                  rx={7}
                  fill="var(--color-ink-850)"
                  stroke={active ? "var(--accent)" : "var(--color-line)"}
                  strokeWidth={1}
                  initial={false}
                  animate={{
                    opacity: aborting ? 0.2 : 1,
                    x: aborting ? -6 : 0,
                  }}
                  transition={{ duration: 0.35, delay: aborting ? i * 0.07 : 0 }}
                />
                <motion.circle
                  cx={80}
                  cy={y + 15}
                  r={4}
                  initial={false}
                  animate={{
                    fill: committed ? "var(--color-ok)" : aborting ? "var(--color-fault)" : "var(--accent)",
                    opacity: phase === "begin" ? 0.3 : 1,
                  }}
                />
                <text x={96} y={y + 19} className="font-mono" fontSize={12} fill="var(--color-fg)">
                  {op.label}
                </text>
                <text x={300} y={y + 19} textAnchor="end" className="font-mono" fontSize={10} fill="var(--color-fg-faint)">
                  {op.target}
                </text>
              </g>
            );
          })}

          {/* arrow from the unit to durable storage */}
          <motion.line
            x1={340}
            y1={120}
            x2={470}
            y2={120}
            stroke="var(--accent)"
            strokeWidth={1.5}
            markerEnd="url(#txn-arrow)"
            initial={false}
            animate={{
              opacity: committed ? 1 : aborting || faulting ? 0.15 : 0.4,
              pathLength: committed ? 1 : 0.2,
            }}
            transition={{ duration: 0.5 }}
          />

          {/* durable storage cylinder */}
          <g transform="translate(486, 70)">
            <ellipse cx={90} cy={12} rx={90} ry={12} fill="var(--color-ink-800)" stroke="var(--color-line-strong)" />
            <path
              d="M0 12 V88 C0 95 40 100 90 100 C140 100 180 95 180 88 V12"
              fill="var(--color-ink-850)"
              stroke="var(--color-line-strong)"
            />
            <ellipse cx={90} cy={12} rx={90} ry={12} fill="none" stroke="var(--color-line-strong)" />
            <text x={90} y={56} textAnchor="middle" className="font-mono" fontSize={11} fill="var(--color-fg-muted)">
              durable
            </text>
            <text x={90} y={72} textAnchor="middle" className="font-mono" fontSize={11} fill="var(--color-fg-muted)">
              storage
            </text>

            {/* landed write rows — only appear on commit */}
            <AnimatePresence>
              {committed &&
                OPS.map((op, i) => (
                  <motion.rect
                    key={op.id}
                    x={28}
                    y={20 + i * 9}
                    width={124}
                    height={5}
                    rx={2.5}
                    fill="var(--color-ok)"
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 0.8, scaleX: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 0.2 + i * 0.12, duration: 0.4 }}
                    style={{ transformOrigin: "28px center" }}
                  />
                ))}
            </AnimatePresence>
          </g>

          {/* fault bolt */}
          <AnimatePresence>
            {faulting && (
              <motion.g
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <path
                  d="M404 86 L388 118 L402 118 L398 146 L420 110 L406 110 L412 86 Z"
                  fill="var(--color-fault)"
                  stroke="var(--color-fault)"
                  strokeWidth={1}
                />
              </motion.g>
            )}
          </AnimatePresence>
        </svg>

        <p className="mt-5 max-w-2xl font-body text-[15px] leading-relaxed text-fg-muted">
          A <strong className="text-fg">transaction</strong> bundles several reads and writes into one logical
          operation. It either lands completely (<span style={{ color: "var(--color-ok)" }}>commit</span>) or
          leaves no trace at all (<span style={{ color: "var(--color-fault)" }}>abort</span>) — there is no
          half-finished state for the rest of the system to trip over.
        </p>
      </div>
    </div>
  );
}
