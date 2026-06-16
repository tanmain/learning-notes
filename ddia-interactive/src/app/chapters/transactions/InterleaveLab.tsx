"use client";

import { useMemo, useReducer } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, SegmentedControl, Stat } from "@/components/chapter";
import { IconReset, IconCheck, IconAlert, IconBolt } from "@/components/icons";

/**
 * Interleave Lab — the driveable centrepiece.
 *
 * Unlike RaceSimulator (which plays a *fixed* script), here the USER chooses,
 * at every step, which transaction advances next. Each transaction is a queue
 * of pending operations; clicking "T1 ▸ next" or "T2 ▸ next" fires that
 * transaction's head operation against the shared store. The interleaving the
 * user builds determines whether an anomaly emerges.
 *
 * Then flip the isolation level (Read Committed → Snapshot → Serializable) and
 * replay the SAME interleaving to watch the database detect the conflict and
 * abort the offender, restoring the invariant.
 *
 * Isolation semantics modelled (faithful to DDIA, ch. 7):
 *  - Read Committed: each read returns the latest *committed* value (no dirty
 *    reads), but two reads in one txn can differ. No abort on commit.
 *  - Snapshot Isolation: reads come from a snapshot frozen at BEGIN (MVCC).
 *    On commit, lost-update detection only: abort if you WROTE a row whose
 *    committed value changed since your snapshot. Write skew slips through.
 *  - Serializable (SSI): snapshot reads + abort at commit if any row you READ
 *    was modified by an already-committed concurrent txn (read-write conflict).
 *    This single rule stops lost update AND write skew.
 */

/* ------------------------------------------------------------------ types */

type Level = "rc" | "si" | "ser";
type TxId = "T1" | "T2";

type Scenario = "lost" | "skew";

/** A single operation in a transaction's program. */
type Op =
  | { kind: "begin"; label: string }
  | { kind: "read"; rows: string[]; label: string; into: string }
  | { kind: "write"; label: string; compute: (regs: Record<string, number>) => Record<string, number> }
  | { kind: "commit"; label: string };

type World = {
  committed: Record<string, number>;
  snap: Record<TxId, Record<string, number>>;
  buffer: Record<TxId, Record<string, number>>;
  /** local registers (named scalars the program reads into) */
  regs: Record<TxId, Record<string, number>>;
  /** rows each txn has read (for SSI conflict detection) */
  readSet: Record<TxId, Set<string>>;
  /** has BEGIN run? */
  started: Record<TxId, boolean>;
  /** committed or aborted (closed) */
  closed: Record<TxId, boolean>;
  aborted: Record<TxId, boolean>;
};

type ScenarioDef = {
  label: string;
  blurb: string;
  rows: { key: string; label: string; init: number }[];
  program: Record<TxId, Op[]>;
  invariant: (w: World) => { ok: boolean; text: string };
};

/* ------------------------------------------------------- scenario programs */

const SCENARIOS: Record<Scenario, ScenarioDef> = {
  // ── LOST UPDATE ──────────────────────────────────────────────────────────
  lost: {
    label: "Lost update",
    blurb:
      "Both transactions run the same read-modify-write: read the counter, add 1, write it back. Interleave the two reads BEFORE either write and you build the classic lost update — final value 11 instead of 12.",
    rows: [{ key: "counter", label: "counter", init: 10 }],
    invariant: (w) => ({
      ok: w.committed.counter === 12,
      text: "Two +1 increments must leave the counter at 12. A final value of 11 means one update was lost.",
    }),
    program: {
      T1: [
        { kind: "begin", label: "BEGIN" },
        { kind: "read", rows: ["counter"], into: "x", label: "x := READ counter" },
        {
          kind: "write",
          label: "WRITE counter := x + 1",
          compute: (r) => ({ counter: (r.x ?? 0) + 1 }),
        },
        { kind: "commit", label: "COMMIT" },
      ],
      T2: [
        { kind: "begin", label: "BEGIN" },
        { kind: "read", rows: ["counter"], into: "y", label: "y := READ counter" },
        {
          kind: "write",
          label: "WRITE counter := y + 1",
          compute: (r) => ({ counter: (r.y ?? 0) + 1 }),
        },
        { kind: "commit", label: "COMMIT" },
      ],
    },
  },

  // ── WRITE SKEW ──────────────────────────────────────────────────────────
  skew: {
    label: "Write skew",
    blurb:
      "Two on-call doctors each feel unwell. Each transaction checks 'are ≥ 2 doctors on call?', sees 2, and takes ITSELF off call — writing a different row. Snapshot isolation cannot see the conflict because the rows written differ from the row that changed.",
    rows: [
      { key: "alice", label: "Alice on-call", init: 1 },
      { key: "bob", label: "Bob on-call", init: 1 },
    ],
    invariant: (w) => ({
      ok: w.committed.alice + w.committed.bob >= 1,
      text: "At least one doctor must stay on call (alice + bob ≥ 1).",
    }),
    program: {
      T1: [
        { kind: "begin", label: "BEGIN" },
        { kind: "read", rows: ["alice", "bob"], into: "on", label: "on := alice + bob" },
        {
          kind: "write",
          label: "if on ≥ 2 → alice := 0",
          compute: (r): Record<string, number> =>
            (r.alice ?? 0) + (r.bob ?? 0) >= 2 ? { alice: 0 } : {},
        },
        { kind: "commit", label: "COMMIT" },
      ],
      T2: [
        { kind: "begin", label: "BEGIN" },
        { kind: "read", rows: ["alice", "bob"], into: "on", label: "on := alice + bob" },
        {
          kind: "write",
          label: "if on ≥ 2 → bob := 0",
          compute: (r): Record<string, number> =>
            (r.alice ?? 0) + (r.bob ?? 0) >= 2 ? { bob: 0 } : {},
        },
        { kind: "commit", label: "COMMIT" },
      ],
    },
  },
};

/* ---------------------------------------------------------------- engine */

function freshWorld(scenario: Scenario): World {
  const committed: Record<string, number> = {};
  for (const r of SCENARIOS[scenario].rows) committed[r.key] = r.init;
  const byTx = <T,>(make: () => T): Record<TxId, T> => ({ T1: make(), T2: make() });
  return {
    committed,
    snap: byTx(() => ({})),
    buffer: byTx(() => ({})),
    regs: byTx(() => ({})),
    readSet: byTx(() => new Set<string>()),
    started: { T1: false, T2: false },
    closed: { T1: false, T2: false },
    aborted: { T1: false, T2: false },
  };
}

function cloneWorld(w: World): World {
  const byTx = <T,>(rec: Record<TxId, T>, f: (v: T) => T): Record<TxId, T> => ({
    T1: f(rec.T1),
    T2: f(rec.T2),
  });
  return {
    committed: { ...w.committed },
    snap: byTx(w.snap, (s) => ({ ...s })),
    buffer: byTx(w.buffer, (s) => ({ ...s })),
    regs: byTx(w.regs, (s) => ({ ...s })),
    readSet: byTx(w.readSet, (s) => new Set(s)),
    started: { ...w.started },
    closed: { ...w.closed },
    aborted: { ...w.aborted },
  };
}

/** What value does `tx` observe reading `row` right now, under `level`? */
function readValue(w: World, level: Level, tx: TxId, row: string): number {
  const own = w.buffer[tx][row];
  if (own !== undefined) return own; // a txn always sees its own writes
  if (level === "rc") return w.committed[row]; // latest committed (fresh each read)
  return w.snap[tx][row] ?? w.committed[row]; // SI & SER read from the snapshot
}

type LogLine = { text: string; tone: "info" | "ok" | "warn" | "fault" };

type State = {
  scenario: Scenario;
  level: Level;
  world: World;
  /** index of next op to run for each txn */
  pc: Record<TxId, number>;
  /** the order the user fired ops, for the replay affordance */
  history: TxId[];
  log: LogLine[];
};

function init(scenario: Scenario, level: Level): State {
  return {
    scenario,
    level,
    world: freshWorld(scenario),
    pc: { T1: 0, T2: 0 },
    history: [],
    log: [{ text: "Pick whose operation runs next. You control the interleaving.", tone: "info" }],
  };
}

type Action =
  | { type: "advance"; tx: TxId }
  | { type: "reset" }
  | { type: "replay" }
  | { type: "setScenario"; scenario: Scenario }
  | { type: "setLevel"; level: Level };

/** Run a single op for `tx` against a cloned world; returns the new state delta. */
function runOp(state: State, tx: TxId): State {
  const def = SCENARIOS[state.scenario];
  const op = def.program[tx][state.pc[tx]];
  if (!op) return state;

  const w = cloneWorld(state.world);
  const { level } = state;
  const log = [...state.log];

  switch (op.kind) {
    case "begin": {
      w.started[tx] = true;
      w.snap[tx] = { ...w.committed }; // freeze MVCC snapshot at BEGIN
      log.push({ text: `${tx}: BEGIN — snapshot taken.`, tone: "info" });
      break;
    }
    case "read": {
      const seen: Record<string, number> = {};
      for (const row of op.rows) {
        const v = readValue(w, level, tx, row);
        seen[row] = v;
        w.readSet[tx].add(row);
      }
      // store the named register (sum for multi-row reads like alice+bob)
      const total = op.rows.reduce((acc, r) => acc + seen[r], 0);
      w.regs[tx][op.into] = total;
      // also stash individual rows so write compute can re-check them
      for (const row of op.rows) w.regs[tx][row] = seen[row];
      const shown = op.rows.map((r) => `${r}=${seen[r]}`).join(", ");
      log.push({ text: `${tx} reads { ${shown} } → ${op.into}=${total}.`, tone: "info" });
      break;
    }
    case "write": {
      const writes = op.compute(w.regs[tx]);
      const entries = Object.entries(writes);
      if (entries.length === 0) {
        log.push({ text: `${tx}: condition false — no write.`, tone: "info" });
      } else {
        for (const [row, val] of entries) w.buffer[tx][row] = val;
        const shown = entries.map(([r, v]) => `${r}→${v}`).join(", ");
        log.push({ text: `${tx} buffers write { ${shown} } (uncommitted).`, tone: "warn" });
      }
      break;
    }
    case "commit": {
      const conflict = detectConflict(state, w, tx);
      if (conflict) {
        w.buffer[tx] = {};
        w.closed[tx] = true;
        w.aborted[tx] = true;
        log.push({
          text: `${tx} COMMIT rejected — ${conflict}. Aborts & must retry.`,
          tone: "fault",
        });
      } else {
        for (const [row, val] of Object.entries(w.buffer[tx])) w.committed[row] = val;
        w.buffer[tx] = {};
        w.closed[tx] = true;
        log.push({ text: `${tx} COMMIT — writes are now durable.`, tone: "ok" });
      }
      break;
    }
  }

  return {
    ...state,
    world: w,
    pc: { ...state.pc, [tx]: state.pc[tx] + 1 },
    log,
  };
}

/**
 * Decide whether a committing txn must abort under the active level.
 *  - rc: never aborts.
 *  - si: lost-update detection — abort if you WROTE a row whose committed value
 *        diverged from your snapshot (first-committer-wins).
 *  - ser: SSI — abort if ANY row you READ was changed by a committed txn.
 */
function detectConflict(state: State, w: World, tx: TxId): string | null {
  const { level } = state;
  if (level === "rc") return null;

  const other: TxId = tx === "T1" ? "T2" : "T1";
  const otherCommitted = w.closed[other] && !w.aborted[other];
  if (!otherCommitted) return null; // no concurrent commit yet → nothing stale

  if (level === "si") {
    // Did we write a row whose committed value moved since our snapshot?
    const lost = Object.keys(w.buffer[tx]).some(
      (row) => w.snap[tx][row] !== undefined && w.committed[row] !== w.snap[tx][row]
    );
    return lost ? "lost-update detected: a row you wrote changed since your snapshot" : null;
  }

  // ser (SSI): did a committed txn modify any row we READ off our snapshot?
  for (const row of w.readSet[tx]) {
    const snapVal = w.snap[tx][row];
    if (snapVal !== undefined && w.committed[row] !== snapVal) {
      return "serialization conflict: a value you read was modified by a committed transaction";
    }
  }
  return null;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return init(state.scenario, state.level);
    case "setScenario":
      return init(action.scenario, state.level);
    case "setLevel":
      // keep scenario + the user's interleaving order; replay it under the new level
      return replayHistory(init(state.scenario, action.level), state.history);
    case "replay":
      return replayHistory(init(state.scenario, state.level), state.history);
    case "advance": {
      const def = SCENARIOS[state.scenario];
      if (state.pc[action.tx] >= def.program[action.tx].length) return state;
      const next = runOp(state, action.tx);
      return { ...next, history: [...state.history, action.tx] };
    }
    default:
      return state;
  }
}

/** Re-run a recorded sequence of txn choices from a fresh state. */
function replayHistory(base: State, history: TxId[]): State {
  let s = base;
  for (const tx of history) {
    const def = SCENARIOS[s.scenario];
    if (s.pc[tx] >= def.program[tx].length) continue;
    s = runOp(s, tx);
  }
  return { ...s, history };
}

/* -------------------------------------------------------------- component */

const SCENARIO_OPTS: { label: string; value: Scenario }[] = [
  { label: "Lost update", value: "lost" },
  { label: "Write skew", value: "skew" },
];

const LEVEL_OPTS: { label: string; value: Level }[] = [
  { label: "Read Committed", value: "rc" },
  { label: "Snapshot", value: "si" },
  { label: "Serializable", value: "ser" },
];

const LEVEL_SHORT: Record<Level, string> = { rc: "RC", si: "SI", ser: "SER" };

export function InterleaveLab() {
  const [state, dispatch] = useReducer(reducer, undefined, () => init("lost", "rc"));
  const def = SCENARIOS[state.scenario];
  const inv = useMemo(() => def.invariant(state.world), [def, state.world]);

  const bothClosed = state.world.closed.T1 && state.world.closed.T2;
  const anyAbort = state.world.aborted.T1 || state.world.aborted.T2;
  const stepped = state.history.length > 0;

  // The outcome is "safe" when the invariant still holds, OR the database
  // aborted a transaction to block the anomaly. After an abort the application
  // retries the loser, which re-reads the fresh value and produces the correct
  // result — so the anomaly was prevented even if the raw committed value
  // (e.g. counter = 11 under first-committer-wins) isn't yet the final figure.
  const safe = inv.ok || anyAbort;

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="kicker">Anomaly</div>
          <SegmentedControl
            value={state.scenario}
            onChange={(v) => dispatch({ type: "setScenario", scenario: v })}
            options={SCENARIO_OPTS}
          />
        </div>
        <div className="space-y-2">
          <div className="kicker">Isolation level</div>
          <SegmentedControl
            value={state.level}
            onChange={(v) => dispatch({ type: "setLevel", level: v })}
            options={LEVEL_OPTS}
          />
        </div>
      </div>

      <p className="text-sm leading-relaxed text-fg-muted">{def.blurb}</p>

      {/* the two transaction programs side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TxColumn tx="T1" state={state} onAdvance={() => dispatch({ type: "advance", tx: "T1" })} />
        <TxColumn tx="T2" state={state} onAdvance={() => dispatch({ type: "advance", tx: "T2" })} />
      </div>

      {/* shared committed store + registers */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="panel p-4">
          <div className="kicker mb-3">Committed database (shared)</div>
          <div className="space-y-2">
            {def.rows.map((r) => (
              <RowMeter
                key={r.key}
                label={r.label}
                value={state.world.committed[r.key]}
                init={r.init}
              />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-ink-950/60 p-4">
          <div className="kicker mb-2">Execution log</div>
          <div className="max-h-36 space-y-1 overflow-y-auto font-mono text-xs leading-relaxed">
            <AnimatePresence initial={false}>
              {state.log.map((l, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  style={{ color: logColor(l.tone) }}
                >
                  <span className="text-fg-faint">{String(i).padStart(2, "0")} </span>
                  {l.text}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* controls row */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          onClick={() => dispatch({ type: "replay" })}
          disabled={!stepped}
          title="Re-run the exact same interleaving from the start under the current level"
        >
          <IconBolt size={15} /> Replay this order
        </Button>
        <Button variant="ghost" onClick={() => dispatch({ type: "reset" })} disabled={!stepped}>
          <IconReset size={15} /> Reset
        </Button>
        <span className="font-mono text-xs text-fg-faint">
          {state.history.length
            ? `order: ${state.history.join(" → ")}`
            : "no steps yet"}
        </span>
      </div>

      {/* result banner */}
      <AnimatePresence>
        {bothClosed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border p-4"
            style={{
              borderColor: safe ? "var(--color-ok)" : "var(--color-fault)",
              background: `color-mix(in oklab, ${safe ? "var(--color-ok)" : "var(--color-fault)"} 9%, var(--color-ink-900))`,
            }}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0" style={{ color: safe ? "var(--color-ok)" : "var(--color-fault)" }}>
                {safe ? <IconCheck size={18} /> : <IconAlert size={18} />}
              </span>
              <div className="space-y-1">
                <div
                  className="font-mono text-xs uppercase tracking-wider"
                  style={{ color: safe ? "var(--color-ok)" : "var(--color-fault)" }}
                >
                  {anyAbort
                    ? "Anomaly blocked · a transaction was aborted"
                    : inv.ok
                      ? "Invariant preserved"
                      : "Invariant violated"}
                </div>
                <p className="text-sm leading-relaxed text-fg">{inv.text}</p>
                {!safe && (
                  <p className="text-xs leading-relaxed text-fg-muted">
                    The anomaly slipped through at this level. Switch to a stronger level —{" "}
                    <strong>Snapshot</strong> catches the lost update, <strong>Serializable</strong>{" "}
                    catches write skew too — and hit <em>Replay this order</em> to watch the database
                    abort the offender.
                  </p>
                )}
                {anyAbort && (
                  <p className="text-xs leading-relaxed text-fg-muted">
                    The database refused the conflicting commit. The application retries the aborted
                    transaction; on retry it reads the fresh committed value and lands the correct
                    result.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* live gauges */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Level" value={LEVEL_SHORT[state.level]} tone="accent" />
        <Stat
          label="Outcome"
          value={bothClosed ? (safe ? "safe" : "corrupt") : "running"}
          tone={bothClosed ? (safe ? "ok" : "fault") : "default"}
        />
        <Stat label="Aborts" value={(state.world.aborted.T1 ? 1 : 0) + (state.world.aborted.T2 ? 1 : 0)} tone={anyAbort ? "warn" : "default"} />
        <Stat label="Steps" value={state.history.length} tone="info" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- sub-views */

function logColor(tone: LogLine["tone"]): string {
  return tone === "ok"
    ? "var(--color-ok)"
    : tone === "warn"
      ? "var(--color-warn)"
      : tone === "fault"
        ? "var(--color-fault)"
        : "color-mix(in oklab, var(--color-fg) 78%, transparent)";
}

function TxColumn({
  tx,
  state,
  onAdvance,
}: {
  tx: TxId;
  state: State;
  onAdvance: () => void;
}) {
  const def = SCENARIOS[state.scenario];
  const ops = def.program[tx];
  const pc = state.pc[tx];
  const closed = state.world.closed[tx];
  const aborted = state.world.aborted[tx];
  const color = tx === "T1" ? "var(--accent)" : "var(--color-special)";
  const done = pc >= ops.length || closed;

  // local register readout
  const regs = Object.entries(state.world.regs[tx]).filter(
    // hide the per-row scratch copies; show only named regs (x, y, on)
    ([k]) => ["x", "y", "on"].includes(k)
  );
  const buffered = Object.entries(state.world.buffer[tx]);

  return (
    <div className="panel overflow-hidden">
      <div
        className="flex items-center justify-between border-b border-line px-4 py-2.5"
        style={{ background: `color-mix(in oklab, ${color} 8%, transparent)` }}
      >
        <span className="font-mono text-xs font-bold uppercase tracking-wider" style={{ color }}>
          {tx}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: aborted ? "var(--color-fault)" : closed ? "var(--color-ok)" : "var(--color-fg-faint)" }}>
          {aborted ? "aborted" : closed ? "committed" : "active"}
        </span>
      </div>

      <div className="space-y-1.5 p-3">
        {ops.map((op, i) => {
          const executed = i < pc;
          const isNext = i === pc && !closed;
          return (
            <div
              key={i}
              className="rounded-md border px-3 py-1.5 transition-colors"
              style={{
                borderColor: isNext ? color : "var(--color-line)",
                background: isNext
                  ? `color-mix(in oklab, ${color} 12%, transparent)`
                  : executed
                    ? "var(--color-ink-850)"
                    : "transparent",
                opacity: executed || isNext ? 1 : 0.4,
                boxShadow: isNext ? `0 0 0 1px ${color}` : "none",
              }}
            >
              <span
                className="font-mono text-[11px] leading-tight"
                style={{ color: executed || isNext ? "var(--color-fg)" : "var(--color-fg-faint)" }}
              >
                {op.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* register + buffer readout */}
      <div className="grid grid-cols-2 gap-2 border-t border-line px-3 py-2.5">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-fg-faint">register</div>
          {regs.length ? (
            regs.map(([k, v]) => (
              <div key={k} className="font-mono text-xs text-fg">
                {k} = <span style={{ color }}>{v}</span>
              </div>
            ))
          ) : (
            <div className="font-mono text-xs text-fg-faint">∅</div>
          )}
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-fg-faint">buffered</div>
          {buffered.length ? (
            buffered.map(([k, v]) => (
              <div key={k} className="font-mono text-xs" style={{ color: "var(--color-warn)" }}>
                {k} → {v}
              </div>
            ))
          ) : (
            <div className="font-mono text-xs text-fg-faint">∅</div>
          )}
        </div>
      </div>

      <div className="border-t border-line p-3">
        <Button size="sm" onClick={onAdvance} disabled={done} className="w-full">
          {done ? "finished" : `${tx} ▸ run next op`}
        </Button>
      </div>
    </div>
  );
}

function RowMeter({ label, value, init }: { label: string; value: number; init: number }) {
  const changed = value !== init;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-ink-850 px-3 py-2">
      <span className="font-mono text-xs text-fg-muted">{label}</span>
      <motion.span
        key={value}
        initial={{ scale: 1.25, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        className="font-mono text-base font-semibold tabular-nums"
        style={{ color: changed ? "var(--accent)" : "var(--color-fg)" }}
      >
        {value}
      </motion.span>
    </div>
  );
}
