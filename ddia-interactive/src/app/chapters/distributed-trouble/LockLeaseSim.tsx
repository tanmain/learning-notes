"use client";

import { useCallback, useMemo, useReducer } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Toggle, Button, Stat } from "@/components/chapter";
import { IconStep, IconReset, IconPause, IconCheck, IconX, IconBolt, IconDatabase } from "@/components/icons";

/* ----------------------------------------------------------------------------
   "Distributed lock gone wrong" — a driveable, time-stepped simulation.

   You advance a shared clock ONE TICK at a time and inject a GC pause into
   whichever client currently holds the lease. The classic corruption unfolds:

     • A client acquires a lease (valid for LEASE_TTL ticks) + a fencing token.
     • You freeze it with a stop-the-world GC pause. The clock keeps ticking;
       the frozen client has NO idea time is passing.
     • Its lease expires. The lock service grants the lease to the other client
       with a HIGHER fencing token. That client writes safely.
     • The frozen client thaws, still believing it holds the lock, and fires a
       now-stale write stamped with its OLD token.

   The storage server is the adjudicator. With fencing ON it remembers the
   highest token it has durably accepted and REJECTS any lower token — the
   zombie write bounces. With fencing OFF it cannot tell the zombie from a live
   writer, so the stale write lands and clobbers good data: split-brain loss.

   This is a real little state machine, not a slider: every action mutates the
   world and you watch causality play out tick by tick. Reducer-driven so the
   logic is auditable and replays deterministically.
---------------------------------------------------------------------------- */

const LEASE_TTL = 4; // ticks a freshly granted lease stays valid

type ClientId = "A" | "B";

type ClientState = {
  /** is this client frozen in a stop-the-world pause right now? */
  paused: boolean;
  /** clock tick at which a paused client will thaw (only meaningful while paused) */
  wakeAt: number;
  /** fencing token this client currently believes it holds (0 = none) */
  token: number;
  /** the client still *thinks* it holds the lock until it acts and learns otherwise */
  thinksItHolds: boolean;
};

/** A GC pause outlasts the lease, so the holder loses it while frozen. */
const PAUSE_DURATION = LEASE_TTL + 1;

type LogEntry = { t: number; text: string; tone: "ok" | "warn" | "fault" | "info" | "muted" };

type Sim = {
  clock: number; // shared true-time tick counter
  fencing: boolean;
  /** who currently holds the lease, per the lock service, and until when */
  holder: ClientId | null;
  leaseExpiresAt: number; // clock tick at which the current lease lapses
  nextToken: number; // next fencing token the lock service will hand out
  storedToken: number; // highest token storage has durably accepted
  storedValue: string; // current value in storage
  corrupted: boolean; // did a stale write ever land?
  clients: Record<ClientId, ClientState>;
  /** transient flag: the most recent write attempt's verdict, for the wire anim */
  lastWrite: { by: ClientId; token: number; accepted: boolean } | null;
  log: LogEntry[];
  done: boolean; // storyboard reached its conclusion
};

type Action =
  | { type: "TICK" }
  | { type: "PAUSE"; who: ClientId }
  | { type: "RESET" }
  | { type: "SET_FENCING"; on: boolean };

function freshClients(): Record<ClientId, ClientState> {
  return {
    A: { paused: false, wakeAt: 0, token: 0, thinksItHolds: false },
    B: { paused: false, wakeAt: 0, token: 0, thinksItHolds: false },
  };
}

function init(fencing: boolean): Sim {
  // The sim opens with Client A already granted the lease + token 1.
  return {
    clock: 0,
    fencing,
    holder: "A",
    leaseExpiresAt: LEASE_TTL,
    nextToken: 2,
    storedToken: 0,
    storedValue: "—",
    corrupted: false,
    clients: { ...freshClients(), A: { paused: false, wakeAt: 0, token: 1, thinksItHolds: true } },
    lastWrite: null,
    log: [
      { t: 0, text: "Lock service grants the lease to Client A with fencing token 1.", tone: "info" },
      { t: 0, text: `Lease valid until t=${LEASE_TTL}. Advance the clock, or pause A mid-hold.`, tone: "muted" },
    ],
    done: false,
  };
}

function reducer(sim: Sim, action: Action): Sim {
  switch (action.type) {
    case "SET_FENCING":
      // Changing the rule resets the world so a clean comparison is possible.
      return init(action.on);

    case "RESET":
      return init(sim.fencing);

    case "PAUSE": {
      const who = action.who;
      if (sim.clients[who].paused || sim.done) return sim;
      const wakeAt = sim.clock + PAUSE_DURATION;
      const log = [...sim.log];
      log.push({
        t: sim.clock,
        text: `Client ${who} hits a stop-the-world GC pause (frozen until t=${wakeAt}). It stops perceiving time — but its lease keeps counting down.`,
        tone: "warn",
      });
      return {
        ...sim,
        clients: { ...sim.clients, [who]: { ...sim.clients[who], paused: true, wakeAt } },
        lastWrite: null,
        log,
      };
    }

    case "TICK": {
      if (sim.done) return sim;
      const clock = sim.clock + 1;
      const log = [...sim.log];
      let { holder, leaseExpiresAt, nextToken, storedToken, storedValue } = sim;
      let corrupted: boolean = sim.corrupted;
      let done: boolean = sim.done;
      const clients: Record<ClientId, ClientState> = {
        A: { ...sim.clients.A },
        B: { ...sim.clients.B },
      };
      let lastWrite: Sim["lastWrite"] = null;

      // 1) Has the current lease expired? If so the lock service reclaims it.
      if (holder && clock >= leaseExpiresAt) {
        const expiredHolder = holder;
        // The expired holder is NOT told — that is the whole danger. If it's
        // paused, it will wake up still believing it holds the lock.
        log.push({
          t: clock,
          text: `Lease for Client ${expiredHolder} has expired (t=${clock} ≥ ${leaseExpiresAt}).`,
          tone: "warn",
        });
        holder = null;
      }

      // 2) If the lease is free, grant it to a LIVE (non-paused) client that
      //    wants it. Here the "other" client steps in to take over the work.
      if (holder === null) {
        const candidate: ClientId | null =
          !clients.B.paused && !clients.B.thinksItHolds && sim.clients.A.paused
            ? "B"
            : !clients.A.paused && sim.clients.B.paused
            ? "A"
            : null;
        if (candidate) {
          const token = nextToken;
          nextToken += 1;
          holder = candidate;
          leaseExpiresAt = clock + LEASE_TTL;
          clients[candidate] = { ...clients[candidate], token, thinksItHolds: true };
          log.push({
            t: clock,
            text: `Lock service grants the lease to Client ${candidate} with a higher token ${token}.`,
            tone: "info",
          });
          // The fresh holder immediately writes — safely.
          const value = `${candidate}: data v${token}`;
          if (token >= storedToken) {
            storedToken = token;
            storedValue = value;
            log.push({
              t: clock,
              text: `Client ${candidate} writes "${value}" with token ${token}. Storage accepts it.`,
              tone: "ok",
            });
            lastWrite = { by: candidate, token, accepted: true };
          }
        }
      }

      // 3) Does a PAUSED client thaw this tick? A pause lasts ~2 ticks; once the
      //    holder has changed beneath it, the thawed client becomes a zombie.
      (["A", "B"] as ClientId[]).forEach((id) => {
        const c = clients[id];
        if (c.paused && clock >= c.wakeAt && holder !== id && holder !== null) {
          // Wake it up: the GC pause is over.
          clients[id] = { ...c, paused: false };
          log.push({
            t: clock,
            text: `Client ${id} thaws — oblivious — and still believes it holds the lock.`,
            tone: "warn",
          });
          // It immediately flushes its long-delayed write with its STALE token.
          const staleToken = c.token;
          const value = `${id}: STALE write`;
          if (sim.fencing && staleToken < storedToken) {
            // Fenced out.
            log.push({
              t: clock,
              text: `Storage sees token ${staleToken} < ${storedToken}. Fenced out — write REJECTED.`,
              tone: "ok",
            });
            lastWrite = { by: id, token: staleToken, accepted: false };
            clients[id] = { ...clients[id], thinksItHolds: false };
          } else {
            // No fencing (or somehow a valid token): the zombie write lands.
            storedValue = value;
            corrupted = true;
            log.push({
              t: clock,
              text: `No fence: storage can't tell ${id} is stale. It overwrites good data — corruption.`,
              tone: "fault",
            });
            lastWrite = { by: id, token: staleToken, accepted: true };
            clients[id] = { ...clients[id], thinksItHolds: false };
          }
          done = true; // the cautionary tale has reached its point
        }
      });

      return {
        ...sim,
        clock,
        holder,
        leaseExpiresAt,
        nextToken,
        storedToken,
        storedValue,
        corrupted,
        clients,
        lastWrite,
        log,
        done,
      };
    }

    default:
      return sim;
  }
}

/* geometry for the scene */
const A_BOX = { x: 18, y: 24 };
const B_BOX = { x: 18, y: 128 };
const STORE = { x: 330, y: 70 };
const BOX_W = 132;
const BOX_H = 58;

export function LockLeaseSim() {
  const [sim, dispatch] = useReducer(reducer, true, init);

  const tick = useCallback(() => dispatch({ type: "TICK" }), []);
  const pauseA = useCallback(() => dispatch({ type: "PAUSE", who: "A" }), []);
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);
  const setFencing = useCallback((on: boolean) => dispatch({ type: "SET_FENCING", on }), []);

  const aPaused = sim.clients.A.paused;
  const canPauseA = !aPaused && sim.holder === "A" && !sim.done;

  // Outcome banner state.
  const outcome: "none" | "fenced" | "corrupt" = !sim.done
    ? "none"
    : sim.corrupted
    ? "corrupt"
    : "fenced";

  const integrity = sim.corrupted ? "VIOLATED" : sim.done ? "intact" : "—";

  // A little hint nudging the user toward the interesting path.
  const hint = useMemo(() => {
    if (sim.done) return "Flip the fencing toggle and Replay to compare the two endings.";
    if (aPaused) return "A is frozen. Keep stepping — its lease will lapse, B will take over, then A wakes up stale.";
    if (sim.holder === "A") return "Pause Client A while it holds the lease, then step the clock repeatedly.";
    return "Step the clock to advance true time.";
  }, [sim.done, aPaused, sim.holder]);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Toggle label="Fencing tokens" checked={sim.fencing} onChange={setFencing} />
        <span className="font-mono text-[11px] text-fg-faint">true clock · t = {sim.clock}</span>
      </div>

      {/* Scene */}
      <div className="overflow-hidden rounded-lg border border-line bg-ink-950/60 p-4">
        <svg viewBox="0 0 500 210" className="w-full" role="img" aria-label="Distributed lock simulation">
          {/* Lease-timer bar across the top */}
          <LeaseBar sim={sim} />

          {/* Client A */}
          <ClientBox
            id="A"
            x={A_BOX.x}
            y={A_BOX.y}
            color="var(--accent)"
            holder={sim.holder === "A"}
            paused={sim.clients.A.paused}
            token={sim.clients.A.token}
            thinks={sim.clients.A.thinksItHolds}
          />
          {/* Client B */}
          <ClientBox
            id="B"
            x={B_BOX.x}
            y={B_BOX.y}
            color="var(--color-special)"
            holder={sim.holder === "B"}
            paused={sim.clients.B.paused}
            token={sim.clients.B.token}
            thinks={sim.clients.B.thinksItHolds}
          />

          {/* Storage server */}
          <rect
            x={STORE.x}
            y={STORE.y}
            width={150}
            height={70}
            rx={10}
            fill="var(--color-ink-800)"
            stroke="var(--color-ok)"
            strokeWidth={1.6}
          />
          <text x={STORE.x + 75} y={STORE.y + 20} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-ok)">
            STORAGE
          </text>
          <text x={STORE.x + 75} y={STORE.y + 36} textAnchor="middle" className="font-mono" fontSize={7.5} fill="var(--color-fg-muted)">
            {sim.storedValue}
          </text>
          <text x={STORE.x + 75} y={STORE.y + 50} textAnchor="middle" className="font-mono" fontSize={7} fill="var(--color-fg-faint)">
            max token: {sim.storedToken || "—"}
          </text>
          <text x={STORE.x + 75} y={STORE.y + 62} textAnchor="middle" className="font-mono" fontSize={6.5} fill={sim.fencing ? "var(--color-ok)" : "var(--color-fault)"}>
            fencing: {sim.fencing ? "ON" : "OFF"}
          </text>

          {/* Write packet animation on the most recent write */}
          <AnimatePresence>
            {sim.lastWrite && (
              <motion.g key={`w-${sim.clock}-${sim.lastWrite.by}-${sim.lastWrite.token}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {(() => {
                  const fromY = sim.lastWrite.by === "A" ? A_BOX.y + BOX_H / 2 : B_BOX.y + BOX_H / 2;
                  const accepted = sim.lastWrite.accepted;
                  const tone = accepted
                    ? sim.corrupted
                      ? "var(--color-fault)"
                      : "var(--color-ok)"
                    : "var(--color-fault)";
                  const targetX = accepted ? STORE.x : STORE.x - 30;
                  return (
                    <>
                      <line
                        x1={A_BOX.x + BOX_W}
                        y1={fromY}
                        x2={STORE.x}
                        y2={STORE.y + 35}
                        stroke={tone}
                        strokeWidth={1}
                        strokeDasharray="3 4"
                        opacity={0.4}
                      />
                      <motion.circle
                        r={4.5}
                        fill={tone}
                        cy={STORE.y + 35}
                        initial={{ cx: A_BOX.x + BOX_W }}
                        animate={{ cx: targetX }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                      {!accepted && (
                        <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ transformOrigin: `${STORE.x - 30}px ${STORE.y + 35}px` }}>
                          <circle cx={STORE.x - 30} cy={STORE.y + 35} r={11} fill="var(--color-ink-900)" stroke="var(--color-fault)" strokeWidth={1.6} />
                          <path d={`M${STORE.x - 35} ${STORE.y + 30} l10 10 M${STORE.x - 25} ${STORE.y + 30} l-10 10`} stroke="var(--color-fault)" strokeWidth={1.8} strokeLinecap="round" />
                        </motion.g>
                      )}
                    </>
                  );
                })()}
              </motion.g>
            )}
          </AnimatePresence>
        </svg>
      </div>

      {/* Outcome banner */}
      <AnimatePresence>
        {outcome !== "none" && (
          <motion.div
            key={`outcome-${outcome}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-start gap-3 rounded-lg border-l-2 p-4 ${
              outcome === "fenced" ? "border-ok bg-ok/10" : "border-fault bg-fault/10"
            }`}
          >
            <span className="mt-0.5 shrink-0" style={{ color: outcome === "fenced" ? "var(--color-ok)" : "var(--color-fault)" }}>
              {outcome === "fenced" ? <IconCheck size={18} /> : <IconX size={18} />}
            </span>
            <div className="text-sm leading-relaxed text-fg">
              {outcome === "fenced" ? (
                <>
                  <strong className="text-ok">Stale write fenced out.</strong> Storage had already accepted token{" "}
                  {sim.storedToken}, so the zombie&apos;s lower token bounced. The takeover client&apos;s data stands —
                  the paused client could not corrupt anything, even though it never realised it had lost the lock.
                </>
              ) : (
                <>
                  <strong className="text-fault">Split-brain corruption.</strong> With no fencing token, storage
                  couldn&apos;t tell the thawed client was a zombie. Its stale write overwrote good data — silent loss,
                  raised as no error at all. Toggle fencing on and replay.
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Lease holder" value={sim.holder ?? "free"} tone={sim.holder === "A" ? "accent" : sim.holder === "B" ? "special" : "warn"} />
        <Stat label="Stored value" value={<span className="text-sm">{sim.storedValue}</span>} tone={sim.corrupted ? "fault" : sim.storedToken ? "ok" : "default"} />
        <Stat label="Server max token" value={sim.storedToken || "—"} tone="ok" />
        <Stat label="Integrity" value={integrity} tone={sim.corrupted ? "fault" : "ok"} />
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={tick} disabled={sim.done}>
          <IconStep size={14} /> Step clock (+1 tick)
        </Button>
        <Button onClick={pauseA} variant="outline" size="sm" disabled={!canPauseA}>
          <IconPause size={13} /> Inject GC pause on A
        </Button>
        <Button onClick={reset} variant="ghost" size="sm">
          <IconReset size={13} /> {sim.done ? "Replay" : "Reset"}
        </Button>
      </div>
      <p className="flex items-center gap-2 font-mono text-[11px] leading-relaxed text-fg-faint">
        <IconBolt size={12} className="shrink-0 text-warn" />
        {hint}
      </p>

      {/* Event log — the causal trace */}
      <div className="rounded-lg border border-line bg-ink-950/40 p-3">
        <div className="kicker mb-2 flex items-center gap-2 text-info">
          <IconDatabase size={13} />
          <span>Event log</span>
        </div>
        <ol className="space-y-1.5">
          <AnimatePresence initial={false}>
            {sim.log.map((e, i) => (
              <motion.li
                key={`${i}-${e.text}`}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex gap-2.5 font-mono text-[11px] leading-relaxed"
              >
                <span className="shrink-0 tabular-nums text-fg-faint">t={e.t}</span>
                <span style={{ color: logColor(e.tone) }}>{e.text}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </div>
    </div>
  );
}

function logColor(tone: LogEntry["tone"]): string {
  switch (tone) {
    case "ok":
      return "var(--color-ok)";
    case "warn":
      return "var(--color-warn)";
    case "fault":
      return "var(--color-fault)";
    case "info":
      return "var(--color-info)";
    default:
      return "var(--color-fg-muted)";
  }
}

/* ---- sub-components (presentational SVG fragments) ---- */

function LeaseBar({ sim }: { sim: Sim }) {
  // Visualise lease validity as a depleting bar between t and leaseExpiresAt.
  const W = 464;
  const x0 = 18;
  const span = 12; // ticks shown across the bar
  const x = (t: number) => x0 + (Math.min(t, span) / span) * W;
  const holderColor = sim.holder === "A" ? "var(--accent)" : sim.holder === "B" ? "var(--color-special)" : "var(--color-warn)";
  return (
    <g opacity={0.9}>
      <text x={x0} y={12} className="font-mono" fontSize={7.5} fill="var(--color-fg-faint)">
        true time →
      </text>
      <line x1={x0} y1={18} x2={x0 + W} y2={18} stroke="var(--color-line)" strokeWidth={1} />
      {/* lease validity window */}
      {sim.holder && (
        <rect
          x={x(sim.clock)}
          y={14}
          width={Math.max(0, x(sim.leaseExpiresAt) - x(sim.clock))}
          height={8}
          rx={2}
          fill={holderColor}
          opacity={0.35}
        />
      )}
      {/* now marker */}
      <line x1={x(sim.clock)} y1={12} x2={x(sim.clock)} y2={22} stroke="var(--color-fg)" strokeWidth={1.5} />
      <text x={x(sim.clock)} y={9} textAnchor="middle" className="font-mono" fontSize={6.5} fill="var(--color-fg)">
        t{sim.clock}
      </text>
      {sim.holder && (
        <text x={x(sim.leaseExpiresAt)} y={9} textAnchor="middle" className="font-mono" fontSize={6.5} fill={holderColor}>
          lease ends
        </text>
      )}
    </g>
  );
}

function ClientBox({
  id,
  x,
  y,
  color,
  holder,
  paused,
  token,
  thinks,
}: {
  id: ClientId;
  x: number;
  y: number;
  color: string;
  holder: boolean;
  paused: boolean;
  token: number;
  thinks: boolean;
}) {
  const stroke = paused ? "var(--color-warn)" : holder ? color : thinks ? "var(--color-warn)" : "var(--color-line-strong)";
  return (
    <g opacity={paused ? 0.6 : 1}>
      <rect x={x} y={y} width={BOX_W} height={BOX_H} rx={10} fill="var(--color-ink-800)" stroke={stroke} strokeWidth={1.6} />
      <text x={x + BOX_W / 2} y={y + 20} textAnchor="middle" className="font-mono" fontSize={9} fill={color}>
        CLIENT {id}
      </text>
      <text x={x + BOX_W / 2} y={y + 35} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-muted)">
        {paused ? "GC PAUSE — frozen" : token ? `token ${token}` : "idle"}
      </text>
      <text x={x + BOX_W / 2} y={y + 48} textAnchor="middle" className="font-mono" fontSize={6.5} fill="var(--color-fg-faint)">
        {holder ? "holds lease ✓" : thinks ? "thinks it holds ✗" : "no lease"}
      </text>
      {paused && (
        <motion.rect
          x={x}
          y={y}
          width={BOX_W}
          height={BOX_H}
          rx={10}
          fill="none"
          stroke="var(--color-warn)"
          strokeWidth={1.6}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
      )}
    </g>
  );
}
