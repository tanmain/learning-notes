"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button, Slider, Stat, SegmentedControl } from "@/components/chapter";
import { IconReset } from "@/components/icons";
import { buildRing, hashAngle, hash32, ownerOf, type RingToken } from "./hashing";

/* ------------------------------------------------------------------ palette */

const NODE_COLORS = [
  "#7d74f2", // accent
  "#f5903d", // accent-2
  "#34d399", // ok
  "#60a5fa", // info
  "#c084fc", // special
  "#fb7185", // fault
  "#fbbf24", // warn
];
const colorFor = (idx: number) => NODE_COLORS[idx % NODE_COLORS.length];

/* --------------------------------------------------------------- geometry */

const CX = 170;
const CY = 170;
const R = 128; // ring radius
const KEY_R = 128; // keys ride on the ring too

function polar(angleDeg: number, radius: number) {
  // 0deg at top (12 o'clock), clockwise — matches a clock face mental model
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a) };
}

/** SVG arc path from startAngle to endAngle (clockwise) at given radius. */
function arcPath(startAngle: number, endAngle: number, radius: number) {
  const start = polar(startAngle, radius);
  const end = polar(endAngle, radius);
  let sweep = endAngle - startAngle;
  if (sweep < 0) sweep += 360;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/* ----------------------------------------------------------------- keys */

// A pool of realistic key names the "+ key" button draws from, in order.
const KEY_POOL = [
  "user:42",
  "user:118",
  "order:7731",
  "order:9920",
  "cart:abc",
  "cart:xyz",
  "post:2048",
  "post:512",
  "sku:9001",
  "sku:3140",
  "session:f2",
  "session:9c",
  "user:777",
  "order:1234",
  "cart:def",
  "post:64",
  "sku:5005",
  "session:aa",
  "user:2718",
  "order:3141",
];
const INITIAL_KEY_COUNT = 8;
const MAX_KEYS = KEY_POOL.length;

type KeyInfo = { key: string; angle: number };
const toKeyInfo = (key: string): KeyInfo => ({ key, angle: hashAngle(key) });

/* ----------------------------------------------------------- assignment */

type Assignment = Record<string, string>; // key -> nodeId

function assignConsistent(keys: KeyInfo[], ring: RingToken[]): Assignment {
  const out: Assignment = {};
  for (const k of keys) out[k.key] = ownerOf(k.angle, ring);
  return out;
}

function assignModN(keys: KeyInfo[], nodeIds: string[]): Assignment {
  const out: Assignment = {};
  const n = nodeIds.length;
  for (const k of keys) {
    out[k.key] = n === 0 ? "" : nodeIds[hash32(k.key) % n];
  }
  return out;
}

function countMoved(before: Assignment, after: Assignment): number {
  let moved = 0;
  for (const k of Object.keys(after)) {
    if (before[k] !== undefined && before[k] !== after[k]) moved++;
  }
  return moved;
}

/* ------------------------------------------------------------------ demo */

type Mode = "ring" | "modn";

export function RingDemo() {
  const [nodeCount, setNodeCount] = useState(3);
  const [keyCount, setKeyCount] = useState(INITIAL_KEY_COUNT);
  const [vnodes, setVnodes] = useState(1);
  const [mode, setMode] = useState<Mode>("ring");
  const [movedKeys, setMovedKeys] = useState<Set<string>>(new Set());
  const [lastEvent, setLastEvent] = useState<string>("3 nodes · 8 keys on the ring");

  const keyInfos = useMemo<KeyInfo[]>(
    () => KEY_POOL.slice(0, keyCount).map(toKeyInfo),
    [keyCount]
  );

  const nodeIds = useMemo(
    () => Array.from({ length: nodeCount }, (_, i) => `node-${i}`),
    [nodeCount]
  );
  const nodeIndex = useMemo(() => {
    const m: Record<string, number> = {};
    nodeIds.forEach((id, i) => (m[id] = i));
    return m;
  }, [nodeIds]);

  const ring = useMemo(() => buildRing(nodeIds, vnodes), [nodeIds, vnodes]);

  const assignment = useMemo<Assignment>(
    () => (mode === "ring" ? assignConsistent(keyInfos, ring) : assignModN(keyInfos, nodeIds)),
    [mode, ring, nodeIds, keyInfos]
  );

  // Per-node ownership arcs (only meaningful for the ring view). A key landing
  // in the arc (t, next] is routed CLOCKWISE to `next`, so the arc is owned by
  // — and colored with — `next.nodeId`. This keeps arc color == key-dot color.
  const arcs = useMemo(() => {
    if (ring.length === 0) return [];
    return ring.map((t, i) => {
      const next = ring[(i + 1) % ring.length];
      return { start: t.angle, end: next.angle, nodeId: next.nodeId };
    });
  }, [ring]);

  // counts per node for the load bars
  const loadByNode = useMemo(() => {
    const counts: Record<string, number> = {};
    nodeIds.forEach((id) => (counts[id] = 0));
    for (const k of Object.keys(assignment)) {
      const owner = assignment[k];
      if (owner in counts) counts[owner]++;
    }
    return counts;
  }, [assignment, nodeIds]);

  /* ---- topology changes: measure churn under the displayed scheme --------- */

  const applyNodeChange = useCallback(
    (nextCount: number, label: string) => {
      const nextIds = Array.from({ length: nextCount }, (_, i) => `node-${i}`);

      // before / after under the CURRENTLY DISPLAYED scheme (to highlight)
      const beforeDisplayed = assignment;
      const afterDisplayed =
        mode === "ring"
          ? assignConsistent(keyInfos, buildRing(nextIds, vnodes))
          : assignModN(keyInfos, nextIds);

      const moved = new Set<string>();
      for (const k of Object.keys(afterDisplayed)) {
        if (beforeDisplayed[k] !== afterDisplayed[k]) moved.add(k);
      }
      setMovedKeys(moved);
      setNodeCount(nextCount);
      setLastEvent(label);
    },
    [assignment, mode, vnodes, keyInfos]
  );

  const addNode = () => {
    if (nodeCount >= 7) return;
    applyNodeChange(nodeCount + 1, `added node-${nodeCount}`);
  };
  const removeNode = () => {
    if (nodeCount <= 1) return;
    applyNodeChange(nodeCount - 1, `removed node-${nodeCount - 1}`);
  };

  // Adding/removing a KEY doesn't churn existing keys — it just lands (or
  // vanishes). We highlight only the newly-added key so the user sees where
  // its hash drops it on the ring.
  const addKey = () => {
    if (keyCount >= MAX_KEYS) return;
    const added = KEY_POOL[keyCount];
    setKeyCount(keyCount + 1);
    setMovedKeys(new Set([added]));
    setLastEvent(`added key ${added}`);
  };
  const removeKey = () => {
    if (keyCount <= 1) return;
    const removed = KEY_POOL[keyCount - 1];
    setKeyCount(keyCount - 1);
    setMovedKeys(new Set());
    setLastEvent(`removed key ${removed}`);
  };

  const reset = () => {
    setMovedKeys(new Set());
    setNodeCount(3);
    setKeyCount(INITIAL_KEY_COUNT);
    setVnodes(1);
    setMode("ring");
    setLastEvent("reset · 3 nodes · 8 keys");
  };

  // For the headline comparison stat, compute churn of a +1 node event under
  // both schemes from the CURRENT topology, so the contrast is always visible.
  const churnPreview = useMemo(() => {
    const nextIds = Array.from({ length: Math.min(nodeCount + 1, 12) }, (_, i) => `node-${i}`);
    const ringBefore = assignConsistent(keyInfos, ring);
    const ringAfter = assignConsistent(keyInfos, buildRing(nextIds, vnodes));
    const modBefore = assignModN(keyInfos, nodeIds);
    const modAfter = assignModN(keyInfos, nextIds);
    return {
      ring: countMoved(ringBefore, ringAfter),
      modn: countMoved(modBefore, modAfter),
      total: keyInfos.length,
    };
  }, [ring, nodeIds, vnodes, nodeCount, keyInfos]);

  // Imbalance: how far the busiest node is above a perfectly even share.
  const loadSkewPct = useMemo(() => {
    const counts = nodeIds.map((id) => loadByNode[id] ?? 0);
    const max = Math.max(...counts, 0);
    const ideal = keyInfos.length / Math.max(nodeIds.length, 1);
    if (ideal === 0) return 0;
    return Math.round(((max - ideal) / ideal) * 100);
  }, [loadByNode, nodeIds, keyInfos]);

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<Mode>
          value={mode}
          onChange={(m) => {
            setMode(m);
            setMovedKeys(new Set());
            setLastEvent(m === "ring" ? "consistent hashing" : "naive hash % N");
          }}
          options={[
            { label: "Consistent hashing", value: "ring" },
            { label: "Naive hash % N", value: "modn" },
          ]}
        />
      </div>

      {/* node + key steppers */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="kicker">Nodes</span>
          <Button size="sm" variant="outline" onClick={removeNode} disabled={nodeCount <= 1}>
            – node
          </Button>
          <span className="w-6 text-center font-mono text-sm tabular-nums text-fg">{nodeCount}</span>
          <Button size="sm" variant="solid" onClick={addNode} disabled={nodeCount >= 7}>
            + node
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="kicker">Keys</span>
          <Button size="sm" variant="outline" onClick={removeKey} disabled={keyCount <= 1}>
            – key
          </Button>
          <span className="w-6 text-center font-mono text-sm tabular-nums text-fg">{keyCount}</span>
          <Button size="sm" variant="solid" onClick={addKey} disabled={keyCount >= MAX_KEYS}>
            + key
          </Button>
        </div>
        <Button size="sm" variant="ghost" onClick={reset} title="Reset" className="ml-auto">
          <IconReset size={14} /> reset
        </Button>
      </div>

      {mode === "ring" && (
        <Slider
          label="Virtual nodes per server (vnodes)"
          value={vnodes}
          min={1}
          max={8}
          step={1}
          onChange={(v) => {
            setVnodes(v);
            setMovedKeys(new Set());
            setLastEvent(`${v} vnode${v > 1 ? "s" : ""} per server`);
          }}
          format={(v) => `${v}×`}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* ---- the ring ---- */}
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 340 340" className="w-full max-w-[340px]">
            {/* base ring */}
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--color-line)" strokeWidth={10} opacity={0.5} />

            {mode === "ring" &&
              arcs.map((a, i) => {
                const idx = nodeIndex[a.nodeId] ?? 0;
                return (
                  <path
                    key={`arc-${i}`}
                    d={arcPath(a.start, a.end, R)}
                    fill="none"
                    stroke={colorFor(idx)}
                    strokeWidth={10}
                    strokeLinecap="butt"
                    opacity={0.7}
                  />
                );
              })}

            {mode === "modn" && (
              <text x={CX} y={CY - 6} textAnchor="middle" className="fill-fg-faint font-mono" fontSize={10}>
                key % {nodeCount}
              </text>
            )}
            {mode === "modn" && (
              <text x={CX} y={CY + 12} textAnchor="middle" className="fill-fg-faint font-mono" fontSize={8}>
                position ignored
              </text>
            )}

            {/* node tokens on the ring */}
            {mode === "ring" &&
              ring.map((t, i) => {
                const p = polar(t.angle, R);
                const idx = nodeIndex[t.nodeId] ?? 0;
                return (
                  <g key={`tok-${i}`}>
                    <circle cx={p.x} cy={p.y} r={7} fill={colorFor(idx)} stroke="var(--color-ink-950)" strokeWidth={2} />
                  </g>
                );
              })}

            {/* keys */}
            {keyInfos.map((k) => {
              const owner = assignment[k.key];
              const idx = owner ? nodeIndex[owner] ?? 0 : 0;
              const moved = movedKeys.has(k.key);
              if (mode === "ring") {
                const p = polar(k.angle, KEY_R);
                // pull the key dot just inside the ring
                const inner = polar(k.angle, KEY_R - 22);
                return (
                  <g key={`key-${k.key}`}>
                    <line x1={p.x} y1={p.y} x2={inner.x} y2={inner.y} stroke="var(--color-line)" strokeWidth={1} opacity={0.4} />
                    <motion.circle
                      cx={inner.x}
                      cy={inner.y}
                      r={moved ? 6 : 4.5}
                      animate={{ fill: colorFor(idx) }}
                      stroke={moved ? "var(--color-fg)" : "var(--color-ink-950)"}
                      strokeWidth={moved ? 2 : 1.5}
                    />
                    {moved && (
                      <motion.circle
                        cx={inner.x}
                        cy={inner.y}
                        r={6}
                        fill="none"
                        stroke="var(--color-fg)"
                        initial={{ r: 6, opacity: 0.9 }}
                        animate={{ r: 15, opacity: 0 }}
                        transition={{ duration: 0.9, repeat: 2 }}
                      />
                    )}
                  </g>
                );
              }
              // mod-N layout: keys arranged in a tidy grid inside the circle
              const i = keyInfos.indexOf(k);
              const col = i % 4;
              const row = Math.floor(i / 4);
              const gx = CX - 54 + col * 36;
              const gy = CY + 30 + row * 22;
              return (
                <g key={`key-${k.key}`}>
                  <motion.circle
                    cx={gx}
                    cy={gy}
                    r={moved ? 7 : 5}
                    animate={{ fill: colorFor(idx) }}
                    stroke={moved ? "var(--color-fg)" : "var(--color-ink-950)"}
                    strokeWidth={moved ? 2 : 1.5}
                  />
                </g>
              );
            })}
          </svg>

          <div className="mt-1 font-mono text-[11px] text-fg-faint">
            last event: <span className="accent-text">{lastEvent}</span>
          </div>
        </div>

        {/* ---- side panel ---- */}
        <div className="space-y-4">
          {/* churn comparison */}
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Move if +1 node (consistent)"
              value={churnPreview.ring}
              unit={`/ ${churnPreview.total} keys`}
              tone="accent"
            />
            <Stat
              label="Move if +1 node (mod N)"
              value={churnPreview.modn}
              unit={`/ ${churnPreview.total} keys`}
              tone={churnPreview.modn > churnPreview.ring ? "fault" : "default"}
            />
          </div>

          {/* per-node load */}
          <div className="rounded-lg border border-line bg-ink-900/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="kicker">Load per node ({Object.keys(assignment).length} keys)</div>
              <span
                className="font-mono text-[11px] tabular-nums"
                style={{
                  color:
                    loadSkewPct > 60
                      ? "var(--color-fault)"
                      : loadSkewPct > 25
                        ? "var(--color-warn)"
                        : "var(--color-ok)",
                }}
              >
                busiest +{Math.max(loadSkewPct, 0)}% vs even
              </span>
            </div>
            <div className="space-y-2">
              {nodeIds.map((id, i) => {
                const count = loadByNode[id] ?? 0;
                const pct = keyInfos.length ? (count / keyInfos.length) * 100 : 0;
                return (
                  <div key={id} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 font-mono text-xs" style={{ color: colorFor(i) }}>
                      node {i}
                    </span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink-800">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: colorFor(i) }}
                        animate={{ width: `${pct}%` }}
                        transition={{ type: "spring", stiffness: 180, damping: 22 }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-fg-muted">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {movedKeys.size > 0 ? (
            <div
              className="rounded-lg border-l-2 p-3 text-[13px] leading-relaxed"
              style={{
                borderColor: mode === "ring" ? "var(--accent)" : "var(--color-fault)",
                background:
                  mode === "ring"
                    ? "color-mix(in oklab, var(--accent) 10%, var(--color-ink-850))"
                    : "color-mix(in oklab, var(--color-fault) 10%, var(--color-ink-850))",
              }}
            >
              <span className="font-mono">
                {movedKeys.size} of {keyInfos.length} keys
              </span>{" "}
              changed owner (highlighted, ringed white).{" "}
              {mode === "ring"
                ? "Only keys in the affected arc move — everything else stays put."
                : "Almost every key remapped, because % N shifts when N changes."}
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-ink-850 p-3 text-[13px] leading-relaxed text-fg-muted">
              Add or remove a <span className="accent-text">node</span> and watch which keys are forced to a new
              home; add a <span className="accent-text">key</span> to see where its hash drops it.
              {mode === "ring"
                ? " Raise vnodes to even out the load bars above."
                : " Notice how the grid recolors almost completely each time N changes."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
