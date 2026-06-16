"use client";

import { useMemo, useReducer } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, SegmentedControl, Stat } from "@/components/chapter";
import { IconStep, IconReset, IconCheck, IconAlert } from "@/components/icons";

/* ------------------------------------------------------------------ types */

type Level = "ru" | "rc" | "si" | "ser";
type Scenario = "dirty" | "lost" | "skew";
type Actor = "T1" | "T2" | "DB";

/** One scripted step in an interleaving. The `effect` mutates the world. */
type Step = {
  actor: Actor;
  /** Short SQL-ish label shown in the timeline. */
  code: string;
  /** Plain-English narration. */
  note: string;
  kind: "read" | "write" | "commit" | "begin";
};

type World = {
  /** Committed, durable values keyed by row. */
  committed: Record<string, number>;
  /** Per-transaction snapshot taken at BEGIN (SI / Serializable read from this). */
  snap: Record<Actor, Record<string, number>>;
  /** Uncommitted buffered writes per transaction. */
  buffer: Record<Actor, Record<string, number>>;
  /** Local register values each transaction has read into memory. */
  reg: Record<Actor, Record<string, number | undefined>>;
  /** Which rows each transaction has READ (for SSI conflict detection). */
  readSet: Record<Actor, Set<string>>;
  /** Whether a transaction has committed already. */
  done: Record<Actor, boolean>;
};

type Verdict = "ok" | "abort";

type ScenarioDef = {
  label: string;
  anomaly: string;
  rows: { key: string; label: string; init: number }[];
  /** invariant evaluated against the final world for the result banner */
  invariant: (w: World) => { ok: boolean; text: string };
  build: (level: Level) => Step[];
  /** What each level does, for the explanation strip. */
  outcome: Record<Level, { verdict: Verdict; summary: string }>;
};

/* ----------------------------------------------------- helpers for reads */

/**
 * What value does `actor` observe when reading `row` at this moment?
 * - Read Uncommitted: latest value *including* another txn's buffered write → dirty read.
 * - Read Committed: latest *committed* value (no dirty reads), fresh per read.
 * - Snapshot / Serializable: the value frozen in the actor's snapshot.
 * A transaction always sees its own buffered writes.
 */
function readValue(w: World, level: Level, actor: Actor, row: string): number {
  const ownWrite = w.buffer[actor][row];
  if (ownWrite !== undefined) return ownWrite;
  if (level === "ru") {
    // Read Uncommitted can see any in-flight buffered write from the OTHER txn.
    const other: Actor = actor === "T1" ? "T2" : "T1";
    const dirty = w.buffer[other][row];
    if (dirty !== undefined) return dirty;
    return w.committed[row];
  }
  if (level === "rc") return w.committed[row];
  return w.snap[actor][row] ?? w.committed[row];
}

/* ------------------------------------------------------- scenario scripts */

const SCENARIOS: Record<Scenario, ScenarioDef> = {
  // ── DIRTY READ ──────────────────────────────────────────────────────────
  dirty: {
    label: "Dirty read",
    anomaly: "T2 reads a value T1 wrote but never committed.",
    rows: [{ key: "balance", label: "balance", init: 100 }],
    invariant: (w) => {
      const seen = w.reg.T2.balance;
      const dirty = seen === 60; // T2 observed the rolled-back value
      return {
        ok: !dirty,
        text: dirty
          ? `T2 observed balance = 60 — a value that was rolled back and never truly existed.`
          : `T2 only ever observed the committed balance (100). No dirty read occurred.`,
      };
    },
    build: () => [
      { actor: "T1", code: "BEGIN", note: "T1 starts a transfer.", kind: "begin" },
      { actor: "T1", code: "balance = 100 − 40 → 60", note: "T1 writes 60, but has NOT committed yet.", kind: "write" },
      { actor: "T2", code: "BEGIN", note: "T2 starts to read the balance.", kind: "begin" },
      { actor: "T2", code: "READ balance", note: "What does T2 see — the dirty 60, or the committed 100?", kind: "read" },
      { actor: "T1", code: "ROLLBACK", note: "T1 hits an error and aborts. Its write of 60 vanishes.", kind: "commit" },
    ],
    outcome: {
      ru: { verdict: "ok", summary: "Read Uncommitted lets T2 see the buffered 60 — a DIRTY READ of a value that gets rolled back." },
      rc: { verdict: "ok", summary: "Read Committed hides uncommitted writes — T2 reads 100. No dirty read." },
      si: { verdict: "ok", summary: "Snapshot Isolation reads from a committed snapshot — T2 reads 100." },
      ser: { verdict: "ok", summary: "Serializable also forbids dirty reads — T2 reads 100." },
    },
  },

  // ── LOST UPDATE ─────────────────────────────────────────────────────────
  lost: {
    label: "Lost update",
    anomaly: "Two read-modify-write cycles race; one increment is clobbered.",
    rows: [{ key: "counter", label: "counter", init: 10 }],
    invariant: (w) => ({
      ok: w.committed.counter === 12,
      text: `Two +1 increments must leave the counter at 12. A final value of 11 means an update was lost.`,
    }),
    build: () => [
      { actor: "T1", code: "BEGIN", note: "T1 begins.", kind: "begin" },
      { actor: "T2", code: "BEGIN", note: "T2 begins concurrently.", kind: "begin" },
      { actor: "T1", code: "x = READ counter", note: "T1 reads the counter into a local register.", kind: "read" },
      { actor: "T2", code: "y = READ counter", note: "T2 reads the same counter.", kind: "read" },
      { actor: "T1", code: "WRITE counter = x + 1", note: "T1 increments its register and writes back.", kind: "write" },
      { actor: "T1", code: "COMMIT", note: "T1 commits.", kind: "commit" },
      { actor: "T2", code: "WRITE counter = y + 1", note: "T2 writes back its stale register + 1.", kind: "write" },
      { actor: "T2", code: "COMMIT", note: "T2 tries to commit.", kind: "commit" },
    ],
    outcome: {
      ru: { verdict: "ok", summary: "Read Uncommitted allows it: T2 clobbers T1's write. One increment is LOST → 11." },
      rc: { verdict: "ok", summary: "Read Committed allows it: T2's write overwrites T1's. One increment is LOST → 11." },
      si: { verdict: "abort", summary: "Snapshot Isolation's lost-update detection aborts T2 (write to a row it read stale). Retry → 12." },
      ser: { verdict: "abort", summary: "Serializable detects the write conflict and aborts T2. After retry → 12." },
    },
  },

  // ── WRITE SKEW ──────────────────────────────────────────────────────────
  skew: {
    label: "Write skew",
    anomaly: "Two transactions read an invariant, then each disable a different row.",
    rows: [
      { key: "alice", label: "Alice on-call", init: 1 },
      { key: "bob", label: "Bob on-call", init: 1 },
    ],
    invariant: (w) => ({
      ok: w.committed.alice + w.committed.bob >= 1,
      text: `At least one doctor must stay on call (alice + bob ≥ 1).`,
    }),
    build: () => [
      { actor: "T1", code: "BEGIN", note: "Alice's request begins.", kind: "begin" },
      { actor: "T2", code: "BEGIN", note: "Bob's request begins concurrently.", kind: "begin" },
      { actor: "T1", code: "on = alice + bob", note: "T1 counts on-call doctors. Sees 2.", kind: "read" },
      { actor: "T2", code: "on = alice + bob", note: "T2 counts on-call doctors. Also sees 2.", kind: "read" },
      { actor: "T1", code: "if on ≥ 2: alice = 0", note: "T1: enough cover, so Alice goes off call.", kind: "write" },
      { actor: "T2", code: "if on ≥ 2: bob = 0", note: "T2: enough cover, so Bob goes off call.", kind: "write" },
      { actor: "T1", code: "COMMIT", note: "T1 commits.", kind: "commit" },
      { actor: "T2", code: "COMMIT", note: "T2 commits.", kind: "commit" },
    ],
    outcome: {
      ru: { verdict: "ok", summary: "Read Uncommitted: both commit. Nobody is on call → invariant broken." },
      rc: { verdict: "ok", summary: "Read Committed: both commit. Nobody is on call → invariant broken." },
      si: { verdict: "ok", summary: "Snapshot Isolation does NOT prevent write skew: both snapshots saw 2, both commit → broken." },
      ser: { verdict: "abort", summary: "Serializable spots the read-write dependency cycle and aborts one transaction. Invariant holds." },
    },
  },
};

/* ---------------------------------------------------------------- reducer */

type State = {
  scenario: Scenario;
  level: Level;
  cursor: number; // how many steps executed
  world: World;
  log: { text: string; tone: "info" | "ok" | "warn" | "fault" }[];
  aborted: Actor | null;
};

function freshWorld(scenario: Scenario): World {
  const committed: Record<string, number> = {};
  for (const r of SCENARIOS[scenario].rows) committed[r.key] = r.init;
  const emptyByActor = <T,>(make: () => T): Record<Actor, T> => ({
    T1: make(),
    T2: make(),
    DB: make(),
  });
  return {
    committed,
    snap: emptyByActor(() => ({})),
    buffer: emptyByActor(() => ({})),
    reg: emptyByActor(() => ({})),
    readSet: emptyByActor(() => new Set<string>()),
    done: { T1: false, T2: false, DB: false },
  };
}

function init(scenario: Scenario, level: Level): State {
  return {
    scenario,
    level,
    cursor: 0,
    world: freshWorld(scenario),
    log: [{ text: "Ready. Step through the interleaving to watch the anomaly.", tone: "info" }],
    aborted: null,
  };
}

type Action =
  | { type: "step" }
  | { type: "reset" }
  | { type: "setScenario"; scenario: Scenario }
  | { type: "setLevel"; level: Level };

function applyStep(state: State, steps: Step[]): State {
  const step = steps[state.cursor];
  if (!step) return state;

  const w = structuredCloneWorld(state.world);
  const { level, scenario } = state;
  const def = SCENARIOS[scenario];
  const log = [...state.log];
  let aborted = state.aborted;

  if (step.kind === "begin") {
    // snapshot the currently-committed state for SI / Serializable
    w.snap[step.actor] = { ...w.committed };
    log.push({ text: `${step.actor}: ${step.note}`, tone: "info" });
  } else if (step.kind === "read") {
    // determine the rows this step reads
    const rows = def.rows.map((r) => r.key);
    const seen: Record<string, number> = {};
    for (const row of rows) {
      const v = readValue(w, level, step.actor, row);
      seen[row] = v;
      w.reg[step.actor][row] = v;
      w.readSet[step.actor].add(row);
    }
    const shown = rows.map((r) => `${r}=${seen[r]}`).join(", ");
    log.push({ text: `${step.actor} reads { ${shown} }. ${step.note}`, tone: "info" });
  } else if (step.kind === "write") {
    // figure out the new value(s) from the scenario semantics
    const writes = computeWrite(scenario, step, w, level);
    for (const [row, val] of Object.entries(writes)) {
      w.buffer[step.actor][row] = val;
    }
    const shown = Object.entries(writes)
      .map(([r, v]) => `${r}→${v}`)
      .join(", ");
    log.push({ text: `${step.actor} buffers write { ${shown} }. ${step.note}`, tone: "warn" });
  } else if (step.kind === "commit") {
    const isRollback = step.code.toUpperCase().includes("ROLLBACK");
    if (isRollback) {
      // discard buffered writes
      w.buffer[step.actor] = {};
      w.done[step.actor] = true;
      log.push({ text: `${step.actor}: ${step.note}`, tone: "fault" });
    } else {
      // attempt to commit — check for conflicts depending on the level
      const conflict = detectConflict(state, w, step.actor);
      if (conflict) {
        // abort: drop buffered writes, mark aborted
        w.buffer[step.actor] = {};
        w.done[step.actor] = true;
        aborted = step.actor;
        log.push({
          text: `${step.actor} COMMIT rejected — ${conflict}. Transaction aborts and must retry.`,
          tone: "fault",
        });
      } else {
        // flush buffered writes to committed store
        for (const [row, val] of Object.entries(w.buffer[step.actor])) {
          w.committed[row] = val;
        }
        w.buffer[step.actor] = {};
        w.done[step.actor] = true;
        log.push({ text: `${step.actor} COMMIT succeeds — writes are now durable.`, tone: "ok" });
      }
    }
  }

  return { ...state, world: w, cursor: state.cursor + 1, log, aborted };
}

/** Deep-ish clone of the world (handles the Set fields). */
function structuredCloneWorld(w: World): World {
  const cloneByActor = <T,>(rec: Record<Actor, T>, f: (v: T) => T): Record<Actor, T> => ({
    T1: f(rec.T1),
    T2: f(rec.T2),
    DB: f(rec.DB),
  });
  return {
    committed: { ...w.committed },
    snap: cloneByActor(w.snap, (s) => ({ ...s })),
    buffer: cloneByActor(w.buffer, (s) => ({ ...s })),
    reg: cloneByActor(w.reg, (s) => ({ ...s })),
    readSet: cloneByActor(w.readSet, (s) => new Set(s)),
    done: { ...w.done },
  };
}

/** Scenario-specific write computation from a transaction's local registers. */
function computeWrite(scenario: Scenario, step: Step, w: World, level: Level): Record<string, number> {
  const a = step.actor;
  if (scenario === "dirty") {
    // T1 sets balance = committed - 40 (read-free demo write)
    return { balance: w.committed.balance - 40 };
  }
  if (scenario === "lost") {
    // write counter = local register + 1
    const reg = w.reg[a].counter ?? w.committed.counter;
    return { counter: reg + 1 };
  }
  // write skew: each transaction zeroes its own row IF its read saw >= 2 on-call
  const on = (w.reg[a].alice ?? readValue(w, level, a, "alice")) + (w.reg[a].bob ?? readValue(w, level, a, "bob"));
  if (on >= 2) {
    return a === "T1" ? { alice: 0 } : { bob: 0 };
  }
  return {};
}

/**
 * Decide whether a committing transaction must abort under the active level.
 * This models the *detection* behaviour DDIA describes:
 *  - Read Committed: never aborts (no first-committer-wins, no SSI).
 *  - Snapshot Isolation: lost-update detection only (write to a row read stale).
 *  - Serializable: aborts on any read-write conflict cycle (covers write skew too).
 */
function detectConflict(state: State, w: World, actor: Actor): string | null {
  const { level, scenario } = state;
  if (level === "ru" || level === "rc") return null;

  const other: Actor = actor === "T1" ? "T2" : "T1";
  const otherCommitted = w.done[other];

  // Did the other transaction commit a write to a row this transaction READ
  // off its snapshot (i.e. it ignored a value that has since been committed)?
  let staleReadConflict = false;
  for (const row of w.readSet[actor]) {
    const snapVal = w.snap[actor][row];
    const committedVal = w.committed[row];
    if (otherCommitted && snapVal !== undefined && committedVal !== snapVal) {
      staleReadConflict = true;
      break;
    }
  }
  if (!staleReadConflict) return null;

  if (level === "si") {
    // Commercial SI detects *lost updates*: the committing txn writes a row
    // whose committed value changed since its snapshot. It does NOT prevent
    // write skew, because the rows written differ from the row that changed.
    const writesAStaleRow = Object.keys(w.buffer[actor]).some(
      (row) => w.readSet[actor].has(row) && w.committed[row] !== w.snap[actor][row]
    );
    if (scenario === "lost" && writesAStaleRow) {
      return "first-committer-wins: counter changed since your snapshot (lost-update detection)";
    }
    return null;
  }

  // Serializable (SSI): abort if this txn acted on a premise another committed
  // txn invalidated — this single rule covers lost update AND write skew.
  return scenario === "skew"
    ? "serialization conflict: read-write dependency cycle detected (write skew)"
    : "serialization conflict: a value you read was modified by a committed transaction";
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return init(state.scenario, state.level);
    case "setScenario":
      return init(action.scenario, state.level);
    case "setLevel":
      return init(state.scenario, action.level);
    case "step": {
      const steps = SCENARIOS[state.scenario].build(state.level);
      if (state.cursor >= steps.length) return state;
      return applyStep(state, steps);
    }
    default:
      return state;
  }
}

/* -------------------------------------------------------------- component */

const LEVEL_OPTS: { label: string; value: Level }[] = [
  { label: "Read Uncommitted", value: "ru" },
  { label: "Read Committed", value: "rc" },
  { label: "Snapshot Isolation", value: "si" },
  { label: "Serializable", value: "ser" },
];

const LEVEL_SHORT: Record<Level, string> = {
  ru: "RU",
  rc: "RC",
  si: "SI",
  ser: "SER",
};

const SCENARIO_OPTS: { label: string; value: Scenario }[] = [
  { label: "Dirty read", value: "dirty" },
  { label: "Lost update", value: "lost" },
  { label: "Write skew", value: "skew" },
];

export function RaceSimulator() {
  const [state, dispatch] = useReducer(reducer, undefined, () => init("dirty", "rc"));
  const def = SCENARIOS[state.scenario];
  const steps = useMemo(() => def.build(state.level), [def, state.level]);
  const finished = state.cursor >= steps.length;
  const inv = def.invariant(state.world);
  const expected = def.outcome[state.level];

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="kicker">Anomaly scenario</div>
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

      <p className="text-sm leading-relaxed text-fg-muted">
        <strong className="text-fg">{def.label}:</strong> {def.anomaly}
      </p>

      {/* main grid: timeline + database state */}
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* interleaved timeline */}
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-2 border-b border-line text-center">
            <div className="border-r border-line py-2 font-mono text-xs uppercase tracking-wider text-accent">
              T1
            </div>
            <div className="py-2 font-mono text-xs uppercase tracking-wider" style={{ color: "var(--color-special)" }}>
              T2
            </div>
          </div>
          <div className="max-h-[320px] overflow-y-auto p-2">
            {steps.map((s, i) => {
              const executed = i < state.cursor;
              const current = i === state.cursor;
              const isT1 = s.actor === "T1";
              return (
                <motion.div
                  key={i}
                  initial={false}
                  animate={{ opacity: executed ? 1 : current ? 0.85 : 0.32 }}
                  className="grid grid-cols-2 gap-2"
                >
                  <StepCell side="left" show={isT1} step={s} executed={executed} current={current} />
                  <StepCell side="right" show={!isT1} step={s} executed={executed} current={current} />
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* database + register state */}
        <div className="space-y-3">
          <div className="panel p-4">
            <div className="kicker mb-3">Committed database</div>
            <div className="space-y-2">
              {def.rows.map((r) => (
                <RowMeter key={r.key} label={r.label} value={state.world.committed[r.key]} init={r.init} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <RegisterCard actor="T1" world={state.world} rows={def.rows} done={state.world.done.T1} />
            <RegisterCard actor="T2" world={state.world} rows={def.rows} done={state.world.done.T2} />
          </div>
        </div>
      </div>

      {/* narration log */}
      <div className="rounded-lg border border-line bg-ink-950/60 p-4">
        <div className="kicker mb-2">Execution log</div>
        <div className="max-h-32 space-y-1 overflow-y-auto font-mono text-xs leading-relaxed">
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

      {/* controls + verdict */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => dispatch({ type: "step" })} disabled={finished}>
          <IconStep size={15} /> {state.cursor === 0 ? "Start stepping" : "Next step"}
        </Button>
        <Button variant="ghost" onClick={() => dispatch({ type: "reset" })}>
          <IconReset size={15} /> Reset
        </Button>
        <span className="font-mono text-xs text-fg-faint">
          step {Math.min(state.cursor, steps.length)} / {steps.length}
        </span>
      </div>

      {/* result banner */}
      <AnimatePresence>
        {finished && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border p-4"
            style={{
              borderColor: inv.ok ? "var(--color-ok)" : "var(--color-fault)",
              background: `color-mix(in oklab, ${inv.ok ? "var(--color-ok)" : "var(--color-fault)"} 9%, var(--color-ink-900))`,
            }}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0" style={{ color: inv.ok ? "var(--color-ok)" : "var(--color-fault)" }}>
                {inv.ok ? <IconCheck size={18} /> : <IconAlert size={18} />}
              </span>
              <div className="space-y-1">
                <div
                  className="font-mono text-xs uppercase tracking-wider"
                  style={{ color: inv.ok ? "var(--color-ok)" : "var(--color-fault)" }}
                >
                  {inv.ok ? "Invariant preserved" : "Invariant violated"}
                  {state.aborted ? ` · ${state.aborted} aborted` : ""}
                </div>
                <p className="text-sm leading-relaxed text-fg">{expected.summary}</p>
                <p className="text-xs leading-relaxed text-fg-muted">{inv.text}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* live invariant gauges */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Isolation" value={LEVEL_SHORT[state.level]} tone="accent" />
        <Stat
          label="Anomaly"
          value={expected.verdict === "abort" ? "blocked" : finished && !inv.ok ? "exposed" : "—"}
          tone={finished ? (inv.ok ? "ok" : "fault") : "default"}
        />
        <Stat label="Aborts" value={state.aborted ? 1 : 0} tone={state.aborted ? "warn" : "default"} />
        <Stat label="Steps run" value={state.cursor} tone="info" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- sub-views */

function logColor(tone: "info" | "ok" | "warn" | "fault"): string {
  return tone === "ok"
    ? "var(--color-ok)"
    : tone === "warn"
      ? "var(--color-warn)"
      : tone === "fault"
        ? "var(--color-fault)"
        : "color-mix(in oklab, var(--color-fg) 78%, transparent)";
}

function StepCell({
  side,
  show,
  step,
  executed,
  current,
}: {
  side: "left" | "right";
  show: boolean;
  step: Step;
  executed: boolean;
  current: boolean;
}) {
  if (!show) return <div className={side === "left" ? "border-r border-line/40" : ""} />;
  const color =
    step.kind === "commit"
      ? step.code.toUpperCase().includes("ROLLBACK")
        ? "var(--color-fault)"
        : "var(--color-ok)"
      : step.kind === "write"
        ? "var(--color-warn)"
        : "var(--accent)";
  return (
    <div className={side === "left" ? "border-r border-line/40 pr-2" : "pl-2"}>
      <div
        className="my-0.5 rounded-md border px-2.5 py-1.5"
        style={{
          borderColor: current ? color : "var(--color-line)",
          background: current ? `color-mix(in oklab, ${color} 12%, transparent)` : "var(--color-ink-850)",
          boxShadow: current ? `0 0 0 1px ${color}` : "none",
        }}
      >
        <div className="font-mono text-[11px] leading-tight" style={{ color: executed || current ? color : "var(--color-fg-faint)" }}>
          {step.code}
        </div>
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

function RegisterCard({
  actor,
  world,
  rows,
  done,
}: {
  actor: Actor;
  world: World;
  rows: { key: string; label: string }[];
  done: boolean;
}) {
  const color = actor === "T1" ? "var(--accent)" : "var(--color-special)";
  const buffered = Object.entries(world.buffer[actor]);
  const regs = rows.map((r) => ({ key: r.key, v: world.reg[actor][r.key] }));
  const hasReg = regs.some((r) => r.v !== undefined);
  return (
    <div className="panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-wider" style={{ color }}>
          {actor}
        </span>
        {done && <span className="font-mono text-[9px] uppercase tracking-wider text-fg-faint">closed</span>}
      </div>
      <div className="space-y-1.5">
        <div className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">read register</div>
        {hasReg ? (
          regs
            .filter((r) => r.v !== undefined)
            .map((r) => (
              <div key={r.key} className="font-mono text-xs text-fg">
                {r.key} = <span style={{ color }}>{r.v}</span>
              </div>
            ))
        ) : (
          <div className="font-mono text-xs text-fg-faint">∅</div>
        )}
        <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-fg-faint">buffered write</div>
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
  );
}
