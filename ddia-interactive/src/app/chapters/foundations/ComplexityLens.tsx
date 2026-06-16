"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Toggle, Stat, SegmentedControl } from "@/components/chapter";

/**
 * Complexity Lens — Maintainability made tangible.
 * A service graph of N modules. "Big ball of mud" wires everything to everything
 * (accidental complexity, O(n^2) coupling). Toggle on an *abstraction* layer and
 * the same modules route through a clean interface (O(n) coupling). A side panel
 * scores the three maintainability principles: operability, simplicity, evolvability.
 */

export function ComplexityLens() {
  const [abstracted, setAbstracted] = useState(false);
  const [modules, setModules] = useState<number>(7);

  const positions = useMemo(() => {
    const r = 78;
    const cx = 160;
    const cy = 110;
    return Array.from({ length: modules }, (_, i) => {
      const a = (i / modules) * Math.PI * 2 - Math.PI / 2;
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), label: `M${i + 1}` };
    });
  }, [modules]);

  // edges
  const edges = useMemo(() => {
    const e: { x1: number; y1: number; x2: number; y2: number }[] = [];
    if (abstracted) {
      // every module connects only to the hub (center)
      for (const p of positions) e.push({ x1: p.x, y1: p.y, x2: 160, y2: 110 });
    } else {
      // every module connects to every other — n(n-1)/2 edges
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          e.push({ x1: positions[i].x, y1: positions[i].y, x2: positions[j].x, y2: positions[j].y });
        }
      }
    }
    return e;
  }, [abstracted, positions]);

  const couplings = abstracted ? modules : (modules * (modules - 1)) / 2;
  const couplingMax = (12 * 11) / 2;

  // score the three principles (heuristic, illustrative)
  const simplicity = Math.round((1 - couplings / couplingMax) * 100);
  const operability = abstracted ? 85 : Math.max(20, 80 - modules * 5);
  const evolvability = abstracted ? Math.max(60, 95 - modules * 2) : Math.max(10, 70 - modules * 7);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Toggle label="Introduce a clean abstraction (hub interface)" checked={abstracted} onChange={setAbstracted} />
        <SegmentedControl<string>
          value={String(modules)}
          onChange={(v) => setModules(Number(v))}
          options={[
            { label: "5 modules", value: "5" },
            { label: "7 modules", value: "7" },
            { label: "10 modules", value: "10" },
            { label: "12 modules", value: "12" },
          ]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-[320px_1fr]">
        <div className="instrument overflow-hidden p-3">
          <svg viewBox="0 0 320 220" className="block w-full">
            {/* edges */}
            {edges.map((e, i) => (
              <motion.line
                key={`${abstracted}-${modules}-${i}`}
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke={abstracted ? "var(--accent)" : "var(--color-fault)"}
                strokeOpacity={abstracted ? 0.55 : 0.3}
                strokeWidth={1}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: i * 0.01 }}
              />
            ))}

            {/* hub */}
            {abstracted && (
              <g>
                <circle cx={160} cy={110} r={20} fill="var(--color-ink-800)" stroke="var(--accent)" strokeWidth={1.6} />
                <text x={160} y={108} textAnchor="middle" fontSize={8} fontWeight={700} fill="var(--accent)" className="font-mono">
                  API
                </text>
                <text x={160} y={118} textAnchor="middle" fontSize={6.5} fill="var(--color-fg-faint)" className="font-mono">
                  facade
                </text>
              </g>
            )}

            {/* module nodes */}
            {positions.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={15} fill="url(#cl-node)" stroke="var(--color-line-strong)" strokeWidth={1.2} />
                <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--color-fg)" className="font-mono">
                  {p.label}
                </text>
              </g>
            ))}
            <defs>
              <radialGradient id="cl-node" cx="50%" cy="35%" r="75%">
                <stop offset="0%" stopColor="var(--color-ink-800)" />
                <stop offset="100%" stopColor="var(--color-ink-850)" />
              </radialGradient>
            </defs>
          </svg>
          <div className="mt-1 text-center font-mono text-[11px]" style={{ color: abstracted ? "var(--accent)" : "var(--color-fault)" }}>
            {abstracted ? "O(n) coupling — abstraction hides detail" : "O(n²) coupling — accidental complexity"}
          </div>
        </div>

        <div className="space-y-3">
          <Stat
            label="connections to reason about"
            value={couplings}
            tone={abstracted ? "ok" : couplings > 20 ? "fault" : "warn"}
          />
          <div className="grid grid-cols-1 gap-3">
            <Bar label="Operability" value={operability} />
            <Bar label="Simplicity" value={simplicity} />
            <Bar label="Evolvability" value={evolvability} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-ink-900/60 p-4 font-mono text-[13px] leading-relaxed text-fg-muted">
        {abstracted ? (
          <p>
            <span className="accent-text">Good abstraction</span> hides implementation detail behind a clean
            interface, so coupling grows linearly (O(n)) instead of quadratically (O(n²)). New engineers
            understand the system faster (simplicity), routine ops are predictable (operability), and changes stay
            local (evolvability). This is the single best tool against <em>accidental</em> complexity.
          </p>
        ) : (
          <p className="text-fault">
            Every module knows about every other: {couplings} edges to keep in your head. Each change risks
            breaking something far away, budgets overrun, and bugs multiply. Most of this complexity is{" "}
            <em>accidental</em> — not inherent to the problem — and abstraction can remove it.
          </p>
        )}
      </div>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  const tone = value >= 70 ? "var(--color-ok)" : value >= 45 ? "var(--color-warn)" : "var(--color-fault)";
  return (
    <div className="rounded-lg border border-line bg-ink-900/60 px-4 py-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">{label}</span>
        <span className="font-mono text-sm tabular-nums" style={{ color: tone }}>
          {value}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
        <motion.div
          className="h-full rounded-full"
          style={{ background: tone }}
          animate={{ width: `${value}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  );
}
