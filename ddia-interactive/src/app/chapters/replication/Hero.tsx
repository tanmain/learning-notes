"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * Animated hero — a single leader streaming a change log to three followers.
 * A "write packet" pulses out of the client into the leader, then ripples down
 * the replication log to each follower with staggered (async) arrival times.
 */

type Follower = { id: number; x: number; y: number; delay: number };

const LEADER = { x: 196, y: 70 };
const CLIENT = { x: 58, y: 70 };
const FOLLOWERS: Follower[] = [
  { id: 0, x: 340, y: 30, delay: 0.0 },
  { id: 1, x: 340, y: 90, delay: 0.25 },
  { id: 2, x: 340, y: 150, delay: 0.55 },
];

export function Hero() {
  // A monotonically increasing "log sequence number" the leader has committed.
  const [lsn, setLsn] = useState(0);
  // Which followers have caught up to the latest LSN (drives the green pulse).
  const [caught, setCaught] = useState<Record<number, number>>({ 0: 0, 1: 0, 2: 0 });

  useEffect(() => {
    const period = 2600;
    const tick = () => {
      setLsn((n) => n + 1);
      // each follower catches up after its own async delay
      FOLLOWERS.forEach((f) => {
        window.setTimeout(() => {
          setCaught((c) => ({ ...c, [f.id]: c[f.id] + 1 }));
        }, 700 + f.delay * 1000);
      });
    };
    tick();
    const iv = window.setInterval(tick, period);
    return () => window.clearInterval(iv);
  }, []);

  return (
    <div className="panel relative overflow-hidden p-6">
      <div className="bg-dotgrid absolute inset-0 opacity-40" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="sm:w-[44%]">
          <div className="kicker mb-2">Single-leader replication</div>
          <h3 className="font-display text-2xl font-bold leading-tight">
            One writer.{" "}
            <span className="accent-gradient-text">Many copies racing to keep up.</span>
          </h3>
          <p className="mt-3 font-body text-[15px] leading-relaxed text-fg-muted">
            Every write lands on the <strong className="text-fg">leader</strong>, which streams an
            ordered change log to its <strong className="text-fg">followers</strong>. They apply it
            asynchronously — so for a flickering instant, replicas disagree. That gap is the whole
            chapter.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-ink-850 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-accent anim-pulse-glow" />
            <span className="font-mono text-[11px] tabular-nums text-fg-muted">
              committed LSN&nbsp;
              <span className="accent-text">#{String(lsn).padStart(3, "0")}</span>
            </span>
          </div>
        </div>

        <div className="sm:w-[56%]">
          <svg viewBox="0 0 400 180" className="w-full" role="img" aria-label="Leader streaming a replication log to three followers">
            {/* connecting paths */}
            <line
              x1={CLIENT.x + 18}
              y1={CLIENT.y}
              x2={LEADER.x - 24}
              y2={LEADER.y}
              stroke="var(--color-line-strong)"
              strokeWidth={1.5}
            />
            {FOLLOWERS.map((f) => (
              <path
                key={f.id}
                d={`M ${LEADER.x + 24} ${LEADER.y} C ${LEADER.x + 80} ${LEADER.y}, ${f.x - 70} ${f.y}, ${f.x - 22} ${f.y}`}
                fill="none"
                stroke="var(--accent)"
                strokeOpacity={0.28}
                strokeWidth={1.5}
                strokeDasharray="5 7"
                className="flow-line"
              />
            ))}

            {/* write packet: client -> leader, restarts every cycle */}
            <motion.circle
              r={4.5}
              fill="var(--color-info)"
              initial={false}
              animate={{ cx: [CLIENT.x + 18, LEADER.x - 24], cy: [CLIENT.y, LEADER.y], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 1.9, times: [0, 0.15, 0.85, 1] }}
            />

            {/* log packets: leader -> each follower */}
            {FOLLOWERS.map((f) => (
              <motion.circle
                key={`pkt-${f.id}`}
                r={4}
                fill="var(--accent)"
                initial={false}
                animate={{
                  cx: [LEADER.x + 24, f.x - 22],
                  cy: [LEADER.y, f.y],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  duration: 0.9,
                  repeat: Infinity,
                  repeatDelay: 1.7,
                  delay: 0.8 + f.delay,
                  times: [0, 0.2, 0.8, 1],
                }}
              />
            ))}

            {/* client */}
            <g>
              <rect x={CLIENT.x - 18} y={CLIENT.y - 14} width={36} height={28} rx={6} fill="var(--color-ink-800)" stroke="var(--color-line-strong)" />
              <text x={CLIENT.x} y={CLIENT.y + 4} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-muted)">
                app
              </text>
            </g>

            {/* leader */}
            <g>
              <circle cx={LEADER.x} cy={LEADER.y} r={24} fill="color-mix(in oklab, var(--accent) 22%, var(--color-ink-850))" stroke="var(--accent)" strokeWidth={1.75} />
              <circle cx={LEADER.x} cy={LEADER.y} r={24} fill="none" stroke="var(--accent)" strokeWidth={1.75} className="anim-pulse-glow" />
              <text x={LEADER.x} y={LEADER.y - 1} textAnchor="middle" className="font-mono font-semibold" fontSize={8.5} fill="var(--color-fg)">
                LEADER
              </text>
              <text x={LEADER.x} y={LEADER.y + 9} textAnchor="middle" className="font-mono" fontSize={7} fill="var(--accent)">
                writes
              </text>
            </g>

            {/* followers */}
            {FOLLOWERS.map((f) => {
              const lag = lsn - caught[f.id];
              const synced = lag <= 0;
              return (
                <g key={`fol-${f.id}`}>
                  <circle
                    cx={f.x}
                    cy={f.y}
                    r={18}
                    fill="var(--color-ink-800)"
                    stroke={synced ? "var(--color-ok)" : "var(--color-warn)"}
                    strokeWidth={1.5}
                  />
                  <motion.circle
                    cx={f.x}
                    cy={f.y}
                    r={18}
                    fill="none"
                    stroke="var(--color-ok)"
                    strokeWidth={1.5}
                    initial={false}
                    animate={{ opacity: [0.9, 0], scale: [1, 1.5] }}
                    transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 1.8, delay: 0.8 + f.delay }}
                    style={{ transformOrigin: `${f.x}px ${f.y}px` }}
                  />
                  <text x={f.x} y={f.y + 3} textAnchor="middle" className="font-mono" fontSize={7.5} fill="var(--color-fg-muted)">
                    R{f.id + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
