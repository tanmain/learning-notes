"use client";

import { useMemo, useReducer } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, SegmentedControl, Stat } from "@/components/chapter";
import { IconStep, IconReset, IconCheck } from "@/components/icons";

/**
 * Run-the-query simulator: ONE social dataset (people + friendships) rendered as
 * (a) normalized relational tables, (b) self-contained JSON documents, and (c) a
 * property graph. The user picks a query — direct friends, mutual friends, or the
 * classic "friends-of-friends" — and a model, then STEPS the engine and watches it
 * work: SQL self-joins on the junction table, the document store firing app-side
 * round-trips because it has no joins, or the graph hopping edge-to-edge. Honest
 * per-model cost counters (joins / round-trips / hops, plus rows or edges touched)
 * make the trade-off the chapter argues about tangible: many-to-many is cheap to
 * traverse in a graph, needs a junction-table join in SQL, and forces N+1 queries
 * in a document store.
 */

/* ------------------------------------------------------------------ dataset */

type PersonId = "lucy" | "ali" | "bo" | "cleo" | "dev" | "evan";

type Person = { id: PersonId; name: string; x: number; y: number };

const PEOPLE: Person[] = [
  { id: "lucy", name: "Lucy", x: 80, y: 130 },
  { id: "ali", name: "Ali", x: 235, y: 56 },
  { id: "bo", name: "Bo", x: 235, y: 205 },
  { id: "cleo", name: "Cleo", x: 400, y: 40 },
  { id: "dev", name: "Dev", x: 400, y: 130 },
  { id: "evan", name: "Evan", x: 400, y: 220 },
];

// Undirected friendships, stored once each (low id first) — this is the
// many-to-many relation that becomes a junction table / edges / N+1 fetches.
const FRIENDSHIPS: [PersonId, PersonId][] = [
  ["lucy", "ali"],
  ["lucy", "bo"],
  ["ali", "cleo"],
  ["ali", "dev"],
  ["bo", "dev"],
  ["bo", "evan"],
];

const NAME: Record<PersonId, string> = Object.fromEntries(
  PEOPLE.map((p) => [p.id, p.name]),
) as Record<PersonId, string>;

/** Adjacency (both directions) from the stored friendships. */
const ADJ: Record<PersonId, PersonId[]> = (() => {
  const m = {} as Record<PersonId, PersonId[]>;
  PEOPLE.forEach((p) => (m[p.id] = []));
  FRIENDSHIPS.forEach(([a, b]) => {
    m[a].push(b);
    m[b].push(a);
  });
  return m;
})();

const ROOT: PersonId = "lucy";

/* ------------------------------------------------------------------- types */

type Model = "relational" | "document" | "graph";
type QueryKind = "friends" | "fof" | "mutual";

type Highlight = {
  /** people to glow as "in the working set / result" */
  nodes: PersonId[];
  /** friendship edges (by index into FRIENDSHIPS) currently being traversed */
  edges: number[];
  /** people that are confirmed results */
  result: PersonId[];
};

type Step = {
  /** short code/pseudo-op shown in the trace */
  code: string;
  /** plain-English narration */
  note: string;
  /** cumulative cost after this step */
  cost: { joins: number; trips: number; hops: number; touched: number };
  /** what to light up on the canvas after this step */
  hl: Highlight;
  /** category, for trace colouring */
  kind: "scan" | "join" | "trip" | "hop" | "emit";
};

/* ----------------------------------------------------------- query targets */

/** Ground-truth answers, model-independent. */
function answer(kind: QueryKind): PersonId[] {
  const direct = ADJ[ROOT];
  if (kind === "friends") return [...direct].sort();
  if (kind === "fof") {
    // friends-of-friends NOT already a direct friend and not the root
    const set = new Set<PersonId>();
    direct.forEach((f) => ADJ[f].forEach((ff) => set.add(ff)));
    return [...set].filter((p) => p !== ROOT && !direct.includes(p)).sort();
  }
  // mutual friends BETWEEN Lucy and Dev (a fixed pair, to keep it concrete)
  const a = new Set(ADJ[ROOT]);
  return ADJ.dev.filter((p) => a.has(p)).sort();
}

const QUERY_LABEL: Record<QueryKind, string> = {
  friends: "Lucy's friends",
  fof: "Friends-of-friends",
  mutual: "Mutual friends of Lucy & Dev",
};

const QUERY_PROSE: Record<QueryKind, string> = {
  friends: "Who is directly connected to Lucy? One hop — the easy case for every model.",
  fof: "Who are Lucy's friends' friends (excluding Lucy and her direct friends)? Two hops — where the models diverge.",
  mutual: "Which people are friends with BOTH Lucy and Dev? An intersection of two friend sets.",
};

/* ----------------------------------------------------- step-script builders */

/** edge index helper */
function edgeIdx(a: PersonId, b: PersonId): number {
  return FRIENDSHIPS.findIndex(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

type Cost = Step["cost"];
const zero: Cost = { joins: 0, trips: 0, hops: 0, touched: 0 };
const add = (c: Cost, d: Partial<Cost>): Cost => ({
  joins: c.joins + (d.joins ?? 0),
  trips: c.trips + (d.trips ?? 0),
  hops: c.hops + (d.hops ?? 0),
  touched: c.touched + (d.touched ?? 0),
});

/* ---- RELATIONAL: self-joins on the friendships junction table ------------ */

function buildRelational(kind: QueryKind): Step[] {
  const steps: Step[] = [];
  let c = zero;
  const direct = ADJ[ROOT];

  c = add(c, { joins: 1, touched: FRIENDSHIPS.length });
  steps.push({
    code: "JOIN friendships f1 ON f1.a = 'lucy'",
    note: `Scan the friendships junction table and keep rows where Lucy appears. Found ${direct.length} direct friends.`,
    cost: c,
    kind: "join",
    hl: { nodes: [ROOT, ...direct], edges: direct.map((f) => edgeIdx(ROOT, f)), result: [] },
  });

  if (kind === "friends") {
    steps.push({
      code: "SELECT f1.b",
      note: `Project the friend column. Done in a single join — many-to-many is exactly what a junction table is for.`,
      cost: c,
      kind: "emit",
      hl: { nodes: [ROOT, ...direct], edges: direct.map((f) => edgeIdx(ROOT, f)), result: answer("friends") },
    });
    return steps;
  }

  if (kind === "fof") {
    c = add(c, { joins: 1, touched: FRIENDSHIPS.length });
    const fof = answer("fof");
    steps.push({
      code: "JOIN friendships f2 ON f2.a = f1.b",
      note: `Self-join the SAME table again: for every direct friend, find THEIR friends. Two joins for two hops — the join count must be fixed in advance.`,
      cost: c,
      kind: "join",
      hl: {
        nodes: [ROOT, ...direct, ...fof],
        edges: FRIENDSHIPS.map((_, i) => i).filter((i) => {
          const [a, b] = FRIENDSHIPS[i];
          return direct.includes(a) || direct.includes(b);
        }),
        result: [],
      },
    });
    steps.push({
      code: "WHERE f2.b <> 'lucy' AND f2.b NOT IN (lucy's friends)",
      note: `Filter out Lucy herself and anyone already a direct friend, then DISTINCT. Result: ${fof.map((p) => NAME[p]).join(", ") || "none"}.`,
      cost: c,
      kind: "emit",
      hl: { nodes: [ROOT, ...direct, ...fof], edges: [], result: fof },
    });
    return steps;
  }

  // mutual
  c = add(c, { joins: 1, touched: FRIENDSHIPS.length });
  steps.push({
    code: "JOIN friendships f2 ON f2.a = 'dev'",
    note: `Second scan for Dev's friends. Two friend sets are now in hand.`,
    cost: c,
    kind: "join",
    hl: { nodes: ["dev", ...ADJ.dev], edges: ADJ.dev.map((f) => edgeIdx("dev", f)), result: [] },
  });
  const mutual = answer("mutual");
  steps.push({
    code: "WHERE f1.b = f2.b   -- intersection",
    note: `Keep only people present in BOTH sets. Mutual friends: ${mutual.map((p) => NAME[p]).join(", ") || "none"}.`,
    cost: c,
    kind: "emit",
    hl: {
      nodes: [ROOT, "dev", ...mutual],
      edges: mutual.flatMap((m) => [edgeIdx(ROOT, m), edgeIdx("dev", m)]).filter((i) => i >= 0),
      result: mutual,
    },
  });
  return steps;
}

/* ---- DOCUMENT: no joins, so the app fires round-trips (N+1) -------------- */

function buildDocument(kind: QueryKind): Step[] {
  const steps: Step[] = [];
  let c = zero;
  const direct = ADJ[ROOT];

  c = add(c, { trips: 1, touched: 1 });
  steps.push({
    code: "db.users.findOne({_id:'lucy'})",
    note: `One read returns Lucy's whole document — including her friendIds array. Great locality for the root record.`,
    cost: c,
    kind: "trip",
    hl: { nodes: [ROOT], edges: [], result: [] },
  });

  if (kind === "friends") {
    steps.push({
      code: "return lucy.friendIds  // [ali, bo]",
      note: `The IDs are right there in the document. But these are just references — to show names you'd resolve each, an app-side join.`,
      cost: c,
      kind: "emit",
      hl: { nodes: [ROOT, ...direct], edges: direct.map((f) => edgeIdx(ROOT, f)), result: answer("friends") },
    });
    return steps;
  }

  if (kind === "fof") {
    const fof = answer("fof");
    // one round-trip per direct friend — the N+1 problem
    direct.forEach((f, i) => {
      c = add(c, { trips: 1, touched: 1 });
      steps.push({
        code: `db.users.findOne({_id:'${f}'})  // round-trip ${i + 1}`,
        note: `No server-side join exists, so the application fetches ${NAME[f]}'s document separately to read THEIR friendIds. This is the N+1 query problem.`,
        cost: c,
        kind: "trip",
        hl: {
          nodes: [ROOT, ...direct, ...ADJ[f]],
          edges: ADJ[f].map((x) => edgeIdx(f, x)),
          result: [],
        },
      });
    });
    steps.push({
      code: "dedupe & drop self + direct friends",
      note: `Merge every fetched friendIds array in application memory, then filter. Result: ${fof.map((p) => NAME[p]).join(", ") || "none"} — ${direct.length} extra round-trips to walk one more hop.`,
      cost: c,
      kind: "emit",
      hl: { nodes: [ROOT, ...direct, ...fof], edges: [], result: fof },
    });
    return steps;
  }

  // mutual
  c = add(c, { trips: 1, touched: 1 });
  steps.push({
    code: "db.users.findOne({_id:'dev'})",
    note: `Fetch Dev's document for his friendIds — a second round-trip.`,
    cost: c,
    kind: "trip",
    hl: { nodes: ["dev"], edges: [], result: [] },
  });
  const mutual = answer("mutual");
  steps.push({
    code: "intersect(lucy.friendIds, dev.friendIds)",
    note: `Compute the intersection in application code. Mutual friends: ${mutual.map((p) => NAME[p]).join(", ") || "none"}.`,
    cost: c,
    kind: "emit",
    hl: { nodes: [ROOT, "dev", ...mutual], edges: [], result: mutual },
  });
  return steps;
}

/* ---- GRAPH: traverse edges directly, hop by hop -------------------------- */

function buildGraph(kind: QueryKind): Step[] {
  const steps: Step[] = [];
  let c = zero;
  const direct = ADJ[ROOT];

  // hop 1
  direct.forEach((f) => {
    c = add(c, { hops: 1, touched: 1 });
    steps.push({
      code: `(lucy)-[:FRIEND]->(${f})`,
      note: `Follow a FRIEND edge from Lucy to ${NAME[f]}. Edges are first-class, so the traversal is a direct pointer-hop — no table scan.`,
      cost: c,
      kind: "hop",
      hl: { nodes: [ROOT, ...direct.slice(0, direct.indexOf(f) + 1)], edges: [edgeIdx(ROOT, f)], result: [] },
    });
  });

  if (kind === "friends") {
    steps.push({
      code: "RETURN friend.name",
      note: `One hop per edge and we're done. The query said WHAT (a FRIEND pattern); the engine walked the edges.`,
      cost: c,
      kind: "emit",
      hl: { nodes: [ROOT, ...direct], edges: direct.map((f) => edgeIdx(ROOT, f)), result: answer("friends") },
    });
    return steps;
  }

  if (kind === "fof") {
    const fof = answer("fof");
    // hop 2 from each direct friend
    direct.forEach((f) => {
      ADJ[f]
        .filter((ff) => ff !== ROOT)
        .forEach((ff) => {
          c = add(c, { hops: 1, touched: 1 });
          steps.push({
            code: `(${f})-[:FRIEND]->(${ff})`,
            note: `Second hop: from ${NAME[f]} to ${NAME[ff]}. The number of hops — not joins — grows with the pattern length, and you never had to count them.`,
            cost: c,
            kind: "hop",
            hl: { nodes: [ROOT, ...direct, ff], edges: [edgeIdx(f, ff)], result: [] },
          });
        });
    });
    steps.push({
      code: "RETURN DISTINCT fof.name  // skip lucy & direct friends",
      note: `Collect the second-hop nodes, drop Lucy and her direct friends. Result: ${fof.map((p) => NAME[p]).join(", ") || "none"}.`,
      cost: c,
      kind: "emit",
      hl: { nodes: [ROOT, ...direct, ...fof], edges: [], result: fof },
    });
    return steps;
  }

  // mutual: hop out from Dev too, then intersect
  ADJ.dev.forEach((f) => {
    c = add(c, { hops: 1, touched: 1 });
    steps.push({
      code: `(dev)-[:FRIEND]->(${f})`,
      note: `Walk Dev's edges as well, so both neighbourhoods are known.`,
      cost: c,
      kind: "hop",
      hl: { nodes: ["dev", f], edges: [edgeIdx("dev", f)], result: [] },
    });
  });
  const mutual = answer("mutual");
  steps.push({
    code: "WHERE (lucy)-[:FRIEND]-(x)-[:FRIEND]-(dev)",
    note: `Keep nodes that both Lucy and Dev point at. Mutual friends: ${mutual.map((p) => NAME[p]).join(", ") || "none"}.`,
    cost: c,
    kind: "emit",
    hl: {
      nodes: [ROOT, "dev", ...mutual],
      edges: mutual.flatMap((m) => [edgeIdx(ROOT, m), edgeIdx("dev", m)]).filter((i) => i >= 0),
      result: mutual,
    },
  });
  return steps;
}

function buildSteps(model: Model, kind: QueryKind): Step[] {
  if (model === "relational") return buildRelational(kind);
  if (model === "document") return buildDocument(kind);
  return buildGraph(kind);
}

/* ---------------------------------------------------------------- reducer */

type State = {
  model: Model;
  query: QueryKind;
  cursor: number; // steps executed so far
};

type Action =
  | { type: "step" }
  | { type: "reset" }
  | { type: "setModel"; model: Model }
  | { type: "setQuery"; query: QueryKind };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return { ...state, cursor: 0 };
    case "setModel":
      return { ...state, model: action.model, cursor: 0 };
    case "setQuery":
      return { ...state, query: action.query, cursor: 0 };
    case "step": {
      const total = buildSteps(state.model, state.query).length;
      return { ...state, cursor: Math.min(state.cursor + 1, total) };
    }
    default:
      return state;
  }
}

/* ---------------------------------------------------------- cost descriptor */

const MODEL_TONE: Record<Model, string> = {
  relational: "var(--accent)",
  document: "var(--accent-2)",
  graph: "var(--color-special)",
};

const COST_META: Record<
  Model,
  { key: keyof Cost; label: string; unit: string; tone: "accent" | "warn" | "special" }
> = {
  relational: { key: "joins", label: "joins run", unit: "× self-join", tone: "accent" },
  document: { key: "trips", label: "round-trips", unit: "× findOne", tone: "warn" },
  graph: { key: "hops", label: "edge hops", unit: "× FRIEND", tone: "special" },
};

function traceColor(kind: Step["kind"]): string {
  switch (kind) {
    case "join":
      return "var(--accent)";
    case "trip":
      return "var(--color-warn)";
    case "hop":
      return "var(--color-special)";
    case "emit":
      return "var(--color-ok)";
    default:
      return "var(--color-fg-muted)";
  }
}

/* -------------------------------------------------------------- component */

export function QueryRunner() {
  const [state, dispatch] = useReducer(reducer, { model: "graph", query: "fof", cursor: 0 });
  const steps = useMemo(() => buildSteps(state.model, state.query), [state.model, state.query]);
  const finished = state.cursor >= steps.length;
  const lastStep = state.cursor > 0 ? steps[state.cursor - 1] : null;
  const hl: Highlight = lastStep?.hl ?? { nodes: [], edges: [], result: [] };
  const cost = lastStep?.cost ?? zero;
  const expected = answer(state.query);
  const costMeta = COST_META[state.model];

  // Cross-model summary line: how many primary ops each model needed in total.
  const totals = useMemo(() => {
    const r = buildSteps("relational", state.query).at(-1)?.cost ?? zero;
    const d = buildSteps("document", state.query).at(-1)?.cost ?? zero;
    const g = buildSteps("graph", state.query).at(-1)?.cost ?? zero;
    return { r: r.joins, d: d.trips, g: g.hops };
  }, [state.query]);

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="kicker">Query</div>
          <SegmentedControl<QueryKind>
            value={state.query}
            onChange={(v) => dispatch({ type: "setQuery", query: v })}
            options={[
              { label: "Friends", value: "friends" },
              { label: "Friends-of-friends", value: "fof" },
              { label: "Mutual", value: "mutual" },
            ]}
          />
        </div>
        <div className="space-y-2">
          <div className="kicker">Data model</div>
          <SegmentedControl<Model>
            value={state.model}
            onChange={(v) => dispatch({ type: "setModel", model: v })}
            options={[
              { label: "Relational", value: "relational" },
              { label: "Document", value: "document" },
              { label: "Graph", value: "graph" },
            ]}
          />
        </div>
      </div>

      <p className="text-sm leading-relaxed text-fg-muted">
        <strong className="text-fg">{QUERY_LABEL[state.query]}:</strong> {QUERY_PROSE[state.query]}
      </p>

      {/* main grid: canvas + execution trace */}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* graph canvas — the SAME dataset for every model */}
        <div className="rounded-lg border border-line bg-ink-950/60 p-3">
          <svg viewBox="0 0 480 260" className="w-full">
            {FRIENDSHIPS.map(([a, b], i) => {
              const pa = PEOPLE.find((p) => p.id === a)!;
              const pb = PEOPLE.find((p) => p.id === b)!;
              const lit = hl.edges.includes(i);
              return (
                <motion.line
                  key={i}
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  animate={{
                    stroke: lit ? MODEL_TONE[state.model] : "var(--color-line)",
                    strokeWidth: lit ? 2.4 : 1.1,
                    opacity: lit ? 1 : 0.4,
                  }}
                  transition={{ duration: 0.25 }}
                />
              );
            })}
            {PEOPLE.map((p) => {
              const inSet = hl.nodes.includes(p.id);
              const isResult = hl.result.includes(p.id);
              const isRoot = p.id === ROOT;
              const ring = isResult
                ? "var(--color-ok)"
                : isRoot
                  ? MODEL_TONE[state.model]
                  : inSet
                    ? MODEL_TONE[state.model]
                    : "var(--color-line)";
              return (
                <motion.g key={p.id} initial={false}>
                  <motion.circle
                    cx={p.x}
                    cy={p.y}
                    r={isRoot ? 22 : 18}
                    fill="var(--color-ink-950)"
                    animate={{
                      stroke: ring,
                      strokeWidth: isResult || isRoot ? 3 : inSet ? 2.25 : 1,
                      opacity: inSet || isResult || isRoot ? 1 : 0.45,
                      filter: "none",
                    }}
                    transition={{ duration: 0.25 }}
                  />
                  <text
                    x={p.x}
                    y={p.y + 1}
                    textAnchor="middle"
                    className="fill-fg font-mono"
                    fontSize={isRoot ? 11 : 10}
                    fontWeight={600}
                  >
                    {p.name}
                  </text>
                  <text
                    x={p.x}
                    y={p.y + 12}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={6}
                    fill={isResult ? "var(--color-ok)" : "var(--color-fg-faint)"}
                  >
                    {isResult ? "result" : isRoot ? "start" : ":person"}
                  </text>
                </motion.g>
              );
            })}
          </svg>
          <p className="mt-1 px-1 font-mono text-[10px] leading-relaxed text-fg-faint">
            Same six people and six friendships in every model. Watch{" "}
            <span style={{ color: MODEL_TONE[state.model] }}>
              {state.model === "relational"
                ? "rows being joined"
                : state.model === "document"
                  ? "documents fetched one round-trip at a time"
                  : "edges being walked"}
            </span>
            .
          </p>
        </div>

        {/* execution trace */}
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span
              className="font-mono text-[11px] font-bold uppercase tracking-wider"
              style={{ color: MODEL_TONE[state.model] }}
            >
              {state.model} execution
            </span>
            <span className="font-mono text-[10px] text-fg-faint">
              step {Math.min(state.cursor, steps.length)} / {steps.length}
            </span>
          </div>
          <div className="max-h-[230px] space-y-1.5 overflow-y-auto p-3">
            {steps.map((s, i) => {
              const done = i < state.cursor;
              const current = i === state.cursor - 1;
              const color = traceColor(s.kind);
              return (
                <motion.div
                  key={i}
                  initial={false}
                  animate={{ opacity: done ? 1 : 0.32 }}
                  className="rounded-md border px-2.5 py-1.5"
                  style={{
                    borderColor: current ? color : "var(--color-line)",
                    background: current ? `color-mix(in oklab, ${color} 12%, transparent)` : "var(--color-ink-850)",
                    boxShadow: current ? `0 0 0 1px ${color}` : "none",
                  }}
                >
                  <div
                    className="font-mono text-[11px] leading-tight"
                    style={{ color: done ? color : "var(--color-fg-faint)" }}
                  >
                    {s.code}
                  </div>
                  <AnimatePresence>
                    {done && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-1 font-sans text-[11px] leading-snug text-fg-muted"
                      >
                        {s.note}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* controls + counters */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => dispatch({ type: "step" })} disabled={finished}>
          <IconStep size={15} /> {state.cursor === 0 ? "Run query" : finished ? "Done" : "Next step"}
        </Button>
        <Button variant="ghost" onClick={() => dispatch({ type: "reset" })}>
          <IconReset size={15} /> Reset
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={costMeta.label} value={cost[costMeta.key]} unit={costMeta.unit} tone={costMeta.tone} />
        <Stat label="rows / docs touched" value={cost.touched} tone="info" />
        <Stat
          label="results found"
          value={`${hl.result.length} / ${expected.length}`}
          tone={finished ? "ok" : "default"}
        />
        <Stat label="model" value={state.model === "relational" ? "SQL" : state.model === "document" ? "DOC" : "GRAPH"} tone={costMeta.tone} />
      </div>

      {/* result + cross-model verdict */}
      <AnimatePresence>
        {finished && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border p-4"
            style={{
              borderColor: "var(--color-ok)",
              background: `color-mix(in oklab, var(--color-ok) 9%, var(--color-ink-900))`,
            }}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0" style={{ color: "var(--color-ok)" }}>
                <IconCheck size={18} />
              </span>
              <div className="space-y-1.5">
                <div className="font-mono text-xs uppercase tracking-wider" style={{ color: "var(--color-ok)" }}>
                  Result · {expected.map((p) => NAME[p]).join(", ") || "none"}
                </div>
                <p className="text-sm leading-relaxed text-fg">
                  Every model returns the same answer — but it cost{" "}
                  <span className="accent-text">{totals.r} self-join{totals.r === 1 ? "" : "s"}</span> in SQL,{" "}
                  <span className="text-warn">{totals.d} round-trip{totals.d === 1 ? "" : "s"}</span> in the document
                  store, and <span className="text-special">{totals.g} edge hop{totals.g === 1 ? "" : "s"}</span> in the
                  graph.{" "}
                  {state.query === "fof"
                    ? "For friends-of-friends the document store pays the N+1 penalty (a round-trip per friend), SQL needs a second self-join, and the graph just keeps hopping — which is why deeply-linked, many-to-many data wants a graph."
                    : state.query === "mutual"
                      ? "An intersection is cheap everywhere here, but notice the document store still needed a separate fetch per person because it has no server-side join."
                      : "One hop is easy for everyone — the models only diverge once relationships chain together."}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
