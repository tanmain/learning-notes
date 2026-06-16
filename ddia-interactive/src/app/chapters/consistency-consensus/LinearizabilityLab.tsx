"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button, SegmentedControl, Stat } from "@/components/chapter";
import { IconReset } from "@/components/icons";

/**
 * Linearizability Lab
 * -------------------
 * A timeline of concurrent operations on ONE register `x` (initial value 0).
 * The user moves each operation's [invocation, response] interval and sets
 * what each read observed. We then run a real linearizability checker:
 *
 *   A history is linearizable iff there is a SINGLE total order of operations
 *   such that (1) it is consistent with real time — if op P completes before
 *   op Q starts, P precedes Q — and (2) it satisfies the sequential spec of a
 *   register — every read returns the value written by the most recent
 *   preceding write (or 0 if none).
 *
 * We search exhaustively over candidate orderings using a constraint-respecting
 * backtracking search (the op set is tiny, so this is exact, not heuristic).
 */

type OpKind = "write" | "read";

type Op = {
  id: string;
  client: string;
  kind: OpKind;
  value: number; // for write: value written; for read: value observed
  start: number; // real-time grid units [0..GRID]
  end: number;
};

const GRID = 24;

// Three client lanes. Values are kept small (0..9) for clarity.
// Opens in a deliberately subtle LINEARIZABLE state: r3 reads the *stale*
// value 1 even though it runs "late", which is legal precisely because it
// overlaps the W(2) write (concurrent ops may be ordered either way). Drag
// r3 to start after r2 responds and the history immediately breaks.
const INITIAL: Op[] = [
  { id: "w1", client: "A", kind: "write", value: 1, start: 1, end: 5 },
  { id: "r1", client: "B", kind: "read", value: 1, start: 7, end: 11 },
  { id: "w2", client: "C", kind: "write", value: 2, start: 10, end: 18 },
  { id: "r3", client: "A", kind: "read", value: 1, start: 12, end: 16 },
  { id: "r2", client: "B", kind: "read", value: 2, start: 15, end: 21 },
];

const CLIENTS = ["A", "B", "C"];
const CLIENT_COLOR: Record<string, string> = {
  A: "var(--color-info)",
  B: "var(--color-special)",
  C: "var(--accent)",
};

/* ----------------------------- the checker ----------------------------- */

/**
 * Returns a valid linearization order (array of op ids) if the history is
 * linearizable, otherwise null. Search respects real-time order: an op P must
 * be placed before op Q whenever P.end < Q.start (P strictly precedes Q).
 */
function findLinearization(ops: Op[]): string[] | null {
  const n = ops.length;

  // mustPrecede[i] = set of indices that MUST come before i (real-time).
  const mustPrecede: Set<number>[] = ops.map(() => new Set<number>());
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      // op j strictly completes before op i begins -> j must precede i
      if (ops[j].end < ops[i].start) mustPrecede[i].add(j);
    }
  }

  const placed: boolean[] = new Array(n).fill(false);
  const order: number[] = [];

  function dfs(register: number): boolean {
    if (order.length === n) return true;
    for (let i = 0; i < n; i++) {
      if (placed[i]) continue;
      // all real-time predecessors already placed?
      let ready = true;
      for (const p of mustPrecede[i]) {
        if (!placed[p]) {
          ready = false;
          break;
        }
      }
      if (!ready) continue;

      const op = ops[i];
      // sequential register semantics
      if (op.kind === "read" && op.value !== register) continue;

      placed[i] = true;
      order.push(i);
      const next = op.kind === "write" ? op.value : register;
      if (dfs(next)) return true;
      placed[i] = false;
      order.pop();
    }
    return false;
  }

  const ok = dfs(0);
  return ok ? order.map((i) => ops[i].id) : null;
}

/* ------------------------------ the demo ------------------------------- */

export function LinearizabilityLab() {
  const [ops, setOps] = useState<Op[]>(INITIAL);
  const [selected, setSelected] = useState<string>("r3");

  const sel = ops.find((o) => o.id === selected) ?? ops[0];

  const result = useMemo(() => findLinearization(ops), [ops]);
  const linearizable = result !== null;

  function update(id: string, patch: Partial<Op>) {
    setOps((prev) => prev.map((o) => (o.id === id ? clampOp({ ...o, ...patch }) : o)));
  }
  function reset() {
    setOps(INITIAL);
  }

  // Map an op id -> its position in the discovered linearization (1-based).
  const orderIndex: Record<string, number> = {};
  if (result) result.forEach((id, i) => (orderIndex[id] = i + 1));

  const W = 760;
  const H = 40;
  const padL = 56;
  const padR = 16;
  const innerW = W - padL - padR;
  const x = (t: number): number => padL + (t / GRID) * innerW;

  const lanes = CLIENTS;
  const laneH = 46;

  return (
    <div className="space-y-5">
      {/* status banner */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
        style={{
          borderColor: linearizable ? "color-mix(in oklab, var(--color-ok) 50%, transparent)" : "color-mix(in oklab, var(--color-fault) 50%, transparent)",
          background: linearizable ? "color-mix(in oklab, var(--color-ok) 8%, transparent)" : "color-mix(in oklab, var(--color-fault) 8%, transparent)",
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full font-mono text-sm font-bold"
            style={{
              color: linearizable ? "var(--color-ok)" : "var(--color-fault)",
              background: linearizable ? "color-mix(in oklab, var(--color-ok) 16%, transparent)" : "color-mix(in oklab, var(--color-fault) 16%, transparent)",
            }}
          >
            {linearizable ? "✓" : "✕"}
          </span>
          <div>
            <div className="font-mono text-sm font-semibold" style={{ color: linearizable ? "var(--color-ok)" : "var(--color-fault)" }}>
              {linearizable ? "Linearizable history" : "NOT linearizable"}
            </div>
            <div className="font-mono text-[11px] text-fg-faint">
              {linearizable
                ? "A single consistent order respects real time and the register spec."
                : "No single order respects both real time and the register spec."}
            </div>
          </div>
        </div>
        {linearizable && result && (
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            <span className="text-fg-faint">order:</span>
            {result.map((id, i) => {
              const op = ops.find((o) => o.id === id)!;
              return (
                <span key={id} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-fg-faint">→</span>}
                  <span
                    className="rounded px-1.5 py-0.5"
                    style={{ background: "color-mix(in oklab, var(--color-ok) 14%, transparent)", color: "var(--color-fg)" }}
                  >
                    {label(op)}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* timeline */}
      <div className="overflow-x-auto rounded-lg border border-line bg-ink-950/60 p-4">
        <svg viewBox={`0 0 ${W} ${lanes.length * laneH + 34}`} className="w-full min-w-[640px]">
          {/* time grid */}
          {Array.from({ length: GRID + 1 }).map((_, t) =>
            t % 4 === 0 ? (
              <g key={`grid-${t}`}>
                <line x1={x(t)} y1={18} x2={x(t)} y2={lanes.length * laneH + 18} stroke="var(--color-line)" strokeWidth={1} />
                <text x={x(t)} y={12} textAnchor="middle" className="fill-[var(--color-fg-faint)] font-mono" style={{ fontSize: 8 }}>
                  t{t}
                </text>
              </g>
            ) : null,
          )}
          <text x={4} y={12} className="fill-[var(--color-fg-faint)] font-mono" style={{ fontSize: 8, letterSpacing: "0.1em" }}>
            real time →
          </text>

          {/* lanes + bars */}
          {lanes.map((c, li) => {
            const yLane = 24 + li * laneH;
            const laneOps = ops.filter((o) => o.client === c);
            return (
              <g key={`lane-${c}`}>
                <text x={4} y={yLane + H / 2 + 3} className="fill-[var(--color-fg-muted)] font-mono" style={{ fontSize: 10 }}>
                  {c}
                </text>
                <line x1={padL} y1={yLane + H / 2} x2={W - padR} y2={yLane + H / 2} stroke="var(--color-line)" strokeWidth={1} strokeDasharray="2 5" />
                {laneOps.map((op) => {
                  const x0 = x(op.start);
                  const x1 = x(op.end);
                  const color = CLIENT_COLOR[c];
                  const isSel = op.id === selected;
                  const isWrite = op.kind === "write";
                  return (
                    <g key={op.id} onClick={() => setSelected(op.id)} style={{ cursor: "pointer" }}>
                      {/* operation interval bar */}
                      <motion.rect
                        x={x0}
                        width={Math.max(x1 - x0, 6)}
                        y={yLane + 6}
                        height={H - 12}
                        rx={6}
                        animate={{ x: x0, width: Math.max(x1 - x0, 6) }}
                        transition={{ type: "spring", stiffness: 320, damping: 30 }}
                        fill={isWrite ? color : "transparent"}
                        fillOpacity={isWrite ? 0.22 : 0}
                        stroke={color}
                        strokeWidth={isSel ? 2.4 : 1.5}
                        strokeDasharray={isWrite ? undefined : "5 4"}
                      />
                      {/* invocation + response ticks */}
                      <line x1={x0} y1={yLane + 2} x2={x0} y2={yLane + H - 2} stroke={color} strokeWidth={1.5} />
                      <line x1={x1} y1={yLane + 2} x2={x1} y2={yLane + H - 2} stroke={color} strokeWidth={1.5} />
                      <text x={(x0 + x1) / 2} y={yLane + H / 2 + 4} textAnchor="middle" className="font-mono" style={{ fontSize: 10, fontWeight: 700, fill: "var(--color-fg)" }}>
                        {label(op)}
                      </text>
                      {/* linearization point marker */}
                      {orderIndex[op.id] && (
                        <g>
                          <circle cx={(x0 + x1) / 2} cy={yLane + 1} r={7.5} fill="var(--color-ink-950)" stroke="var(--color-ok)" strokeWidth={1.4} />
                          <text x={(x0 + x1) / 2} y={yLane + 4} textAnchor="middle" className="font-mono" style={{ fontSize: 8, fontWeight: 700, fill: "var(--color-ok)" }}>
                            {orderIndex[op.id]}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* editor for the selected op */}
      <div className="rounded-lg border border-line bg-ink-900/50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="kicker">Editing</span>
            <span className="font-mono text-sm font-semibold" style={{ color: CLIENT_COLOR[sel.client] }}>
              client {sel.client} · {label(sel)}
            </span>
          </div>
          <SegmentedControl
            value={selected}
            onChange={(v) => setSelected(v)}
            options={ops.map((o) => ({ label: `${o.client}:${label(o)}`, value: o.id }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TimeSlider
            label="Invocation (start)"
            value={sel.start}
            max={sel.end - 1}
            onChange={(v) => update(sel.id, { start: v })}
          />
          <TimeSlider
            label="Response (end)"
            value={sel.end}
            min={sel.start + 1}
            onChange={(v) => update(sel.id, { end: v })}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1.5 font-mono text-xs uppercase tracking-wider text-fg-muted">
              {sel.kind === "write" ? "Value written" : "Value the read observed"}
            </div>
            <SegmentedControl
              value={String(sel.value)}
              onChange={(v) => update(sel.id, { value: Number(v) })}
              options={[0, 1, 2, 3].map((n) => ({ label: String(n), value: String(n) }))}
            />
          </div>
          <Button onClick={reset} variant="ghost" size="sm">
            <IconReset size={14} /> Reset history
          </Button>
        </div>
      </div>

      {/* readouts */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Operations" value={ops.length} tone="default" />
        <Stat label="Verdict" value={linearizable ? "valid" : "violated"} tone={linearizable ? "ok" : "fault"} />
        <Stat label="Register x₀" value={0} tone="accent" />
      </div>

      <p className="font-mono text-[11px] leading-relaxed text-fg-faint">
        Tip: a <span className="accent-text">read</span> is dashed, a <span className="accent-text">write</span> is filled. Right
        now <span className="text-info">A</span>&apos;s read returns the <em>stale</em> value 1 — legal, because it overlaps{" "}
        <span className="accent-text">C</span>&apos;s W(2) (concurrent ops may be ordered either way). Drag that read so it{" "}
        <em>starts after</em> <span className="text-special">B</span>&apos;s R⇒2 responds and the history breaks: once a newer
        value has been observed, every later-starting read must see it too.
      </p>
    </div>
  );
}

/* ----------------------------- sub-pieces ------------------------------ */

function TimeSlider({
  label,
  value,
  min = 0,
  max = GRID,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs uppercase tracking-wider text-fg-muted">{label}</span>
        <span className="font-mono text-sm tabular-nums accent-text">t{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-700"
        style={{ accentColor: "var(--accent)" }}
      />
    </label>
  );
}

function label(op: Op): string {
  return op.kind === "write" ? `W(${op.value})` : `R⇒${op.value}`;
}

function clampOp(o: Op): Op {
  let start = Math.max(0, Math.min(o.start, GRID - 1));
  const end = Math.max(start + 1, Math.min(o.end, GRID));
  if (start >= end) start = end - 1;
  return { ...o, start, end };
}
