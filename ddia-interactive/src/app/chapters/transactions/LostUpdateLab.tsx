"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, SegmentedControl, Stat, CodeBlock } from "@/components/chapter";
import { IconPlay, IconReset, IconCheck, IconAlert } from "@/components/icons";

/**
 * Lost Update Lab — two clients run a read-modify-write increment on the same
 * counter at the same time. The user picks one of DDIA's four remedies and
 * watches whether the second update survives or gets clobbered. Each strategy
 * shows the actual mechanism (SQL or control flow) and the final value.
 */

type Strategy = "naive" | "atomic" | "lock" | "cas" | "detect";

type StrategyDef = {
  label: string;
  code: string;
  lang: string;
  /** does the second writer's update survive? */
  preserves: boolean;
  /** narration frames played out in the timeline */
  frames: string[];
  blurb: string;
};

const START = 42;

const STRATEGIES: Record<Strategy, StrategyDef> = {
  naive: {
    label: "Read-modify-write",
    lang: "js",
    code: `// Both clients run this concurrently
const v = await db.get("views");   // both read 42
await db.set("views", v + 1);      // both write 43`,
    preserves: false,
    blurb:
      "The classic bug. Two clients read 42 into application memory, each adds 1, and each writes 43. The second write clobbers the first — one increment vanishes.",
    frames: [
      "C1 reads views = 42",
      "C2 reads views = 42",
      "C1 computes 42 + 1 = 43, writes 43",
      "C2 computes 42 + 1 = 43, writes 43  ← overwrites C1",
      "Final: views = 43  (one update LOST)",
    ],
  },
  atomic: {
    label: "Atomic write",
    lang: "sql",
    code: `-- The increment happens inside the database,
-- never round-tripping through the app.
UPDATE counters SET views = views + 1
WHERE key = 'page';`,
    preserves: true,
    blurb:
      "Push the read-modify-write into a single atomic statement. The database serializes the two increments on a row lock; no stale value ever leaves the engine. MongoDB and Redis offer the same atomic primitives.",
    frames: [
      "C1: UPDATE … views = views + 1  → 43 (row locked)",
      "C2 blocks on the row lock…",
      "C1 commits, lock released",
      "C2: UPDATE … views = views + 1  → 44",
      "Final: views = 44  (both increments kept)",
    ],
  },
  lock: {
    label: "Explicit lock",
    lang: "sql",
    code: `BEGIN;
SELECT views FROM counters
  WHERE key = 'page' FOR UPDATE;   -- 42, locks the row
-- application computes 42 + 1
UPDATE counters SET views = 43 WHERE key = 'page';
COMMIT;`,
    preserves: true,
    blurb:
      "When the logic is too complex for an atomic op, lock the rows you intend to update with SELECT … FOR UPDATE. The second client must wait until the first commits, then reads the fresh value.",
    frames: [
      "C1: SELECT … FOR UPDATE → 42 (row locked)",
      "C2: SELECT … FOR UPDATE blocks…",
      "C1 writes 43, COMMIT, lock released",
      "C2 unblocks, re-reads 43, writes 44",
      "Final: views = 44  (both increments kept)",
    ],
  },
  cas: {
    label: "Compare-and-set",
    lang: "sql",
    code: `-- Only write if the value is still what we read.
UPDATE counters SET views = 43
WHERE key = 'page' AND views = 42;
-- rows affected = 0  → someone changed it, retry`,
    preserves: true,
    blurb:
      "Allow the write only if the value hasn't changed since you read it. The losing client's UPDATE matches zero rows, so it detects the conflict and retries with the fresh value. (Beware: if the DB reads from an old snapshot, the WHERE may pass anyway.)",
    frames: [
      "C1 & C2 both read views = 42",
      "C1: UPDATE … WHERE views = 42 → 43 (1 row)",
      "C2: UPDATE … WHERE views = 42 → 0 rows!",
      "C2 detects conflict, re-reads 43, retries → 44",
      "Final: views = 44  (both increments kept)",
    ],
  },
  detect: {
    label: "Auto-detect (SSI)",
    lang: "sql",
    code: `-- Run optimistically under serializable isolation.
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT views FROM counters WHERE key = 'page';  -- 42
UPDATE counters SET views = 43 WHERE key = 'page';
COMMIT;  -- DB aborts the loser: 40001 serialization_failure`,
    preserves: true,
    blurb:
      "Let both transactions run, and let the database detect the lost update at commit time. The loser is aborted with a serialization error and the application transparently retries. This is how PostgreSQL's repeatable-read / serializable modes behave.",
    frames: [
      "C1 & C2 read 42 from their snapshots",
      "C1 writes 43, COMMIT succeeds",
      "C2 writes 43, COMMIT → serialization_failure",
      "C2 is aborted and retried, re-reads 43 → 44",
      "Final: views = 44  (both increments kept)",
    ],
  },
};

const STRATEGY_OPTS: { label: string; value: Strategy }[] = [
  { label: "Naive RMW", value: "naive" },
  { label: "Atomic", value: "atomic" },
  { label: "Lock", value: "lock" },
  { label: "Compare-and-set", value: "cas" },
  { label: "Auto-detect", value: "detect" },
];

export function LostUpdateLab() {
  const [strategy, setStrategy] = useState<Strategy>("naive");
  const [running, setRunning] = useState(false);
  const [frame, setFrame] = useState(0);
  const def = STRATEGIES[strategy];
  const done = frame >= def.frames.length;
  const finalValue = def.preserves ? START + 2 : START + 1;

  function run() {
    setRunning(true);
    setFrame(0);
    let i = 0;
    const tick = () => {
      i += 1;
      setFrame(i);
      if (i < def.frames.length) {
        setTimeout(tick, 760);
      } else {
        setRunning(false);
      }
    };
    setTimeout(tick, 300);
  }

  function reset() {
    setRunning(false);
    setFrame(0);
  }

  function pick(s: Strategy) {
    setStrategy(s);
    setRunning(false);
    setFrame(0);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="kicker">Prevention strategy</div>
        <SegmentedControl value={strategy} onChange={pick} options={STRATEGY_OPTS} />
      </div>

      <p className="text-sm leading-relaxed text-fg-muted">{def.blurb}</p>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* the two racing clients + counter */}
        <div className="panel relative overflow-hidden p-5">
          <div className="bg-dotgrid pointer-events-none absolute inset-0 opacity-20" />
          <div className="relative">
            <div className="mb-4 flex items-center justify-between">
              <span className="kicker">Shared counter</span>
              <motion.span
                key={done ? finalValue : "live"}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                className="font-mono text-3xl font-bold tabular-nums"
                style={{
                  color: done ? (def.preserves ? "var(--color-ok)" : "var(--color-fault)") : "var(--accent)",
                }}
              >
                {done ? finalValue : frame === 0 ? START : "··"}
              </motion.span>
            </div>

            <svg viewBox="0 0 320 150" className="w-full">
              {/* client 1 */}
              <ClientNode x={20} y={20} label="Client 1" active={frame >= 1} color="var(--accent)" />
              {/* client 2 */}
              <ClientNode x={20} y={92} label="Client 2" active={frame >= 2} color="var(--color-special)" />
              {/* counter box */}
              <rect x={210} y={48} width={92} height={54} rx={10} fill="var(--color-ink-850)" stroke="var(--color-line-strong)" />
              <text x={256} y={70} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-fg-faint)">
                counters
              </text>
              <text x={256} y={90} textAnchor="middle" className="font-mono" fontSize={16} fill="var(--color-fg)">
                {done ? finalValue : frame === 0 ? START : "?"}
              </text>

              {/* arrows */}
              <Arrow from={[108, 38]} to={[208, 64]} active={frame >= 1} color="var(--accent)" />
              <Arrow from={[108, 110]} to={[208, 86]} active={frame >= 2} color="var(--color-special)" />

              {/* collision marker for naive */}
              <AnimatePresence>
                {!def.preserves && frame >= 4 && (
                  <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}>
                    <circle cx={158} cy={75} r={13} fill="none" stroke="var(--color-fault)" strokeWidth={1.5} />
                    <path d="M152 69 l12 12 M164 69 l-12 12" stroke="var(--color-fault)" strokeWidth={1.5} />
                  </motion.g>
                )}
              </AnimatePresence>
            </svg>
          </div>
        </div>

        {/* timeline of frames */}
        <div className="rounded-lg border border-line bg-ink-950/60 p-4">
          <div className="kicker mb-3">Interleaving</div>
          <ol className="space-y-1.5">
            {def.frames.map((f, i) => {
              const shown = i < frame;
              const isLast = i === def.frames.length - 1;
              return (
                <motion.li
                  key={f}
                  initial={false}
                  animate={{ opacity: shown ? 1 : 0.28, x: shown ? 0 : -4 }}
                  className="font-mono text-xs leading-relaxed"
                  style={{
                    color: isLast && shown ? (def.preserves ? "var(--color-ok)" : "var(--color-fault)") : "var(--color-fg)",
                  }}
                >
                  <span className="text-fg-faint">{i + 1}. </span>
                  {f}
                </motion.li>
              );
            })}
          </ol>
        </div>
      </div>

      <CodeBlock code={def.code} lang={def.lang} caption={`${def.label} — the mechanism`} />

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={running}>
          <IconPlay size={15} /> Run the race
        </Button>
        <Button variant="ghost" onClick={reset} disabled={running || frame === 0}>
          <IconReset size={15} /> Reset
        </Button>
      </div>

      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-4 rounded-lg border p-4"
            style={{
              borderColor: def.preserves ? "var(--color-ok)" : "var(--color-fault)",
              background: `color-mix(in oklab, ${def.preserves ? "var(--color-ok)" : "var(--color-fault)"} 9%, var(--color-ink-900))`,
            }}
          >
            <span style={{ color: def.preserves ? "var(--color-ok)" : "var(--color-fault)" }}>
              {def.preserves ? <IconCheck size={20} /> : <IconAlert size={20} />}
            </span>
            <div className="flex flex-1 items-center gap-4">
              <Stat label="Started at" value={START} />
              <span className="font-mono text-fg-faint">+2 wanted →</span>
              <Stat
                label="Final value"
                value={finalValue}
                tone={def.preserves ? "ok" : "fault"}
              />
              <span className="font-mono text-sm" style={{ color: def.preserves ? "var(--color-ok)" : "var(--color-fault)" }}>
                {def.preserves ? "both updates preserved" : "one update lost"}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------- sub-views */

function ClientNode({
  x,
  y,
  label,
  active,
  color,
}: {
  x: number;
  y: number;
  label: string;
  active: boolean;
  color: string;
}) {
  return (
    <g>
      <motion.rect
        x={x}
        y={y}
        width={88}
        height={38}
        rx={9}
        fill="var(--color-ink-850)"
        stroke={active ? color : "var(--color-line)"}
        strokeWidth={1.25}
        initial={{ opacity: active ? 1 : 0.55 }}
        animate={{ opacity: active ? 1 : 0.55 }}
      />
      <text x={x + 44} y={y + 18} textAnchor="middle" className="font-mono" fontSize={10} fill={color}>
        {label}
      </text>
      <text x={x + 44} y={y + 30} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">
        v = 42
      </text>
    </g>
  );
}

function Arrow({
  from,
  to,
  active,
  color,
}: {
  from: [number, number];
  to: [number, number];
  active: boolean;
  color: string;
}) {
  return (
    <motion.line
      x1={from[0]}
      y1={from[1]}
      x2={to[0]}
      y2={to[1]}
      stroke={color}
      strokeWidth={1.25}
      strokeDasharray="4 4"
      initial={{ opacity: active ? 0.9 : 0.2 }}
      animate={{ opacity: active ? 0.9 : 0.2 }}
    />
  );
}
