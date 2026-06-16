"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SegmentedControl, Button, Stat, CodeBlock } from "@/components/chapter";
import { IconPlay, IconReset } from "@/components/icons";

/**
 * Declarative vs imperative query execution, made visible.
 *
 * Task: "find sharks observed in the data set" over a list of animal sightings.
 *  - IMPERATIVE: you write the loop. A single cursor marches through every row in
 *    a fixed order — you specified the algorithm, so the engine can't reorder or
 *    parallelise it.
 *  - DECLARATIVE: you state the PATTERN (WHERE family = 'Shark'). The optimizer is
 *    free to scan partitions in parallel and short-circuit — it owns the access path.
 *
 * The animation shows the cursor stepping one-at-a-time for imperative, vs four
 * partitions lighting up at once for declarative — and reports the "wall-clock"
 * steps each took.
 */

type Mode = "imperative" | "declarative";

type Row = { id: number; family: "Sharks" | "Whales" | "Rays"; name: string };

const ROWS: Row[] = [
  { id: 1, family: "Whales", name: "Blue" },
  { id: 2, family: "Sharks", name: "Tiger" },
  { id: 3, family: "Rays", name: "Manta" },
  { id: 4, family: "Sharks", name: "Hammerhead" },
  { id: 5, family: "Whales", name: "Orca" },
  { id: 6, family: "Sharks", name: "Great White" },
  { id: 7, family: "Rays", name: "Eagle" },
  { id: 8, family: "Sharks", name: "Mako" },
];

// 4 partitions of 2 rows each (so declarative can fan out 4-wide)
const PARTITIONS = [ROWS.slice(0, 2), ROWS.slice(2, 4), ROWS.slice(4, 6), ROWS.slice(6, 8)];

const IMPERATIVE_CODE = `// you specify HOW: walk every row in order
const sharks = [];
const cursor = db.openCursor("animals");
while (cursor.next()) {
  if (cursor.row.family === "Sharks")
    sharks.push(cursor.row);   // fixed access path
}`;

const DECLARATIVE_CODE = `-- you specify WHAT: just the pattern
SELECT * FROM animals
WHERE family = 'Sharks';
-- the optimizer chooses the access path
-- (and may scan partitions in parallel)`;

export function QueryDuel() {
  const [mode, setMode] = useState<Mode>("imperative");
  const [step, setStep] = useState(0); // imperative: rows visited; declarative: 0|1 (sweep done)
  const [running, setRunning] = useState(false);
  const timers = useRef<number[]>([]);

  const matched = ROWS.filter((r) => r.family === "Sharks").map((r) => r.id);

  // wall-clock "ticks": imperative visits all 8 rows serially (8 ticks);
  // declarative fans 4 partitions in parallel (2 ticks of depth).
  const ticks = mode === "imperative" ? (running || step > 0 ? step : 8) : running || step > 0 ? Math.min(step, 2) : 2;
  const totalTicks = mode === "imperative" ? 8 : 2;

  function clearTimers() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }

  function reset() {
    clearTimers();
    setRunning(false);
    setStep(0);
  }

  function run() {
    clearTimers();
    setStep(0);
    setRunning(true);
    if (mode === "imperative") {
      // step through 8 rows one at a time
      for (let i = 1; i <= ROWS.length; i++) {
        timers.current.push(
          window.setTimeout(() => {
            setStep(i);
            if (i === ROWS.length) setRunning(false);
          }, i * 320)
        );
      }
    } else {
      // two depth-ticks: all partitions advance together
      timers.current.push(window.setTimeout(() => setStep(1), 360));
      timers.current.push(
        window.setTimeout(() => {
          setStep(2);
          setRunning(false);
        }, 720)
      );
    }
  }

  // reset when switching modes
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => () => clearTimers(), []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { label: "Imperative (you loop)", value: "imperative" },
            { label: "Declarative (you ask)", value: "declarative" },
          ]}
        />
        <div className="flex gap-2">
          <Button onClick={run} size="sm" disabled={running}>
            <IconPlay size={14} /> Run query
          </Button>
          <Button onClick={reset} size="sm" variant="ghost">
            <IconReset size={14} /> Reset
          </Button>
        </div>
      </div>

      <CodeBlock
        code={mode === "imperative" ? IMPERATIVE_CODE : DECLARATIVE_CODE}
        lang={mode === "imperative" ? "javascript" : "sql"}
      />

      {/* The data + execution visualization */}
      <div className="rounded-lg border border-line bg-ink-950/60 p-4">
        {mode === "imperative" ? (
          <ImperativeStage step={step} matched={matched} />
        ) : (
          <DeclarativeStage swept={step >= 1} matched={matched} />
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="rows matched" value={step > 0 || !running ? matched.length : 0} tone="accent" />
        <Stat
          label="wall-clock ticks"
          value={ticks}
          unit={`/ ${totalTicks}`}
          tone={mode === "imperative" ? "warn" : "ok"}
        />
        <Stat
          label="parallelism"
          value={mode === "imperative" ? "1×" : "4×"}
          tone={mode === "imperative" ? "fault" : "ok"}
        />
      </div>

      <p className="font-mono text-[11px] leading-relaxed text-fg-muted">
        {mode === "imperative" ? (
          <>
            <span className="text-warn">A single cursor</span> visits rows in the exact order you coded. Because
            you fixed the algorithm, the engine cannot reorder or parallelise it — 8 rows, 8 serial ticks.
          </>
        ) : (
          <>
            You only stated the <span className="text-ok">pattern</span>. The optimizer is free to scan all four
            partitions <span className="text-ok">at once</span> and short-circuit — same result in 2 ticks. New
            indexes can speed it up with zero query changes.
          </>
        )}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- Imperative stage */

function ImperativeStage({ step, matched }: { step: number; matched: number[] }) {
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
        animals · single cursor, sequential scan
      </div>
      <div className="space-y-1.5">
        {ROWS.map((r, i) => {
          const visited = step > i;
          const isCursor = step === i + 1;
          const isMatch = r.family === "Sharks";
          return (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors"
              style={
                {
                  borderColor: isCursor
                    ? "var(--color-warn)"
                    : visited && isMatch
                    ? "var(--accent)"
                    : "var(--color-line)",
                  background: isCursor
                    ? "color-mix(in oklab, var(--color-warn) 14%, transparent)"
                    : visited && isMatch
                    ? "color-mix(in oklab, var(--accent) 10%, transparent)"
                    : "transparent",
                  opacity: !visited && !isCursor && step > 0 ? 0.45 : 1,
                } as React.CSSProperties
              }
            >
              <span className="w-6 text-fg-faint">#{r.id}</span>
              <span className={isMatch ? "accent-text w-24" : "w-24 text-fg-muted"}>{r.family}</span>
              <span className="text-fg-muted">{r.name}</span>
              <AnimatePresence>
                {isCursor && (
                  <motion.span
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="ml-auto text-warn"
                  >
                    ◀ cursor
                  </motion.span>
                )}
                {visited && isMatch && !isCursor && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="ml-auto accent-text"
                  >
                    + kept
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
      <div className="mt-2 font-mono text-[10px] text-fg-faint">
        {step >= ROWS.length
          ? `done · kept ${matched.length} rows after ${ROWS.length} sequential steps`
          : `visited ${step} / ${ROWS.length} rows…`}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- Declarative stage */

function DeclarativeStage({ swept, matched }: { swept: boolean; matched: number[] }) {
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
        animals · optimizer fans out across 4 partitions in parallel
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PARTITIONS.map((part, pi) => (
          <motion.div
            key={pi}
            className="rounded-md border p-2"
            animate={{
              borderColor: swept ? "var(--color-ok)" : "var(--color-line)",
              boxShadow: "none",
            }}
            transition={{ duration: 0.3, delay: pi * 0.02 }}
          >
            <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-fg-faint">
              shard {pi + 1}
            </div>
            <div className="space-y-1">
              {part.map((r) => {
                const isMatch = r.family === "Sharks";
                const kept = swept && isMatch;
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded px-2 py-1 font-mono text-[10px]"
                    style={
                      {
                        background: kept
                          ? "color-mix(in oklab, var(--accent) 14%, transparent)"
                          : "var(--color-ink-900)",
                        color: kept ? "var(--accent)" : "var(--color-fg-muted)",
                        opacity: swept && !isMatch ? 0.4 : 1,
                      } as React.CSSProperties
                    }
                  >
                    <span>{r.family}</span>
                    {kept && <span>✓</span>}
                  </div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>
      <div className="mt-2 font-mono text-[10px] text-fg-faint">
        {swept
          ? `done · ${matched.length} rows matched in parallel — depth 2, not 8`
          : "press Run — all shards evaluate the predicate simultaneously"}
      </div>
    </div>
  );
}
