"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SegmentedControl, Stat } from "@/components/chapter";

/* ----------------------------------------------------------------- data --- */

type Car = { id: number; color: "red" | "silver" | "black"; partition: number };

// 12 cars, partitioned by document id across 3 partitions (round-robin-ish).
const CARS: Car[] = [
  { id: 191, color: "red", partition: 0 },
  { id: 214, color: "silver", partition: 0 },
  { id: 306, color: "black", partition: 0 },
  { id: 422, color: "red", partition: 0 },
  { id: 515, color: "silver", partition: 1 },
  { id: 533, color: "red", partition: 1 },
  { id: 641, color: "black", partition: 1 },
  { id: 728, color: "silver", partition: 1 },
  { id: 810, color: "red", partition: 2 },
  { id: 884, color: "black", partition: 2 },
  { id: 905, color: "silver", partition: 2 },
  { id: 999, color: "red", partition: 2 },
];

const COLORS = ["red", "silver", "black"] as const;
type Color = (typeof COLORS)[number];

const SWATCH: Record<Color, string> = {
  red: "#fb7185",
  silver: "#cbd5e1",
  black: "#94a3b8",
};

const PARTITION_COLORS = ["#7d74f2", "#f5903d", "#34d399"];

type Mode = "document" | "term";

/**
 * For term-partitioning: which index partition owns a given term. A real system
 * hashes or ranges the term; with three terms we map them one-per-shard so each
 * partition clearly owns a distinct slice of the global index.
 */
const TERM_PARTITION: Record<Color, number> = { red: 0, silver: 1, black: 2 };
function termPartition(color: Color): number {
  return TERM_PARTITION[color];
}

export function IndexDemo() {
  const [mode, setMode] = useState<Mode>("document");
  const [query, setQuery] = useState<Color>("red");

  const matches = useMemo(() => CARS.filter((c) => c.color === query), [query]);

  // which partitions must be CONTACTED to answer "color = query"
  const contacted = useMemo(() => {
    if (mode === "document") return [0, 1, 2]; // scatter/gather: ask everyone
    return [termPartition(query)]; // term: one targeted partition
  }, [mode, query]);

  const reads = contacted.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <div className="kicker mb-1.5">Secondary-index strategy</div>
          <SegmentedControl<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { label: "By document (local)", value: "document" },
              { label: "By term (global)", value: "term" },
            ]}
          />
        </div>
        <div>
          <div className="kicker mb-1.5">Query: color =</div>
          <SegmentedControl<Color>
            value={query}
            onChange={setQuery}
            options={COLORS.map((c) => ({ label: c, value: c }))}
          />
        </div>
      </div>

      <svg viewBox="0 0 520 300" className="w-full">
        {/* client / coordinator */}
        <g>
          <rect x={222} y={8} width={76} height={30} rx={8} fill="var(--color-ink-800)" stroke="var(--accent)" strokeOpacity={0.5} />
          <text x={260} y={27} textAnchor="middle" className="fill-fg font-mono" fontSize={10}>
            client
          </text>
        </g>

        {[0, 1, 2].map((p) => {
          const x = 40 + p * 165;
          const isContacted = contacted.includes(p);
          // documents living on this data partition
          const docs = CARS.filter((c) => c.partition === p);
          return (
            <g key={p}>
              {/* request arrow */}
              <motion.path
                d={`M260 38 C 260 60, ${x + 70} 50, ${x + 70} 78`}
                fill="none"
                stroke={isContacted ? PARTITION_COLORS[p] : "var(--color-line)"}
                strokeWidth={isContacted ? 2 : 1}
                strokeDasharray={isContacted ? "0" : "3 4"}
                opacity={isContacted ? 0.9 : 0.3}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: isContacted ? [0, 1] : 1 }}
                transition={{ duration: 0.5 }}
              />

              {/* partition box */}
              <rect
                x={x}
                y={80}
                width={140}
                height={196}
                rx={10}
                fill="var(--color-ink-900)"
                stroke={isContacted ? PARTITION_COLORS[p] : "var(--color-line)"}
                strokeWidth={isContacted ? 1.75 : 1}
                opacity={isContacted ? 1 : 0.45}
              />
              <text x={x + 70} y={99} textAnchor="middle" className="font-mono" fontSize={10} fill={PARTITION_COLORS[p]}>
                partition {p}
              </text>

              {/* data docs */}
              <text x={x + 10} y={118} className="fill-fg-faint font-mono" fontSize={8}>
                documents
              </text>
              <g>
                {docs.map((d, i) => {
                  const dx = x + 14 + (i % 2) * 64;
                  const dy = 126 + Math.floor(i / 2) * 20;
                  const hit = d.color === query;
                  return (
                    <g key={d.id}>
                      <rect
                        x={dx}
                        y={dy}
                        width={58}
                        height={15}
                        rx={3}
                        fill={hit ? "color-mix(in oklab, var(--color-fault) 22%, transparent)" : "var(--color-ink-800)"}
                        stroke={hit ? "var(--color-fault)" : "var(--color-line)"}
                        strokeWidth={hit ? 1.25 : 0.75}
                      />
                      <circle cx={dx + 8} cy={dy + 7.5} r={3.5} fill={SWATCH[d.color]} />
                      <text x={dx + 17} y={dy + 11} className="fill-fg-muted font-mono" fontSize={7.5}>
                        car {d.id}
                      </text>
                    </g>
                  );
                })}
              </g>

              {/* index region */}
              <line x1={x + 8} y1={216} x2={x + 132} y2={216} stroke="var(--color-line)" strokeWidth={0.75} />
              <text x={x + 10} y={230} className="fill-fg-faint font-mono" fontSize={8}>
                {mode === "document" ? "local index" : "global index shard"}
              </text>

              {mode === "document" ? (
                // local index: every partition has color→docs for its OWN docs
                <text x={x + 10} y={248} className="fill-fg-muted font-mono" fontSize={7.5}>
                  color → {"{"}docs here{"}"}
                </text>
              ) : (
                // term index: this shard owns specific colors for ALL docs
                <text x={x + 10} y={248} className="fill-fg-muted font-mono" fontSize={7.5}>
                  owns: {COLORS.filter((c) => termPartition(c) === p).join(", ") || "—"}
                </text>
              )}
              {mode === "term" && termPartition(query) === p && (
                <text x={x + 10} y={263} className="font-mono" fontSize={7.5} fill="var(--color-fault)">
                  → {matches.map((m) => m.id).join(", ")}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Partitions read" value={reads} unit="/ 3" tone={reads === 1 ? "ok" : "warn"} />
        <Stat label="Matches found" value={matches.length} tone="accent" />
        <Stat
          label="Read pattern"
          value={mode === "document" ? "scatter/gather" : "targeted"}
          tone={mode === "document" ? "warn" : "ok"}
        />
      </div>

      <div
        className="rounded-lg border-l-2 p-3 text-[13px] leading-relaxed"
        style={{
          borderColor: mode === "document" ? "var(--color-warn)" : "var(--color-ok)",
          background:
            mode === "document"
              ? "color-mix(in oklab, var(--color-warn) 9%, var(--color-ink-850))"
              : "color-mix(in oklab, var(--color-ok) 9%, var(--color-ink-850))",
        }}
      >
        {mode === "document" ? (
          <>
            <strong className="text-fg">Document-partitioned (local index).</strong> Each partition indexes only its
            own documents, so a query on <code>color</code> must be sent to <em>all</em> partitions and the results
            merged — a <em>scatter/gather</em>. Writes are cheap (one partition), but reads pay tail-latency
            amplification: the query is only as fast as the slowest partition.
          </>
        ) : (
          <>
            <strong className="text-fg">Term-partitioned (global index).</strong> The index itself is partitioned by
            the <em>term</em> (the color), so all entries for <code>{query}</code> live on one shard. The read hits a
            single partition — fast, no scatter. The catch: a write to one document may touch several index shards
            (one per indexed term), so writes become slower and harder to keep consistent.
          </>
        )}
      </div>
    </div>
  );
}
