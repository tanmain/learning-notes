"use client";

import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Slider, Stat } from "@/components/chapter";
import { IconReset, IconStep } from "@/components/icons";

/* ------------------------------------------------------------------ model */

type Leaf = { id: number; keys: number[] };

const MAX_BRANCH = 6;

/** Keys to insert in a fixed-but-interesting order (forces a couple of splits). */
const SCRIPT = [25, 12, 40, 8, 30, 50, 18, 45, 35, 5, 22, 48, 15];

export function BTreeDemo() {
  const [order, setOrder] = useState<number>(4); // max keys per leaf before split
  const [leaves, setLeaves] = useState<Leaf[]>([{ id: 0, keys: [] }]);
  const [pageWrites, setPageWrites] = useState<number>(0);
  const [logical, setLogical] = useState<number>(0);
  const [splits, setSplits] = useState<number>(0);
  const [walFsyncs, setWalFsyncs] = useState<number>(0);
  const [lastTouched, setLastTouched] = useState<number[]>([]);
  const leafId = useRef<number>(1);
  const scriptIdx = useRef<number>(0);

  /** root holds the separator keys = first key of each leaf after the first. */
  const separators = useMemo(() => leaves.slice(1).map((l) => l.keys[0] ?? 0), [leaves]);

  function insert(value: number): void {
    // pure computation from the current render's `leaves`, then commit setters once
    const next = leaves.map((l) => ({ ...l, keys: [...l.keys] }));

    // find target leaf by key range
    let target = 0;
    for (let i = 0; i < next.length; i++) {
      const min = next[i].keys[0] ?? -Infinity;
      if (value >= min) target = i;
    }
    // a value smaller than everything goes to the leftmost leaf
    if (next.length && value < (next[0].keys[0] ?? Infinity)) target = 0;

    setLogical((n) => n + 1);
    setWalFsyncs((n) => n + 1); // WAL append before touching pages (crash safety)

    const leaf = next[target];
    if (leaf.keys.includes(value)) {
      // overwrite in place → exactly ONE page write
      setLastTouched([leaf.id]);
      setPageWrites((w) => w + 1);
      setLeaves(next);
      return;
    }

    leaf.keys = [...leaf.keys, value].sort((a, b) => a - b);

    if (leaf.keys.length > order) {
      // split → write the two halves + overwrite the parent (root)
      const mid = Math.ceil(leaf.keys.length / 2);
      const left = leaf.keys.slice(0, mid);
      const right = leaf.keys.slice(mid);
      leaf.keys = left;
      const newLeaf: Leaf = { id: leafId.current++, keys: right };
      next.splice(target + 1, 0, newLeaf);
      next.sort((a, b) => (a.keys[0] ?? 0) - (b.keys[0] ?? 0));
      setSplits((s) => s + 1);
      setPageWrites((w) => w + 3); // two split pages + parent overwrite
      setLastTouched([leaf.id, newLeaf.id]);
    } else {
      setPageWrites((w) => w + 1); // single in-place page overwrite
      setLastTouched([leaf.id]);
    }
    setLeaves(next);
  }

  function insertNext(): void {
    const v = SCRIPT[scriptIdx.current % SCRIPT.length];
    scriptIdx.current += 1;
    insert(v);
  }

  function reset(): void {
    setLeaves([{ id: 0, keys: [] }]);
    setPageWrites(0);
    setLogical(0);
    setSplits(0);
    setWalFsyncs(0);
    setLastTouched([]);
    leafId.current = 1;
    scriptIdx.current = 0;
  }

  const amp = logical === 0 ? 0 : pageWrites / logical;
  const depth = leaves.length <= 1 ? 1 : 2;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={insertNext} variant="solid" size="sm">
          <IconStep size={14} /> Insert next key
        </Button>
        <Button onClick={reset} variant="ghost" size="sm">
          <IconReset size={14} /> Reset
        </Button>
        <span className="font-mono text-[11px] text-fg-faint">
          fixed-size 4&nbsp;KB pages · overwritten in place
        </span>
      </div>

      <Slider
        label="Branching factor (keys per page)"
        value={order}
        min={3}
        max={MAX_BRANCH}
        step={1}
        onChange={setOrder}
        format={(v) => `${v} keys`}
      />

      {/* tree diagram */}
      <div className="rounded-lg border border-line bg-ink-950/40 p-5">
        {/* root */}
        <div className="mb-6 flex justify-center">
          <div className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-2">
            <div className="mb-1 text-center font-mono text-[9px] uppercase tracking-wider accent-text">
              root page
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-fg-faint">·</span>
              {separators.length === 0 && (
                <span className="px-2 font-mono text-[11px] text-fg-muted">
                  (points to one leaf)
                </span>
              )}
              {separators.map((s, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-fg">
                    &lt;{s}
                  </span>
                  <span className="font-mono text-[10px] text-fg-faint">·</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* connectors + leaves */}
        <div className="flex flex-wrap justify-center gap-3">
          <AnimatePresence mode="popLayout">
            {leaves.map((leaf) => {
              const touched = lastTouched.includes(leaf.id);
              const full = leaf.keys.length >= order;
              return (
                <motion.div
                  key={leaf.id}
                  layout
                  initial={{ opacity: 0, y: 14, scale: 0.92 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    borderColor: touched
                      ? "var(--accent)"
                      : full
                        ? "var(--color-warn)"
                        : "var(--color-line)",
                  }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.35 }}
                  className="min-w-[92px] rounded-lg border bg-ink-900/70 p-2.5"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="font-mono text-[9px] text-fg-faint">leaf {leaf.id}</span>
                    {touched && <span className="font-mono text-[9px] accent-text">overwritten</span>}
                    {!touched && full && <span className="font-mono text-[9px] text-warn">full</span>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {leaf.keys.length === 0 && (
                      <span className="font-mono text-[10px] text-fg-faint">empty</span>
                    )}
                    {leaf.keys.map((k) => (
                      <motion.span
                        key={k}
                        layout
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-fg"
                      >
                        {k}
                      </motion.span>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Logical writes" value={logical} tone="accent" />
        <Stat label="Page overwrites" value={pageWrites} tone="warn" />
        <Stat label="Write amplification" value={amp.toFixed(2)} unit="×" tone={amp > 2 ? "warn" : "ok"} />
        <Stat label="Tree depth" value={depth} unit={`O(log n)`} tone="info" />
      </div>

      <p className="font-mono text-[11px] leading-relaxed text-fg-faint">
        A plain update touches exactly <span className="accent-text">one page</span> in place. A split is the
        expensive case: it rewrites the two halves <span className="text-warn">plus the parent</span> — and is
        why a <span className="text-info">write-ahead log</span> ({walFsyncs} fsyncs so far) exists, so a crash
        mid-split can&apos;t corrupt the tree. Splits so far: <span className="text-warn">{splits}</span>.
      </p>
    </div>
  );
}
