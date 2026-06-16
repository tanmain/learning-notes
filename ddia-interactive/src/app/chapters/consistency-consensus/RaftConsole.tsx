"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Stat } from "@/components/chapter";
import { IconReset, IconBolt, IconStep, IconPlay, IconPause } from "@/components/icons";

/**
 * Raft Console — a driveable leader election + log replication sandbox.
 *
 * Five nodes advance on a logical clock you control (step the time, or let it
 * auto-tick). Each follower runs an election timeout; when it fires without a
 * heartbeat from a current-term leader, the follower becomes a CANDIDATE, bumps
 * its term, and requests votes. A node grants its vote only to a candidate whose
 * log is at least as up-to-date as its own (Raft's election restriction). A
 * candidate that collects a quorum (3/5) of votes becomes LEADER and starts
 * sending heartbeats.
 *
 * You can:
 *   • crash / revive any node
 *   • drop the network into TWO partitions and watch split-brain be PREVENTED
 *     (only the side with a majority can elect a leader or commit)
 *   • heal the partition and watch the stale minority leader step down and its
 *     uncommitted log get overwritten to reconcile with the real leader
 *   • append commands, which commit only once a quorum has replicated them
 *
 * This is a faithful teaching model of Raft's safety intuition (terms, election
 * timeouts, quorum commit, the election restriction, epoch-fencing of zombie
 * leaders), not a byte-accurate implementation of the wire protocol.
 */

type Role = "leader" | "follower" | "candidate" | "down";
type Entry = { term: number; cmd: string };

type NodeState = {
  id: string;
  side: 0 | 1; // which network partition the node sits in
  role: Role;
  term: number;
  votedFor: string | null; // candidate this node voted for, in `term`
  votes: number; // votes tallied while a candidate
  log: Entry[];
  /** ticks remaining on this follower's randomized election timeout */
  timeout: number;
};

const N = 5;
const QUORUM = Math.floor(N / 2) + 1; // 3
const IDS = ["n1", "n2", "n3", "n4", "n5"];
const CMDS = ["set x=1", "set y=A", "set x=2", "del z", "set y=B", "inc x", "set z=9", "set y=C"];

// Election-timeout band (in ticks). Randomized per node so they rarely all
// time out at once — this is exactly how Raft avoids perpetual split votes.
const TIMEOUT_MIN = 3;
const TIMEOUT_MAX = 6;

type Tone = "info" | "ok" | "warn" | "special" | "fault";
type LogLine = { id: number; text: string; tone: Tone };

function randTimeout() {
  return TIMEOUT_MIN + Math.floor(Math.random() * (TIMEOUT_MAX - TIMEOUT_MIN + 1));
}

function freshNodes(): NodeState[] {
  return IDS.map((id, i) => ({
    id,
    side: 0,
    role: i === 0 ? "leader" : "follower",
    term: 1,
    votedFor: null,
    votes: 0,
    log: [],
    timeout: randTimeout(),
  }));
}

/** Two nodes can exchange messages iff they're alive and on the same side. */
function reachable(a: NodeState, b: NodeState) {
  return a.role !== "down" && b.role !== "down" && a.side === b.side;
}

/** Leader is "more up to date" than voter? Raft compares (lastTerm, length). */
function logIsUpToDate(candidate: NodeState, voter: NodeState) {
  const cLastTerm = candidate.log.at(-1)?.term ?? 0;
  const vLastTerm = voter.log.at(-1)?.term ?? 0;
  if (cLastTerm !== vLastTerm) return cLastTerm > vLastTerm;
  return candidate.log.length >= voter.log.length;
}

export function RaftConsole() {
  const [nodes, setNodes] = useState<NodeState[]>(freshNodes);
  const [logs, setLogs] = useState<LogLine[]>([
    { id: 0, text: "Cluster online · n1 elected leader for term 1", tone: "ok" },
  ]);
  const [tick, setTick] = useState(0);
  const [cmdCursor, setCmdCursor] = useState(0);
  const [partitioned, setPartitioned] = useState(false);
  const [running, setRunning] = useState(false);
  const logId = useRef(1);

  const pushLog = useCallback((text: string, tone: Tone) => {
    setLogs((l) => [{ id: logId.current++, text, tone }, ...l].slice(0, 9));
  }, []);

  /* ----------------------- the simulation step ------------------------- */
  // A live mirror of `nodes` so the auto-run interval and any back-to-back
  // clicks always advance from the freshest state, never a stale closure.
  const nodesRef = useRef(nodes);
  const writeNodes = useCallback((updater: NodeState[] | ((p: NodeState[]) => NodeState[])) => {
    const value = typeof updater === "function" ? updater(nodesRef.current) : updater;
    nodesRef.current = value;
    setNodes(value);
  }, []);

  // One logical tick: compute the next cluster state + event lines, apply both.
  const step = useCallback(() => {
    const { next, events } = advance(nodesRef.current);
    writeNodes(next);
    for (const e of events) pushLog(e.text, e.tone);
    setTick((t) => t + 1);
  }, [pushLog, writeNodes]);

  /* ---------------------------- auto-run ------------------------------- */
  useEffect(() => {
    if (!running) return;
    const h = window.setInterval(step, 900);
    return () => window.clearInterval(h);
  }, [running, step]);

  /* ----------------------------- actions ------------------------------- */
  function appendCommand() {
    const live = nodesRef.current;
    const leaders = live.filter((n) => n.role === "leader");
    if (leaders.length === 0) {
      pushLog("No leader — append rejected. Step time so an election can run.", "warn");
      return;
    }
    // Append at the leader on the majority side (the only one that can commit).
    const leader = leaders.find((l) => sideAlive(live, l.side) >= QUORUM) ?? leaders[0];
    const cmd = CMDS[cmdCursor % CMDS.length];
    setCmdCursor((c) => c + 1);
    const entry: Entry = { term: leader.term, cmd };

    writeNodes((prev) => prev.map((n) => (n.id === leader.id ? { ...n, log: [...n.log, entry] } : n)));

    const replicas = live.filter((n) => reachable(n, leader)).length; // includes leader
    if (replicas >= QUORUM) {
      pushLog(`Leader ${leader.id} appended "${cmd}" — will commit once replicated to ${QUORUM}/${N}.`, "info");
    } else {
      pushLog(`Leader ${leader.id} appended "${cmd}" but only ${replicas}/${N} reachable — cannot commit (no quorum).`, "warn");
    }
  }

  function crash(id: string) {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node || node.role === "down") return;
    const wasLeader = node.role === "leader";
    writeNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, role: "down", votes: 0, votedFor: null } : n)),
    );
    if (wasLeader) {
      pushLog(`Leader ${id} crashed — followers will time out and start an election. Step time ▶`, "fault");
    } else {
      pushLog(`${id} crashed.`, "warn");
    }
  }

  function revive(id: string) {
    writeNodes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, role: "follower", votes: 0, votedFor: null, timeout: randTimeout() } : n,
      ),
    );
    pushLog(`${id} rejoined as a follower. It will catch up from the next heartbeat.`, "info");
  }

  function togglePartition() {
    const now = !partitioned;
    setPartitioned(now);
    if (now) {
      // Split {n1,n2} | {n3,n4,n5}: a 2 | 3 minority/majority cut.
      writeNodes((prev) => prev.map((n) => ({ ...n, side: n.id === "n1" || n.id === "n2" ? 0 : 1 })));
      pushLog("Network PARTITIONED: {n1,n2} | {n3,n4,n5}. The minority side can't elect or commit — split-brain prevented.", "fault");
    } else {
      writeNodes((prev) => prev.map((n) => ({ ...n, side: 0 })));
      pushLog("Partition HEALED. Any stale minority leader will step down; logs reconcile to the real leader. Step time ▶", "ok");
    }
  }

  function reset() {
    writeNodes(freshNodes());
    setLogs([{ id: 0, text: "Cluster reset · n1 leader for term 1", tone: "ok" }]);
    logId.current = 1;
    setTick(0);
    setCmdCursor(0);
    setPartitioned(false);
    setRunning(false);
  }

  /* ------------------------- derived display --------------------------- */
  const term = Math.max(...nodes.map((n) => n.term));
  const aliveCount = nodes.filter((n) => n.role !== "down").length;
  const commitIndex = useMemo(() => computeCommitIndex(nodes), [nodes]);
  const leaderLabel = useMemo(() => {
    const ls = nodes.filter((n) => n.role === "leader");
    if (ls.length === 0) return "—";
    return ls.map((l) => l.id).join(", ");
  }, [nodes]);
  const maxLen = Math.max(1, ...nodes.map((n) => n.log.length));
  const sides = useMemo(() => sideStats(nodes), [nodes]);
  const noMajorityAnywhere = !sides.some((s) => s.alive >= QUORUM);

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button onClick={step} variant="solid">
          <IconStep size={15} /> Step time
        </Button>
        <Button onClick={() => setRunning((r) => !r)} variant="outline">
          {running ? <IconPause size={14} /> : <IconPlay size={14} />} {running ? "Pause" : "Auto-run"}
        </Button>
        <Button onClick={appendCommand} variant="outline">
          <IconBolt size={14} /> Append command
        </Button>
        <Button
          onClick={togglePartition}
          variant={partitioned ? "solid" : "ghost"}
          size="sm"
          className={partitioned ? "!border-fault !bg-fault" : ""}
        >
          {partitioned ? "Heal partition" : "Partition network"}
        </Button>
        <Button onClick={reset} variant="ghost" size="sm">
          <IconReset size={14} /> Reset
        </Button>
        <span className="ml-auto font-mono text-xs text-fg-faint">
          tick {tick} · quorum {QUORUM}/{N}
        </span>
      </div>

      {/* node grid, grouped by partition side when split */}
      {partitioned ? (
        <div className="grid gap-3 sm:grid-cols-[2fr_3fr]">
          <PartitionGroup
            label={`Side A · ${sides[0].alive} alive`}
            hasQuorum={sides[0].alive >= QUORUM}
            nodes={nodes.filter((n) => n.side === 0)}
            commitIndex={commitIndex}
            maxLen={maxLen}
            onCrash={crash}
            onRevive={revive}
          />
          <PartitionGroup
            label={`Side B · ${sides[1].alive} alive`}
            hasQuorum={sides[1].alive >= QUORUM}
            nodes={nodes.filter((n) => n.side === 1)}
            commitIndex={commitIndex}
            maxLen={maxLen}
            onCrash={crash}
            onRevive={revive}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          {nodes.map((n) => (
            <NodeCard
              key={n.id}
              node={n}
              commitIndex={commitIndex}
              maxLen={maxLen}
              onCrash={() => crash(n.id)}
              onRevive={() => revive(n.id)}
            />
          ))}
        </div>
      )}

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Highest term" value={term} tone="special" />
        <Stat label="Leader(s)" value={leaderLabel} tone={leaderLabel === "—" ? "fault" : "accent"} />
        <Stat label="Alive" value={`${aliveCount}/${N}`} tone={aliveCount >= QUORUM ? "ok" : "fault"} />
        <Stat label="Committed" value={commitIndex} unit="entries" tone="ok" />
      </div>

      {noMajorityAnywhere && (
        <div className="rounded-lg border border-fault/40 bg-fault/10 px-4 py-3 font-mono text-xs leading-relaxed text-fg">
          No partition holds a majority ({QUORUM}+ nodes), so no leader can be elected and nothing new can commit.
          This is consensus refusing to risk a split brain — it would rather stall than let two sides diverge.
        </div>
      )}

      {/* event log */}
      <div className="rounded-lg border border-line bg-ink-950/60 p-4">
        <div className="kicker mb-3">Event log</div>
        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {logs.map((l) => (
              <motion.div
                key={l.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 font-mono text-[12px] leading-relaxed"
              >
                <span style={{ color: toneColor(l.tone) }}>›</span>
                <span className="text-fg-muted">{l.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- partition group --------------------------- */

function PartitionGroup({
  label,
  hasQuorum,
  nodes,
  commitIndex,
  maxLen,
  onCrash,
  onRevive,
}: {
  label: string;
  hasQuorum: boolean;
  nodes: NodeState[];
  commitIndex: number;
  maxLen: number;
  onCrash: (id: string) => void;
  onRevive: (id: string) => void;
}) {
  return (
    <div
      className="rounded-xl border-2 border-dashed p-3"
      style={{
        borderColor: hasQuorum
          ? "color-mix(in oklab, var(--color-ok) 45%, transparent)"
          : "color-mix(in oklab, var(--color-fault) 45%, transparent)",
      }}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-fg-muted">{label}</span>
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
          style={{
            color: hasQuorum ? "var(--color-ok)" : "var(--color-fault)",
            background: `color-mix(in oklab, ${hasQuorum ? "var(--color-ok)" : "var(--color-fault)"} 14%, transparent)`,
          }}
        >
          {hasQuorum ? "has quorum" : "no quorum"}
        </span>
      </div>
      <div className={`grid gap-2.5 ${nodes.length <= 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {nodes.map((n) => (
          <NodeCard
            key={n.id}
            node={n}
            commitIndex={commitIndex}
            maxLen={maxLen}
            onCrash={() => onCrash(n.id)}
            onRevive={() => onRevive(n.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ node card ------------------------------ */

function NodeCard({
  node,
  commitIndex,
  maxLen,
  onCrash,
  onRevive,
}: {
  node: NodeState;
  commitIndex: number;
  maxLen: number;
  onCrash: () => void;
  onRevive: () => void;
}) {
  const down = node.role === "down";
  const isLeader = node.role === "leader";
  const isCandidate = node.role === "candidate";
  const accent = roleColor(node.role);

  return (
    <motion.div
      animate={{
        opacity: down ? 0.45 : 1,
        boxShadow: isLeader ? "0 0 0 1px var(--accent)" : "none",
      }}
      className="flex flex-col rounded-lg border bg-ink-900/60 p-3"
      style={{
        borderColor: isLeader
          ? "color-mix(in oklab, var(--accent) 55%, transparent)"
          : isCandidate
            ? "color-mix(in oklab, var(--color-special) 50%, transparent)"
            : "var(--color-line)",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-sm font-bold text-fg">{node.id}</span>
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
          style={{ color: accent, background: `color-mix(in oklab, ${accent} 14%, transparent)` }}
        >
          {node.role}
        </span>
      </div>

      <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-fg-faint">
        <span>
          term <span className="text-fg-muted">{node.term}</span>
        </span>
        {isCandidate && (
          <span style={{ color: "var(--color-special)" }}>{node.votes} votes</span>
        )}
        {!isLeader && !isCandidate && !down && (
          <span title="ticks until this follower starts an election">⏱ {node.timeout}</span>
        )}
      </div>

      {/* log cells */}
      <div className="mb-3 flex flex-wrap gap-1">
        {Array.from({ length: maxLen }).map((_, i) => {
          const entry = node.log[i];
          const committed = i < commitIndex;
          if (!entry) {
            return <span key={i} className="h-5 w-5 rounded-sm border border-dashed border-line" />;
          }
          return (
            <motion.span
              key={i}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              title={`${entry.cmd} (term ${entry.term})`}
              className="flex h-5 w-5 items-center justify-center rounded-sm font-mono text-[9px] font-bold"
              style={{
                background: committed
                  ? "color-mix(in oklab, var(--color-ok) 22%, transparent)"
                  : "color-mix(in oklab, var(--color-warn) 18%, transparent)",
                color: committed ? "var(--color-ok)" : "var(--color-warn)",
                border: `1px solid ${
                  committed
                    ? "color-mix(in oklab, var(--color-ok) 50%, transparent)"
                    : "color-mix(in oklab, var(--color-warn) 45%, transparent)"
                }`,
              }}
            >
              {entry.term}
            </motion.span>
          );
        })}
      </div>

      <div className="mt-auto">
        {down ? (
          <button
            type="button"
            onClick={onRevive}
            className="w-full rounded-md border border-ok/40 bg-ok/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ok transition-colors hover:bg-ok/20"
          >
            revive
          </button>
        ) : (
          <button
            type="button"
            onClick={onCrash}
            className="w-full rounded-md border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-faint transition-colors hover:border-fault/50 hover:text-fault"
          >
            crash
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------- helpers ------------------------------- */

/**
 * Advance the cluster by one logical tick. Pure: takes the current node list,
 * returns the next list plus an ordered list of event-log lines. Models
 * heartbeats, election timeouts, candidacy, vote granting, quorum commit, and
 * epoch-fencing of stale leaders — all partition-aware.
 */
function advance(prev: NodeState[]): { next: NodeState[]; events: { text: string; tone: Tone }[] } {
  const events: { text: string; tone: Tone }[] = [];
  const next = prev.map((n) => ({ ...n }));

  // 1) A live leader heartbeats every node it can reach, resetting their
  //    election timeouts and pulling them up to its term + log.
  for (const ldr of next.filter((n) => n.role === "leader")) {
    for (const f of next) {
      if (f.id === ldr.id || f.role === "down") continue;
      if (!reachable(ldr, f)) continue;
      if (ldr.term >= f.term) {
        f.term = ldr.term;
        f.role = "follower";
        f.votedFor = null;
        f.votes = 0;
        f.timeout = randTimeout();
        // Replicate / repair the follower's log toward the leader's.
        f.log = ldr.log.map((e) => ({ ...e }));
      }
    }
  }

  // 2) Followers / candidates that can't hear a current leader count down.
  for (const n of next) {
    if (n.role === "down" || n.role === "leader") continue;
    const hearsLeader = next.some((m) => m.role === "leader" && reachable(m, n) && m.term >= n.term);
    if (hearsLeader) {
      n.timeout = randTimeout();
      continue;
    }
    n.timeout -= 1;
  }

  // 3) Any node whose timeout expired starts an election (becomes candidate).
  for (const n of next) {
    if (n.role === "down" || n.role === "leader") continue;
    if (n.timeout > 0) continue;
    n.role = "candidate";
    n.term += 1;
    n.votedFor = n.id; // votes for itself
    n.votes = 1;
    n.timeout = randTimeout();
    events.push({
      text: `${n.id} timed out → candidate, starts election for term ${n.term}`,
      tone: "special",
    });

    // Request votes from every reachable peer.
    for (const peer of next) {
      if (peer.id === n.id || peer.role === "down") continue;
      if (!reachable(n, peer)) continue;
      const freshTerm = n.term > peer.term;
      const sameTermUnvoted = n.term === peer.term && (peer.votedFor === null || peer.votedFor === n.id);
      const canVote = (freshTerm || sameTermUnvoted) && logIsUpToDate(n, peer);
      if (canVote) {
        peer.term = n.term;
        peer.role = "follower";
        peer.votedFor = n.id;
        peer.votes = 0;
        peer.timeout = randTimeout();
        n.votes += 1;
      } else if (n.term > peer.term) {
        // Adopt the higher term but withhold the vote (log not up to date).
        peer.term = n.term;
      }
    }
  }

  // 4) Resolve candidacies: a quorum of votes wins the term.
  for (const c of next.filter((n) => n.role === "candidate")) {
    if (c.votes >= QUORUM) {
      c.role = "leader";
      c.votedFor = null;
      events.push({
        text: `Term ${c.term}: ${c.id} won with ${c.votes}/${N} votes (quorum) → new leader`,
        tone: "ok",
      });
      for (const o of next) {
        if (o.id !== c.id && o.role === "candidate" && o.term <= c.term) {
          o.role = "follower";
          o.votes = 0;
          o.votedFor = null;
          o.timeout = randTimeout();
        }
      }
    }
  }

  // 5) Epoch fencing: a leader carrying a stale term steps down the moment a
  //    higher term exists (e.g. just after a partition heals).
  const maxTerm = Math.max(...next.map((n) => n.term));
  for (const n of next) {
    if (n.role === "leader" && n.term < maxTerm) {
      n.role = "follower";
      n.votes = 0;
      n.votedFor = null;
      n.timeout = randTimeout();
      events.push({
        text: `${n.id} saw a higher term (${maxTerm}) and stepped down — zombie leader fenced.`,
        tone: "warn",
      });
    }
  }

  // 6) Teaching note: a candidate stranded in a sub-quorum partition can never
  //    win. Surface that once so the stall is legible rather than mysterious.
  for (const s of sideStats(next).filter((x) => x.alive < QUORUM)) {
    const stuck = next.find((n) => n.side === s.side && n.role === "candidate");
    if (stuck) {
      events.push({
        text: `${stuck.id} can't win — its partition has only ${s.alive}/${N}, short of quorum ${QUORUM}. No leader here.`,
        tone: "fault",
      });
      break;
    }
  }

  return { next, events };
}

/** commit index = longest prefix length present on a strict majority of nodes. */
function computeCommitIndex(nodes: NodeState[]): number {
  const maxLen = Math.max(0, ...nodes.map((n) => n.log.length));
  let committed = 0;
  for (let i = 1; i <= maxLen; i++) {
    const have = nodes.filter((n) => n.log.length >= i).length;
    if (have >= QUORUM) committed = i;
    else break;
  }
  return committed;
}

function sideAlive(nodes: NodeState[], side: 0 | 1) {
  return nodes.filter((n) => n.side === side && n.role !== "down").length;
}

function sideStats(nodes: NodeState[]): { side: 0 | 1; alive: number }[] {
  return [0, 1].map((s) => ({ side: s as 0 | 1, alive: sideAlive(nodes, s as 0 | 1) }));
}

function roleColor(role: Role): string {
  switch (role) {
    case "leader":
      return "var(--accent)";
    case "candidate":
      return "var(--color-special)";
    case "down":
      return "var(--color-fault)";
    default:
      return "var(--color-info)";
  }
}

function toneColor(tone: Tone): string {
  switch (tone) {
    case "ok":
      return "var(--color-ok)";
    case "warn":
      return "var(--color-warn)";
    case "special":
      return "var(--color-special)";
    case "fault":
      return "var(--color-fault)";
    default:
      return "var(--color-info)";
  }
}
