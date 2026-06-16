"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SegmentedControl, Stat, Toggle } from "@/components/chapter";

/**
 * Modes-of-dataflow explorer. Pick how encoded data moves between processes and
 * see the topology, the coupling it implies, and where version skew bites.
 */

type Mode = "db" | "service" | "broker";

const MODES = [
  { label: "Via database", value: "db" },
  { label: "Via service (REST/RPC)", value: "service" },
  { label: "Via message broker", value: "broker" },
] as const;

type Spec = {
  blurb: React.ReactNode;
  coupling: string; // who must be up at the same time
  decoupleTime: boolean; // sender & receiver need NOT overlap in time
  decoupleSpace: boolean; // sender need NOT know the recipient's address
  fanout: string;
  skew: React.ReactNode; // where compatibility matters most
};

const SPEC: Record<Mode, Spec> = {
  db: {
    blurb: (
      <>
        The writer <strong className="text-fg">encodes</strong> into the database; some later reader{" "}
        <strong className="text-fg">decodes</strong>. The two never meet — they communicate through stored bytes.
      </>
    ),
    coupling: "none — async through storage",
    decoupleTime: true,
    decoupleSpace: true,
    fanout: "1 → many readers",
    skew: (
      <>
        <strong className="text-fg">Data outlives code.</strong> A value written by today&apos;s code may be read
        years later by code that has been rewritten many times — and vice-versa during a rolling upgrade. Both{" "}
        <em className="text-ok not-italic">forward</em> and <em className="text-ok not-italic">backward</em>{" "}
        compatibility are required.
      </>
    ),
  },
  service: {
    blurb: (
      <>
        A client sends an encoded request; the server decodes it, acts, and encodes a response. REST and RPC make a
        network call <em>look</em> like a function call — but it isn&apos;t.
      </>
    ),
    coupling: "synchronous — both up now",
    decoupleTime: false,
    decoupleSpace: false,
    fanout: "1 → 1 (request/response)",
    skew: (
      <>
        Servers and clients deploy independently, so old and new run together. Requests must be{" "}
        <strong className="text-fg">backward compatible</strong> (new server reads old client) and responses{" "}
        <strong className="text-fg">forward compatible</strong> (old client reads new server&apos;s reply).
      </>
    ),
  },
  broker: {
    blurb: (
      <>
        The sender publishes to a named <strong className="text-fg">queue/topic</strong>; a broker stores the message
        and delivers it to one or more consumers. The sender then forgets about it.
      </>
    ),
    coupling: "async — buffered by broker",
    decoupleTime: true,
    decoupleSpace: true,
    fanout: "1 → N subscribers",
    skew: (
      <>
        The broker buffers if a consumer is down and can redeliver after a crash. Producers don&apos;t know who
        consumes, so messages should stay <strong className="text-fg">backward & forward compatible</strong> as
        producers and consumers evolve separately.
      </>
    ),
  },
};

export function DataflowExplorer() {
  const [mode, setMode] = useState<Mode>("db");
  const [recipientDown, setRecipientDown] = useState(false);
  const spec = SPEC[mode];

  return (
    <div className="space-y-5">
      <SegmentedControl<Mode>
        value={mode}
        onChange={setMode}
        options={MODES.map((m) => ({ label: m.label, value: m.value }))}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] leading-relaxed text-fg-muted">{spec.blurb}</p>
        <Toggle label="recipient down" checked={recipientDown} onChange={setRecipientDown} />
      </div>

      {/* animated topology */}
      <div className="instrument relative overflow-hidden p-5">
        <div className="bg-dotgrid absolute inset-0 opacity-20" />
        <svg viewBox="0 0 460 170" className="relative w-full" role="img" aria-label={`Dataflow: ${mode}`}>
          <AnimatePresence mode="wait">
            <motion.g
              key={mode}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {mode === "db" && <DbScene down={recipientDown} />}
              {mode === "service" && <ServiceScene down={recipientDown} />}
              {mode === "broker" && <BrokerScene down={recipientDown} />}
            </motion.g>
          </AnimatePresence>
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Coupling" value={<span className="text-sm">{spec.coupling.split(" — ")[0]}</span>} tone="accent" />
        <Stat
          label="Time-decoupled"
          value={spec.decoupleTime ? "yes" : "no"}
          tone={spec.decoupleTime ? "ok" : "warn"}
        />
        <Stat
          label="Space-decoupled"
          value={spec.decoupleSpace ? "yes" : "no"}
          tone={spec.decoupleSpace ? "ok" : "warn"}
        />
        <Stat label="Fan-out" value={<span className="text-sm">{spec.fanout}</span>} tone="info" />
      </div>

      <div className="rounded-r-lg rounded-l-sm border-l-2 border-accent bg-accent/[0.07] p-4">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider accent-text">where compatibility bites</div>
        <div className="text-[13px] leading-relaxed text-fg">{spec.skew}</div>
      </div>

      {recipientDown && (
        <p className="text-[12px] leading-relaxed text-fg-muted">
          {mode === "service" ? (
            <span className="text-fault">With a synchronous service, a down recipient means the request fails or times out — the caller must retry (and handle duplicates idempotently).</span>
          ) : (
            <span className="text-ok">With async dataflow, a down recipient is fine: the bytes sit in storage / the broker queue until it comes back. This is the whole point of decoupling.</span>
          )}
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- scenes */

function Box({
  x,
  y,
  label,
  sub,
  hue = "var(--accent)",
  down,
}: {
  x: number;
  y: number;
  label: string;
  sub?: string;
  hue?: string;
  down?: boolean;
}) {
  return (
    <g opacity={down ? 0.4 : 1}>
      <rect
        x={x}
        y={y}
        width={92}
        height={46}
        rx={8}
        fill={`color-mix(in oklab, ${hue} 12%, var(--color-ink-900))`}
        stroke={hue}
        strokeWidth={1.2}
        strokeOpacity={0.7}
      />
      <text x={x + 46} y={y + 21} textAnchor="middle" className="font-mono" fontSize={11} fill="var(--color-fg)">
        {label}
      </text>
      {sub && (
        <text x={x + 46} y={y + 35} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">
          {down ? "offline" : sub}
        </text>
      )}
    </g>
  );
}

function Packet({ from, to, delay = 0, hue = "var(--accent)" }: { from: [number, number]; to: [number, number]; delay?: number; hue?: string }) {
  return (
    <motion.circle
      r={5}
      fill={hue}
      initial={{ cx: from[0], cy: from[1], opacity: 0 }}
      animate={{ cx: [from[0], to[0]], cy: [from[1], to[1]], opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.6, delay, repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" }}
    />
  );
}

function wire(x1: number, y1: number, x2: number, y2: number, flowing = true) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="var(--color-line-strong)"
      strokeWidth={1}
      strokeDasharray="5 7"
      className={flowing ? "flow-line" : undefined}
    />
  );
}

function DbScene({ down }: { down: boolean }) {
  return (
    <>
      <Box x={20} y={62} label="writer" sub="encode()" hue="var(--accent)" />
      {/* database cylinder */}
      <g>
        <ellipse cx={230} cy={58} rx={34} ry={11} fill="color-mix(in oklab, var(--accent) 16%, var(--color-ink-900))" stroke="var(--accent)" strokeOpacity={0.7} strokeWidth={1.2} />
        <path d="M196 58v54c0 6 15 11 34 11s34-5 34-11V58" fill="color-mix(in oklab, var(--accent) 10%, var(--color-ink-900))" stroke="var(--accent)" strokeOpacity={0.7} strokeWidth={1.2} />
        <path d="M196 85c0 6 15 11 34 11s34-5 34-11" fill="none" stroke="var(--accent)" strokeOpacity={0.4} strokeWidth={1} />
        <text x={230} y={112} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-fg-faint)">stored bytes</text>
      </g>
      <Box x={348} y={62} label="reader" sub="decode()" hue="var(--accent-2)" down={down} />
      {wire(112, 85, 196, 85)}
      {wire(264, 85, 348, 85, !down)}
      <Packet from={[112, 85]} to={[196, 85]} />
      {!down && <Packet from={[264, 85]} to={[348, 85]} delay={0.8} hue="var(--accent-2)" />}
      <text x={230} y={150} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">
        writer & reader never overlap in time — data outlives code
      </text>
    </>
  );
}

function ServiceScene({ down }: { down: boolean }) {
  return (
    <>
      <Box x={30} y={62} label="client" sub="request" hue="var(--accent)" />
      <Box x={338} y={62} label="server" sub="response" hue="var(--accent-2)" down={down} />
      {wire(122, 78, 338, 78, !down)}
      {wire(338, 96, 122, 96, !down)}
      {!down && <Packet from={[122, 78]} to={[338, 78]} hue="var(--accent)" />}
      {!down && <Packet from={[338, 96]} to={[122, 96]} delay={0.8} hue="var(--accent-2)" />}
      {down && (
        <text x={230} y={88} textAnchor="middle" className="font-mono" fontSize={10} fill="var(--color-fault)">
          ✕ timeout — retry needed
        </text>
      )}
      <text x={230} y={150} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">
        synchronous — both endpoints must be up at the same instant
      </text>
    </>
  );
}

function BrokerScene({ down }: { down: boolean }) {
  return (
    <>
      <Box x={14} y={62} label="producer" sub="publish" hue="var(--accent)" />
      {/* broker queue */}
      <g>
        <rect x={186} y={56} width={88} height={40} rx={6} fill="color-mix(in oklab, var(--color-special) 14%, var(--color-ink-900))" stroke="var(--color-special)" strokeOpacity={0.7} strokeWidth={1.2} />
        <text x={230} y={72} textAnchor="middle" className="font-mono" fontSize={10} fill="var(--color-fg)">broker</text>
        <text x={230} y={86} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">topic · queue</text>
        {/* buffered messages */}
        {down &&
          [0, 1, 2].map((i) => (
            <rect key={i} x={196 + i * 10} y={104} width={7} height={7} rx={1.5} fill="var(--color-warn)" opacity={0.8} />
          ))}
        {down && (
          <text x={232} y={120} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-warn)">
            buffered
          </text>
        )}
      </g>
      <Box x={358} y={30} label="consumer A" hue="var(--accent-2)" />
      <Box x={358} y={94} label="consumer B" hue="var(--accent-2)" down={down} />
      {wire(106, 76, 186, 76)}
      {wire(274, 66, 358, 53, !down)}
      {wire(274, 86, 358, 117, !down)}
      <Packet from={[106, 76]} to={[186, 76]} />
      {!down && <Packet from={[274, 70]} to={[358, 53]} delay={0.7} hue="var(--accent-2)" />}
      {!down && <Packet from={[274, 82]} to={[358, 117]} delay={0.9} hue="var(--accent-2)" />}
      <text x={230} y={150} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">
        producer forgets; broker buffers & fans out to N subscribers
      </text>
    </>
  );
}
