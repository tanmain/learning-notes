"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Slider, Stat, Toggle, SegmentedControl } from "@/components/chapter";

/**
 * Sort-merge join + the hot-key skew problem from the chapter.
 *
 * We join a "users" table against an "activity" stream on user_id. With a plain
 * partitioned (sort-merge) join, every record for a given key goes to ONE
 * reducer. If a few "linchpin" keys are wildly more active than the rest
 * (a celebrity's millions of followers), the reducer that owns that key gets
 * crushed: classic data skew. Turning on the "skewed join" splits the hot key's
 * records across ALL reducers (its other side is replicated), flattening the
 * load — at the cost of duplicating the small side.
 *
 * The user sets the number of reducers, how hot the hottest key is, and toggles
 * the skewed-join optimization, then watches per-reducer load rebalance and the
 * wall-clock estimate (governed by the busiest reducer) drop.
 */

const NAMES = ["alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi"];

function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const TONES = ["var(--accent)", "var(--accent-2)", "var(--color-info)", "var(--color-special)"];

export function JoinSkewDemo() {
  const [reducers, setReducers] = useState<2 | 3 | 4>(3);
  const [hotness, setHotness] = useState(60); // % of all activity that belongs to the one hot key
  const [skewedJoin, setSkewedJoin] = useState(false);

  // The hottest key (alice) owns `hotness`% of activity; the rest share the remainder.
  const records = useMemo(() => {
    const TOTAL = 120;
    const hotCount = Math.round((hotness / 100) * TOTAL);
    const coldCount = TOTAL - hotCount;
    const coldNames = NAMES.slice(1);
    const out: { key: string; hot: boolean }[] = [];
    for (let i = 0; i < hotCount; i++) out.push({ key: NAMES[0], hot: true });
    for (let i = 0; i < coldCount; i++) out.push({ key: coldNames[i % coldNames.length], hot: false });
    return out;
  }, [hotness]);

  // Assign each record's load to a reducer.
  const loads = useMemo(() => {
    const buckets = Array.from({ length: reducers }, () => 0);
    let rr = 0;
    for (const r of records) {
      if (r.hot && skewedJoin) {
        // hot key is sprayed across all reducers (round-robin); small side replicated
        buckets[rr % reducers] += 1;
        rr++;
      } else {
        buckets[hashKey(r.key) % reducers] += 1;
      }
    }
    return buckets;
  }, [records, reducers, skewedJoin]);

  const maxLoad = Math.max(...loads, 1);
  const total = records.length;
  const ideal = Math.ceil(total / reducers);
  // Wall-clock is governed by the slowest (busiest) reducer; normalize to a tidy ms scale.
  const wallclock = Math.round(maxLoad * 24);
  const idealClock = Math.round(ideal * 24);
  const skewFactor = (maxLoad / ideal).toFixed(2);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div>
          <div className="kicker mb-1.5">Reducers</div>
          <SegmentedControl
            value={String(reducers)}
            onChange={(v) => setReducers(Number(v) as 2 | 3 | 4)}
            options={[
              { label: "2", value: "2" },
              { label: "3", value: "3" },
              { label: "4", value: "4" },
            ]}
          />
        </div>
        <Slider
          className="min-w-[220px] flex-1"
          label="Hot key share (alice)"
          value={hotness}
          min={10}
          max={90}
          step={5}
          onChange={setHotness}
          format={(v) => v + "% of activity"}
        />
        <Toggle label="Skewed join" checked={skewedJoin} onChange={setSkewedJoin} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="join records" value={total} tone="info" />
        <Stat label="busiest reducer" value={maxLoad} unit="recs" tone={maxLoad > ideal * 1.4 ? "fault" : "ok"} />
        <Stat label="skew factor" value={skewFactor} unit="×" tone={Number(skewFactor) > 1.4 ? "warn" : "ok"} />
        <Stat label="est. wall-clock" value={wallclock} unit="ms" tone={maxLoad > ideal * 1.4 ? "fault" : "accent"} />
      </div>

      {/* reducer load bars */}
      <div className="instrument p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-mono text-xs text-fg-muted">per-reducer load — the job finishes when the slowest one does</span>
          <span className="font-mono text-[10px] text-fg-faint">ideal ≈ {ideal} recs/reducer</span>
        </div>
        <div className="flex items-end justify-around gap-3" style={{ height: 160 }}>
          {loads.map((load, i) => {
            const h = (load / maxLoad) * 130;
            const overloaded = load > ideal * 1.4;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <span className="font-mono text-[11px] tabular-nums" style={{ color: overloaded ? "var(--color-fault)" : TONES[i] }}>
                  {load}
                </span>
                <div className="flex w-full items-end justify-center" style={{ height: 130 }}>
                  <motion.div
                    className="w-9 rounded-t"
                    style={{
                      background: overloaded ? "var(--color-fault)" : TONES[i],
                      opacity: 0.85,
                    }}
                    animate={{ height: h }}
                    transition={{ type: "spring", stiffness: 200, damping: 24 }}
                  />
                </div>
                {/* ideal-load reference line marker */}
                <span className="font-mono text-[10px]" style={{ color: TONES[i] }}>
                  R{i}
                </span>
              </div>
            );
          })}
        </div>
        {/* ideal reference */}
        <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-fg-faint">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--color-fault)" }} />
          red = overloaded (&gt;1.4× the ideal share). The hot key piles onto a single reducer until you spread it.
        </div>
      </div>

      <div className="rounded-lg border border-line bg-ink-950/60 p-4 font-mono text-[12px] leading-relaxed text-fg-muted">
        {skewedJoin ? (
          <>
            <span className="accent-text">Skewed join ON.</span> alice&apos;s records are sampled, detected as hot,
            and round-robined across <span className="text-fg">all {reducers} reducers</span>; the matching row from
            the small (users) side is replicated to each. Load flattens — the slowest reducer no longer holds the
            whole celebrity. Cost: the small side is duplicated R times.
          </>
        ) : (
          <>
            <span style={{ color: "var(--color-warn)" }}>Plain partitioned join.</span> Every record with
            key=alice hashes to the <span className="text-fg">same reducer</span>. At {hotness}% hot share that one
            reducer does {((maxLoad / total) * 100).toFixed(0)}% of the work while the others idle — the job&apos;s
            wall-clock is held hostage by a single straggler.
          </>
        )}
      </div>
    </div>
  );
}
