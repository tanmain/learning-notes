"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Toggle } from "@/components/chapter";
import { IconReset } from "@/components/icons";

/**
 * Lamport Clocks — making sequence numbers consistent with causality.
 *
 * Three processes. The user records local events and sends messages between
 * processes. Each event gets a timestamp:
 *   • Wall clock OFF  → a Lamport timestamp (counter, nodeId). On send, the
 *     sender's counter rides along; on receive, the receiver jumps its counter
 *     to max(local, incoming) + 1. Total order = sort by (counter, nodeId),
 *     which is GUARANTEED consistent with happens-before.
 *   • Wall clock ON   → a physical time-of-day stamp that drifts per node. The
 *     total order by raw timestamp can DISAGREE with causality (a receive can
 *     look "earlier" than the send that caused it).
 */

type Proc = "P1" | "P2" | "P3";
const PROCS: Proc[] = ["P1", "P2", "P3"];
const PROC_INDEX: Record<Proc, number> = { P1: 0, P2: 1, P3: 2 };
const PROC_COLOR: Record<Proc, string> = {
  P1: "var(--color-info)",
  P2: "var(--accent)",
  P3: "var(--color-special)",
};

// Per-node physical clock skew (ms offset) — P2 runs fast, P3 runs slow.
const SKEW: Record<Proc, number> = { P1: 0, P2: 9, P3: -6 };

type Ev = {
  id: number;
  proc: Proc;
  kind: "local" | "send" | "recv";
  lamport: number; // lamport counter assigned to this event
  physical: number; // physical timestamp (ms)
  from?: Proc; // for recv: which process sent the delivered message
  causedBy?: number; // event id of the matching send (for recv)
  seq: number; // global creation order (the "real" causal truth)
};

export function LamportClocks() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [counters, setCounters] = useState<Record<Proc, number>>({ P1: 0, P2: 0, P3: 0 });
  const [physical, setPhysical] = useState<number>(100);
  const [useWall, setUseWall] = useState(false);
  const [pendingSend, setPendingSend] = useState<{ from: Proc; evId: number } | null>(null);
  const seqRef = useRef(0);

  function nextSeq(): number {
    seqRef.current += 1;
    return seqRef.current;
  }
  function tickPhysical(p: Proc): number {
    const t = physical + SKEW[p];
    setPhysical((x) => x + 3 + Math.floor(Math.random() * 4));
    return t;
  }

  function localEvent(p: Proc) {
    const c = counters[p] + 1;
    setCounters((cs) => ({ ...cs, [p]: c }));
    const ev: Ev = { id: nextSeq(), proc: p, kind: "local", lamport: c, physical: tickPhysical(p), seq: nextSeq() };
    setEvents((e) => [...e, ev]);
  }

  function startSend(p: Proc) {
    if (pendingSend?.from === p) {
      setPendingSend(null);
      return;
    }
    const c = counters[p] + 1;
    setCounters((cs) => ({ ...cs, [p]: c }));
    const ev: Ev = { id: nextSeq(), proc: p, kind: "send", lamport: c, physical: tickPhysical(p), seq: nextSeq() };
    setEvents((e) => [...e, ev]);
    setPendingSend({ from: p, evId: ev.id });
  }

  function deliverTo(p: Proc) {
    if (!pendingSend || pendingSend.from === p) return;
    const sendEv = events.find((e) => e.id === pendingSend.evId);
    if (!sendEv) {
      setPendingSend(null);
      return;
    }
    // Lamport receive rule: counter = max(local, incoming) + 1
    const c = Math.max(counters[p], sendEv.lamport) + 1;
    setCounters((cs) => ({ ...cs, [p]: c }));
    const ev: Ev = {
      id: nextSeq(),
      proc: p,
      kind: "recv",
      lamport: c,
      physical: tickPhysical(p),
      from: pendingSend.from,
      causedBy: pendingSend.evId,
      seq: nextSeq(),
    };
    setEvents((e) => [...e, ev]);
    setPendingSend(null);
  }

  function reset() {
    setEvents([]);
    setCounters({ P1: 0, P2: 0, P3: 0 });
    setPhysical(100);
    setPendingSend(null);
    seqRef.current = 0;
  }

  // Build the chosen total order.
  const ordered = [...events].sort((a, b) => {
    if (useWall) return a.physical - b.physical || PROC_INDEX[a.proc] - PROC_INDEX[b.proc];
    return a.lamport - b.lamport || PROC_INDEX[a.proc] - PROC_INDEX[b.proc];
  });

  // Detect a causality violation: any recv that the chosen order ranks
  // before its causing send.
  const rank: Record<number, number> = {};
  ordered.forEach((e, i) => (rank[e.id] = i));
  const violations = events.filter((e) => e.kind === "recv" && e.causedBy !== undefined && rank[e.id] < rank[e.causedBy]);
  const consistent = violations.length === 0;

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-ink-900/50 p-3">
        <Toggle label={useWall ? "Wall clock (physical)" : "Lamport clock"} checked={useWall} onChange={setUseWall} />
        <Button onClick={reset} variant="ghost" size="sm">
          <IconReset size={14} /> Reset
        </Button>
      </div>

      {/* per-process action rows */}
      <div className="grid gap-3 sm:grid-cols-3">
        {PROCS.map((p) => {
          const armed = pendingSend && pendingSend.from !== p;
          return (
            <div key={p} className="rounded-lg border border-line bg-ink-900/40 p-3" style={{ borderColor: `color-mix(in oklab, ${PROC_COLOR[p]} 30%, var(--color-line))` }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-sm font-bold" style={{ color: PROC_COLOR[p] }}>
                  {p}
                </span>
                <span className="font-mono text-[10px] text-fg-faint">
                  C=<span className="text-fg-muted">{counters[p]}</span>
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => localEvent(p)}
                  className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  local event
                </button>
                <button
                  type="button"
                  onClick={() => startSend(p)}
                  className="rounded-md border px-2 py-1 font-mono text-[11px] transition-colors"
                  style={{
                    borderColor: pendingSend?.from === p ? PROC_COLOR[p] : "var(--color-line)",
                    color: pendingSend?.from === p ? PROC_COLOR[p] : "var(--color-fg-muted)",
                    background: pendingSend?.from === p ? `color-mix(in oklab, ${PROC_COLOR[p]} 12%, transparent)` : "transparent",
                  }}
                >
                  {pendingSend?.from === p ? "sending… (cancel)" : "send msg →"}
                </button>
                <button
                  type="button"
                  onClick={() => deliverTo(p)}
                  disabled={!armed}
                  className="rounded-md border px-2 py-1 font-mono text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                  style={{
                    borderColor: armed ? "color-mix(in oklab, var(--color-ok) 50%, transparent)" : "var(--color-line)",
                    color: armed ? "var(--color-ok)" : "var(--color-fg-faint)",
                  }}
                >
                  ↓ deliver here
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {pendingSend && (
        <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[11px] text-fg">
          Message in flight from <span style={{ color: PROC_COLOR[pendingSend.from] }}>{pendingSend.from}</span> (carrying counter{" "}
          {events.find((e) => e.id === pendingSend.evId)?.lamport}). Click <span className="text-ok">deliver here</span> on another process.
        </div>
      )}

      {/* spacetime diagram */}
      <Spacetime events={events} useWall={useWall} rank={rank} />

      {/* the resulting total order */}
      <div className="rounded-lg border border-line bg-ink-950/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="kicker">Total order by {useWall ? "physical timestamp" : "Lamport (counter, node)"}</span>
          <span
            className="rounded px-2 py-0.5 font-mono text-[11px]"
            style={{
              color: consistent ? "var(--color-ok)" : "var(--color-fault)",
              background: consistent ? "color-mix(in oklab, var(--color-ok) 14%, transparent)" : "color-mix(in oklab, var(--color-fault) 14%, transparent)",
            }}
          >
            {consistent ? "consistent with causality" : `${violations.length} causality violation${violations.length > 1 ? "s" : ""}`}
          </span>
        </div>
        {ordered.length === 0 ? (
          <p className="font-mono text-[12px] text-fg-faint">Record some events and send a message to build a history.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <AnimatePresence>
              {ordered.map((e, i) => {
                const bad = e.kind === "recv" && e.causedBy !== undefined && rank[e.id] < rank[e.causedBy];
                return (
                  <motion.div key={e.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-fg-faint">→</span>}
                    <span
                      className="rounded px-1.5 py-0.5 font-mono text-[11px]"
                      style={{
                        background: bad ? "color-mix(in oklab, var(--color-fault) 16%, transparent)" : `color-mix(in oklab, ${PROC_COLOR[e.proc]} 14%, transparent)`,
                        color: bad ? "var(--color-fault)" : "var(--color-fg)",
                        border: bad ? "1px solid color-mix(in oklab, var(--color-fault) 50%, transparent)" : "1px solid transparent",
                      }}
                      title={`${e.proc} ${e.kind} · L=${e.lamport} · t=${e.physical}`}
                    >
                      {e.proc}:{useWall ? `t${e.physical}` : e.lamport}
                      {e.kind === "send" ? "↗" : e.kind === "recv" ? "↘" : ""}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
        {!consistent && (
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-fault">
            A delivery is ordered before the send that caused it — physical clocks drift, so raw timestamps can break the
            happens-before relation. Switch off the wall clock to see Lamport timestamps fix it.
          </p>
        )}
      </div>
    </div>
  );
}

/* --------------------------- spacetime diagram -------------------------- */

function Spacetime({
  events,
  useWall,
  rank,
}: {
  events: Ev[];
  useWall: boolean;
  rank: Record<number, number>;
}) {
  const W = 760;
  const laneY: Record<Proc, number> = { P1: 40, P2: 96, P3: 152 };
  const H = 196;
  const padL = 52;
  const padR = 24;

  // X position by creation order (causal truth), evenly spaced.
  const xs: Record<number, number> = {};
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const step = sorted.length > 1 ? (W - padL - padR) / (sorted.length + 0.5) : 0;
  sorted.forEach((e, i) => (xs[e.id] = padL + step * (i + 1)));

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-ink-950/60 p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px]">
        {/* process lifelines */}
        {PROCS.map((p) => (
          <g key={p}>
            <text x={8} y={laneY[p] + 4} className="font-mono" style={{ fontSize: 11, fontWeight: 700, fill: PROC_COLOR[p] }}>
              {p}
            </text>
            <line x1={padL} y1={laneY[p]} x2={W - padR} y2={laneY[p]} stroke="var(--color-line-strong)" strokeWidth={1.25} />
          </g>
        ))}

        {/* message arrows (send -> recv) */}
        {events
          .filter((e) => e.kind === "recv" && e.causedBy !== undefined)
          .map((e) => {
            const send = events.find((s) => s.id === e.causedBy);
            if (!send) return null;
            const x1 = xs[send.id];
            const y1 = laneY[send.proc];
            const x2 = xs[e.id];
            const y2 = laneY[e.proc];
            const bad = rank[e.id] < rank[send.id];
            return (
              <g key={`msg-${e.id}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={bad ? "var(--color-fault)" : "var(--color-fg-faint)"}
                  strokeWidth={1.4}
                  markerEnd="url(#arrow)"
                  strokeDasharray="4 3"
                />
              </g>
            );
          })}

        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-fg-faint)" />
          </marker>
        </defs>

        {/* event dots */}
        {events.map((e) => {
          const cx = xs[e.id];
          const cy = laneY[e.proc];
          const tag = useWall ? `t${e.physical}` : `${e.lamport}`;
          return (
            <g key={e.id}>
              <motion.circle
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                cx={cx}
                cy={cy}
                r={e.kind === "local" ? 5 : 6}
                fill={e.kind === "local" ? "var(--color-ink-900)" : PROC_COLOR[e.proc]}
                stroke={PROC_COLOR[e.proc]}
                strokeWidth={1.6}
              />
              <text x={cx} y={cy - 11} textAnchor="middle" className="font-mono" style={{ fontSize: 9, fontWeight: 700, fill: "var(--color-fg)" }}>
                {tag}
              </text>
            </g>
          );
        })}

        {events.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="font-mono" style={{ fontSize: 11, fill: "var(--color-fg-faint)" }}>
            spacetime diagram — events appear here in causal order
          </text>
        )}
      </svg>
    </div>
  );
}
