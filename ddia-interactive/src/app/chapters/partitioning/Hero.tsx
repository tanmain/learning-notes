"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * Animated hero: one logical dataset is split into partitions and spread across
 * a cluster of nodes. Records stream in, get hashed, and land in the partition
 * that owns their key — the central idea of the chapter. Replicas are hinted by
 * the stacked "shadow" behind each node.
 */

type Node = { id: number; x: number; y: number; partitions: number[] };

const NODES: Node[] = [
  { id: 0, x: 250, y: 70, partitions: [0, 3] },
  { id: 1, x: 410, y: 150, partitions: [1, 4] },
  { id: 2, x: 250, y: 230, partitions: [2, 5] },
  { id: 3, x: 90, y: 150, partitions: [6, 7] },
];

const PALETTE = ["var(--accent)", "var(--accent-2)", "#34d399", "#60a5fa"];

type Packet = { key: number; node: number; phase: number };

export function Hero() {
  const [tick, setTick] = useState(0);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) return;
    const t = setInterval(() => setTick((n) => n + 1), 1500);
    return () => clearInterval(t);
  }, []);

  // A small rotating set of "records" flowing from the router to their node.
  const packets = useMemo<Packet[]>(() => {
    const out: Packet[] = [];
    for (let i = 0; i < 4; i++) {
      const key = (tick * 7 + i * 13) % 97;
      out.push({ key, node: key % NODES.length, phase: i });
    }
    return out;
  }, [tick]);

  return (
    <div className="instrument relative overflow-hidden">
      <div className="bg-dotgrid absolute inset-0 opacity-40" />

      {/* corner label */}
      <div className="absolute left-4 top-3 z-10 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent anim-pulse-glow" />
        <span className="kicker">partition · distribute · replicate</span>
      </div>

      <svg viewBox="0 0 500 300" className="relative w-full" role="img" aria-label="One dataset split into partitions across a cluster of nodes">
        <defs>
          <radialGradient id="hero-node" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="color-mix(in oklab, var(--accent) 35%, var(--color-ink-800))" />
            <stop offset="100%" stopColor="var(--color-ink-850)" />
          </radialGradient>
          <linearGradient id="hero-wire" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* Source dataset (left) */}
        <g>
          <rect x={14} y={120} width={44} height={60} rx={8} fill="var(--color-ink-800)" stroke="var(--color-line-strong)" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect
              key={i}
              x={20}
              y={128 + i * 9.5}
              width={32}
              height={5}
              rx={2}
              fill={PALETTE[i % PALETTE.length]}
              opacity={0.75}
            />
          ))}
          <text x={36} y={196} textAnchor="middle" className="fill-fg-faint font-mono" fontSize={8}>
            dataset
          </text>
        </g>

        {/* Router / hash in the middle-left */}
        <g>
          <rect x={120} y={132} width={56} height={36} rx={8} fill="var(--color-ink-850)" stroke="var(--accent)" strokeOpacity={0.5} />
          <text x={148} y={150} textAnchor="middle" className="fill-fg font-mono" fontSize={9}>
            hash(k)
          </text>
          <text x={148} y={161} textAnchor="middle" className="fill-fg-faint font-mono" fontSize={7}>
            % N
          </text>
        </g>

        {/* wire from dataset to router */}
        <path d="M58 150 H120" stroke="url(#hero-wire)" strokeWidth={1.5} fill="none" className="flow-line" />

        {/* wires from router to each node */}
        {NODES.map((n) => (
          <path
            key={`wire-${n.id}`}
            d={`M176 150 C 210 150, 210 ${n.y}, ${n.x - 34} ${n.y}`}
            stroke="var(--color-line)"
            strokeWidth={1.25}
            fill="none"
            opacity={0.6}
          />
        ))}

        {/* Animated packets traveling router -> node */}
        {!reduced.current &&
          packets.map((p) => {
            const n = NODES[p.node];
            return (
              <motion.circle
                key={`pkt-${tick}-${p.phase}`}
                r={4}
                fill={PALETTE[p.node]}
                initial={{ cx: 176, cy: 150, opacity: 0 }}
                animate={{
                  cx: [176, (176 + n.x - 34) / 2, n.x - 30],
                  cy: [150, (150 + n.y) / 2, n.y],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{ duration: 1.2, delay: p.phase * 0.12, ease: "easeInOut" }}
              />
            );
          })}

        {/* Nodes with replica shadow + two partition slots each */}
        {NODES.map((n) => (
          <g key={`node-${n.id}`}>
            {/* replica shadow stack */}
            <rect x={n.x - 26} y={n.y - 22} width={56} height={44} rx={9} fill="var(--color-ink-900)" stroke="var(--color-line)" opacity={0.55} transform="translate(6 6)" />
            <rect x={n.x - 28} y={n.y - 24} width={56} height={44} rx={9} fill="var(--color-ink-900)" stroke="var(--color-line)" opacity={0.75} transform="translate(3 3)" />
            {/* main node body */}
            <motion.rect
              x={n.x - 30}
              y={n.y - 26}
              width={56}
              height={44}
              rx={9}
              fill="url(#hero-node)"
              stroke="var(--accent)"
              initial={{ strokeOpacity: 0.45 }}
              animate={{
                strokeOpacity:
                  !reduced.current && packets.some((p) => p.node === n.id) ? [0.45, 0.95, 0.45] : 0.45,
              }}
              transition={{ duration: 1.4 }}
            />
            {/* two partition chips */}
            {n.partitions.map((pid, idx) => (
              <g key={pid}>
                <rect
                  x={n.x - 24}
                  y={n.y - 18 + idx * 17}
                  width={44}
                  height={13}
                  rx={3}
                  fill={PALETTE[pid % PALETTE.length]}
                  opacity={0.22}
                />
                <text x={n.x - 2} y={n.y - 8.5 + idx * 17} textAnchor="middle" className="fill-fg font-mono" fontSize={7.5}>
                  P{pid}
                </text>
              </g>
            ))}
            <text x={n.x - 2} y={n.y + 30} textAnchor="middle" className="fill-fg-faint font-mono" fontSize={7.5}>
              node {n.id}
            </text>
          </g>
        ))}

        {/* legend */}
        <g>
          <rect x={350} y={258} width={9} height={9} rx={2} fill="var(--accent)" opacity={0.5} />
          <text x={364} y={266} className="fill-fg-faint font-mono" fontSize={7.5}>
            partition
          </text>
          <rect x={420} y={258} width={9} height={9} rx={2} fill="var(--color-ink-900)" stroke="var(--color-line)" />
          <text x={434} y={266} className="fill-fg-faint font-mono" fontSize={7.5}>
            replica
          </text>
        </g>
      </svg>

      <p className="relative border-t border-line px-5 py-3 text-center font-mono text-[11px] text-fg-faint">
        each record belongs to exactly one partition — partitions spread across nodes for scale, and replicate for fault tolerance
      </p>
    </div>
  );
}
