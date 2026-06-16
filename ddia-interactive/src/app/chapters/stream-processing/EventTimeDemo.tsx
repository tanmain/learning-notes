"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Slider, SegmentedControl, Stat } from "@/components/chapter";

/**
 * Event-time vs processing-time demo.
 *
 * A set of events have a true EVENT time (when they happened on the device) but
 * arrive at the server delayed by a network/queue lag — their PROCESSING time.
 * We bucket them into 1-minute tumbling windows by whichever clock the user picks.
 *
 *  - By PROCESSING TIME: a burst of delayed events all land "now" and pile into
 *    one window, distorting the per-minute rate. A restart/lag spike makes it worse.
 *  - By EVENT TIME: events fall into the window when they truly occurred — correct
 *    counts — but you must wait, and late "straggler" events arrive after a window
 *    was already declared closed. The user controls a watermark/lateness allowance.
 *
 * The visual shows both timelines and the resulting per-window counts side by side.
 */

type Clock = "event" | "processing";

type Ev = { event: number; lag: number }; // minutes; processing = event + lag

// Deterministic events across a 6-minute span. A few have large lag (stragglers).
const BASE: Ev[] = [
  { event: 0.4, lag: 0.2 },
  { event: 0.8, lag: 0.3 },
  { event: 1.3, lag: 0.4 },
  { event: 1.7, lag: 2.6 }, // straggler: occurs in min 1, arrives in min 4
  { event: 2.2, lag: 0.3 },
  { event: 2.6, lag: 0.2 },
  { event: 3.1, lag: 0.5 },
  { event: 3.4, lag: 1.9 }, // straggler
  { event: 4.1, lag: 0.3 },
  { event: 4.5, lag: 0.2 },
  { event: 4.9, lag: 0.4 },
  { event: 5.3, lag: 0.3 },
];

const WIN = 1; // 1-minute tumbling windows
const T_MAX = 6;
const N_WIN = T_MAX / WIN;

export function EventTimeDemo() {
  const [clock, setClock] = useState<Clock>("processing");
  const [lagBoost, setLagBoost] = useState(1); // multiply all lags (simulate a slow consumer)
  const [lateness, setLateness] = useState(30); // allowed lateness in seconds for event-time

  const events = useMemo(
    () => BASE.map((e) => ({ ...e, proc: e.event + e.lag * lagBoost })),
    [lagBoost]
  );

  const time = (e: (typeof events)[number]) => (clock === "event" ? e.event : e.proc);

  // counts per window under the selected clock
  const counts = Array.from({ length: N_WIN }, (_, w) => {
    const lo = w * WIN;
    const hi = lo + WIN;
    return events.filter((e) => {
      const t = time(e);
      return t >= lo && t < hi;
    }).length;
  });

  // "true" counts = by event time (the ground truth)
  const trueCounts = Array.from({ length: N_WIN }, (_, w) => {
    const lo = w * WIN;
    const hi = lo + WIN;
    return BASE.filter((e) => e.event >= lo && e.event < hi).length;
  });

  // Stragglers = events whose lag pushes them past the window close (event-time view).
  // With a lateness allowance, a straggler is "recovered" if its delay <= lateness.
  const latenessMin = lateness / 60;
  const stragglers = events.filter((e) => e.lag * lagBoost > WIN); // crossed at least one window
  const dropped = clock === "event" ? stragglers.filter((e) => e.lag * lagBoost > latenessMin).length : 0;

  const maxCount = Math.max(1, ...counts, ...trueCounts);
  const xPct = (t: number) => (t / T_MAX) * 100;
  const distortion = counts.reduce((acc, c, i) => acc + Math.abs(c - trueCounts[i]), 0);

  return (
    <div className="space-y-5">
      <SegmentedControl<Clock>
        value={clock}
        onChange={setClock}
        options={[
          { label: "Window by processing time", value: "processing" },
          { label: "Window by event time", value: "event" },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Consumer lag spike"
          value={Math.round(lagBoost * 100)}
          min={50}
          max={300}
          step={10}
          onChange={(v) => setLagBoost(v / 100)}
          format={(v) => (v / 100).toFixed(1) + "× delay"}
        />
        {clock === "event" && (
          <Slider
            label="Allowed lateness"
            value={lateness}
            min={0}
            max={150}
            step={5}
            onChange={setLateness}
            format={(v) => v + " s"}
          />
        )}
      </div>

      {/* timeline */}
      <div className="rounded-lg border border-line bg-ink-950/60 p-4">
        <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-fg-faint">
          <span>{clock === "event" ? "event-time" : "processing-time"} axis · 1-min tumbling windows</span>
          <span>0–6 min</span>
        </div>
        <div className="relative" style={{ height: 96 }}>
          {/* window dividers */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
            {Array.from({ length: N_WIN + 1 }, (_, i) => (
              <line key={i} x1={xPct(i * WIN)} y1={0} x2={xPct(i * WIN)} y2={70} stroke="var(--color-line)" strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>

          {/* events: draw at their event time, with a tail to processing time when relevant */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
            {events.map((e, i) => {
              const isStraggler = e.lag * lagBoost > WIN;
              const recovered = clock === "event" && e.lag * lagBoost <= latenessMin;
              const tDisplay = time(e);
              const color = isStraggler
                ? clock === "event" && !recovered
                  ? "var(--color-fault)"
                  : "var(--color-warn)"
                : "var(--accent)";
              return (
                <g key={i}>
                  {/* lag tail: from event time to processing time */}
                  <line
                    x1={xPct(e.event)}
                    y1={36}
                    x2={xPct(e.proc)}
                    y2={36}
                    stroke="var(--color-fg-faint)"
                    strokeOpacity={0.35}
                    strokeWidth={0.3}
                    strokeDasharray="0.6 0.6"
                    vectorEffect="non-scaling-stroke"
                  />
                  <motion.circle
                    cx={xPct(tDisplay)}
                    cy={36}
                    r={1.3}
                    fill={color}
                    stroke="var(--color-ink-950)"
                    strokeWidth={0.3}
                    vectorEffect="non-scaling-stroke"
                    animate={{ cx: xPct(tDisplay) }}
                    transition={{ type: "spring", stiffness: 120, damping: 18 }}
                  />
                </g>
              );
            })}
          </svg>

          {/* per-window counts */}
          {counts.map((c, w) => (
            <div
              key={w}
              className="absolute -translate-x-1/2 font-mono text-[12px] font-semibold tabular-nums"
              style={{
                left: `${xPct(w * WIN + WIN / 2)}%`,
                top: 54,
                color: c === trueCounts[w] ? "var(--color-ok)" : "var(--color-warn)",
              }}
            >
              {c}
            </div>
          ))}

          <div className="absolute bottom-0 left-0 right-0 flex justify-between font-mono text-[8px] text-fg-faint">
            {[0, 1, 2, 3, 4, 5, 6].map((t) => (
              <span key={t}>{t}m</span>
            ))}
          </div>
        </div>
      </div>

      {/* comparison bars: measured vs true */}
      <div className="rounded-lg border border-line bg-ink-900/40 p-4">
        <div className="mb-3 flex items-center gap-4 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
          <span><span className="text-accent">▮</span> measured</span>
          <span><span className="text-fg-faint">▯</span> true (by event time)</span>
        </div>
        <div className="flex items-end gap-2" style={{ height: 80 }}>
          {counts.map((c, w) => (
            <div key={w} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 60 }}>
                <motion.div
                  className="w-1/2 rounded-sm bg-accent/55"
                  animate={{ height: `${(c / maxCount) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
                <div
                  className="w-1/2 rounded-sm border border-fg-faint/50"
                  style={{ height: `${(trueCounts[w] / maxCount) * 100}%` }}
                />
              </div>
              <span className="font-mono text-[8px] text-fg-faint">{w}–{w + 1}m</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Distortion vs truth" value={distortion} unit="events" tone={distortion === 0 ? "ok" : "warn"} />
        <Stat label="Stragglers" value={stragglers.length} tone="warn" />
        <Stat
          label="Dropped late"
          value={dropped}
          tone={dropped > 0 ? "fault" : "ok"}
        />
      </div>

      <p className="text-[13px] leading-relaxed text-fg-muted">
        {clock === "processing" ? (
          <>
            Bucketing by <span className="text-[var(--color-warn)]">processing time</span> means delayed events pile
            into whatever minute they happen to <em>arrive</em>. Crank up the lag spike and watch counts smear into
            later windows — the per-minute rate is now a lie about what really happened.
          </>
        ) : (
          <>
            Bucketing by <span className="accent-text">event time</span> gives the true per-minute counts (distortion
            drops toward zero) — but a <span className="text-[var(--color-fault)]">straggler</span> that arrives after
            its window closed is only counted if it falls inside your <em>allowed lateness</em>. Shrink the allowance
            and late events get dropped; you must publish a correction or accept the loss.
          </>
        )}
      </p>
    </div>
  );
}
