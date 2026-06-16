"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

/**
 * Animated hero: an in-memory record is ENCODED into a byte stream, sent across
 * the wire / across time, and DECODED on the far side — sometimes by code that
 * is an older or newer version than the writer. The packet visibly carries
 * field *tags* (numbers) rather than field *names*, which is the trick that
 * lets schemas evolve.
 */

type Field = { tag: number; name: string; hue: string };

const FIELDS: Field[] = [
  { tag: 1, name: "userId", hue: "var(--accent)" },
  { tag: 2, name: "name", hue: "var(--accent-2)" },
  { tag: 3, name: "since", hue: "var(--color-info)" },
];

// A compact byte stream: [tag|type] then payload, the way Thrift/protobuf pack it.
type Byte = { label: string; hue: string; kind: "tag" | "data" };

const STREAM: Byte[] = [
  { label: "18", hue: "var(--accent)", kind: "tag" },
  { label: "c4", hue: "var(--accent)", kind: "data" },
  { label: "29", hue: "var(--accent-2)", kind: "tag" },
  { label: "4a", hue: "var(--accent-2)", kind: "data" },
  { label: "6f", hue: "var(--accent-2)", kind: "data" },
  { label: "38", hue: "var(--color-info)", kind: "tag" },
  { label: "e6", hue: "var(--color-info)", kind: "data" },
];

export function Hero() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1000), 2600);
    return () => clearInterval(id);
  }, []);

  // Reader is "older" on odd ticks — it sees a 4th field it doesn't recognise.
  const readerIsOld = tick % 2 === 1;
  const bytes = useMemo(
    () => (readerIsOld ? [...STREAM, { label: "41", hue: "var(--color-special)", kind: "data" as const }] : STREAM),
    [readerIsOld]
  );

  return (
    <div className="instrument relative overflow-hidden p-6 sm:p-8">
      <div className="bg-dotgrid absolute inset-0 opacity-25" />

      <div className="relative">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-accent anim-pulse-glow" />
            <span className="kicker">In-memory → bytes → in-memory</span>
          </div>
          <span className="font-mono text-[10px] tracking-wider text-fg-faint">
            {readerIsOld ? "reader: v1 (old)" : "reader: v2 (new)"}
          </span>
        </div>

        <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_auto_1.2fr_auto_1fr]">
          {/* Writer: in-memory object */}
          <Node title="Writer · encode()" sub="v2 in memory">
            <div className="space-y-1.5">
              {FIELDS.map((f) => (
                <div key={f.tag} className="flex items-center gap-2">
                  <span
                    className="grid h-4 w-4 shrink-0 place-items-center rounded-[3px] font-mono text-[8px] font-bold text-ink-950"
                    style={{ background: f.hue }}
                  >
                    {f.tag}
                  </span>
                  <span className="font-mono text-[11px] text-fg-muted">{f.name}</span>
                </div>
              ))}
            </div>
          </Node>

          <Arrow />

          {/* The wire — a stream of tagged bytes flowing left → right */}
          <div className="relative">
            <div className="mb-2 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-fg-faint">
              the wire
            </div>
            <svg viewBox="0 0 360 70" className="w-full" role="img" aria-label="Byte stream on the wire">
              <line
                x1={6}
                y1={35}
                x2={354}
                y2={35}
                stroke="var(--color-line-strong)"
                strokeWidth={1}
                className="flow-line"
                strokeDasharray="6 8"
              />
              {bytes.map((b, i) => {
                const span = 360 / (bytes.length + 0.5);
                return (
                  <motion.g
                    key={`${tick}-${i}`}
                    initial={{ opacity: 0, x: -22 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.12, duration: 0.45 }}
                  >
                    <rect
                      x={10 + i * span}
                      y={18}
                      width={span - 8}
                      height={34}
                      rx={4}
                      fill={`color-mix(in oklab, ${b.hue} ${b.kind === "tag" ? 26 : 13}%, var(--color-ink-950))`}
                      stroke={b.hue}
                      strokeWidth={b.kind === "tag" ? 1.3 : 0.8}
                      strokeOpacity={b.kind === "tag" ? 0.9 : 0.4}
                    />
                    <text
                      x={10 + i * span + (span - 8) / 2}
                      y={39}
                      textAnchor="middle"
                      className="font-mono"
                      fontSize={11}
                      fill={b.kind === "tag" ? b.hue : "var(--color-fg)"}
                      fillOpacity={b.kind === "tag" ? 1 : 0.8}
                    >
                      {b.label}
                    </text>
                  </motion.g>
                );
              })}
            </svg>
            <div className="mt-1 flex justify-center gap-4 font-mono text-[8px] uppercase tracking-wider text-fg-faint">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-[2px] border border-accent/80 bg-accent/25" /> field tag
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-[2px] border border-line-strong bg-ink-800" /> payload
              </span>
            </div>
          </div>

          <Arrow />

          {/* Reader: decodes — old version skips the unknown 4th field */}
          <Node title="Reader · decode()" sub={readerIsOld ? "v1 — knows tags 1–3" : "v2 — knows 1–4"}>
            <div className="space-y-1.5">
              {FIELDS.map((f) => (
                <div key={f.tag} className="flex items-center gap-2">
                  <span
                    className="grid h-4 w-4 shrink-0 place-items-center rounded-[3px] font-mono text-[8px] font-bold text-ink-950"
                    style={{ background: f.hue }}
                  >
                    {f.tag}
                  </span>
                  <span className="font-mono text-[11px] text-fg-muted">{f.name}</span>
                </div>
              ))}
              <motion.div
                key={readerIsOld ? "old" : "new"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2"
              >
                <span
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-[3px] font-mono text-[8px] font-bold text-ink-950"
                  style={{ background: "var(--color-special)" }}
                >
                  4
                </span>
                <span className="font-mono text-[11px] text-fg-muted">
                  {readerIsOld ? (
                    <span className="text-fg-faint italic">tag 4 → skipped</span>
                  ) : (
                    "vip"
                  )}
                </span>
              </motion.div>
            </div>
          </Node>
        </div>

        <p className="mt-6 max-w-2xl font-body text-sm italic leading-relaxed text-fg-muted">
          Data is encoded to a flat byte stream that carries numeric{" "}
          <span className="accent-text not-italic">field tags</span>, not field names. New writers can add tag{" "}
          <span className="text-special not-italic">4</span>; older readers simply skip tags they don&apos;t
          recognise. That asymmetry is what lets old and new code coexist during a rolling upgrade.
        </p>
      </div>
    </div>
  );
}

function Node({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="mb-2.5">
        <div className="font-mono text-[11px] font-medium text-fg">{title}</div>
        <div className="font-mono text-[9px] text-fg-faint">{sub}</div>
      </div>
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <div className="hidden justify-center md:flex">
      <motion.svg
        width={28}
        height={16}
        viewBox="0 0 28 16"
        animate={{ x: [0, 4, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <path d="M2 8h20M16 3l6 5-6 5" stroke="var(--accent)" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </motion.svg>
    </div>
  );
}
