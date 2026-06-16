"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SegmentedControl, Stat } from "@/components/chapter";

/**
 * Timeliness vs. Integrity, and coordination-avoidance.
 *
 * DDIA separates "consistency" into two axes:
 *   - TIMELINESS  : are reads up to date? (violation = eventual consistency)
 *   - INTEGRITY   : is the data free of corruption / contradiction?
 *                   (violation = perpetual inconsistency — the bad one)
 *
 * Three enforcement models for a constraint (e.g. "username unique" /
 * "balance >= 0") trade these off differently:
 *   - synchronous coordination (linearizable, atomic commit)
 *   - log-based / async dataflow (single-partition ordering, idempotent)
 *   - apologize-later (accept, detect violations afterwards, compensate)
 */

type Model = "sync" | "log" | "apology";

type Profile = {
  label: string;
  timeliness: number; // 0..100 (higher = more up-to-date)
  integrity: number; // 0..100 (higher = stronger integrity guarantee)
  latency: number; // relative write latency, ms
  coordination: number; // 0..100 cross-partition coordination required
  availability: number; // 0..100 tolerance to partitions/faults
  blurb: React.ReactNode;
};

const PROFILES: Record<Model, Profile> = {
  sync: {
    label: "synchronous coordination",
    timeliness: 100,
    integrity: 100,
    latency: 95,
    coordination: 100,
    availability: 35,
    blurb: (
      <>
        Linearizable reads + atomic commit (2PC / consensus). The constraint can
        <strong> never</strong> be violated, even momentarily — but every write blocks on a coordinator, so
        latency is high and a network partition can stall the system. This is the only option when a violation is
        truly unacceptable (e.g. you must reject a duplicate username instantly).
      </>
    ),
  },
  log: {
    label: "log-based dataflow",
    timeliness: 55,
    integrity: 100,
    latency: 30,
    coordination: 15,
    availability: 90,
    blurb: (
      <>
        A single stream processor reads one log partition sequentially, so it can deterministically decide which
        of two conflicting operations came first — enforcing uniqueness with <strong>full integrity</strong> and
        no atomic commit. Reads of derived views lag slightly (timeliness drops), but integrity is preserved end
        to end through deterministic, idempotent derivation. <em>Coordination-avoiding.</em>
      </>
    ),
  },
  apology: {
    label: "apologize later",
    timeliness: 85,
    integrity: 60,
    latency: 8,
    coordination: 0,
    availability: 99,
    blurb: (
      <>
        Accept every write immediately, then detect violations asynchronously and compensate (cancel the order,
        email an apology, issue a refund). Lowest latency and highest availability, but the constraint can be{" "}
        <strong>temporarily violated</strong>. In many businesses the cost of an occasional apology is far lower
        than the cost of coordinating on every single write.
      </>
    ),
  },
};

const BARS: { key: keyof Profile; label: string; good: "high" | "low" }[] = [
  { key: "integrity", label: "integrity guarantee", good: "high" },
  { key: "timeliness", label: "read timeliness", good: "high" },
  { key: "availability", label: "fault tolerance", good: "high" },
  { key: "coordination", label: "coordination cost", good: "low" },
  { key: "latency", label: "write latency", good: "low" },
];

function barColor(value: number, good: "high" | "low") {
  const score = good === "high" ? value : 100 - value;
  if (score >= 75) return "var(--color-ok)";
  if (score >= 45) return "var(--color-warn)";
  return "var(--color-fault)";
}

export function TimelinessIntegrityDemo() {
  const [model, setModel] = useState<Model>("log");
  const p = PROFILES[model];

  const violation = useMemo(() => {
    if (p.integrity >= 100 && p.timeliness >= 100) return { text: "none — fully consistent", tone: "ok" as const };
    if (p.integrity >= 100) return { text: "timeliness only (eventual consistency)", tone: "warn" as const };
    return { text: "integrity may break (perpetual inconsistency)", tone: "fault" as const };
  }, [p]);

  return (
    <div className="space-y-5">
      <SegmentedControl<Model>
        value={model}
        onChange={setModel}
        options={[
          { label: "synchronous", value: "sync" },
          { label: "log-based", value: "log" },
          { label: "apologize later", value: "apology" },
        ]}
      />

      <div className="grid gap-5 md:grid-cols-2">
        {/* bars */}
        <div className="space-y-3">
          {BARS.map((b) => {
            const raw = p[b.key] as number;
            const color = barColor(raw, b.good);
            return (
              <div key={b.key}>
                <div className="mb-1 flex items-baseline justify-between font-mono text-[11px]">
                  <span className="uppercase tracking-wider text-fg-muted">{b.label}</span>
                  <span className="text-fg-faint">
                    {b.good === "low" ? "lower = better" : "higher = better"}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-ink-800">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: color }}
                    animate={{ width: `${raw}%` }}
                    transition={{ type: "spring", stiffness: 180, damping: 22 }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* timeliness x integrity quadrant */}
        <div className="panel relative overflow-hidden p-3">
          <div className="mb-1 kicker">timeliness × integrity</div>
          <svg viewBox="0 0 200 180" className="w-full">
            {/* axes */}
            <line x1={28} y1={150} x2={188} y2={150} stroke="var(--color-line-strong)" strokeWidth={1} />
            <line x1={28} y1={12} x2={28} y2={150} stroke="var(--color-line-strong)" strokeWidth={1} />
            <text x={108} y={170} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">
              timeliness →
            </text>
            <text x={12} y={84} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)" transform="rotate(-90 12 84)">
              integrity →
            </text>

            {/* danger band: low integrity */}
            <rect x={28} y={92} width={160} height={58} fill="var(--color-fault)" opacity={0.07} />
            <text x={108} y={146} textAnchor="middle" className="font-mono" fontSize={7} fill="var(--color-fault)" opacity={0.7}>
              perpetual inconsistency
            </text>

            {/* the marker */}
            <motion.circle
              r={8}
              fill={violation.tone === "ok" ? "var(--color-ok)" : violation.tone === "warn" ? "var(--color-warn)" : "var(--color-fault)"}
              animate={{
                cx: 28 + (p.timeliness / 100) * 156,
                cy: 150 - (p.integrity / 100) * 134,
              }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
            />
            <motion.circle
              r={14}
              fill="none"
              stroke={violation.tone === "ok" ? "var(--color-ok)" : violation.tone === "warn" ? "var(--color-warn)" : "var(--color-fault)"}
              strokeOpacity={0.4}
              animate={{
                cx: 28 + (p.timeliness / 100) * 156,
                cy: 150 - (p.integrity / 100) * 134,
              }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
            />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="model" value={p.label.split(" ")[0]} tone="accent" />
        <Stat label="violation risk" value={violation.text.split(" ")[0]} tone={violation.tone} />
        <Stat label="coordination" value={p.coordination === 0 ? "none" : p.coordination < 50 ? "low" : "high"} tone={p.coordination < 50 ? "ok" : "warn"} />
      </div>

      <div
        className="rounded-lg border-l-2 px-4 py-3 text-[13px] leading-relaxed text-fg"
        style={{
          borderColor: "var(--accent)",
          background: "color-mix(in oklab, var(--accent) 8%, var(--color-ink-850))",
        }}
      >
        {p.blurb}
      </div>
    </div>
  );
}
