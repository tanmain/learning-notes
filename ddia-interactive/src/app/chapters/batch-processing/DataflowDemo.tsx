"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, SegmentedControl, Stat } from "@/components/chapter";
import { IconReset } from "@/components/icons";

/**
 * MapReduce (full materialization) vs. a dataflow engine (Spark/Flink/Tez).
 *
 * A 3-stage workflow A -> B -> C.
 *   - MapReduce: each stage is an independent job; its output is *materialized*
 *     to the distributed filesystem (replicated to 3 nodes) before the next job
 *     can even start. A fault is tolerated by re-reading that durable file.
 *   - Dataflow engine: stages are operators in ONE job, pipelined; intermediate
 *     state is kept in memory and NOT replicated. A fault is tolerated by
 *     *recomputing* the lost partition from lineage (Spark RDD ancestry).
 *
 * The user flips the engine and injects a fault, watching how recovery differs
 * and how the cost model (disk writes, replication, start latency) changes.
 */

type Engine = "mapreduce" | "dataflow";
const STAGES = ["A · map", "B · join", "C · reduce"];

export function DataflowDemo() {
  const [engine, setEngine] = useState<Engine>("mapreduce");
  const [faulted, setFaulted] = useState(false);

  const isMR = engine === "mapreduce";

  // crude but representative cost model
  const diskWrites = isMR ? 3 : 1; // MR materializes after each of 3 stages; dataflow only the final output
  const replication = isMR ? 3 : 0; // MR replicates intermediate state; dataflow keeps it in memory
  const startLatency = isMR ? "serial" : "pipelined";
  const recovery = isMR
    ? faulted
      ? "re-read durable file from HDFS"
      : "—"
    : faulted
      ? "recompute partition from lineage"
      : "—";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <SegmentedControl
          value={engine}
          onChange={(v) => {
            setEngine(v as Engine);
            setFaulted(false);
          }}
          options={[
            { label: "MapReduce", value: "mapreduce" },
            { label: "Dataflow (Spark/Flink)", value: "dataflow" },
          ]}
        />
        <Button
          size="sm"
          variant={faulted ? "solid" : "outline"}
          onClick={() => setFaulted((f) => !f)}
        >
          {faulted ? "fault injected" : "inject node fault at B"}
        </Button>
        {faulted && (
          <Button size="sm" variant="ghost" onClick={() => setFaulted(false)}>
            <IconReset size={14} /> recover
          </Button>
        )}
      </div>

      {/* pipeline schematic */}
      <div className="instrument p-5">
        <svg viewBox="0 0 600 200" className="w-full" role="img" aria-label="workflow stages and intermediate state">
          {STAGES.map((label, i) => {
            const x = 90 + i * 200;
            const faultHere = faulted && i === 1;
            return (
              <g key={label}>
                {/* connector to next stage */}
                {i < STAGES.length - 1 && (
                  <>
                    <line
                      x1={x + 42}
                      y1={70}
                      x2={x + 158}
                      y2={70}
                      stroke="var(--color-line-strong)"
                      strokeWidth={2}
                    />
                    {!isMR && (
                      <line
                        x1={x + 42}
                        y1={70}
                        x2={x + 158}
                        y2={70}
                        stroke="var(--accent)"
                        strokeWidth={2}
                        className="flow-line"
                        style={{ strokeDasharray: "5 8" } as React.CSSProperties}
                      />
                    )}
                    {/* MapReduce: a materialized file sits between stages */}
                    {isMR && (
                      <g>
                        <rect
                          x={x + 78}
                          y={56}
                          width={44}
                          height={28}
                          rx={3}
                          fill="var(--color-ink-950)"
                          stroke="var(--accent-2)"
                          strokeWidth={1.2}
                        />
                        <text
                          x={x + 100}
                          y={67}
                          textAnchor="middle"
                          className="font-mono"
                          fontSize={7}
                          fill="var(--accent-2)"
                        >
                          HDFS
                        </text>
                        <text
                          x={x + 100}
                          y={77}
                          textAnchor="middle"
                          className="font-mono"
                          fontSize={6}
                          fill="var(--color-fg-faint)"
                        >
                          ×3 copies
                        </text>
                      </g>
                    )}
                  </>
                )}

                {/* stage node */}
                <circle
                  cx={x}
                  cy={70}
                  r={32}
                  fill="var(--color-ink-900)"
                  stroke={faultHere ? "var(--color-fault)" : "var(--accent)"}
                  strokeWidth={1.6}
                />
                {faultHere && (
                  <motion.circle
                    cx={x}
                    cy={70}
                    r={32}
                    fill="none"
                    stroke="var(--color-fault)"
                    strokeWidth={1.6}
                    animate={{ scale: [1, 1.45], opacity: [0.6, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                    style={{ transformOrigin: `${x}px 70px` }}
                  />
                )}
                <text x={x} y={74} textAnchor="middle" className="font-mono" fontSize={10} fontWeight={700} fill="var(--color-fg)">
                  {label.split(" · ")[0]}
                </text>

                {/* recovery annotation under the faulted stage */}
                <AnimatePresence>
                  {faultHere && (
                    <motion.g
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      <text x={x} y={130} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fault)">
                        node lost
                      </text>
                      <text x={x} y={146} textAnchor="middle" className="font-mono" fontSize={8} fill={isMR ? "var(--accent-2)" : "var(--accent)"}>
                        {isMR ? "re-read file" : "recompute"}
                      </text>
                      <text x={x} y={160} textAnchor="middle" className="font-mono" fontSize={8} fill={isMR ? "var(--accent-2)" : "var(--accent)"}>
                        {isMR ? "from HDFS" : "from lineage"}
                      </text>
                      {/* dataflow recompute reaches back to the prior stage */}
                      {!isMR && i > 0 && (
                        <motion.line
                          x1={x - 36}
                          y1={92}
                          x2={x - 168}
                          y2={92}
                          stroke="var(--accent)"
                          strokeWidth={1.4}
                          strokeDasharray="3 4"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.8 }}
                        />
                      )}
                    </motion.g>
                  )}
                </AnimatePresence>

                {/* stage role label */}
                <text x={x} y={26} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">
                  {label.split(" · ")[1]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="disk writes" value={diskWrites} unit="× full set" tone={isMR ? "warn" : "ok"} />
        <Stat label="replication" value={replication} unit="copies" tone={isMR ? "warn" : "ok"} />
        <Stat label="stage start" value={startLatency} tone={isMR ? "warn" : "accent"} />
        <Stat label="fault recovery" value={faulted ? (isMR ? "re-read" : "recompute") : "—"} tone={faulted ? "info" : "default"} />
      </div>

      <div className="rounded-lg border border-line bg-ink-950/60 p-4 font-mono text-[12px] leading-relaxed text-fg-muted">
        {isMR ? (
          <>
            <span style={{ color: "var(--accent-2)" }}>MapReduce materializes everything.</span> Each stage&apos;s
            output is written to HDFS and replicated 3× before the next job starts — so stages run strictly serially,
            and recovery is trivial: just re-read the durable intermediate file. Robust, but the disk writes and the
            &quot;wait for the whole stage&quot; barrier cost you latency.{" "}
            {faulted && <span className="text-info">Right now stage B failed — the scheduler simply re-reads A&apos;s output and re-runs B.</span>}
          </>
        ) : (
          <>
            <span className="accent-text">Dataflow engines pipeline operators.</span> Spark, Flink and Tez treat the
            whole A→B→C workflow as one job, streaming records between operators in memory and skipping the redundant
            HDFS round-trips. Intermediate state isn&apos;t replicated; instead the engine tracks{" "}
            <span className="text-fg">lineage</span> (Spark&apos;s RDD ancestry).{" "}
            {faulted && (
              <span className="text-info">
                Stage B&apos;s node died — so the engine recomputes just the lost partition from its parents, no
                durable file required.
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
