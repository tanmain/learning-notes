"use client";

import { useMemo, useReducer } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, SegmentedControl, Stat, Toggle } from "@/components/chapter";
import { IconStep, IconReset } from "@/components/icons";

/**
 * Driveable MapReduce word-count lab.
 *
 * Unlike the read-only step viewer, the USER builds the input: they pick which
 * log lines to feed in (toggling chips on/off), choose the number of reducers,
 * and can inject a "hot key" line that floods one term. Then they STEP the job
 * one phase at a time and watch:
 *
 *   1. SPLIT  — input files broken into records (one line = one record)
 *   2. MAP    — map() emits (word, 1) for each word, per mapper
 *   3. SHUFFLE— each pair routed to partition hash(word) % R, then sorted
 *   4. REDUCE — reduce() sums the 1s per key; per-reducer load is shown
 *
 * The hot key makes one reducer's load spike, demonstrating skew: the job's
 * wall-clock is governed by the busiest reducer, so one straggler holds it back.
 * Everything is deterministic and recomputed from the chosen input — re-run any
 * time and you get the identical answer, which is the chapter's core point.
 */

/* ----------------------------------------------------------------- corpus */

type Line = { id: string; text: string; on: boolean };

const BASE_LINES: { id: string; text: string }[] = [
  { id: "l1", text: "home about home" },
  { id: "l2", text: "home pricing about" },
  { id: "l3", text: "pricing home docs" },
  { id: "l4", text: "docs about home" },
];

// A "linchpin" line: one key (home) dominates, like a celebrity's activity.
const HOT_LINE = "home home home home home home";

type Phase = 0 | 1 | 2 | 3;

const PHASE_META: { key: Phase; label: string; verb: string }[] = [
  { key: 0, label: "1 · Split", verb: "split input into records" },
  { key: 1, label: "2 · Map", verb: "emit (word, 1) per word" },
  { key: 2, label: "3 · Shuffle", verb: "partition by hash(key) % R, then sort" },
  { key: 3, label: "4 · Reduce", verb: "sum the values for each key" },
];

const REDUCER_TONE = ["var(--accent)", "var(--accent-2)", "var(--color-info)"];

/* FNV-1a — stable so a key always lands on the same reducer. */
function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ----------------------------------------------------------------- state */

type State = {
  lines: Line[];
  hot: boolean;
  reducers: 2 | 3;
  phase: Phase;
};

type Action =
  | { type: "toggleLine"; id: string }
  | { type: "setHot"; on: boolean }
  | { type: "setReducers"; r: 2 | 3 }
  | { type: "step" }
  | { type: "setPhase"; phase: Phase }
  | { type: "reset" };

function initState(): State {
  return {
    lines: BASE_LINES.map((l) => ({ ...l, on: true })),
    hot: false,
    reducers: 2,
    phase: 0,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "toggleLine":
      return {
        ...state,
        phase: 0,
        lines: state.lines.map((l) => (l.id === action.id ? { ...l, on: !l.on } : l)),
      };
    case "setHot":
      return { ...state, hot: action.on, phase: 0 };
    case "setReducers":
      return { ...state, reducers: action.r, phase: 0 };
    case "setPhase":
      return { ...state, phase: action.phase };
    case "step":
      return { ...state, phase: (state.phase < 3 ? state.phase + 1 : state.phase) as Phase };
    case "reset":
      return initState();
    default:
      return state;
  }
}

/* ------------------------------------------------------------- component */

export function WordCountLab() {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const { lines, hot, reducers, phase } = state;

  // The records that actually feed the job (toggled-on lines + optional hot line).
  const records = useMemo(() => {
    const live = lines.filter((l) => l.on).map((l) => l.text);
    if (hot) live.push(HOT_LINE);
    return live;
  }, [lines, hot]);

  // MAP: each record -> array of (word, 1). One mapper per record/block.
  const mapped = useMemo(
    () =>
      records.map((line, li) =>
        line
          .split(/\s+/)
          .filter(Boolean)
          .map((w, wi) => ({ key: w, value: 1, id: `${li}-${wi}` }))
      ),
    [records]
  );
  const flatMapped = useMemo(() => mapped.flat(), [mapped]);

  // SHUFFLE: route each pair to hash(key) % R, then sort within the partition.
  const partitions = useMemo(() => {
    const buckets: { key: string; value: number }[][] = Array.from({ length: reducers }, () => []);
    for (const kv of flatMapped) buckets[hashKey(kv.key) % reducers].push({ key: kv.key, value: kv.value });
    return buckets.map((b) => [...b].sort((a, c) => a.key.localeCompare(c.key)));
  }, [flatMapped, reducers]);

  // REDUCE: sum the 1s per key inside each partition.
  const reduced = useMemo(
    () =>
      partitions.map((bucket) => {
        const m = new Map<string, number>();
        for (const kv of bucket) m.set(kv.key, (m.get(kv.key) ?? 0) + kv.value);
        return [...m.entries()].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0]));
      }),
    [partitions]
  );

  // Per-reducer load (records handled) drives the skew read-out.
  const loads = useMemo(() => partitions.map((b) => b.length), [partitions]);
  const maxLoad = Math.max(1, ...loads);
  const totalPairs = flatMapped.length;
  const idealLoad = Math.max(1, Math.ceil(totalPairs / reducers));
  const busiest = Math.max(0, ...loads);
  const skewFactor = (busiest / idealLoad).toFixed(2);
  const skewed = busiest > idealLoad * 1.4;
  const noInput = records.length === 0;

  return (
    <div className="space-y-5">
      {/* ---- input builder ---- */}
      <div className="rounded-lg border border-line bg-ink-950/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="kicker">Build the input — toggle lines on/off</span>
          <span className="font-mono text-[10px] text-fg-faint">
            {records.length} records · {totalPairs} words
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {lines.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => dispatch({ type: "toggleLine", id: l.id })}
              className="rounded-md border px-2.5 py-1.5 font-mono text-[12px] transition-colors"
              style={{
                borderColor: l.on ? "var(--accent)" : "var(--color-line)",
                background: l.on ? "color-mix(in oklab, var(--accent) 12%, transparent)" : "var(--color-ink-850)",
                color: l.on ? "var(--color-fg)" : "var(--color-fg-faint)",
              }}
            >
              <span style={{ color: l.on ? "var(--accent)" : "var(--color-fg-faint)" }}>{l.on ? "✓ " : "○ "}</span>
              {l.text}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line/60 pt-3">
          <Toggle label="Inject hot key (home ×6)" checked={hot} onChange={(v) => dispatch({ type: "setHot", on: v })} />
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-fg-muted">Reducers (R)</span>
            <SegmentedControl
              value={String(reducers)}
              onChange={(v) => dispatch({ type: "setReducers", r: Number(v) as 2 | 3 })}
              options={[
                { label: "2", value: "2" },
                { label: "3", value: "3" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ---- phase driver ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          value={String(phase)}
          onChange={(v) => dispatch({ type: "setPhase", phase: Number(v) as Phase })}
          options={PHASE_META.map((p) => ({ label: p.label, value: String(p.key) }))}
        />
        <Button size="sm" variant="outline" onClick={() => dispatch({ type: "step" })} disabled={phase === 3 || noInput}>
          <IconStep size={14} /> Run next phase
        </Button>
        <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "reset" })}>
          <IconReset size={14} /> Reset
        </Button>
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-fg-muted">
        <span className="accent-text">{PHASE_META[phase].label}</span> — {PHASE_META[phase].verb}.
      </p>

      {noInput && (
        <div className="rounded-lg border border-line bg-ink-950/60 p-4 font-mono text-[12px] text-warn">
          No input selected — toggle at least one line on (or inject the hot key) to run the job.
        </div>
      )}

      {/* ---- the pipeline board ---- */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.05fr]">
        {/* SPLIT + MAP */}
        <div className="instrument p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs accent-text">map()</span>
            <span className="font-mono text-[10px] text-fg-faint">{records.length} mappers</span>
          </div>
          <div className="space-y-2.5">
            {mapped.map((pairs, li) => {
              const isHot = hot && li === records.length - 1;
              return (
                <div
                  key={li}
                  className="rounded-md border bg-ink-950/60 p-2"
                  style={{ borderColor: isHot ? "var(--color-warn)" : "var(--color-line)" }}
                >
                  <div className="mb-1.5 font-mono text-[10px] text-fg-faint">
                    record {li}
                    {isHot && <span className="ml-1 text-warn">· hot key</span>}: {records[li]}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pairs.map((kv) => (
                      <motion.span
                        key={kv.id}
                        initial={false}
                        animate={{ opacity: phase >= 1 ? 1 : 0.22, scale: phase >= 1 ? 1 : 0.92 }}
                        transition={{ duration: 0.3 }}
                        className="rounded border border-line bg-ink-850 px-1.5 py-0.5 font-mono text-[11px]"
                      >
                        <span className="text-fg">{kv.key}</span>
                        <span className="text-fg-faint">,{kv.value}</span>
                      </motion.span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SHUFFLE */}
        <div className="instrument p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs" style={{ color: "var(--accent-2)" }}>
              shuffle
            </span>
            <span className="font-mono text-[10px] text-fg-faint">hash(k) % {reducers} · sort</span>
          </div>
          <div className="space-y-3">
            {partitions.map((bucket, pi) => (
              <div
                key={pi}
                className="rounded-md border p-2"
                style={{
                  borderColor:
                    phase >= 2 ? `color-mix(in oklab, ${REDUCER_TONE[pi]} 45%, transparent)` : "var(--color-line)",
                  background: "var(--color-ink-950)",
                }}
              >
                <div className="mb-1.5 font-mono text-[10px]" style={{ color: REDUCER_TONE[pi] }}>
                  partition {pi} → reducer {pi}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <AnimatePresence>
                    {(phase >= 2 ? bucket : []).map((kv, i) => (
                      <motion.span
                        key={`${pi}-${kv.key}-${i}`}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22, delay: Math.min(i * 0.025, 0.4) }}
                        className="rounded px-1.5 py-0.5 font-mono text-[11px]"
                        style={{
                          background: `color-mix(in oklab, ${REDUCER_TONE[pi]} 16%, transparent)`,
                          color: "var(--color-fg)",
                        }}
                      >
                        {kv.key},{kv.value}
                      </motion.span>
                    ))}
                  </AnimatePresence>
                  {phase < 2 && <span className="font-mono text-[10px] text-fg-faint">waiting for map…</span>}
                  {phase >= 2 && bucket.length === 0 && (
                    <span className="font-mono text-[10px] text-fg-faint">∅ empty</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* REDUCE */}
        <div className="instrument p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs accent-text">reduce()</span>
            <span className="font-mono text-[10px] text-fg-faint">sum values per key</span>
          </div>
          <div className="space-y-3">
            {reduced.map((bucket, pi) => {
              const overloaded = phase >= 3 && loads[pi] > idealLoad * 1.4;
              return (
                <div
                  key={pi}
                  className="rounded-md border p-2"
                  style={{
                    borderColor: overloaded
                      ? "var(--color-fault)"
                      : phase >= 3
                        ? `color-mix(in oklab, ${REDUCER_TONE[pi]} 45%, transparent)`
                        : "var(--color-line)",
                    background: "var(--color-ink-950)",
                  }}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-mono text-[10px]" style={{ color: REDUCER_TONE[pi] }}>
                      reducer {pi}
                    </span>
                    {phase >= 3 && (
                      <span
                        className="font-mono text-[9px] uppercase tracking-wider"
                        style={{ color: overloaded ? "var(--color-fault)" : "var(--color-fg-faint)" }}
                      >
                        {loads[pi]} recs{overloaded ? " · straggler" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <AnimatePresence>
                      {(phase >= 3 ? bucket : []).map(([k, n], i) => (
                        <motion.div
                          key={`${pi}-${k}`}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3, delay: Math.min(i * 0.05, 0.5) }}
                          className="flex items-center justify-between rounded bg-ink-850 px-2 py-1"
                        >
                          <span className="font-mono text-[12px] text-fg">{k}</span>
                          <span
                            className="font-mono text-[12px] font-semibold tabular-nums"
                            style={{ color: overloaded ? "var(--color-fault)" : REDUCER_TONE[pi] }}
                          >
                            {n}
                          </span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {phase < 3 && <span className="font-mono text-[10px] text-fg-faint">waiting for shuffle…</span>}
                    {phase >= 3 && bucket.length === 0 && (
                      <span className="font-mono text-[10px] text-fg-faint">∅ idle</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---- skew read-out ---- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="emitted pairs" value={phase >= 1 ? totalPairs : 0} unit="(k,1)" tone="accent" />
        <Stat label="busiest reducer" value={phase >= 3 ? busiest : "—"} unit="recs" tone={skewed ? "fault" : "ok"} />
        <Stat label="skew factor" value={phase >= 3 ? skewFactor : "—"} unit="×" tone={skewed ? "warn" : "ok"} />
        <Stat
          label="est. wall-clock"
          value={phase >= 3 ? busiest * 8 : "—"}
          unit="ms"
          tone={skewed ? "fault" : "accent"}
        />
      </div>

      <div className="rounded-lg border border-line bg-ink-950/60 p-4 font-mono text-[12px] leading-relaxed text-fg-muted">
        {phase < 3 ? (
          <>
            Step through the phases with <span className="accent-text">Run next phase</span>. Watch <code>map()</code>{" "}
            light up its <code>(word, 1)</code> pairs, then the shuffle route each pair to{" "}
            <span style={{ color: "var(--accent-2)" }}>partition hash(key) % {reducers}</span> and sort it, before{" "}
            <code>reduce()</code> sums each key.
          </>
        ) : skewed ? (
          <>
            <span className="text-fault">Skew.</span> The hot key sends all its records to one reducer
            (hash routes a given key to a single partition), so reducer{" "}
            <span className="text-fg">{loads.indexOf(busiest)}</span> handles {busiest} records — a{" "}
            <span className="text-warn">{skewFactor}×</span> straggler — while the others finish early. The job&apos;s
            wall-clock is held hostage by that one reducer. A <span className="accent-text">skewed join</span> fixes
            this by spreading a hot key&apos;s records across all reducers; toggle the hot key off to rebalance.
          </>
        ) : (
          <>
            <span className="accent-text">Balanced run.</span> With no dominant key, each reducer handles a similar
            load (≈{idealLoad} records), so the job finishes in roughly the time of one reducer. Re-run it: the inputs
            never change, so the output is byte-for-byte identical — that determinism is what makes a failed task safe
            to simply re-run.
          </>
        )}
      </div>
    </div>
  );
}
