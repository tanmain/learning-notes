"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Slider, Stat, CodeBlock, Toggle } from "@/components/chapter";

/**
 * Variable-length traversal: why a graph query has no fixed number of joins.
 *
 * A classic DDIA example — a location hierarchy linked by WITHIN edges plus people
 * linked by BORN_IN / LIVES_IN. The user drags a "max hops" slider; we BFS outward
 * from a person and light up every vertex reachable within that many WITHIN-hops.
 * In Cypher this is `:WITHIN*0..n`; in SQL it's a recursive CTE. The point: the
 * number of joins isn't known until run time — it depends on the data's depth.
 */

type V = { id: string; label: string; type: "person" | "city" | "region" | "country" | "continent"; x: number; y: number };
type E = { from: string; to: string; rel: "WITHIN" | "BORN_IN" | "LIVES_IN" };

const VERTICES: V[] = [
  { id: "idaho", label: "Idaho", type: "region", x: 150, y: 60 },
  { id: "usa", label: "United States", type: "country", x: 320, y: 60 },
  { id: "namerica", label: "N. America", type: "continent", x: 490, y: 60 },
  { id: "lakewood", label: "Lakewood", type: "city", x: 150, y: 150 },
  { id: "london", label: "London", type: "city", x: 150, y: 230 },
  { id: "england", label: "England", type: "region", x: 320, y: 230 },
  { id: "uk", label: "U.K.", type: "country", x: 490, y: 230 },
  { id: "europe", label: "Europe", type: "continent", x: 640, y: 230 },
  { id: "lucy", label: "Lucy", type: "person", x: 40, y: 150 },
];

const EDGES: E[] = [
  { from: "lucy", to: "lakewood", rel: "BORN_IN" },
  { from: "lucy", to: "london", rel: "LIVES_IN" },
  { from: "lakewood", to: "idaho", rel: "WITHIN" },
  { from: "idaho", to: "usa", rel: "WITHIN" },
  { from: "usa", to: "namerica", rel: "WITHIN" },
  { from: "london", to: "england", rel: "WITHIN" },
  { from: "england", to: "uk", rel: "WITHIN" },
  { from: "uk", to: "europe", rel: "WITHIN" },
];

const TYPE_COLOR: Record<V["type"], string> = {
  person: "var(--color-special)",
  city: "var(--accent)",
  region: "var(--accent-2)",
  country: "var(--accent-2)",
  continent: "var(--color-info)",
};

const CYPHER = `MATCH (lucy:Person {name:'Lucy'})
      -[:BORN_IN|LIVES_IN]-> ()
      -[:WITHIN*0..N]-> (place)
RETURN place.name
-- *0..N = follow WITHIN zero-or-more times
-- the traversal depth isn't fixed in advance`;

const SQL = `WITH RECURSIVE places(id) AS (
  SELECT to_id FROM edges
   WHERE from_id = 'lucy'
  UNION
  SELECT e.to_id FROM edges e
   JOIN places p ON e.from_id = p.id
   WHERE e.rel = 'WITHIN'   -- recurse
)
SELECT * FROM places;`;

export function GraphTraversal() {
  const [hops, setHops] = useState(2);
  const [useSql, setUseSql] = useState(false);

  // BFS from Lucy: first follow BORN_IN/LIVES_IN (the anchor), then WITHIN*0..hops.
  const { reachable, depth } = useMemo(() => {
    const adjWithin = new Map<string, string[]>();
    EDGES.filter((e) => e.rel === "WITHIN").forEach((e) => {
      adjWithin.set(e.from, [...(adjWithin.get(e.from) ?? []), e.to]);
    });

    // anchors: places Lucy is directly connected to
    const anchors = EDGES.filter((e) => e.from === "lucy").map((e) => e.to);
    const reach = new Set<string>(["lucy", ...anchors]);
    const depth = new Map<string, number>();
    anchors.forEach((a) => depth.set(a, 0));

    let frontier = [...anchors];
    for (let h = 1; h <= hops; h++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const to of adjWithin.get(id) ?? []) {
          if (!reach.has(to)) {
            reach.add(to);
            depth.set(to, h);
            next.push(to);
          }
        }
      }
      frontier = next;
    }
    return { reachable: reach, depth };
  }, [hops]);

  const byId = (id: string) => VERTICES.find((v) => v.id === id)!;
  const continentsFound = [...reachable].filter((id) => byId(id).type === "continent");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-[220px] flex-1">
          <Slider
            label="WITHIN*0..N  (max hops)"
            value={hops}
            min={0}
            max={4}
            step={1}
            onChange={setHops}
            format={(n) => `${n} hop${n === 1 ? "" : "s"}`}
          />
        </div>
        <Toggle label={useSql ? "showing recursive SQL" : "showing Cypher"} checked={useSql} onChange={setUseSql} />
      </div>

      <div className="rounded-lg border border-line bg-ink-950/60 p-3">
        <svg viewBox="0 0 700 270" className="w-full">
          {EDGES.map((e, i) => {
            const a = byId(e.from);
            const b = byId(e.to);
            const lit = reachable.has(e.from) && reachable.has(e.to);
            const isWithin = e.rel === "WITHIN";
            return (
              <g key={i}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={lit ? (isWithin ? "var(--accent-2)" : "var(--color-special)") : "var(--color-line)"}
                  strokeWidth={lit ? 1.75 : 1}
                  strokeDasharray={isWithin ? undefined : "4 4"}
                  opacity={lit ? 0.9 : 0.35}
                />
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 4}
                  textAnchor="middle"
                  className="font-mono"
                  fontSize={7}
                  fill={lit ? "var(--color-fg-muted)" : "var(--color-fg-faint)"}
                  opacity={lit ? 1 : 0.5}
                >
                  {e.rel}
                </text>
              </g>
            );
          })}
          {VERTICES.map((v) => {
            const lit = reachable.has(v.id);
            const d = depth.get(v.id);
            return (
              <motion.g key={v.id} initial={{ opacity: lit ? 1 : 0.32 }} animate={{ opacity: lit ? 1 : 0.32 }} transition={{ duration: 0.3 }}>
                <motion.rect
                  x={v.x - 42}
                  y={v.y - 14}
                  width={84}
                  height={28}
                  rx={v.type === "person" ? 14 : 6}
                  fill="var(--color-ink-950)"
                  animate={{
                    stroke: lit ? TYPE_COLOR[v.type] : "var(--color-line)",
                    strokeWidth: lit ? 2.5 : 1,
                    filter: "none",
                  }}
                />
                <text x={v.x} y={v.y - 1} textAnchor="middle" className="fill-fg font-mono" fontSize={8} fontWeight={500}>
                  {v.label}
                </text>
                <text x={v.x} y={v.y + 9} textAnchor="middle" className="font-mono" fontSize={6} fill={lit ? TYPE_COLOR[v.type] : "var(--color-fg-faint)"}>
                  {v.type === "person" ? ":person" : d !== undefined ? `hop ${d}` : `:${v.type}`}
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="vertices reached" value={reachable.size} tone="special" />
        <Stat label="effective joins" value={hops} unit="× WITHIN" tone="accent" />
        <Stat label="continents found" value={continentsFound.length} tone={continentsFound.length ? "ok" : "default"} />
      </div>

      <CodeBlock
        code={useSql ? SQL : CYPHER.replace(/N/g, String(hops))}
        lang={useSql ? "sql" : "cypher"}
        caption={
          useSql
            ? "WITH RECURSIVE re-joins the edges table to itself until it stops finding new rows."
            : "*0..N means: follow WITHIN edges between zero and N times — a variable-length path."
        }
      />

      <p className="font-mono text-[11px] leading-relaxed text-fg-muted">
        Drag the slider: each extra hop is <span className="text-accent-2">one more join the engine must run</span>
        , but you never wrote those joins explicitly. In a relational query you must know the join count up front;
        in a graph query the depth is <span className="text-special">data-dependent</span>. That is exactly why
        many-to-many, deeply-linked data wants a graph.
      </p>
    </div>
  );
}
