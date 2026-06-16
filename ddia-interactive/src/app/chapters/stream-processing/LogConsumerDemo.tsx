"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button, Slider, Stat, Toggle } from "@/components/chapter";

/**
 * Interactive partitioned log + consumer-offset demo.
 *
 * A producer appends events to a single append-only partition. Each event gets a
 * monotonically increasing offset. Two consumers read the SAME log independently:
 *  - Consumer A ("real-time") advances quickly and tails the head.
 *  - Consumer B ("derived view") advances at a user-controlled speed and can fall
 *    behind, building lag. The user can reset its offset to 0 to *replay* history,
 *    or jump it to the head to skip ahead.
 * A retention slider trims old segments; if B's offset points to a trimmed offset,
 * it has *missed* messages (a real Kafka failure mode). Reading never deletes data,
 * so fan-out is free and only the slow consumer is affected by its own lag.
 */

const VISIBLE = 16; // cells shown
const APPEND_MS = 750;

type ConsumerState = {
  offset: number; // next offset to read
  acc: number; // running tick accumulator (events per APPEND tick)
};

export function LogConsumerDemo() {
  const [head, setHead] = useState(6); // next offset producer will write
  const [trimBefore, setTrimBefore] = useState(0); // lowest retained offset
  const [running, setRunning] = useState(true);
  const [retention, setRetention] = useState(12); // keep this many offsets behind head
  const [bSpeed, setBSpeed] = useState(0.45); // consumer B events per producer tick
  const [a, setA] = useState<ConsumerState>({ offset: 6, acc: 0 });
  const [b, setB] = useState<ConsumerState>({ offset: 0, acc: 0 });
  const [flash, setFlash] = useState<number | null>(null);

  const headRef = useRef(head);
  headRef.current = head;

  // The producer tick: append one event, advance consumers, trim old segments.
  const tick = useCallback(() => {
    setHead((h) => {
      const newHead = h + 1;
      // trim segments older than retention window
      setTrimBefore((t) => Math.max(t, newHead - retention));
      setFlash(h);
      setTimeout(() => setFlash((f) => (f === h ? null : f)), 320);
      return newHead;
    });
    // Consumer A: fast, tails head (consumes ~all new events).
    setA((s) => ({ ...s, offset: headRef.current })); // catches up to current head
    // Consumer B: advances by bSpeed, accumulating fractional progress.
    setB((s) => {
      const acc = s.acc + bSpeed;
      const steps = Math.floor(acc);
      const next = Math.min(s.offset + steps, headRef.current);
      return { offset: next, acc: acc - steps };
    });
  }, [retention, bSpeed]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(tick, APPEND_MS);
    return () => clearInterval(id);
  }, [running, tick]);

  const replayB = () => setB({ offset: trimBefore, acc: 0 });
  const skipB = () => setB({ offset: head, acc: 0 });
  const reset = () => {
    setHead(6);
    setTrimBefore(0);
    setA({ offset: 6, acc: 0 });
    setB({ offset: 0, acc: 0 });
    setFlash(null);
  };

  // Derived metrics
  const lagA = Math.max(0, head - a.offset);
  const lagB = Math.max(0, head - b.offset);
  const missed = Math.max(0, trimBefore - b.offset);
  const bStatus = missed > 0 ? "MISSED DATA" : lagB > retention * 0.6 ? "FALLING BEHIND" : lagB > 0 ? "CATCHING UP" : "AT HEAD";
  const bTone: "fault" | "warn" | "info" | "ok" =
    missed > 0 ? "fault" : lagB > retention * 0.6 ? "warn" : lagB > 0 ? "info" : "ok";

  // Window of offsets to render: last VISIBLE offsets up to head.
  const startOffset = Math.max(0, head - VISIBLE + 1);
  const cells = Array.from({ length: Math.min(VISIBLE, head + 1) }, (_, i) => startOffset + i);

  const CELL_W = 100 / Math.max(cells.length, 1);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setRunning((r) => !r)} variant={running ? "outline" : "solid"} size="sm">
          {running ? "Pause producer" : "Resume producer"}
        </Button>
        <Button onClick={() => !running && tick()} variant="ghost" size="sm" disabled={running}>
          Append 1 event
        </Button>
        <Button onClick={replayB} variant="ghost" size="sm">
          Replay B from start
        </Button>
        <Button onClick={skipB} variant="ghost" size="sm">
          Skip B to head
        </Button>
        <Button onClick={reset} variant="ghost" size="sm">
          Reset
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Consumer B speed"
          value={Math.round(bSpeed * 100)}
          min={0}
          max={130}
          step={5}
          onChange={(v) => setBSpeed(v / 100)}
          format={(v) => (v / 100).toFixed(2) + "× producer"}
        />
        <Slider
          label="Retention window"
          value={retention}
          min={4}
          max={16}
          step={1}
          onChange={setRetention}
          format={(v) => v + " offsets"}
        />
      </div>

      {/* The log */}
      <div className="rounded-lg border border-line bg-ink-950/60 p-4">
        <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-fg-faint">
          <span>partition 0 — append-only</span>
          <span>
            head @ <span className="text-accent">offset {head - 1 < 0 ? "—" : head - 1}</span>
          </span>
        </div>

        <svg viewBox="0 0 100 30" className="w-full" preserveAspectRatio="none" style={{ height: 96 }}>
          {cells.map((off, i) => {
            const x = i * CELL_W;
            const trimmed = off < trimBefore;
            const justWritten = off === flash;
            const aHere = off === a.offset - 1 && a.offset > startOffset;
            const bHere = off === b.offset;
            return (
              <g key={off}>
                <motion.rect
                  x={x + 0.4}
                  y={9}
                  width={CELL_W - 0.8}
                  height={12}
                  rx={1}
                  fill={trimmed ? "var(--color-ink-800)" : "var(--accent)"}
                  stroke={trimmed ? "var(--color-line)" : "var(--accent)"}
                  strokeOpacity={trimmed ? 0.4 : 0.55}
                  strokeWidth={0.3}
                  initial={{ fillOpacity: trimmed ? 0.25 : 0.14 }}
                  animate={{ fillOpacity: justWritten ? [0.6, 0.14] : trimmed ? 0.25 : 0.14 }}
                  transition={{ duration: 0.4 }}
                  vectorEffect="non-scaling-stroke"
                />
                {!trimmed && (
                  <text x={x + CELL_W / 2} y={17} textAnchor="middle" fontSize={4} className="fill-fg/70 font-mono">
                    {off}
                  </text>
                )}
                {trimmed && (
                  <line x1={x + 1} y1={10} x2={x + CELL_W - 1} y2={20} stroke="var(--color-fault)" strokeOpacity={0.4} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
                )}

                {/* Consumer A cursor (top) */}
                {(off === Math.min(a.offset, head - 1)) && (
                  <g>
                    <rect x={x + 0.4} y={9} width={CELL_W - 0.8} height={12} rx={1} fill="none" stroke="var(--color-ok)" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
                    <text x={x + CELL_W / 2} y={6.5} textAnchor="middle" fontSize={3.6} className="fill-[var(--color-ok)] font-mono">
                      A
                    </text>
                    <polygon points={`${x + CELL_W / 2 - 1.4},7.6 ${x + CELL_W / 2 + 1.4},7.6 ${x + CELL_W / 2},9`} fill="var(--color-ok)" />
                  </g>
                )}

                {/* Consumer B cursor (bottom) — points at the NEXT offset it will read */}
                {bHere && off >= trimBefore && (
                  <g>
                    <rect x={x + 0.4} y={9} width={CELL_W - 0.8} height={12} rx={1} fill="none" stroke="var(--accent-2)" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
                    <text x={x + CELL_W / 2} y={26} textAnchor="middle" fontSize={3.6} className="fill-[var(--accent-2)] font-mono">
                      B
                    </text>
                    <polygon points={`${x + CELL_W / 2 - 1.4},23.4 ${x + CELL_W / 2 + 1.4},23.4 ${x + CELL_W / 2},22`} fill="var(--accent-2)" />
                  </g>
                )}
                {/* If B's offset was trimmed away, pin its marker to the oldest live cell */}
                {missed > 0 && off === trimBefore && (
                  <g>
                    <text x={x + CELL_W / 2} y={26} textAnchor="middle" fontSize={3.6} className="fill-[var(--color-fault)] font-mono">
                      B!
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        <div className="mt-1 flex items-center justify-between font-mono text-[9px] text-fg-faint">
          <span className="text-[var(--color-fault)]">{trimBefore > 0 ? `✕ offsets < ${trimBefore} trimmed` : "nothing trimmed yet"}</span>
          <span className="text-fg-faint">reading never deletes — fan-out is free</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Consumer A lag" value={lagA} unit="off" tone={lagA === 0 ? "ok" : "info"} />
        <Stat label="Consumer B lag" value={lagB} unit="off" tone={bTone} />
        <Stat label="B offset" value={b.offset} tone="special" />
        <Stat label="B status" value={<span className="text-base">{bStatus}</span>} tone={bTone} />
      </div>

      <p className="text-[13px] leading-relaxed text-fg-muted">
        Consumer A keeps up, so it always tails the <span className="accent-text">head</span>. Slow Consumer B
        builds <span className="text-[var(--accent-2)]">lag</span> — but that only affects B. Push its speed below
        the retention line and watch its offset fall off a <span className="text-[var(--color-fault)]">trimmed segment</span>:
        it now skips data. Hit <em>Replay B from start</em> to re-consume history from the oldest retained offset —
        the same log, read again, with no producer involvement.
      </p>

      <div className="flex items-center gap-3">
        <Toggle label="Producer running" checked={running} onChange={setRunning} />
      </div>
    </div>
  );
}
