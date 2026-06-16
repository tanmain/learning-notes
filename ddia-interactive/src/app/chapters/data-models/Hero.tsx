"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Animated hero: one entity ("a user profile") fans out into three data models —
 * relational tables, a JSON document, and a property graph — emphasising the
 * chapter's central idea: the same facts, three shapes, each tuned to a
 * different access pattern. A pulse of "data" flows from the source entity into
 * each model in turn.
 */

const MODELS = ["relational", "document", "graph"] as const;
type Model = (typeof MODELS)[number];

const MODEL_META: Record<Model, { label: string; tone: string }> = {
  relational: { label: "Relational", tone: "var(--accent)" },
  document: { label: "Document", tone: "var(--accent-2)" },
  graph: { label: "Graph", tone: "var(--color-special)" },
};

export function Hero() {
  const [active, setActive] = useState<Model>("relational");

  useEffect(() => {
    const id = setInterval(() => {
      setActive((m) => MODELS[(MODELS.indexOf(m) + 1) % MODELS.length]);
    }, 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="instrument relative overflow-hidden rounded-xl p-5 sm:p-7">
      <div className="bg-dotgrid pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-accent anim-pulse-glow" />
          <span className="kicker">One entity · three models</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
          rendering as{" "}
          <span style={{ color: MODEL_META[active].tone }}>{MODEL_META[active].label}</span>
        </span>
      </div>

      <svg viewBox="0 0 760 300" className="relative w-full" role="img" aria-label="One entity fanning into relational, document, and graph data models">
        <defs>
          <linearGradient id="hero-src" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>

        {/* Source entity */}
        <g>
          <motion.rect
            x={42}
            y={112}
            width={132}
            height={76}
            rx={12}
            fill="url(#hero-src)"
            opacity={0.16}
            stroke="url(#hero-src)"
            strokeWidth={1.5}
            animate={{ opacity: [0.12, 0.22, 0.12] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <text x={108} y={140} textAnchor="middle" className="fill-fg font-mono" fontSize={12} fontWeight={600}>
            user #42
          </text>
          <text x={108} y={158} textAnchor="middle" className="fill-fg-muted font-mono" fontSize={9}>
            name · jobs · skills
          </text>
          <text x={108} y={172} textAnchor="middle" className="fill-fg-faint font-mono" fontSize={8}>
            the same facts →
          </text>
        </g>

        {/* Connectors from source to each model */}
        {[
          { y: 56, model: "relational" as Model },
          { y: 150, model: "document" as Model },
          { y: 244, model: "graph" as Model },
        ].map(({ y, model }) => (
          <path
            key={model}
            d={`M174 150 C 250 150, 250 ${y}, 326 ${y}`}
            fill="none"
            stroke={active === model ? MODEL_META[model].tone : "var(--color-line)"}
            strokeWidth={active === model ? 2 : 1.25}
            strokeDasharray="5 7"
            className="flow-line"
            opacity={active === model ? 0.95 : 0.4}
          />
        ))}

        {/* Travelling pulse to the active model */}
        <motion.circle
          key={active}
          r={4.5}
          fill={MODEL_META[active].tone}
          initial={{ offsetDistance: "0%", opacity: 0 }}
          animate={{ offsetDistance: "100%", opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.1, ease: "easeInOut" }}
          style={
            {
              offsetPath: `path("M174 150 C 250 150, 250 ${
                active === "relational" ? 56 : active === "document" ? 150 : 244
              }, 326 ${active === "relational" ? 56 : active === "document" ? 150 : 244}")`,
            } as React.CSSProperties
          }
        />

        {/* ---- Relational model ---- */}
        <ModelCard x={326} y={18} active={active === "relational"} tone={MODEL_META.relational.tone}>
          <g className="font-mono">
            {/* users table */}
            <rect x={336} y={30} width={120} height={34} rx={4} fill="var(--color-ink-950)" stroke="var(--accent)" strokeWidth={1} opacity={0.85} />
            <line x1={336} y1={42} x2={456} y2={42} stroke="var(--accent)" strokeWidth={0.75} opacity={0.5} />
            <text x={342} y={40} className="fill-accent" fontSize={8}>users</text>
            <text x={342} y={56} className="fill-fg-muted" fontSize={7}>42 · &quot;Ada&quot;</text>
            {/* jobs table */}
            <rect x={470} y={30} width={120} height={34} rx={4} fill="var(--color-ink-950)" stroke="var(--accent)" strokeWidth={1} opacity={0.85} />
            <line x1={470} y1={42} x2={590} y2={42} stroke="var(--accent)" strokeWidth={0.75} opacity={0.5} />
            <text x={476} y={40} className="fill-accent" fontSize={8}>jobs</text>
            <text x={476} y={56} className="fill-fg-muted" fontSize={7}>user_id 42 → …</text>
            {/* FK link */}
            <path d="M456 47 H470" stroke="var(--accent)" strokeWidth={1} />
            <circle cx={470} cy={47} r={1.8} fill="var(--accent)" />
          </g>
        </ModelCard>

        {/* ---- Document model ---- */}
        <ModelCard x={326} y={112} active={active === "document"} tone={MODEL_META.document.tone}>
          <g className="font-mono" fill="var(--color-fg-muted)" fontSize={8}>
            <text x={342} y={130} fill={MODEL_META.document.tone}>{"{"}</text>
            <text x={352} y={142}>&quot;id&quot;: 42,</text>
            <text x={352} y={154}>&quot;jobs&quot;: [ … ],</text>
            <text x={352} y={166}>&quot;skills&quot;: [ … ]</text>
            <text x={342} y={178} fill={MODEL_META.document.tone}>{"}"}</text>
            <text x={470} y={154} fill="var(--color-fg-faint)" fontSize={7}>one self-</text>
            <text x={470} y={165} fill="var(--color-fg-faint)" fontSize={7}>contained tree</text>
          </g>
        </ModelCard>

        {/* ---- Graph model ---- */}
        <ModelCard x={326} y={206} active={active === "graph"} tone={MODEL_META.graph.tone}>
          <g>
            <line x1={372} y1={244} x2={430} y2={228} stroke={MODEL_META.graph.tone} strokeWidth={1} opacity={0.7} />
            <line x1={372} y1={244} x2={430} y2={262} stroke={MODEL_META.graph.tone} strokeWidth={1} opacity={0.7} />
            <line x1={430} y1={228} x2={500} y2={244} stroke={MODEL_META.graph.tone} strokeWidth={1} opacity={0.5} />
            {[
              { cx: 372, cy: 244, t: "u42" },
              { cx: 430, cy: 228, t: "job" },
              { cx: 430, cy: 262, t: "skill" },
              { cx: 500, cy: 244, t: "u7" },
            ].map((n) => (
              <g key={n.t}>
                <circle cx={n.cx} cy={n.cy} r={10} fill="var(--color-ink-950)" stroke={MODEL_META.graph.tone} strokeWidth={1.25} />
                <text x={n.cx} y={n.cy + 2.5} textAnchor="middle" className="fill-fg-muted font-mono" fontSize={6}>{n.t}</text>
              </g>
            ))}
            <text x={524} y={247} className="fill-fg-faint font-mono" fontSize={7}>edges = rels</text>
          </g>
        </ModelCard>
      </svg>

      <p className="relative mt-4 max-w-2xl font-body text-sm italic leading-relaxed text-fg-muted">
        The data never changes — only its <span className="accent-text not-italic">shape</span> does. Each
        model optimises a different question: tables for flexible joins, documents for locality, graphs for
        many-to-many traversal.
      </p>
    </div>
  );
}

function ModelCard({
  x,
  y,
  active,
  tone,
  children,
}: {
  x: number;
  y: number;
  active: boolean;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <motion.g
      initial={{ opacity: active ? 1 : 0.4 }}
      animate={{ opacity: active ? 1 : 0.4 }}
      transition={{ duration: 0.5 }}
    >
      <motion.rect
        x={x}
        y={y}
        width={418}
        height={64}
        rx={10}
        fill="var(--color-ink-900)"
        stroke={active ? tone : "var(--color-line)"}
        strokeWidth={active ? 2.5 : 1}
        animate={{
          filter: "none",
        }}
      />
      {children}
    </motion.g>
  );
}
