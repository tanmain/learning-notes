"use client";

import { useMemo, useReducer } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Slider, Stat, SegmentedControl } from "@/components/chapter";
import { IconStep, IconReset, IconBolt } from "@/components/icons";

/**
 * EngineRace — fire the SAME stream of writes into BOTH a log-structured
 * (LSM) engine and a page-oriented (B-tree) engine at once, and watch the two
 * pay for it differently: sequential appends + background compaction vs. random
 * in-place page overwrites + splits. The point the chapter makes in prose and a
 * static table — "the same job, opposite bets" — made driveable.
 */

/* --------------------------------------------------------------- shared keys */

/** A scripted, interesting workload: news inserts, overwrites, a delete. */
const SCRIPT: { key: number; kind: "put" | "del" }[] = [
  { key: 50, kind: "put" },
  { key: 25, kind: "put" },
  { key: 75, kind: "put" },
  { key: 25, kind: "put" }, // overwrite
  { key: 10, kind: "put" },
  { key: 60, kind: "put" },
  { key: 90, kind: "put" },
  { key: 50, kind: "del" }, // delete
  { key: 40, kind: "put" },
  { key: 30, kind: "put" },
  { key: 75, kind: "put" }, // overwrite
  { key: 85, kind: "put" },
];

type Op = "sequential" | "random";

/* ----------------------------------------------------------------- LSM model */

type Entry = { key: number; del?: boolean };
type Segment = { id: number; entries: Entry[] };

type LsmState = {
  memtable: Entry[];
  segments: Segment[]; // newest first
  segId: number;
  wal: number; // sequential WAL appends
  physical: number; // physical entry-writes to disk (flush + compaction)
  seqWrites: number; // sequential I/O operations
  randWrites: number; // random I/O operations (LSM ≈ 0)
};

function lsmInit(): LsmState {
  return { memtable: [], segments: [], segId: 0, wal: 0, physical: 0, seqWrites: 0, randWrites: 0 };
}

function lsmFlush(s: LsmState): LsmState {
  if (s.memtable.length === 0) return s;
  const sorted = [...s.memtable].sort((a, b) => a.key - b.key);
  const segId = s.segId + 1;
  return {
    ...s,
    segId,
    memtable: [],
    segments: [{ id: segId, entries: sorted }, ...s.segments],
    physical: s.physical + sorted.length, // whole segment streamed out sequentially
    seqWrites: s.seqWrites + 1,
  };
}

function lsmWrite(state: LsmState, op: { key: number; kind: "put" | "del" }, threshold: number): LsmState {
  // Append to WAL (sequential), then update the in-memory sorted tree.
  let s: LsmState = { ...state, wal: state.wal + 1 };
  const next = s.memtable.filter((e) => e.key !== op.key);
  next.push({ key: op.key, del: op.kind === "del" });
  s = { ...s, memtable: next };
  if (next.length >= threshold) s = lsmFlush(s);
  return s;
}

function lsmCompact(state: LsmState): LsmState {
  if (state.segments.length < 2) return state;
  const ordered = [...state.segments].reverse(); // oldest → newest
  const map = new Map<number, Entry>();
  for (const seg of ordered) for (const e of seg.entries) map.set(e.key, e);
  const merged = [...map.values()].filter((e) => !e.del).sort((a, b) => a.key - b.key);
  const segId = state.segId + 1;
  return {
    ...state,
    segId,
    segments: [{ id: segId, entries: merged }],
    physical: state.physical + merged.length, // surviving entries rewritten
    seqWrites: state.seqWrites + 1,
  };
}

/* --------------------------------------------------------------- B-tree model */

type Leaf = { id: number; keys: number[] };

type BtState = {
  leaves: Leaf[];
  leafId: number;
  pageWrites: number; // physical 4 KB page writes
  wal: number;
  splits: number;
  seqWrites: number; // B-tree ≈ 0 (only the WAL is sequential-ish)
  randWrites: number; // page overwrites are random I/O
  touched: number[]; // ids touched on the last op
};

function btInit(): BtState {
  return { leaves: [{ id: 0, keys: [] }], leafId: 1, pageWrites: 0, wal: 0, splits: 0, seqWrites: 0, randWrites: 0, touched: [] };
}

function btWrite(state: BtState, op: { key: number; kind: "put" | "del" }, order: number): BtState {
  const leaves = state.leaves.map((l) => ({ ...l, keys: [...l.keys] }));

  // locate target leaf by key range
  let target = 0;
  for (let i = 0; i < leaves.length; i++) {
    const min = leaves[i].keys[0] ?? -Infinity;
    if (op.key >= min) target = i;
  }
  if (leaves.length && op.key < (leaves[0].keys[0] ?? Infinity)) target = 0;

  const leaf = leaves[target];
  let pageWrites = 0;
  let splits = state.splits;
  let touched: number[] = [];
  let leafId = state.leafId;

  if (op.kind === "del") {
    if (leaf.keys.includes(op.key)) {
      leaf.keys = leaf.keys.filter((k) => k !== op.key);
      pageWrites = 1; // rewrite the one page in place
      touched = [leaf.id];
    } else {
      pageWrites = 1; // still touch the page to confirm (kept simple)
      touched = [leaf.id];
    }
  } else if (leaf.keys.includes(op.key)) {
    // overwrite in place → exactly ONE page write
    pageWrites = 1;
    touched = [leaf.id];
  } else {
    leaf.keys = [...leaf.keys, op.key].sort((a, b) => a - b);
    if (leaf.keys.length > order) {
      // split: write two halves + overwrite the parent
      const mid = Math.ceil(leaf.keys.length / 2);
      const left = leaf.keys.slice(0, mid);
      const right = leaf.keys.slice(mid);
      leaf.keys = left;
      const newLeaf: Leaf = { id: leafId++, keys: right };
      leaves.splice(target + 1, 0, newLeaf);
      leaves.sort((a, b) => (a.keys[0] ?? 0) - (b.keys[0] ?? 0));
      splits += 1;
      pageWrites = 3;
      touched = [leaf.id, newLeaf.id];
    } else {
      pageWrites = 1;
      touched = [leaf.id];
    }
  }

  return {
    ...state,
    leaves,
    leafId,
    splits,
    touched,
    pageWrites: state.pageWrites + pageWrites,
    randWrites: state.randWrites + pageWrites, // every page write is a random seek
    wal: state.wal + 1, // redo-log append before the page mutation
  };
}

/* ---------------------------------------------------------------- combined */

type State = {
  cursor: number;
  threshold: number; // memtable flush threshold
  order: number; // B-tree keys per page
  autoCompact: boolean;
  lsm: LsmState;
  bt: BtState;
  lastKey: number | null;
  lastKind: "put" | "del" | null;
};

type Action =
  | { type: "step" }
  | { type: "compact" }
  | { type: "reset" }
  | { type: "setThreshold"; v: number }
  | { type: "setOrder"; v: number }
  | { type: "setAuto"; v: boolean };

function init(threshold = 3, order = 4, autoCompact = false): State {
  return { cursor: 0, threshold, order, autoCompact, lsm: lsmInit(), bt: btInit(), lastKey: null, lastKind: null };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return init(state.threshold, state.order, state.autoCompact);
    case "setThreshold":
      return init(action.v, state.order, state.autoCompact);
    case "setOrder":
      return init(state.threshold, action.v, state.autoCompact);
    case "setAuto":
      return { ...state, autoCompact: action.v };
    case "compact":
      return { ...state, lsm: lsmCompact(state.lsm) };
    case "step": {
      const op = SCRIPT[state.cursor % SCRIPT.length];
      let lsm = lsmWrite(state.lsm, op, state.threshold);
      const bt = btWrite(state.bt, op, state.order);
      // optional: auto-compaction kicks in once a few segments pile up
      if (state.autoCompact && lsm.segments.length >= 3) lsm = lsmCompact(lsm);
      return { ...state, cursor: state.cursor + 1, lsm, bt, lastKey: op.key, lastKind: op.kind };
    }
    default:
      return state;
  }
}

/* --------------------------------------------------------------- component */

export function EngineRace() {
  const [state, dispatch] = useReducer(reducer, undefined, () => init());
  const { lsm, bt } = state;

  const lsmLogical = state.cursor;
  const btLogical = state.cursor;
  const lsmAmp = lsmLogical === 0 ? 0 : lsm.physical / lsmLogical;
  const btAmp = btLogical === 0 ? 0 : bt.pageWrites / btLogical;

  const btSeparators = useMemo(() => bt.leaves.slice(1).map((l) => l.keys[0] ?? 0), [bt.leaves]);
  const totalSteps = SCRIPT.length;
  const finished = state.cursor >= totalSteps;

  // who currently wins each metric (lower is better for amplification)
  const ampWinner = lsmAmp === btAmp ? null : lsmAmp < btAmp ? "lsm" : "bt";

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => dispatch({ type: "step" })} variant="solid" size="sm" disabled={finished}>
          <IconStep size={14} /> {state.cursor === 0 ? "Write first key" : "Write next key"}
        </Button>
        <Button
          onClick={() => dispatch({ type: "compact" })}
          variant="outline"
          size="sm"
          disabled={lsm.segments.length < 2}
        >
          <IconBolt size={14} /> Compact LSM ({lsm.segments.length})
        </Button>
        <Button onClick={() => dispatch({ type: "reset" })} variant="ghost" size="sm">
          <IconReset size={14} /> Reset
        </Button>
        <span className="font-mono text-[11px] text-fg-faint">
          step {Math.min(state.cursor, totalSteps)} / {totalSteps}
        </span>
      </div>

      {/* the key being written — the SAME op goes to both engines */}
      <div className="flex items-center gap-3 rounded-lg border border-line bg-ink-950/40 px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">same write →</span>
        <AnimatePresence mode="wait">
          {state.lastKey === null ? (
            <motion.span
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-mono text-xs text-fg-faint"
            >
              press “Write next key” to fan one operation into both engines
            </motion.span>
          ) : (
            <motion.span
              key={`${state.cursor}-${state.lastKey}`}
              initial={{ opacity: 0, scale: 0.7, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className={
                "rounded-md border px-3 py-1 font-mono text-sm font-bold " +
                (state.lastKind === "del"
                  ? "border-fault/50 bg-fault/10 text-fault"
                  : "border-accent/50 bg-accent/10 accent-text")
              }
            >
              {state.lastKind === "del" ? `delete(${state.lastKey})` : `put(${state.lastKey})`}
            </motion.span>
          )}
        </AnimatePresence>
        <span className="ml-auto hidden font-mono text-[10px] text-fg-faint sm:inline">
          identical workload · two storage engines
        </span>
      </div>

      {/* knobs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Slider
          label="LSM memtable flush"
          value={state.threshold}
          min={2}
          max={6}
          step={1}
          onChange={(v) => dispatch({ type: "setThreshold", v })}
          format={(v) => `${v} keys`}
        />
        <Slider
          label="B-tree keys / page"
          value={state.order}
          min={3}
          max={6}
          step={1}
          onChange={(v) => dispatch({ type: "setOrder", v })}
          format={(v) => `${v} keys`}
        />
        <div className="flex items-end pb-1">
          <SegmentedControl<"manual" | "auto">
            value={state.autoCompact ? "auto" : "manual"}
            onChange={(v) => dispatch({ type: "setAuto", v: v === "auto" })}
            options={[
              { label: "Manual compact", value: "manual" },
              { label: "Auto compact", value: "auto" },
            ]}
          />
        </div>
      </div>

      {/* side-by-side engines */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------------- LSM column ---------------- */}
        <div className="rounded-lg border border-accent/30 bg-ink-950/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider accent-text">
              Log-structured (LSM)
            </span>
            <span className="font-mono text-[10px] text-fg-faint">append · merge</span>
          </div>

          {/* memtable */}
          <div className="mb-3 rounded-md border border-accent/40 bg-accent/5 p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-wider text-fg-faint">memtable · RAM</span>
              <span className="font-mono text-[9px] accent-text">
                {lsm.memtable.length}/{state.threshold}
              </span>
            </div>
            <div className="flex min-h-[26px] flex-wrap gap-1">
              <AnimatePresence mode="popLayout">
                {lsm.memtable.length === 0 && (
                  <motion.span
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="font-mono text-[10px] text-fg-faint"
                  >
                    flushed — empty
                  </motion.span>
                )}
                {[...lsm.memtable]
                  .sort((a, b) => a.key - b.key)
                  .map((e) => (
                    <motion.span
                      key={e.key}
                      layout
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className={
                        "rounded px-1.5 py-0.5 font-mono text-[11px] " +
                        (e.del ? "bg-fault/15 text-fault" : "bg-ink-800 text-fg")
                      }
                    >
                      {e.key}
                      {e.del && "⌫"}
                    </motion.span>
                  ))}
              </AnimatePresence>
            </div>
          </div>

          {/* segments on disk */}
          <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-fg-faint">
            disk · immutable SSTables (newest top)
          </div>
          <div className="min-h-[120px] space-y-1.5">
            <AnimatePresence mode="popLayout">
              {lsm.segments.length === 0 && (
                <motion.p
                  key="noseg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-6 text-center font-mono text-[10px] text-fg-faint"
                >
                  no segments yet
                </motion.p>
              )}
              {lsm.segments.map((s, idx) => (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: -12, scale: 0.96 }}
                  animate={{ opacity: idx === 0 ? 1 : 0.7, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="rounded-md border border-ok/30 bg-ink-900/70 p-2"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-[9px] text-ok">SSTable #{s.id}</span>
                    <span className="font-mono text-[9px] text-fg-faint">sorted</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {s.entries.map((e) => (
                      <span
                        key={e.key}
                        className={
                          "rounded border border-line bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] " +
                          (e.del ? "text-fault" : "text-fg-muted")
                        }
                      >
                        {e.key}
                        {e.del && "⌫"}
                      </span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat label="Sequential I/O" value={lsm.seqWrites} tone="ok" />
            <MiniStat label="Random I/O" value={lsm.randWrites} tone="ok" />
          </div>
        </div>

        {/* ---------------- B-tree column ---------------- */}
        <div className="rounded-lg border border-special/30 bg-ink-950/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span
              className="font-mono text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--color-special)" }}
            >
              Page-oriented (B-tree)
            </span>
            <span className="font-mono text-[10px] text-fg-faint">overwrite · split</span>
          </div>

          {/* root */}
          <div className="mb-3 flex justify-center">
            <div className="rounded-md border border-special/50 px-2.5 py-1.5" style={{ background: "color-mix(in oklab, var(--color-special) 10%, transparent)" }}>
              <div className="mb-0.5 text-center font-mono text-[8px] uppercase tracking-wider" style={{ color: "var(--color-special)" }}>
                root page
              </div>
              <div className="flex items-center gap-1">
                {btSeparators.length === 0 ? (
                  <span className="font-mono text-[10px] text-fg-muted">→ one leaf</span>
                ) : (
                  btSeparators.map((s, i) => (
                    <span key={i} className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-fg">
                      &lt;{s}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* leaves */}
          <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-fg-faint">
            disk · fixed 4&nbsp;KB pages (overwritten in place)
          </div>
          <div className="flex min-h-[120px] flex-wrap content-start gap-1.5">
            <AnimatePresence mode="popLayout">
              {bt.leaves.map((leaf) => {
                const touched = bt.touched.includes(leaf.id);
                const full = leaf.keys.length >= state.order;
                return (
                  <motion.div
                    key={leaf.id}
                    layout
                    initial={{ opacity: 0, y: 12, scale: 0.92 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      borderColor: touched
                        ? "var(--color-special)"
                        : full
                          ? "var(--color-warn)"
                          : "var(--color-line)",
                    }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3 }}
                    className="min-w-[78px] rounded-md border bg-ink-900/70 p-2"
                  >
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <span className="font-mono text-[8px] text-fg-faint">leaf {leaf.id}</span>
                      {touched && (
                        <span className="font-mono text-[8px]" style={{ color: "var(--color-special)" }}>
                          rewritten
                        </span>
                      )}
                      {!touched && full && <span className="font-mono text-[8px] text-warn">full</span>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {leaf.keys.length === 0 && <span className="font-mono text-[10px] text-fg-faint">empty</span>}
                      {leaf.keys.map((k) => (
                        <motion.span
                          key={k}
                          layout
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-fg"
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

          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat label="Sequential I/O" value={bt.seqWrites} tone="warn" />
            <MiniStat label="Random I/O" value={bt.randWrites} tone="warn" />
          </div>
        </div>
      </div>

      {/* the scoreboard */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Logical writes" value={lsmLogical} tone="accent" />
        <Stat
          label="LSM write amp."
          value={lsmAmp.toFixed(2)}
          unit="×"
          tone={ampWinner === "lsm" ? "ok" : "warn"}
        />
        <Stat
          label="B-tree write amp."
          value={btAmp.toFixed(2)}
          unit="×"
          tone={ampWinner === "bt" ? "ok" : "warn"}
        />
        <Stat label="B-tree splits" value={bt.splits} tone="special" />
      </div>

      {/* amplification bars */}
      <div className="space-y-2 rounded-lg border border-line bg-ink-900/40 p-4">
        <div className="kicker mb-1">Physical writes per logical write</div>
        <AmpBar label="LSM" amp={lsmAmp} color="var(--accent)" />
        <AmpBar label="B-tree" amp={btAmp} color="var(--color-special)" />
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-fg-faint">
          The LSM turns every write into a <span className="text-ok">sequential</span> WAL append, then streams
          whole sorted segments out at flush time; its amplification spikes only when{" "}
          <span className="accent-text">compaction</span> rewrites surviving entries. The B-tree does a{" "}
          <span style={{ color: "var(--color-special)" }}>random</span> in-place page overwrite per write — usually
          one page, but a <span className="text-warn">split</span> rewrites two halves plus the parent. Drive the
          workload and watch which bet wins for this access pattern.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- sub-views */

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" }) {
  const color = tone === "ok" ? "var(--color-ok)" : "var(--color-warn)";
  return (
    <div className="rounded-md border border-line bg-ink-850 px-2.5 py-1.5">
      <div className="font-mono text-[8px] uppercase tracking-wider text-fg-faint">{label}</div>
      <div className="font-mono text-base font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function AmpBar({ label, amp, color }: { label: string; amp: number; color: string }) {
  // scale: cap the bar at 4x for layout; show the real number to the right
  const pct = Math.min(amp / 4, 1) * 100;
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 font-mono text-[10px] text-fg-faint">{label}</span>
      <div className="h-4 flex-1 overflow-hidden rounded bg-ink-800">
        <motion.div
          className="h-full rounded"
          style={{ background: color }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        />
      </div>
      <span className="w-12 text-right font-mono text-[10px] tabular-nums text-fg-muted">{amp.toFixed(2)}×</span>
    </div>
  );
}
