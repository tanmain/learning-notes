"use client";

import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Stat, Slider, Toggle } from "@/components/chapter";
import { IconReset, IconDatabase, IconStep } from "@/components/icons";

/* ------------------------------------------------------------------ model */

type Entry = { key: string; value: string; tombstone?: boolean };
type Segment = { id: number; entries: Entry[] };

/** Sample writes a user can fire in sequence — includes overwrites + a delete. */
const SCRIPT: Entry[] = [
  { key: "user:42", value: "alice" },
  { key: "cart:7", value: "2 items" },
  { key: "sku:99", value: "$19" },
  { key: "user:42", value: "alice2" }, // overwrite
  { key: "cart:7", value: "3 items" }, // overwrite
  { key: "sku:12", value: "$4" },
  { key: "sku:99", value: "", tombstone: true }, // delete
  { key: "user:88", value: "bob" },
];

type ReadTrace = {
  key: string;
  steps: { where: string; hit: boolean; value?: string; tombstone?: boolean }[];
  result: string;
};

function mergeSorted(older: Entry[], newer: Entry[]): Entry[] {
  // newer wins on key collision; result stays sorted by key (mergesort-style).
  const map = new Map<string, Entry>();
  for (const e of older) map.set(e.key, e);
  for (const e of newer) map.set(e.key, e); // newer overrides
  return [...map.values()]
    .filter((e) => !e.tombstone) // compaction drops tombstoned keys
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function LogStructuredDemo() {
  const [threshold, setThreshold] = useState<number>(3);
  const [showSorted, setShowSorted] = useState<boolean>(true);
  const [memtable, setMemtable] = useState<Entry[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [wal, setWal] = useState<number>(0); // write-ahead-log appends (durability)
  const [diskWrites, setDiskWrites] = useState<number>(0); // bytes-ish: flushes + compaction rewrites
  const [logicalWrites, setLogicalWrites] = useState<number>(0);
  const [trace, setTrace] = useState<ReadTrace | null>(null);
  const segId = useRef<number>(0);
  const scriptIdx = useRef<number>(0);

  /** memtable is conceptually a balanced tree → always shown sorted if toggled. */
  const memView = useMemo(() => {
    const arr = [...memtable];
    if (showSorted) arr.sort((a, b) => a.key.localeCompare(b.key));
    return arr;
  }, [memtable, showSorted]);

  const writeAmp = logicalWrites === 0 ? 0 : diskWrites / logicalWrites;

  /**
   * Flush a concrete memtable snapshot into a new immutable SSTable. Pure with
   * respect to React: no setter is nested inside another updater.
   */
  function flush(snapshot: Entry[]): void {
    if (snapshot.length === 0) return;
    const sorted = [...snapshot].sort((a, b) => a.key.localeCompare(b.key));
    segId.current += 1;
    const id = segId.current;
    setTrace(null);
    setSegments((segs) => [{ id, entries: sorted }, ...segs]);
    setDiskWrites((d) => d + sorted.length); // every entry rewritten to a fresh SSTable
    setMemtable([]);
  }

  function writeEntry(e: Entry): void {
    setTrace(null);
    setWal((w) => w + 1); // append to WAL first (crash recovery)
    setLogicalWrites((n) => n + 1);
    // memtable keeps one entry per key (it's a tree, not a log)
    const next = memtable.filter((x) => x.key !== e.key).concat(e);
    if (next.length >= threshold) {
      flush(next); // flush this exact snapshot, then memtable resets to empty
    } else {
      setMemtable(next);
    }
  }

  function writeNext(): void {
    const e = SCRIPT[scriptIdx.current % SCRIPT.length];
    scriptIdx.current += 1;
    writeEntry(e);
  }

  function compact(): void {
    if (segments.length < 2) return;
    setTrace(null);
    // segments[0] is newest. Merge ALL into one, newest values winning.
    const ordered = [...segments].reverse(); // oldest → newest
    let acc: Entry[] = [];
    for (const s of ordered) acc = mergeSorted(acc, s.entries);
    segId.current += 1;
    const id = segId.current;
    setDiskWrites((d) => d + acc.length); // compaction rewrites surviving entries
    setSegments([{ id, entries: acc }]);
  }

  function read(key: string): void {
    const steps: ReadTrace["steps"] = [];
    let result = "not found";

    // 1) memtable
    const inMem = memtable.find((e) => e.key === key);
    if (inMem) {
      steps.push({ where: "memtable", hit: true, value: inMem.value, tombstone: inMem.tombstone });
      result = inMem.tombstone ? "deleted (tombstone)" : inMem.value;
      setTrace({ key, steps, result });
      return;
    }
    steps.push({ where: "memtable", hit: false });

    // 2) segments newest → oldest
    for (const s of segments) {
      const found = s.entries.find((e) => e.key === key);
      if (found) {
        steps.push({ where: `SSTable #${s.id}`, hit: true, value: found.value, tombstone: found.tombstone });
        result = found.tombstone ? "deleted (tombstone)" : found.value;
        setTrace({ key, steps, result });
        return;
      }
      steps.push({ where: `SSTable #${s.id}`, hit: false });
    }
    setTrace({ key, steps, result });
  }

  function reset(): void {
    setMemtable([]);
    setSegments([]);
    setWal(0);
    setDiskWrites(0);
    setLogicalWrites(0);
    setTrace(null);
    segId.current = 0;
    scriptIdx.current = 0;
  }

  // distinct keys we can read (memtable + all segments)
  const readableKeys = useMemo(() => {
    const set = new Set<string>();
    memtable.forEach((e) => set.add(e.key));
    segments.forEach((s) => s.entries.forEach((e) => set.add(e.key)));
    set.add("ghost:0"); // a key guaranteed to miss → shows the worst case
    return [...set].sort();
  }, [memtable, segments]);

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={writeNext} variant="solid" size="sm">
          <IconStep size={14} /> Write next key
        </Button>
        <Button onClick={() => flush(memtable)} variant="outline" size="sm" disabled={memtable.length === 0}>
          Flush memtable → SSTable
        </Button>
        <Button onClick={compact} variant="outline" size="sm" disabled={segments.length < 2}>
          <IconDatabase size={14} /> Compact ({segments.length})
        </Button>
        <Button onClick={reset} variant="ghost" size="sm">
          <IconReset size={14} /> Reset
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Memtable flush threshold"
          value={threshold}
          min={2}
          max={6}
          step={1}
          onChange={setThreshold}
          format={(v) => `${v} keys`}
        />
        <div className="flex items-end">
          <Toggle label="Memtable kept sorted (tree)" checked={showSorted} onChange={setShowSorted} />
        </div>
      </div>

      {/* the engine */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        {/* RAM side */}
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-ink-900/60 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
                memtable · RAM
              </span>
              <span className="font-mono text-[10px] accent-text">
                {memtable.length}/{threshold}
              </span>
            </div>
            <div className="min-h-[120px] space-y-1.5">
              <AnimatePresence mode="popLayout">
                {memView.length === 0 && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-8 text-center font-mono text-xs text-fg-faint"
                  >
                    empty — write a key
                  </motion.p>
                )}
                {memView.map((e) => (
                  <motion.div
                    key={e.key}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center justify-between rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5"
                  >
                    <span className="font-mono text-xs accent-text">{e.key}</span>
                    <span className="font-mono text-xs text-fg-muted">
                      {e.tombstone ? "⌫ tombstone" : e.value}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-ink-950/60 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
                write-ahead log (durability)
              </span>
              <span className="font-mono text-xs text-info">{wal} appended</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {Array.from({ length: Math.min(wal, 24) }).map((_, i) => (
                <span key={i} className="h-2 w-2 rounded-[2px] bg-info/60" />
              ))}
            </div>
          </div>
        </div>

        {/* DISK side */}
        <div className="rounded-lg border border-line bg-ink-950/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
              disk · immutable SSTables (newest on top)
            </span>
            <span className="font-mono text-[10px] text-ok">{segments.length} segments</span>
          </div>
          <div className="min-h-[160px] space-y-2">
            <AnimatePresence mode="popLayout">
              {segments.length === 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-12 text-center font-mono text-xs text-fg-faint"
                >
                  no segments yet — flush the memtable
                </motion.p>
              )}
              {segments.map((s, idx) => (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: -16, scale: 0.96 }}
                  animate={{ opacity: idx === 0 ? 1 : 0.82, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="rounded-lg border border-ok/30 bg-ink-900/70 p-2.5"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-mono text-[10px] text-ok">SSTable #{s.id}</span>
                    <span className="font-mono text-[10px] text-fg-faint">sorted by key</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {s.entries.map((e) => (
                      <span
                        key={e.key}
                        className="rounded border border-line bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted"
                      >
                        {e.key}
                        <span className="text-fg-faint">·{e.tombstone ? "⌫" : e.value}</span>
                      </span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Logical writes" value={logicalWrites} tone="accent" />
        <Stat label="Physical disk writes" value={diskWrites} tone="warn" />
        <Stat label="Write amplification" value={writeAmp.toFixed(2)} unit="×" tone={writeAmp > 2 ? "fault" : "ok"} />
        <Stat label="Segments to scan" value={segments.length + 1} unit="max" tone="info" />
      </div>

      {/* read path */}
      <div className="rounded-lg border border-line bg-ink-900/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
            read path — get(key) checks newest → oldest
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {readableKeys.map((k) => (
            <Button key={k} onClick={() => read(k)} variant="ghost" size="sm">
              {k}
            </Button>
          ))}
        </div>

        <AnimatePresence>
          {trace && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-2">
                {trace.steps.map((st, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.12 }}
                    className={
                      "flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] " +
                      (st.hit
                        ? "border-ok/50 bg-ok/10 text-ok"
                        : "border-line bg-ink-850 text-fg-faint")
                    }
                  >
                    <span>{st.where}</span>
                    <span>{st.hit ? (st.tombstone ? "⌫ found" : "✓ hit") : "· miss"}</span>
                  </motion.div>
                ))}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: trace.steps.length * 0.12 }}
                  className="font-mono text-[11px] text-fg"
                >
                  → <span className="accent-text">{trace.result}</span>
                </motion.div>
              </div>
              <p className="mt-2 font-mono text-[10px] text-fg-faint">
                Checked {trace.steps.length} location{trace.steps.length === 1 ? "" : "s"}. Misses are why a
                miss is the slow case — a Bloom filter would short-circuit most of these.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
