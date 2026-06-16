"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, SegmentedControl, Stat, Toggle } from "@/components/chapter";
import { IconReset, IconStep } from "@/components/icons";

/**
 * Interactive MapReduce visualizer over a word-count job.
 *
 * The four-step pipeline from the chapter:
 *   1. read input, split into records (lines -> words)
 *   2. map(): emit (word, 1) for every word
 *   3. shuffle: partition by hash(key) % R, then sort by key
 *   4. reduce(): sum the 1s per key
 *
 * The user controls the number of reducers, can step the pipeline forward,
 * and can "kill" a reducer mid-run to show that — because inputs are
 * immutable and tasks are pure — the framework just re-runs the task and the
 * result is identical. The Unix equivalent (sort | uniq -c) is shown alongside.
 */

type Phase = 0 | 1 | 2 | 3;
const PHASES: { label: string; value: string }[] = [
  { label: "1 · Input", value: "0" },
  { label: "2 · Map", value: "1" },
  { label: "3 · Shuffle", value: "2" },
  { label: "4 · Reduce", value: "3" },
];

const DATASETS: Record<string, string> = {
  pages: "home about home\nhome pricing about\npricing home",
  fruit: "fig kiwi fig\nkiwi fig plum\nplum fig kiwi",
};

// Stable, deterministic string hash so partition assignment never wobbles.
function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const REDUCER_TONE = ["var(--accent)", "var(--accent-2)", "var(--color-info)"];

export function MapReduceDemo() {
  const [datasetKey, setDatasetKey] = useState<keyof typeof DATASETS>("pages");
  const [reducers, setReducers] = useState<2 | 3>(2);
  const [phase, setPhase] = useState<Phase>(0);
  const [killed, setKilled] = useState<number | null>(null);
  const [showUnix, setShowUnix] = useState(true);

  const text = DATASETS[datasetKey];
  const lines = useMemo(() => text.split("\n").map((l) => l.trim()).filter(Boolean), [text]);

  // map step: every word -> (word, 1), kept grouped by source line for the viz
  const mapped = useMemo(
    () =>
      lines.map((line, li) =>
        line.split(/\s+/).map((w, wi) => ({ key: w, value: 1, id: `${li}-${wi}` }))
      ),
    [lines]
  );
  const flatMapped = useMemo(() => mapped.flat(), [mapped]);

  // shuffle: assign each key to a reducer partition, then sort within partition
  const partitions = useMemo(() => {
    const buckets: { key: string; value: number }[][] = Array.from({ length: reducers }, () => []);
    for (const kv of flatMapped) {
      const p = hashKey(kv.key) % reducers;
      buckets[p].push({ key: kv.key, value: kv.value });
    }
    return buckets.map((b) => b.sort((a, c) => a.key.localeCompare(c.key)));
  }, [flatMapped, reducers]);

  // reduce: sum per key inside each partition
  const reduced = useMemo(
    () =>
      partitions.map((b) => {
        const m = new Map<string, number>();
        for (const kv of b) m.set(kv.key, (m.get(kv.key) ?? 0) + kv.value);
        return [...m.entries()].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0]));
      }),
    [partitions]
  );

  const reset = () => {
    setPhase(0);
    setKilled(null);
  };
  const step = () => setPhase((p) => (p < 3 ? ((p + 1) as Phase) : p));

  const unixOut = useMemo(() => {
    const m = new Map<string, number>();
    for (const kv of flatMapped) m.set(kv.key, (m.get(kv.key) ?? 0) + 1);
    return [...m.entries()].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0]));
  }, [flatMapped]);

  const totalRecords = flatMapped.length;
  const distinctKeys = new Set(flatMapped.map((k) => k.key)).size;

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <div className="kicker mb-1.5">Input dataset</div>
          <SegmentedControl
            value={datasetKey}
            onChange={(v) => {
              setDatasetKey(v as keyof typeof DATASETS);
              reset();
            }}
            options={[
              { label: "page hits", value: "pages" },
              { label: "fruit log", value: "fruit" },
            ]}
          />
        </div>
        <div>
          <div className="kicker mb-1.5">Reducers (R)</div>
          <SegmentedControl
            value={String(reducers)}
            onChange={(v) => {
              setReducers(Number(v) as 2 | 3);
              reset();
            }}
            options={[
              { label: "2", value: "2" },
              { label: "3", value: "3" },
            ]}
          />
        </div>
        <Toggle label="Show Unix pipe" checked={showUnix} onChange={setShowUnix} />
      </div>

      {/* phase tracker */}
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl value={String(phase)} onChange={(v) => setPhase(Number(v) as Phase)} options={PHASES} />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={step} disabled={phase === 3}>
            <IconStep size={14} /> Step
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            <IconReset size={14} /> Reset
          </Button>
        </div>
      </div>

      {/* stat strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="input records" value={lines.length} unit="lines" tone="info" />
        <Stat label="emitted pairs" value={phase >= 1 ? totalRecords : 0} unit="(k,1)" tone="accent" />
        <Stat label="distinct keys" value={phase >= 2 ? distinctKeys : "—"} tone="special" />
        <Stat
          label="reduce outputs"
          value={phase >= 3 ? reduced.reduce((n, b) => n + b.length, 0) : "—"}
          tone="ok"
        />
      </div>

      {/* the pipeline board */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.1fr]">
        {/* INPUT + MAP */}
        <div className="instrument p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs accent-text">map()</span>
            <span className="font-mono text-[10px] text-fg-faint">{lines.length} mappers</span>
          </div>
          <div className="space-y-2.5">
            {mapped.map((pairs, li) => (
              <div key={li} className="rounded-md border border-line bg-ink-950/60 p-2">
                <div className="mb-1.5 font-mono text-[10px] text-fg-faint">line {li}: {lines[li]}</div>
                <div className="flex flex-wrap gap-1.5">
                  {pairs.map((kv) => (
                    <motion.span
                      key={kv.id}
                      initial={false}
                      animate={{
                        opacity: phase >= 1 ? 1 : 0.25,
                        scale: phase >= 1 ? 1 : 0.9,
                      }}
                      transition={{ duration: 0.3 }}
                      className="rounded border border-line bg-ink-850 px-1.5 py-0.5 font-mono text-[11px]"
                    >
                      <span className="text-fg">{kv.key}</span>
                      <span className="text-fg-faint">,{kv.value}</span>
                    </motion.span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SHUFFLE / PARTITIONS */}
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
                        key={`${kv.key}-${i}`}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25, delay: i * 0.03 }}
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
              const isKilled = killed === pi;
              return (
                <div
                  key={pi}
                  className="rounded-md border p-2"
                  style={{
                    borderColor: isKilled
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
                      <button
                        type="button"
                        onClick={() => setKilled(isKilled ? null : pi)}
                        className="font-mono text-[9px] uppercase tracking-wider transition-colors"
                        style={{ color: isKilled ? "var(--color-ok)" : "var(--color-fault)" }}
                      >
                        {isKilled ? "↻ re-run" : "✕ kill task"}
                      </button>
                    )}
                  </div>
                  {isKilled ? (
                    <div className="font-mono text-[10px] leading-relaxed text-fault">
                      task died mid-run. input is unchanged on HDFS, so the scheduler reschedules it
                      elsewhere — same input, same output.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <AnimatePresence>
                        {(phase >= 3 ? bucket : []).map(([k, n], i) => (
                          <motion.div
                            key={k}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3, delay: i * 0.05 }}
                            className="flex items-center justify-between rounded bg-ink-850 px-2 py-1"
                          >
                            <span className="font-mono text-[12px] text-fg">{k}</span>
                            <span
                              className="font-mono text-[12px] font-semibold tabular-nums"
                              style={{ color: REDUCER_TONE[pi] }}
                            >
                              {n}
                            </span>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {phase < 3 && <span className="font-mono text-[10px] text-fg-faint">waiting for shuffle…</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Unix equivalent */}
      <AnimatePresence>
        {showUnix && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border border-line bg-ink-950/70 p-4">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
                the same job, in one Unix pipe
              </div>
              <pre className="overflow-x-auto font-mono text-[12px] leading-relaxed text-fg/90">
                {`cat hits.log | tr ' ' '\\n' | sort | uniq -c | sort -rn`}
              </pre>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] text-fg-faint">→</span>
                {unixOut.map(([k, n]) => (
                  <span
                    key={k}
                    className="rounded border border-line bg-ink-850 px-2 py-0.5 font-mono text-[11px]"
                  >
                    <span className="text-fg-faint">{n}</span> <span className="text-fg">{k}</span>
                  </span>
                ))}
              </div>
              <div className="mt-3 font-mono text-[11px] leading-relaxed text-fg-muted">
                <span className="accent-text">sort</span> plays the role of shuffle: it groups identical keys
                so <span className="accent-text">uniq -c</span> can count each run. MapReduce just spreads that
                same sort across many machines and partitions.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
