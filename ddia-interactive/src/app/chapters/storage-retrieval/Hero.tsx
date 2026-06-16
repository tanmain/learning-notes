"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * Animated hero — the chapter's central idea in one frame:
 * a write enters the in-memory memtable, the memtable flushes to an immutable
 * sorted segment on disk, and compaction merges old segments in the background.
 * A read fans out across the levels until it finds the key.
 */

type Phase = 0 | 1 | 2 | 3;

const KEYS = ["user:42", "cart:7", "user:42", "sku:99", "cart:7", "sku:12"];

export function Hero() {
  const [phase, setPhase] = useState<Phase>(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setPhase((p) => ((p + 1) % 4) as Phase);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  const incoming = KEYS[tick % KEYS.length];

  return (
    <div className="instrument relative overflow-hidden">
      <div className="bg-dotgrid absolute inset-0 opacity-40" />

      {/* status strip */}
      <div className="relative flex items-center justify-between border-b border-line px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-accent anim-pulse-glow" />
          <span className="kicker">Log-structured storage engine</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
          {phase === 0 && "1 · write → memtable"}
          {phase === 1 && "2 · flush → SSTable"}
          {phase === 2 && "3 · compact segments"}
          {phase === 3 && "4 · read fans out"}
        </span>
      </div>

      <div className="relative p-5 sm:p-7">
        <svg viewBox="0 0 760 300" className="w-full" role="img" aria-label="Write path through a log-structured merge-tree">
          <defs>
            <linearGradient id="hero-disk" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-ink-800)" />
              <stop offset="100%" stopColor="var(--color-ink-950)" />
            </linearGradient>
            <marker id="hero-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)" />
            </marker>
          </defs>

          {/* ---- WRITE column ---- */}
          <text x="86" y="26" textAnchor="middle" className="fill-fg-faint font-mono" fontSize="11">
            WRITE
          </text>

          {/* incoming key */}
          <motion.g key={`in-${tick}`} initial={{ opacity: 0, x: -28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
            <rect x="30" y="44" width="112" height="30" rx="6" fill="var(--color-ink-850)" stroke="var(--accent)" strokeWidth="1.4" />
            <text x="86" y="63" textAnchor="middle" className="fill-fg font-mono" fontSize="11">
              {incoming}
            </text>
          </motion.g>

          {/* arrow into memtable */}
          <line x1="86" y1="78" x2="86" y2="104" stroke="var(--accent)" strokeWidth="1.6" markerEnd="url(#hero-arrow)" />

          {/* memtable (RAM) */}
          <rect x="22" y="110" width="128" height="120" rx="10" fill="url(#hero-disk)" stroke="var(--color-line-strong)" strokeWidth="1.2" />
          <text x="86" y="130" textAnchor="middle" className="fill-fg-muted font-mono" fontSize="10">
            memtable · RAM
          </text>
          {[0, 1, 2].map((i) => {
            const filling = phase === 0 && i <= tick % 3;
            return (
              <motion.rect
                key={i}
                x="38"
                y={142 + i * 26}
                width="96"
                height="18"
                rx="4"
                fill={filling ? "color-mix(in oklab, var(--accent) 30%, var(--color-ink-800))" : "var(--color-ink-800)"}
                stroke={filling ? "var(--accent)" : "var(--color-line)"}
                strokeWidth="1"
                initial={{ opacity: filling ? 1 : 0.55 }}
                animate={{ opacity: filling ? 1 : 0.55 }}
                transition={{ duration: 0.4 }}
              />
            );
          })}

          {/* flush arrow */}
          <motion.line
            x1="150"
            y1="170"
            x2="208"
            y2="170"
            stroke="var(--accent-2)"
            strokeWidth="1.8"
            markerEnd="url(#hero-arrow)"
            initial={{ opacity: phase === 1 ? 1 : 0.3 }}
            animate={{ opacity: phase === 1 ? 1 : 0.3 }}
          />
          <text x="179" y="160" textAnchor="middle" className="fill-fg-faint font-mono" fontSize="9">
            flush
          </text>

          {/* ---- DISK column: stacked SSTables ---- */}
          <text x="320" y="26" textAnchor="middle" className="fill-fg-faint font-mono" fontSize="11">
            DISK · immutable sorted segments (SSTables)
          </text>

          {[0, 1, 2].map((lvl) => {
            const justFlushed = phase === 1 && lvl === 0;
            const compacting = phase === 2;
            return (
              <motion.g
                key={lvl}
                initial={{ opacity: compacting && lvl > 0 ? 0.3 : 1 }}
                animate={{
                  opacity: compacting && lvl > 0 ? 0.3 : 1,
                  y: justFlushed ? [-8, 0] : 0,
                }}
                transition={{ duration: 0.6 }}
              >
                <rect
                  x="216"
                  y={48 + lvl * 56}
                  width="208"
                  height="44"
                  rx="8"
                  fill="url(#hero-disk)"
                  stroke={justFlushed ? "var(--accent-2)" : "var(--color-line)"}
                  strokeWidth={justFlushed ? "1.8" : "1.1"}
                />
                <text x="228" y={66 + lvl * 56} className="fill-fg-faint font-mono" fontSize="9">
                  L{lvl}
                </text>
                {/* sorted cells */}
                {[0, 1, 2, 3].map((c) => (
                  <rect
                    key={c}
                    x={250 + c * 42}
                    y={56 + lvl * 56}
                    width="36"
                    height="28"
                    rx="3"
                    fill="var(--color-ink-800)"
                    stroke="var(--color-line)"
                    strokeWidth="0.8"
                  />
                ))}
              </motion.g>
            );
          })}

          {/* compaction merge arrows */}
          <motion.path
            d="M424 70 C 470 70, 470 126, 424 126"
            fill="none"
            stroke="var(--color-special)"
            strokeWidth="1.6"
            strokeDasharray="5 5"
            initial={{ opacity: phase === 2 ? 1 : 0.15 }}
            animate={{ opacity: phase === 2 ? 1 : 0.15 }}
          />
          <motion.text
            x="470"
            y="100"
            className="fill-special font-mono"
            fontSize="9"
            initial={{ opacity: phase === 2 ? 1 : 0.2 }}
            animate={{ opacity: phase === 2 ? 1 : 0.2 }}
          >
            merge
          </motion.text>

          {/* ---- READ path ---- */}
          <text x="620" y="26" textAnchor="middle" className="fill-fg-faint font-mono" fontSize="11">
            READ
          </text>
          <rect x="556" y="44" width="128" height="30" rx="6" fill="var(--color-ink-850)" stroke="var(--color-info)" strokeWidth="1.4" />
          <text x="620" y="63" textAnchor="middle" className="fill-info font-mono" fontSize="11">
            get(cart:7)
          </text>

          {[0, 1, 2].map((lvl) => (
            <motion.line
              key={lvl}
              x1="556"
              y1="59"
              x2="426"
              y2={70 + lvl * 56}
              stroke="var(--color-info)"
              strokeWidth="1.2"
              strokeDasharray="3 4"
              initial={{ opacity: phase === 3 ? (lvl === 0 ? 1 : 0.4) : 0.1 }}
              animate={{ opacity: phase === 3 ? (lvl === 0 ? 1 : 0.4) : 0.1 }}
              transition={{ duration: 0.4, delay: phase === 3 ? lvl * 0.18 : 0 }}
            />
          ))}
          <motion.text
            x="560"
            y="92"
            className="fill-fg-faint font-mono"
            fontSize="9"
            initial={{ opacity: phase === 3 ? 1 : 0.2 }}
            animate={{ opacity: phase === 3 ? 1 : 0.2 }}
          >
            newest → oldest
          </motion.text>
        </svg>

        <p className="relative mt-3 max-w-2xl font-mono text-[11px] leading-relaxed text-fg-faint">
          Writes are buffered in a sorted in-memory <span className="accent-text">memtable</span>, then flushed as
          whole <span className="text-ok">immutable segments</span>. A background thread{" "}
          <span className="text-special">compacts</span> overlapping segments; a read checks levels newest-first.
        </p>
      </div>
    </div>
  );
}
