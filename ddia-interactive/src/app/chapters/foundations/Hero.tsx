"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Animated hero — "The Control Room".
 * A request enters from the left, flows through the standard building blocks of a
 * data-intensive application (DB · cache · search · stream · batch), and the three
 * pillars — Reliability, Scalability, Maintainability — sit above as the gauges
 * every system is judged by. A live ticker shows a request stream being graded.
 */

type Block = { id: string; label: string; sub: string; x: number };

const BLOCKS: Block[] = [
  { id: "db", label: "DB", sub: "store", x: 150 },
  { id: "cache", label: "Cache", sub: "fast reads", x: 270 },
  { id: "idx", label: "Index", sub: "search", x: 390 },
  { id: "stream", label: "Stream", sub: "async msg", x: 510 },
  { id: "batch", label: "Batch", sub: "crunch", x: 630 },
];

const PILLARS = [
  { id: "rel", label: "RELIABILITY", note: "works under adversity", color: "var(--accent)" },
  { id: "scl", label: "SCALABILITY", note: "copes with growth", color: "var(--color-info)" },
  { id: "mnt", label: "MAINTAINABILITY", note: "productive to evolve", color: "var(--color-special)" },
];

export function Hero() {
  // A tiny live "p99 gauge" that wobbles to feel like a real instrument.
  const [p99, setP99] = useState(420);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      // Occasional tail spike, mostly calm — mimics a real latency feed.
      setP99(() => {
        const spike = Math.random() < 0.18;
        const base = 280 + Math.random() * 160;
        return Math.round(spike ? base + 300 + Math.random() * 320 : base);
      });
      setTick((t) => (t + 1) % 1000);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const healthy = p99 < 600;

  return (
    <div className="panel relative overflow-hidden">
      {/* top status strip */}
      <div className="relative flex items-center justify-between border-b border-line px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-accent anim-pulse-glow" />
          <span className="kicker">Control Room · live</span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] text-fg-faint">
          <span>
            p99{" "}
            <span
              className="tabular-nums"
              style={{ color: healthy ? "var(--color-ok)" : "var(--color-warn)" }}
            >
              {p99} ms
            </span>
          </span>
          <span className="hidden sm:inline">throughput 304k req/s</span>
        </div>
      </div>

      <svg viewBox="0 0 780 360" className="relative block w-full">
        <defs>
          <linearGradient id="hero-flow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.05" />
            <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--color-info)" stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id="hero-node" cx="50%" cy="35%" r="75%">
            <stop offset="0%" stopColor="var(--color-ink-800)" />
            <stop offset="100%" stopColor="var(--color-ink-850)" />
          </radialGradient>
        </defs>

        {/* ---- The three pillars / gauges along the top ---- */}
        {PILLARS.map((p, i) => {
          const x = 120 + i * 230;
          return (
            <g key={p.id} transform={`translate(${x}, 30)`}>
              <motion.rect
                x={-95}
                y={0}
                width={190}
                height={56}
                rx={10}
                fill="url(#hero-node)"
                stroke={p.color}
                strokeOpacity={0.55}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 * i, duration: 0.6 }}
              />
              <text
                x={0}
                y={24}
                textAnchor="middle"
                className="font-mono"
                fontSize={13}
                fontWeight={700}
                fill={p.color}
                letterSpacing={1.5}
              >
                {p.label}
              </text>
              <text x={0} y={42} textAnchor="middle" fontSize={10} fill="var(--color-fg-muted)" className="font-mono">
                {p.note}
              </text>
              {/* gauge tick lights */}
              {[0, 1, 2, 3, 4].map((d) => (
                <motion.circle
                  key={d}
                  cx={-70 + d * 35}
                  cy={50}
                  r={2.2}
                  fill={p.color}
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1.8, delay: d * 0.18 + i * 0.3, repeat: Infinity }}
                />
              ))}
            </g>
          );
        })}

        {/* connectors from pillars down to the bus */}
        {PILLARS.map((p, i) => {
          const x = 120 + i * 230;
          return (
            <line
              key={p.id}
              x1={x}
              y1={86}
              x2={x}
              y2={150}
              stroke={p.color}
              strokeOpacity={0.22}
              strokeWidth={1}
              strokeDasharray="3 5"
            />
          );
        })}

        {/* ---- Ingress request ---- */}
        <g transform="translate(40, 196)">
          <circle r={16} fill="url(#hero-node)" stroke="var(--accent)" strokeWidth={1.5} />
          <text textAnchor="middle" dy={4} fontSize={9} fill="var(--accent)" className="font-mono">
            REQ
          </text>
        </g>

        {/* ---- The data bus line ---- */}
        <line
          x1={56}
          y1={196}
          x2={720}
          y2={196}
          stroke="url(#hero-flow)"
          strokeWidth={3}
          className="flow-line"
          strokeDasharray="6 8"
        />

        {/* animated packets riding the bus */}
        {[0, 1, 2, 3].map((k) => (
          <motion.circle
            key={k}
            r={4}
            fill={k % 2 ? "var(--color-info)" : "var(--accent)"}
            cy={196}
            initial={{ cx: 56, opacity: 0 }}
            animate={{ cx: [56, 720], opacity: [0, 1, 1, 0] }}
            transition={{
              duration: 3.2,
              delay: k * 0.8,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}

        {/* ---- The standard building blocks ---- */}
        {BLOCKS.map((b, i) => (
          <g key={b.id} transform={`translate(${b.x}, 196)`}>
            <line x1={0} y1={0} x2={0} y2={42} stroke="var(--color-line)" strokeWidth={1} />
            <motion.rect
              x={-44}
              y={42}
              width={88}
              height={54}
              rx={9}
              fill="url(#hero-node)"
              stroke="var(--color-line-strong)"
              initial={{ opacity: 0, y: 52 }}
              animate={{ opacity: 1, y: 42 }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
            />
            <motion.rect
              x={-44}
              y={42}
              width={88}
              height={54}
              rx={9}
              fill="none"
              stroke="var(--accent)"
              animate={{ strokeOpacity: [0, 0.7, 0] }}
              transition={{ duration: 3.2, delay: 0.3 + i * 0.8, repeat: Infinity }}
            />
            <text x={0} y={66} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-fg)" className="font-mono">
              {b.label}
            </text>
            <text x={0} y={83} textAnchor="middle" fontSize={9} fill="var(--color-fg-faint)" className="font-mono">
              {b.sub}
            </text>
          </g>
        ))}

        {/* ---- live request ledger (right-bottom) ---- */}
        <g transform="translate(0, 300)">
          <text x={40} y={0} fontSize={10} fill="var(--color-fg-faint)" className="font-mono" letterSpacing={1}>
            REQUEST LEDGER
          </text>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((c) => {
            const seed = (tick + c * 37) % 100;
            const slow = seed > 82;
            return (
              <motion.rect
                key={c}
                x={40 + c * 26}
                y={12}
                width={18}
                height={22}
                rx={3}
                fill={slow ? "var(--color-warn)" : "var(--color-ok)"}
                fillOpacity={slow ? 0.85 : 0.5}
                animate={{ height: [22, slow ? 34 : 18, 22] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: c * 0.07 }}
              />
            );
          })}
          <text x={40 + 12 * 26 + 6} y={28} fontSize={9} fill="var(--color-fg-faint)" className="font-mono">
            ← tail
          </text>
        </g>
      </svg>

      <div className="relative border-t border-line px-5 py-3 text-center font-mono text-[11px] text-fg-faint">
        Standard building blocks, judged by three pillars — measured in milliseconds at the{" "}
        <span className="accent-text">99th percentile</span>.
      </div>
    </div>
  );
}
