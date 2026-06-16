"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { SegmentedControl } from "@/components/chapter";
import { IconCheck, IconX } from "@/components/icons";

/**
 * Interactive isolation × anomaly matrix. Pick a level; each anomaly row
 * lights up green (prevented) or red (still possible). A compact mental model
 * for "what does this level actually buy me?".
 */

type Level = "ru" | "rc" | "si" | "ser";

const LEVELS: { label: string; value: Level; note: string }[] = [
  { label: "Read Uncommitted", value: "ru", note: "Almost no guarantees — rarely useful." },
  { label: "Read Committed", value: "rc", note: "No dirty reads or dirty writes. The common default." },
  { label: "Snapshot Isolation", value: "si", note: "Consistent snapshot per transaction (MVCC). 'Repeatable read' in Postgres/MySQL." },
  { label: "Serializable", value: "ser", note: "As if transactions ran one at a time. Prevents everything." },
];

type Anomaly = {
  key: string;
  name: string;
  desc: string;
  /** which levels prevent this anomaly */
  preventedBy: Level[];
};

const ANOMALIES: Anomaly[] = [
  {
    key: "dirtyRead",
    name: "Dirty read",
    desc: "Reading another transaction's uncommitted write.",
    preventedBy: ["rc", "si", "ser"],
  },
  {
    key: "dirtyWrite",
    name: "Dirty write",
    desc: "Overwriting another transaction's uncommitted write.",
    preventedBy: ["rc", "si", "ser"],
  },
  {
    key: "readSkew",
    name: "Read skew (non-repeatable read)",
    desc: "Two reads in one transaction see different committed states.",
    preventedBy: ["si", "ser"],
  },
  {
    key: "lostUpdate",
    name: "Lost update",
    desc: "Concurrent read-modify-write; one update is clobbered.",
    preventedBy: ["si", "ser"], // SI via first-committer-wins detection (DDIA: PostgreSQL/Oracle SI)
  },
  {
    key: "writeSkew",
    name: "Write skew",
    desc: "Both read a shared premise, then update different rows.",
    preventedBy: ["ser"],
  },
  {
    key: "phantom",
    name: "Phantoms",
    desc: "A write changes the result of another transaction's search.",
    preventedBy: ["ser"],
  },
];

export function IsolationMatrix() {
  const [level, setLevel] = useState<Level>("rc");
  const current = LEVELS.find((l) => l.value === level)!;
  const preventedCount = ANOMALIES.filter((a) => a.preventedBy.includes(level)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl value={level} onChange={setLevel} options={LEVELS} />
        <span className="font-mono text-xs text-fg-faint">
          prevents {preventedCount} / {ANOMALIES.length} anomalies
        </span>
      </div>

      <p className="rounded-md border border-line bg-ink-850 px-4 py-2.5 text-sm text-fg-muted">
        <strong className="accent-text">{current.label}:</strong> {current.note}
      </p>

      <div className="grid gap-2.5">
        {ANOMALIES.map((a, i) => {
          const prevented = a.preventedBy.includes(level);
          const color = prevented ? "var(--color-ok)" : "var(--color-fault)";
          return (
            <motion.div
              key={a.key}
              layout
              initial={false}
              animate={{
                borderColor: color,
                background: `color-mix(in oklab, ${color} 7%, var(--color-ink-900))`,
              }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
              className="flex items-center gap-3 rounded-lg border px-4 py-3"
            >
              <motion.span
                key={`${a.key}-${prevented}`}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
              >
                {prevented ? <IconCheck size={15} /> : <IconX size={15} />}
              </motion.span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-sm font-medium text-fg">{a.name}</span>
                  <span
                    className="font-mono text-[10px] uppercase tracking-wider"
                    style={{ color }}
                  >
                    {prevented ? "prevented" : "possible"}
                  </span>
                </div>
                <div className="text-xs leading-relaxed text-fg-muted">{a.desc}</div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
