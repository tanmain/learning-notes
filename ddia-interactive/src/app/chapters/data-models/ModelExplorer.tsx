"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SegmentedControl, Toggle, Stat } from "@/components/chapter";

/**
 * The centrepiece: one résumé entity rendered three ways — normalized relational
 * tables, a single JSON document, and a property graph. A toggle promotes "skills"
 * from a private one-to-many list into a shared, many-to-many entity (skills the
 * user shares with others, à la LinkedIn endorsements). Watch the relational view
 * sprout a join table, the document view DUPLICATE the skill labels, and the graph
 * view simply add edges. Live counters surface joins, duplication, and the
 * object–relational impedance mismatch.
 */

type Model = "relational" | "document" | "graph";

const PERSON = {
  id: 251,
  name: "Bill Gates",
  region: "Greater Seattle",
  positions: [
    { id: 1, title: "Co-chair", org: "Gates Foundation", years: "2000–now" },
    { id: 2, title: "Co-founder", org: "Microsoft", years: "1975–2008" },
  ],
  // skills as plain strings (one-to-many) OR shared skill entities (many-to-many)
  skills: ["Philanthropy", "Software", "Leadership"],
};

// In the shared (m:n) world, these skills are also held by other users.
const SKILL_HOLDERS: Record<string, string[]> = {
  Philanthropy: ["Melinda French", "Warren Buffett"],
  Software: ["Melinda French"],
  Leadership: [],
};

const TONE: Record<Model, string> = {
  relational: "var(--accent)",
  document: "var(--accent-2)",
  graph: "var(--color-special)",
};

export function ModelExplorer() {
  const [model, setModel] = useState<Model>("relational");
  const [shared, setShared] = useState(false);

  // ---- derived "cost" metrics, computed honestly from the model + toggle ----
  const metrics = useMemo(() => {
    const nSkills = PERSON.skills.length;
    const nPos = PERSON.positions.length;

    if (model === "relational") {
      // tables touched + joins to assemble the full profile
      const tables = shared ? 4 : 3; // users, positions, skills(+) , user_skills join
      const joins = shared ? 3 : 2; // positions join + (skills + join-table) joins
      return {
        unit: "joins",
        cost: joins,
        costTone: "accent" as const,
        dup: 0,
        tables,
        note: shared
          ? "Many-to-many needs a join table (user_skills). Reads cost an extra join."
          : "One-to-many positions are a child table with a foreign key. One join.",
      };
    }
    if (model === "document") {
      // a single document read = locality win; but m:n forces duplication
      const dup = shared
        ? Object.values(SKILL_HOLDERS).reduce((n, hs) => n + hs.length, 0)
        : 0;
      return {
        unit: "reads",
        cost: 1,
        costTone: "ok" as const,
        dup,
        tables: 1,
        note: shared
          ? "Skill labels are now copied into every user's document — updates fan out and drift."
          : "Everything in one tree: a single read loads the whole profile. Great locality.",
      };
    }
    // graph
    const edges = nPos + nSkills + (shared ? Object.values(SKILL_HOLDERS).flat().length : 0);
    return {
      unit: "hops",
      cost: shared ? 2 : 1,
      costTone: "special" as const,
      dup: 0,
      tables: 1 + nPos + nSkills, // vertices
      note: shared
        ? "A skill is a shared vertex; other people just point at it. No duplication, variable-length traversal."
        : "Vertices and labelled edges. Positions and skills are nodes linked to the person.",
      edges,
    };
  }, [model, shared]);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SegmentedControl<Model>
          value={model}
          onChange={setModel}
          options={[
            { label: "Relational", value: "relational" },
            { label: "Document", value: "document" },
            { label: "Graph", value: "graph" },
          ]}
        />
        <Toggle
          label={shared ? "skills are shared (m:n)" : "skills are private (1:n)"}
          checked={shared}
          onChange={setShared}
        />
      </div>

      {/* Stage */}
      <div className="rounded-lg border border-line bg-ink-950/60 p-4 sm:p-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={model + String(shared)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28 }}
          >
            {model === "relational" && <RelationalView shared={shared} />}
            {model === "document" && <DocumentView shared={shared} />}
            {model === "graph" && <GraphView shared={shared} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Live metrics */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label={`cost to read profile (${metrics.unit})`} value={metrics.cost} tone={metrics.costTone} />
        <Stat
          label="duplicated facts"
          value={metrics.dup}
          tone={metrics.dup > 0 ? "warn" : "ok"}
        />
        <Stat
          label={model === "graph" ? "vertices" : "tables / docs"}
          value={metrics.tables}
          tone="info"
        />
      </div>

      <p
        className="rounded-md border-l-2 px-4 py-2.5 font-mono text-xs leading-relaxed"
        style={
          {
            borderColor: TONE[model],
            background: `color-mix(in oklab, ${TONE[model]} 8%, transparent)`,
            color: "var(--color-fg-muted)",
          } as React.CSSProperties
        }
      >
        {metrics.note}
      </p>

      {/* Impedance-mismatch callout, only meaningful in the relational normalized case */}
      <AnimatePresence>
        {model === "relational" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <ImpedanceStrip shared={shared} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------- Relational view */

function Table({
  name,
  cols,
  rows,
  highlight,
}: {
  name: string;
  cols: string[];
  rows: string[][];
  highlight?: boolean;
}) {
  return (
    <div
      className="min-w-[150px] flex-1 overflow-hidden rounded-md border bg-ink-900"
      style={{
        borderColor: highlight ? TONE.relational : "var(--color-line)",
      }}
    >
      <div
        className="border-b px-3 py-1.5 font-mono text-[11px] font-medium"
        style={{
          borderColor: "var(--color-line)",
          color: highlight ? TONE.relational : "var(--color-fg-muted)",
          background: "var(--color-ink-850)",
        }}
      >
        {name}
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} className="px-3 py-1 text-left font-mono text-[9px] uppercase tracking-wider text-fg-faint">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line/60">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-1 font-mono text-[10px] text-fg-muted">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RelationalView({ shared }: { shared: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Table name="users" cols={["id", "name", "region"]} rows={[[String(PERSON.id), PERSON.name, PERSON.region]]} />
        <Table
          name="positions"
          cols={["id", "user_id", "title"]}
          rows={PERSON.positions.map((p) => [String(p.id), "→ " + PERSON.id, p.title])}
          highlight
        />
      </div>
      <div className="flex flex-wrap gap-3">
        {shared ? (
          <>
            <Table
              name="skills"
              cols={["id", "label"]}
              rows={PERSON.skills.map((s, i) => [String(100 + i), s])}
              highlight
            />
            <Table
              name="user_skills (join)"
              cols={["user_id", "skill_id"]}
              rows={PERSON.skills.map((_, i) => ["→ " + PERSON.id, "→ " + (100 + i)])}
              highlight
            />
          </>
        ) : (
          <Table
            name="skills"
            cols={["user_id", "label"]}
            rows={PERSON.skills.map((s) => ["→ " + PERSON.id, s])}
            highlight
          />
        )}
      </div>
      <p className="font-mono text-[10px] text-fg-faint">
        {shared
          ? "→ many-to-many: skills are their own table, linked through a junction table. Each label stored once."
          : "→ each child row carries a foreign key (→) back to its parent user. The optimizer picks the access path."}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- Document view */

function DocumentView({ shared }: { shared: boolean }) {
  const doc = useMemo(() => {
    const skills = shared
      ? PERSON.skills.map((s) => ({
          label: s,
          alsoHeldBy: SKILL_HOLDERS[s],
        }))
      : PERSON.skills;
    return JSON.stringify(
      {
        _id: PERSON.id,
        name: PERSON.name,
        region: PERSON.region,
        positions: PERSON.positions.map((p) => ({ title: p.title, org: p.org, years: p.years })),
        skills,
      },
      null,
      2
    );
  }, [shared]);

  // highlight duplicated names by wrapping them — simple token pass
  const lines = doc.split("\n");

  return (
    <div>
      <pre className="overflow-x-auto rounded-md border border-line bg-ink-950 p-4 text-[11px] leading-relaxed">
        <code className="font-mono">
          {lines.map((line, i) => {
            const dup = shared && /alsoHeldBy|"Melinda|"Warren/.test(line);
            return (
              <div
                key={i}
                style={
                  dup
                    ? ({ background: "color-mix(in oklab, var(--color-warn) 16%, transparent)" } as React.CSSProperties)
                    : undefined
                }
                className={dup ? "text-warn" : "text-fg-muted"}
              >
                {line || " "}
              </div>
            );
          })}
        </code>
      </pre>
      <p className="mt-3 font-mono text-[10px] text-fg-faint">
        {shared
          ? "→ to know who else has a skill, the document must embed those names — the same fact now lives in many places (highlighted)."
          : "→ one self-contained tree. A single read returns the whole profile with perfect storage locality."}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- Graph view */

type Node = { id: string; label: string; type: "user" | "position" | "skill"; x: number; y: number };
type Edge = { from: string; to: string; label: string; faint?: boolean };

function GraphView({ shared }: { shared: boolean }) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [
      { id: "u251", label: "Bill Gates", type: "user", x: 90, y: 130 },
      { id: "p1", label: "Co-chair", type: "position", x: 250, y: 56 },
      { id: "p2", label: "Co-founder", type: "position", x: 250, y: 110 },
      { id: "s0", label: "Philanthropy", type: "skill", x: 250, y: 170 },
      { id: "s1", label: "Software", type: "skill", x: 250, y: 214 },
      { id: "s2", label: "Leadership", type: "skill", x: 90, y: 230 },
    ];
    const edges: Edge[] = [
      { from: "u251", to: "p1", label: "HELD" },
      { from: "u251", to: "p2", label: "HELD" },
      { from: "u251", to: "s0", label: "KNOWS" },
      { from: "u251", to: "s1", label: "KNOWS" },
      { from: "u251", to: "s2", label: "KNOWS" },
    ];

    if (shared) {
      // other users point at the SAME skill vertices — no duplication
      nodes.push(
        { id: "u_mf", label: "Melinda", type: "user", x: 470, y: 150 },
        { id: "u_wb", label: "Buffett", type: "user", x: 470, y: 214 }
      );
      edges.push(
        { from: "u_mf", to: "s0", label: "KNOWS", faint: true },
        { from: "u_mf", to: "s1", label: "KNOWS", faint: true },
        { from: "u_wb", to: "s0", label: "KNOWS", faint: true }
      );
    }
    return { nodes, edges };
  }, [shared]);

  const nodeColor = (t: Node["type"]) =>
    t === "user" ? TONE.graph : t === "position" ? "var(--accent)" : "var(--accent-2)";

  const byId = (id: string) => nodes.find((n) => n.id === id)!;

  return (
    <div>
      <svg viewBox="0 0 560 270" className="w-full">
        {edges.map((e, i) => {
          const a = byId(e.from);
          const b = byId(e.to);
          return (
            <g key={i} opacity={e.faint ? 0.5 : 1}>
              <motion.line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={e.faint ? "var(--color-fg-faint)" : "var(--color-special)"}
                strokeWidth={e.faint ? 1 : 1.5}
                strokeDasharray={e.faint ? "4 4" : undefined}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: e.faint ? 0.5 : 1 }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
              />
              <text
                x={(a.x + b.x) / 2}
                y={(a.y + b.y) / 2 - 3}
                textAnchor="middle"
                className="fill-fg-faint font-mono"
                fontSize={7}
              >
                {e.label}
              </text>
            </g>
          );
        })}
        {nodes.map((n) => (
          <motion.g
            key={n.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <circle
              cx={n.x}
              cy={n.y}
              r={n.type === "user" ? 24 : 19}
              fill="var(--color-ink-950)"
              stroke={nodeColor(n.type)}
              strokeWidth={1.75}
            />
            <text x={n.x} y={n.y - 1} textAnchor="middle" className="fill-fg font-mono" fontSize={n.type === "user" ? 8 : 7}>
              {n.label.length > 10 ? n.label.slice(0, 9) + "…" : n.label}
            </text>
            <text x={n.x} y={n.y + 9} textAnchor="middle" className="font-mono" fontSize={6} fill={nodeColor(n.type)}>
              :{n.type}
            </text>
          </motion.g>
        ))}
      </svg>
      <p className="mt-1 font-mono text-[10px] text-fg-faint">
        {shared
          ? "→ shared skills are single vertices that many users point at. Adding a person who shares a skill is just one new edge — zero duplication."
          : "→ vertices carry properties; labelled edges carry the relationships. New relationship types need no schema migration."}
      </p>
    </div>
  );
}

/* --------------------------------------------------------- Impedance strip */

function ImpedanceStrip({ shared }: { shared: boolean }) {
  return (
    <div className="rounded-md border border-dashed border-line p-4">
      <div className="kicker mb-2 text-[9px]">Object–relational impedance mismatch</div>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <div className="flex-1 rounded bg-ink-900 p-2.5 font-mono text-[10px] text-fg-muted">
          <span className="text-accent-2">app object</span> Person{"{ positions:[…], skills:[…] }"}
        </div>
        <div className="self-center font-mono text-fg-faint">⇄ shred / re-stitch ⇄</div>
        <div className="flex-1 rounded bg-ink-900 p-2.5 font-mono text-[10px] text-fg-muted">
          <span className="accent-text">{shared ? "4 flat tables" : "3 flat tables"}</span> + {shared ? "3" : "2"} joins
          on read
        </div>
      </div>
      <p className="mt-2 font-mono text-[9px] leading-relaxed text-fg-faint">
        Your code holds a nested object; the relational store holds flat tuples. The translation layer that
        shreds the object into rows and re-stitches rows back into the object is the impedance mismatch.
      </p>
    </div>
  );
}
