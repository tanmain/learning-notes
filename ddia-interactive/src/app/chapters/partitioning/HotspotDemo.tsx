"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Slider, Stat, SegmentedControl } from "@/components/chapter";
import { hash32 } from "./hashing";

/* -------------------------------------------------------------- model ----- */

const PARTITIONS = 8;
const SAMPLE = 2000; // writes simulated per render

type Strategy = "range" | "hash";
type Workload = "sequential" | "uniform" | "hot";

const COLORS = [
  "#7d74f2",
  "#f5903d",
  "#34d399",
  "#60a5fa",
  "#c084fc",
  "#fb7185",
  "#fbbf24",
  "#22d3ee",
];

/**
 * Decide the partition for a generated key under the chosen strategy.
 * - range: partition = floor(keySpacePosition * P)  → adjacent keys cluster
 * - hash : partition = hash(key) % P                → adjacent keys scatter
 */
function partitionFor(key: string, pos01: number, strategy: Strategy): number {
  if (strategy === "range") {
    return Math.min(PARTITIONS - 1, Math.floor(pos01 * PARTITIONS));
  }
  return hash32(key) % PARTITIONS;
}

/**
 * Generate a deterministic-ish workload of writes and tally writes/partition.
 * `seed` lets the picture re-roll without being random across renders mid-frame.
 */
function simulate(
  workload: Workload,
  strategy: Strategy,
  saltBuckets: number,
  seed: number
): { counts: number[]; hotKeyShare: number } {
  const counts = new Array<number>(PARTITIONS).fill(0);
  // simple LCG for repeatable pseudo-randomness
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };

  for (let i = 0; i < SAMPLE; i++) {
    let key: string;
    let pos01: number;

    if (workload === "sequential") {
      // Monotonically increasing key (timestamp / auto-increment id). The
      // *current* writes all land at the high END of the key space — today's
      // rows — so under range partitioning they pile into the last partition
      // (the classic write hot spot). A tiny jitter keeps it from being a
      // single point. Under hashing, these same keys scatter uniformly.
      const ts = 1_700_000_000 + i;
      key = `evt:${ts}`;
      pos01 = 0.92 + (i / SAMPLE) * 0.08; // recent window: top ~8% of the range
    } else if (workload === "uniform") {
      pos01 = rnd();
      key = `k:${Math.floor(pos01 * 1e9)}`;
    } else {
      // 70% of writes hammer ONE celebrity key; the rest are uniform
      const isHot = rnd() < 0.7;
      if (isHot) {
        const bucket = saltBuckets > 1 ? Math.floor(rnd() * saltBuckets) : 0;
        key = saltBuckets > 1 ? `celeb#${bucket}` : `celeb`;
        // for range, salted variants still sit near each other unless hashed;
        // approximate their key-space position by hashing the salted key
        pos01 = (hash32(key) >>> 0) / 0x100000000;
      } else {
        pos01 = rnd();
        key = `k:${Math.floor(pos01 * 1e9)}`;
      }
    }

    const p = partitionFor(key, pos01, strategy);
    counts[p]++;
  }

  const max = Math.max(...counts);
  return { counts, hotKeyShare: max / SAMPLE };
}

/* ---------------------------------------------------------------- demo ---- */

export function HotspotDemo() {
  const [strategy, setStrategy] = useState<Strategy>("range");
  const [workload, setWorkload] = useState<Workload>("sequential");
  const [salt, setSalt] = useState(1);
  const [seed, setSeed] = useState(1);

  const { counts, hotKeyShare } = useMemo(
    () => simulate(workload, strategy, salt, seed),
    [workload, strategy, salt, seed]
  );

  const max = Math.max(...counts, 1);
  const total = counts.reduce((a, b) => a + b, 0);
  const ideal = total / PARTITIONS;
  // skew = how far the busiest partition is above a perfectly even share
  const skewPct = Math.round(((max - ideal) / ideal) * 100);
  const hottest = counts.indexOf(max);

  const hotThreshold = ideal * 1.6; // visual "this is a hot spot" line

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="kicker mb-1.5">Partitioning scheme</div>
          <SegmentedControl<Strategy>
            value={strategy}
            onChange={(v) => {
              setStrategy(v);
              setSeed((n) => n + 1);
            }}
            options={[
              { label: "By key range", value: "range" },
              { label: "By hash of key", value: "hash" },
            ]}
          />
        </div>
        <div>
          <div className="kicker mb-1.5">Write workload</div>
          <SegmentedControl<Workload>
            value={workload}
            onChange={(v) => {
              setWorkload(v);
              setSeed((n) => n + 1);
            }}
            options={[
              { label: "Sequential", value: "sequential" },
              { label: "Uniform", value: "uniform" },
              { label: "One hot key", value: "hot" },
            ]}
          />
        </div>
      </div>

      {workload === "hot" && (
        <div className="rounded-lg border border-line bg-ink-850 p-4">
          <Slider
            label="Salt the hot key across N buckets"
            value={salt}
            min={1}
            max={8}
            step={1}
            onChange={(v) => {
              setSalt(v);
              setSeed((n) => n + 1);
            }}
            format={(v) => (v === 1 ? "no salt" : `${v} buckets`)}
          />
          <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
            Prefixing a hot key with a random bucket (<code>celeb#0…celeb#{Math.max(salt - 1, 0)}</code>)
            splits its writes across partitions. The cost: a read must now fan out to all{" "}
            {salt > 1 ? salt : "N"} buckets and merge — write relief paid for with read work.
          </p>
        </div>
      )}

      {/* bars */}
      <div className="rounded-lg border border-line bg-ink-900/50 p-5">
        <div className="mb-4 flex items-end justify-between">
          <div className="kicker">Writes per partition · {total.toLocaleString()} ops</div>
          <button
            type="button"
            onClick={() => setSeed((n) => n + 1)}
            className="font-mono text-[11px] text-fg-faint transition-colors hover:text-accent"
          >
            re-roll ↻
          </button>
        </div>

        <div className="relative flex h-44 items-end gap-2">
          {/* ideal / hot-spot reference line */}
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-fg-faint/40"
            style={{ bottom: `${(ideal / max) * 100}%` }}
          >
            <span className="absolute -top-4 right-0 font-mono text-[9px] text-fg-faint">even share</span>
          </div>

          {counts.map((c, i) => {
            const h = (c / max) * 100;
            const isHot = c >= hotThreshold && workload !== "uniform";
            return (
              <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                <span className="font-mono text-[10px] tabular-nums text-fg-muted">{c}</span>
                <motion.div
                  className="w-full rounded-t-sm"
                  style={{
                    background: isHot ? "var(--color-fault)" : COLORS[i],
                    boxShadow: "none",
                  }}
                  animate={{ height: `${h}%` }}
                  transition={{ type: "spring", stiffness: 160, damping: 20 }}
                />
                <span className="font-mono text-[9px] text-fg-faint">P{i}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* readout */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Hottest partition"
          value={`P${hottest}`}
          tone={skewPct > 60 ? "fault" : skewPct > 20 ? "warn" : "ok"}
        />
        <Stat
          label="Skew over even share"
          value={`+${Math.max(skewPct, 0)}`}
          unit="%"
          tone={skewPct > 60 ? "fault" : skewPct > 20 ? "warn" : "ok"}
        />
        <Stat
          label="Busiest partition load"
          value={Math.round(hotKeyShare * 100)}
          unit="% of writes"
          tone={hotKeyShare > 0.4 ? "fault" : "default"}
        />
      </div>

      {/* contextual verdict */}
      <div
        className="rounded-lg border-l-2 p-3 text-[13px] leading-relaxed"
        style={{
          borderColor: skewPct > 60 ? "var(--color-fault)" : skewPct > 20 ? "var(--color-warn)" : "var(--color-ok)",
          background:
            skewPct > 60
              ? "color-mix(in oklab, var(--color-fault) 9%, var(--color-ink-850))"
              : skewPct > 20
                ? "color-mix(in oklab, var(--color-warn) 9%, var(--color-ink-850))"
                : "color-mix(in oklab, var(--color-ok) 9%, var(--color-ink-850))",
        }}
      >
        {verdict(strategy, workload, salt, skewPct)}
      </div>
    </div>
  );
}

function verdict(strategy: Strategy, workload: Workload, salt: number, skewPct: number): string {
  if (workload === "sequential" && strategy === "range") {
    return "Classic hot spot: monotonically increasing keys (timestamps, auto-increment IDs) all land in the highest range, so one partition takes every write while the rest idle. This is exactly why you avoid range partitioning on a timestamp key.";
  }
  if (workload === "sequential" && strategy === "hash") {
    return "Hashing the key scatters the sequential stream uniformly — the write hot spot disappears. The price you pay: keys that were adjacent are now on different partitions, so range scans must hit every partition.";
  }
  if (workload === "uniform") {
    return strategy === "hash"
      ? "Uniform keys + hashing → near-perfect balance. A good hash turns whatever distribution you feed it into an even one."
      : "Uniform keys spread reasonably across ranges too, but real workloads are rarely uniform — and any clustering reintroduces skew.";
  }
  // hot key
  if (salt > 1) {
    return `Salting the celebrity key across ${salt} buckets fans its writes out — skew drops to +${Math.max(skewPct, 0)}%. But no hash function can save you from a single un-split hot key; only the application can, by splitting the key.`;
  }
  return "A single hot key (a celebrity, a viral post) overwhelms one partition no matter the scheme — hashing routes every copy of that exact key to the same place. The fix isn't in the database: salt the key in the application, then merge on read.";
}
