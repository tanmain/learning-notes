"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Slider, Toggle, Stat } from "@/components/chapter";
import { IconBolt, IconReset, IconStep } from "@/components/icons";

/* ----------------------------------------------------------------------------
   Single-leader replication sandbox — now a driveable failover simulation.

   A leader streams its ordered replication log to three followers. The user can:
     • crank the asynchronous replication lag up or down,
     • flip on semi-synchronous replication (R1 confirms before a write returns),
     • WRITE a new version to the leader,
     • STEP TIME to deliver in-flight log records one tick at a time,
     • KILL THE LEADER mid-flight and trigger a FAILOVER that promotes the most
       caught-up follower — exposing async writes the new leader never received,
     • READ any replica, surfacing read-your-writes violations in red.

   The point: failover is where async replication bites. A write the dead leader
   acknowledged but hadn't yet shipped is simply LOST when a less-current
   follower is promoted — and any client that already saw that write now reads a
   value that has travelled backward in time.
---------------------------------------------------------------------------- */

const NUM_NODES = 4; // 1 leader + 3 followers initially
const TICK_MS = 380;

type Node = {
  id: number;
  /** value currently visible on this replica */
  value: number;
  /** the LSN this replica has durably applied */
  applied: number;
  /** ticks remaining until the next pending record lands (0 = nothing flying) */
  eta: number;
  /** the record still in transit toward this node, if any */
  pending: { lsn: number; value: number } | null;
  role: "leader" | "follower" | "dead";
};

type LastRead = {
  nodeId: number;
  value: number;
  lsn: number;
  stale: boolean;
} | null;

type State = {
  nodes: Node[];
  leaderId: number; // id of the current leader (-1 if none until failover)
  committedLsn: number; // highest LSN any leader has ever acknowledged
  tick: number;
  lastRead: LastRead;
  writeCount: number;
  lostWrites: number; // writes acked by a dead leader that no live node holds
  phase: "live" | "leader-down" | "failed-over";
  log: { text: string; tone: "info" | "ok" | "warn" | "fault" }[];
};

type Action =
  | { type: "WRITE"; value: number; lag: number; sync: boolean }
  | { type: "TICK" }
  | { type: "KILL_LEADER" }
  | { type: "FAILOVER" }
  | { type: "READ"; nodeId: number }
  | { type: "RESET" };

function freshNodes(): Node[] {
  return Array.from({ length: NUM_NODES }, (_, id) => ({
    id,
    value: 0,
    applied: 0,
    eta: 0,
    pending: null,
    role: id === 0 ? "leader" : "follower",
  }));
}

function initial(): State {
  return {
    nodes: freshNodes(),
    leaderId: 0,
    committedLsn: 0,
    tick: 0,
    lastRead: null,
    writeCount: 0,
    lostWrites: 0,
    phase: "live",
    log: [{ text: "Cluster healthy. R0 leads; R1–R3 follow. Write, then step time.", tone: "info" }],
  };
}

/** ticks an async follower waits, derived from the lag slider + its distance. */
function etaFor(node: Node, leaderId: number, lag: number, sync: boolean): number {
  if (node.id === leaderId) return 0;
  const isSyncFollower = sync && node.id === 1;
  if (isSyncFollower) return 1; // semi-sync follower confirms almost immediately
  // 0..2000ms maps to ~1..6 ticks, plus a little spread by node id for staggering
  const base = 1 + Math.round((lag / 2000) * 5);
  return base + (node.id % 3);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "WRITE": {
      if (state.leaderId < 0) return state;
      const lsn = state.committedLsn + 1;
      const log = [...state.log];
      log.push({
        text: `WRITE v${action.value} → leader R${state.leaderId} (committed as lsn #${lsn}). Streaming to followers…`,
        tone: "info",
      });
      const nodes = state.nodes.map((n) => {
        if (n.role === "dead") return n;
        if (n.id === state.leaderId) return { ...n, value: action.value, applied: lsn };
        const pending = { lsn, value: action.value };
        return { ...n, pending, eta: etaFor(n, state.leaderId, action.lag, action.sync) };
      });
      return {
        ...state,
        nodes,
        committedLsn: lsn,
        writeCount: state.writeCount + 1,
        lastRead: null,
        log,
      };
    }

    case "TICK": {
      let delivered = 0;
      const nodes = state.nodes.map((n) => {
        if (!n.pending || n.role === "dead") return n;
        const eta = n.eta - 1;
        if (eta > 0) return { ...n, eta };
        delivered++;
        return { ...n, value: n.pending.value, applied: n.pending.lsn, pending: null, eta: 0 };
      });
      if (delivered === 0 && !state.nodes.some((n) => n.pending)) return state;
      const log = [...state.log];
      if (delivered > 0) {
        const caught = nodes.filter((n) => n.role !== "dead" && n.applied === state.committedLsn).length;
        log.push({
          text: `tick — ${delivered} follower(s) applied the next record. ${caught} live node(s) now current.`,
          tone: "ok",
        });
      }
      return { ...state, nodes, tick: state.tick + 1, log };
    }

    case "KILL_LEADER": {
      if (state.leaderId < 0) return state;
      const dead = state.leaderId;
      const log = [...state.log];
      log.push({
        text: `R${dead} (leader) CRASHED. Any writes it acked but had not yet shipped are now stranded on a dead node.`,
        tone: "fault",
      });
      const nodes = state.nodes.map((n) =>
        n.id === dead ? { ...n, role: "dead" as const, pending: null, eta: 0 } : n
      );
      return { ...state, nodes, leaderId: -1, phase: "leader-down", lastRead: null, log };
    }

    case "FAILOVER": {
      if (state.phase !== "leader-down") return state;
      // Promote the live follower with the highest applied LSN (most caught up).
      const candidates = state.nodes.filter((n) => n.role === "follower");
      if (candidates.length === 0) return state;
      const winner = candidates.reduce((best, n) => (n.applied > best.applied ? n : best));
      // Any in-flight records on the OTHER followers are abandoned: the new
      // leader will only ever propagate what it itself holds.
      const lostWrites = Math.max(0, state.committedLsn - winner.applied);
      const log = [...state.log];
      log.push({
        text: `FAILOVER — R${winner.id} is the most caught-up follower (lsn #${winner.applied}) and is promoted to leader.`,
        tone: "warn",
      });
      if (lostWrites > 0) {
        log.push({
          text: `Data loss: ${lostWrites} write(s) the old leader acknowledged (up to lsn #${state.committedLsn}) never reached R${winner.id} and are gone for good.`,
          tone: "fault",
        });
      } else {
        log.push({
          text: `Clean failover: R${winner.id} had every acknowledged write, so nothing was lost.`,
          tone: "ok",
        });
      }
      const nodes = state.nodes.map((n) => {
        if (n.id === winner.id) return { ...n, role: "leader" as const, pending: null, eta: 0 };
        if (n.role === "follower") {
          // followers abandon any in-flight record and re-sync to the new leader's history
          return { ...n, pending: null, eta: 0, value: winner.value, applied: winner.applied };
        }
        return n;
      });
      return {
        ...state,
        nodes,
        leaderId: winner.id,
        committedLsn: winner.applied, // the surviving history is now the truth
        lostWrites: state.lostWrites + lostWrites,
        phase: "failed-over",
        log,
      };
    }

    case "READ": {
      const node = state.nodes.find((n) => n.id === action.nodeId);
      if (!node || node.role === "dead") return state;
      const stale = node.applied < state.committedLsn;
      return {
        ...state,
        lastRead: { nodeId: node.id, value: node.value, lsn: node.applied, stale },
      };
    }

    case "RESET":
      return initial();

    default:
      return state;
  }
}

/* geometry — leader on the left, three followers stacked on the right */
const POS = [
  { x: 110, y: 130 }, // R0 (initial leader)
  { x: 348, y: 52 }, // R1
  { x: 366, y: 130 }, // R2
  { x: 348, y: 208 }, // R3
];

export function LeaderFollowerDemo() {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  const lagRef = useRef(900);
  const syncRef = useRef(false);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const lag = lagRef.current;
  const sync = syncRef.current;

  // Auto-advance time while records are in flight, so "step" is optional.
  const playingRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const inFlight = state.nodes.some((n) => n.pending);

  useEffect(() => {
    if (!inFlight) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      playingRef.current = false;
      return;
    }
    if (!playingRef.current) {
      playingRef.current = true;
      intervalRef.current = window.setInterval(() => dispatch({ type: "TICK" }), TICK_MS);
    }
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      playingRef.current = false;
    };
  }, [inFlight]);

  const setLag = useCallback((v: number) => {
    lagRef.current = v;
    force();
  }, []);
  const setSync = useCallback((v: boolean) => {
    syncRef.current = v;
    force();
  }, []);

  const write = useCallback(() => {
    const value = Math.floor(Math.random() * 90) + 10; // 2-digit "version"
    dispatch({ type: "WRITE", value, lag: lagRef.current, sync: syncRef.current });
  }, []);

  const maxLag = state.nodes.reduce(
    (m, n) => (n.role === "dead" ? m : Math.max(m, Math.max(0, state.committedLsn - n.applied))),
    0
  );

  const leaderDown = state.phase === "leader-down";

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Slider
          label="Replication lag (async followers)"
          value={lag}
          min={0}
          max={2000}
          step={50}
          onChange={setLag}
          format={(n) => `${n} ms`}
        />
        <div className="flex items-center gap-4">
          <Toggle label="Semi-sync (R1)" checked={sync} onChange={setSync} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={write} disabled={state.leaderId < 0}>
          <IconBolt size={14} /> Write to leader
        </Button>
        <Button variant="outline" size="md" onClick={() => dispatch({ type: "TICK" })} disabled={!inFlight}>
          <IconStep size={14} /> Step time
        </Button>
        {!leaderDown ? (
          <Button
            variant="outline"
            size="md"
            onClick={() => dispatch({ type: "KILL_LEADER" })}
            disabled={state.leaderId < 0}
            className="!border-fault !text-fault hover:!bg-transparent"
          >
            Kill leader
          </Button>
        ) : (
          <Button
            variant="solid"
            size="md"
            onClick={() => dispatch({ type: "FAILOVER" })}
            className="!border-warn !bg-warn"
          >
            Promote a follower (failover) →
          </Button>
        )}
        <Button variant="ghost" size="md" onClick={() => dispatch({ type: "RESET" })}>
          <IconReset size={14} /> Reset
        </Button>
      </div>

      {leaderDown && (
        <div
          className="rounded-lg border px-4 py-2.5 font-mono text-xs"
          style={{
            borderColor: "var(--color-warn)",
            background: "color-mix(in oklab, var(--color-warn) 10%, var(--color-ink-900))",
            color: "var(--color-warn)",
          }}
        >
          Leader is down. Step time first to let some followers catch up, or promote now to see how much
          un-replicated data the failover throws away.
        </div>
      )}

      {/* visualization */}
      <div className="rounded-lg border border-line bg-ink-950/50 p-3">
        <svg viewBox="0 0 440 260" className="w-full" role="img" aria-label="Leader and followers replication topology">
          {/* edges */}
          {state.nodes.map((n) => {
            if (n.id === state.leaderId || n.role === "dead") return null;
            const leaderPos = state.leaderId >= 0 ? POS[state.leaderId] : null;
            if (!leaderPos) return null;
            const p = POS[n.id];
            const live = n.pending !== null;
            const isSyncFollower = sync && n.id === 1;
            return (
              <path
                key={`edge-${n.id}`}
                d={`M ${leaderPos.x + 30} ${leaderPos.y} C ${leaderPos.x + 110} ${leaderPos.y}, ${p.x - 90} ${p.y}, ${p.x - 28} ${p.y}`}
                fill="none"
                stroke={live ? "var(--accent)" : "var(--color-line-strong)"}
                strokeOpacity={live ? 0.75 : 1}
                strokeWidth={1.5}
                strokeDasharray={isSyncFollower ? "0" : "5 6"}
              />
            );
          })}

          {/* in-flight log packets — position interpolated from remaining eta */}
          <AnimatePresence>
            {state.nodes.map((n) => {
              if (!n.pending || n.role === "dead" || state.leaderId < 0) return null;
              const leaderPos = POS[state.leaderId];
              const p = POS[n.id];
              const total = etaFor(n, state.leaderId, lag, sync) || 1;
              const progress = Math.min(1, Math.max(0, (total - n.eta) / total));
              const cx = leaderPos.x + 30 + (p.x - 28 - (leaderPos.x + 30)) * progress;
              const cy = leaderPos.y + (p.y - leaderPos.y) * progress;
              return (
                <motion.circle
                  key={`pkt-${n.id}-${n.pending.lsn}`}
                  r={5}
                  fill="var(--accent)"
                  initial={false}
                  animate={{ cx, cy }}
                  transition={{ duration: TICK_MS / 1000, ease: "linear" }}
                />
              );
            })}
          </AnimatePresence>

          {/* nodes */}
          {state.nodes.map((n) => {
            const p = POS[n.id];
            const isLeader = n.role === "leader";
            const isDead = n.role === "dead";
            const behind = !isDead && n.applied < state.committedLsn;
            const isSyncFollower = sync && n.id === 1 && !isLeader && !isDead;
            const read = state.lastRead?.nodeId === n.id;

            const ring = isDead
              ? "var(--color-fault)"
              : isLeader
                ? "var(--accent)"
                : behind
                  ? "var(--color-warn)"
                  : "var(--color-ok)";
            const fill = isLeader
              ? "color-mix(in oklab, var(--accent) 20%, var(--color-ink-850))"
              : isDead
                ? "color-mix(in oklab, var(--color-fault) 14%, var(--color-ink-900))"
                : "var(--color-ink-800)";

            return (
              <g key={`node-${n.id}`} opacity={isDead ? 0.55 : 1}>
                {isSyncFollower && (
                  <circle cx={p.x} cy={p.y} r={isLeader ? 34 : 28} fill="none" stroke="var(--color-ok)" strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />
                )}
                <circle cx={p.x} cy={p.y} r={isLeader ? 30 : 24} fill={fill} stroke={ring} strokeWidth={isLeader ? 2 : 1.75} />

                <text x={p.x} y={p.y - (isLeader ? 6 : 5)} textAnchor="middle" className="font-mono font-semibold" fontSize={isLeader ? 9 : 8} fill={isDead ? "var(--color-fault)" : isLeader ? "var(--color-fg)" : "var(--color-fg-muted)"}>
                  {isLeader ? "LEADER" : `R${n.id}`}
                </text>
                <text x={p.x} y={p.y + (isLeader ? 7 : 8)} textAnchor="middle" className="font-mono" fontSize={isLeader ? 13 : 12} fontWeight={700} fill={isDead ? "var(--color-fault)" : behind ? "var(--color-warn)" : isLeader ? "var(--accent)" : "var(--color-fg)"}>
                  {isDead ? "✕" : `v${n.value}`}
                </text>
                <text x={p.x} y={p.y + (isLeader ? 18 : 18)} textAnchor="middle" className="font-mono" fontSize={6.5} fill="var(--color-fg-faint)">
                  {isDead ? "crashed" : `lsn #${n.applied}`}
                </text>
                {isLeader && (
                  <text x={p.x} y={p.y - 36} textAnchor="middle" className="font-mono" fontSize={6.5} fill="var(--accent)">
                    R{n.id}
                  </text>
                )}
                {isSyncFollower && (
                  <text x={p.x} y={p.y - 32} textAnchor="middle" className="font-mono" fontSize={6.5} fill="var(--color-ok)">
                    SYNC
                  </text>
                )}
                {!isDead && (
                  <ReadButton x={p.x} y={p.y + (isLeader ? 46 : 44)} label={isLeader ? "read leader" : `read R${n.id}`} onClick={() => dispatch({ type: "READ", nodeId: n.id })} active={read} />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* read result + stats */}
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
        <ReadResult read={state.lastRead} committedValue={leaderValueOf(state)} />
        <Stat label="Max follower lag" value={maxLag} unit="behind" tone={maxLag > 0 ? "warn" : "ok"} />
        <Stat label="Writes lost to failover" value={state.lostWrites} tone={state.lostWrites > 0 ? "fault" : "default"} />
      </div>

      {/* event log */}
      <div className="rounded-lg border border-line bg-ink-950/60 p-4">
        <div className="kicker mb-2">Replication log</div>
        <div className="max-h-32 space-y-1 overflow-y-auto font-mono text-xs leading-relaxed">
          <AnimatePresence initial={false}>
            {state.log.map((l, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} style={{ color: logColor(l.tone) }}>
                <span className="text-fg-faint">{String(i).padStart(2, "0")} </span>
                {l.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function leaderValueOf(state: State): number {
  const leader = state.nodes.find((n) => n.id === state.leaderId);
  return leader ? leader.value : 0;
}

function logColor(tone: "info" | "ok" | "warn" | "fault"): string {
  return tone === "ok"
    ? "var(--color-ok)"
    : tone === "warn"
      ? "var(--color-warn)"
      : tone === "fault"
        ? "var(--color-fault)"
        : "color-mix(in oklab, var(--color-fg) 78%, transparent)";
}

/* in-SVG read button */
function ReadButton({
  x,
  y,
  label,
  onClick,
  active,
}: {
  x: number;
  y: number;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <g style={{ cursor: "pointer" }} onClick={onClick}>
      <rect
        x={x - 32}
        y={y - 9}
        width={64}
        height={18}
        rx={9}
        fill={active ? "color-mix(in oklab, var(--color-info) 30%, var(--color-ink-850))" : "var(--color-ink-850)"}
        stroke={active ? "var(--color-info)" : "var(--color-line-strong)"}
        strokeWidth={1}
      />
      <text x={x} y={y + 3.5} textAnchor="middle" className="font-mono" fontSize={7.5} fill={active ? "var(--color-info)" : "var(--color-fg-muted)"}>
        {label}
      </text>
    </g>
  );
}

function ReadResult({ read, committedValue }: { read: LastRead; committedValue: number }) {
  if (!read) {
    return (
      <div className="flex items-center rounded-lg border border-dashed border-line bg-ink-900/40 px-4 py-3 font-mono text-xs text-fg-faint">
        Write a value, then click a node&apos;s <span className="mx-1 accent-text">read</span> pill to query it.
      </div>
    );
  }
  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{
        borderColor: read.stale ? "var(--color-fault)" : "var(--color-ok)",
        background: read.stale
          ? "color-mix(in oklab, var(--color-fault) 10%, var(--color-ink-900))"
          : "color-mix(in oklab, var(--color-ok) 9%, var(--color-ink-900))",
      }}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: read.stale ? "var(--color-fault)" : "var(--color-ok)" }}>
        {read.stale ? "Stale read — read-your-writes violated" : "Fresh read"}
      </div>
      <div className="mt-1 font-mono text-sm text-fg">
        Read <span className="font-bold text-fg">v{read.value}</span> from R{read.nodeId}
        {read.stale && (
          <>
            {" "}
            <span className="text-fault">— but the leader already holds v{committedValue}.</span>
          </>
        )}
      </div>
    </div>
  );
}
