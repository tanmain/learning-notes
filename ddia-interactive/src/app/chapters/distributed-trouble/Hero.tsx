"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * Animated hero — "The Control Room sees only silence."
 * A coordinator node fires requests at four peers across an asynchronous
 * packet network. Packets travel, then meet one of three fates chosen at
 * random: delivered, dropped mid-flight, or delayed (stuck, then crawling).
 * The coordinator's status read-out can never distinguish a dead peer from a
 * slow one — the whole point of the chapter, dramatized in motion.
 */

type Fate = "ok" | "lost" | "slow";

type Peer = {
  id: number;
  x: number;
  y: number;
  label: string;
};

const COORD = { x: 90, y: 130 };

const PEERS: Peer[] = [
  { id: 0, x: 470, y: 44, label: "node b" },
  { id: 1, x: 510, y: 116, label: "node c" },
  { id: 2, x: 510, y: 196, label: "node d" },
  { id: 3, x: 460, y: 246, label: "node e" },
];

const FATE_COLOR: Record<Fate, string> = {
  ok: "var(--color-ok)",
  lost: "var(--color-fault)",
  slow: "var(--color-warn)",
};

type Packet = {
  key: number;
  peer: Peer;
  fate: Fate;
};

let counter = 0;

export function Hero() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [tick, setTick] = useState(0);

  // Fire a packet at a random peer on a steady cadence.
  useEffect(() => {
    const id = setInterval(() => {
      const peer = PEERS[Math.floor(Math.random() * PEERS.length)];
      const r = Math.random();
      const fate: Fate = r < 0.34 ? "lost" : r < 0.6 ? "slow" : "ok";
      const key = counter++;
      setPackets((prev) => [...prev.slice(-7), { key, peer, fate }]);
      setTick((t) => t + 1);
    }, 900);
    return () => clearInterval(id);
  }, []);

  return (
    <figure className="instrument relative overflow-hidden">
      <div className="bg-dotgrid pointer-events-none absolute inset-0 opacity-20" />

      {/* Header strip — control-room chrome */}
      <div className="relative flex items-center justify-between border-b border-line bg-ink-900/50 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-accent anim-pulse-glow" />
          <span className="kicker">Network monitor · live</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
          {PEERS.length + 1} nodes · async packet link
        </span>
      </div>

      <div className="relative p-4 sm:p-6">
        <svg viewBox="0 0 560 290" className="w-full" role="img" aria-label="A coordinator node sending packets across an unreliable network to four peers; some arrive, some are lost, some are delayed.">
          <defs>
            <radialGradient id="dt-coord-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Static link lines */}
          {PEERS.map((p) => (
            <line
              key={`link-${p.id}`}
              x1={COORD.x}
              y1={COORD.y}
              x2={p.x}
              y2={p.y}
              stroke="var(--color-line-strong)"
              strokeWidth={1}
              className="flow-line"
            />
          ))}

          {/* In-flight packets */}
          {packets.map((pkt) => (
            <FlyingPacket key={pkt.key} packet={pkt} />
          ))}

          {/* Peer nodes */}
          {PEERS.map((p) => (
            <PeerNode key={p.id} peer={p} tick={tick} packets={packets} />
          ))}

          {/* Coordinator node */}
          <g>
            <circle cx={COORD.x} cy={COORD.y} r={42} fill="url(#dt-coord-glow)" />
            <motion.circle
              cx={COORD.x}
              cy={COORD.y}
              r={26}
              fill="var(--color-ink-800)"
              stroke="var(--accent)"
              strokeWidth={2}
              animate={{ r: [26, 28, 26] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            />
            <text
              x={COORD.x}
              y={COORD.y - 2}
              textAnchor="middle"
              className="font-mono"
              fontSize={9}
              fill="var(--accent)"
            >
              COORD
            </text>
            <text
              x={COORD.x}
              y={COORD.y + 9}
              textAnchor="middle"
              className="font-mono"
              fontSize={7}
              fill="var(--color-fg-faint)"
            >
              node a
            </text>
          </g>
        </svg>

        {/* The punchline read-out */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-3 font-mono text-[11px]">
          <span className="flex items-center gap-1.5 text-fg-faint">
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-ok)" }} /> delivered
          </span>
          <span className="flex items-center gap-1.5 text-fg-faint">
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-warn)" }} /> delayed
          </span>
          <span className="flex items-center gap-1.5 text-fg-faint">
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-fault)" }} /> lost
          </span>
          <span className="ml-auto italic text-fg-muted">
            no reply ≠ dead node — it might just be slow
          </span>
        </div>
      </div>
    </figure>
  );
}

/* Packet that animates from coordinator toward its peer and meets its fate. */
function FlyingPacket({ packet }: { packet: Packet }) {
  const { peer, fate } = packet;
  // Lost packets die at ~55% of the path; slow packets crawl; ok packets arrive.
  const stopAt = fate === "lost" ? 0.55 : 1;
  const x = COORD.x + (peer.x - COORD.x) * stopAt;
  const y = COORD.y + (peer.y - COORD.y) * stopAt;
  const duration = fate === "slow" ? 3.4 : 1.3;

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, fate === "lost" ? 0 : 1] }}
      transition={{ duration, times: [0, 0.1, 0.8, 1] }}
    >
      <motion.circle
        r={fate === "lost" ? 3 : 3.5}
        fill={FATE_COLOR[fate]}
        initial={{ cx: COORD.x, cy: COORD.y }}
        animate={{ cx: x, cy: y }}
        transition={{ duration, ease: fate === "slow" ? "easeIn" : "easeOut" }}
      />
      {fate === "lost" && (
        <motion.circle
          cx={x}
          cy={y}
          r={3}
          fill="none"
          stroke="var(--color-fault)"
          strokeWidth={1.4}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 3.5], opacity: [0, 0.9, 0] }}
          transition={{ duration: 0.6, delay: duration * 0.78 }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      )}
    </motion.g>
  );
}

/* Peer node — flickers to the colour of the most recent packet aimed at it. */
function PeerNode({ peer, packets }: { peer: Peer; tick: number; packets: Packet[] }) {
  const latest = [...packets].reverse().find((p) => p.peer.id === peer.id);
  const tone = latest ? FATE_COLOR[latest.fate] : "var(--color-fg-faint)";
  const alive = latest?.fate !== "lost";

  return (
    <g>
      <motion.circle
        cx={peer.x}
        cy={peer.y}
        r={17}
        fill="var(--color-ink-850)"
        stroke={tone}
        strokeWidth={1.6}
        initial={{ opacity: alive ? 1 : 0.4 }}
        animate={{ opacity: alive ? 1 : 0.4 }}
        transition={{ duration: 0.5 }}
      />
      <circle cx={peer.x} cy={peer.y} r={4} fill={tone} />
      <text
        x={peer.x}
        y={peer.y + 30}
        textAnchor="middle"
        className="font-mono"
        fontSize={7.5}
        fill="var(--color-fg-faint)"
      >
        {peer.label}
      </text>
    </g>
  );
}
