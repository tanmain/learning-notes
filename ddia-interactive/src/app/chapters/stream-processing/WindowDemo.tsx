"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SegmentedControl, Slider, Stat } from "@/components/chapter";

/**
 * Windowing demo: the SAME stream of timestamped events, aggregated under four
 * window strategies. The user picks the window type and its size and immediately
 * sees how the windows tile the timeline (or overlap, or stretch) and how the
 * resulting counts differ. This makes the abstract DDIA taxonomy concrete:
 *
 *  - Tumbling  : fixed length, non-overlapping. Each event in exactly one window.
 *  - Hopping   : fixed length, overlapping by a hop < size — smoothing.
 *  - Sliding   : a window per event, covering [t-size, t]. Counts neighbours within size.
 *  - Session   : no fixed length; a window grows while events are close, closes
 *                after a gap of `size` with no activity.
 *
 * Timeline is 0..60 "seconds". Events are deterministic (seeded), clustered into
 * bursts so session windows are visually meaningful.
 */

type WinType = "tumbling" | "hopping" | "sliding" | "session";

// Deterministic event times (seconds) — two bursts + a couple of stragglers.
const EVENTS: number[] = [
  2, 3, 4, 6, 7, 9, 11, // burst 1
  22, 23, 25, 26, 28, 30, 31, 33, // burst 2
  47, 48, 50, 53, // burst 3
];

const T_MAX = 60;

type Window = { start: number; end: number; count: number };

function computeWindows(type: WinType, size: number, hop: number, events: number[]): Window[] {
  if (type === "tumbling") {
    const out: Window[] = [];
    for (let s = 0; s < T_MAX; s += size) {
      const end = Math.min(s + size, T_MAX);
      out.push({ start: s, end, count: events.filter((e) => e >= s && e < end).length });
    }
    return out;
  }
  if (type === "hopping") {
    const out: Window[] = [];
    for (let s = 0; s + size <= T_MAX + hop; s += hop) {
      const end = s + size;
      if (s >= T_MAX) break;
      out.push({ start: s, end: Math.min(end, T_MAX), count: events.filter((e) => e >= s && e < end).length });
    }
    return out;
  }
  if (type === "sliding") {
    // One window per event: [e - size, e]. Count includes events in that span.
    return events.map((e) => {
      const start = Math.max(0, e - size);
      return { start, end: e, count: events.filter((x) => x >= start && x <= e).length };
    });
  }
  // session: group events whose gaps are <= size
  const out: Window[] = [];
  let start = events[0];
  let last = events[0];
  let count = 1;
  for (let i = 1; i < events.length; i++) {
    if (events[i] - last <= size) {
      last = events[i];
      count++;
    } else {
      out.push({ start, end: last, count });
      start = events[i];
      last = events[i];
      count = 1;
    }
  }
  out.push({ start, end: last, count });
  return out;
}

const WIN_COLORS = ["var(--accent)", "var(--accent-2)", "var(--color-special)", "var(--color-info)", "var(--color-ok)", "var(--color-warn)"];

const DESCRIPTIONS: Record<WinType, string> = {
  tumbling: "Fixed length, no overlap. Every event lands in exactly one window — clean buckets for per-minute counts.",
  hopping: "Fixed length but windows overlap by a hop smaller than the size, so each event appears in several windows. Used to smooth a rate.",
  sliding: "One window per event, covering the size just before it. Groups events that fall within `size` of each other; counts neighbours.",
  session: "No fixed length. A window grows while events stay close, and closes after a gap of `size` with no activity — perfect for user sessions.",
};

export function WindowDemo() {
  const [type, setType] = useState<WinType>("tumbling");
  const [size, setSize] = useState(10);
  const [hop, setHop] = useState(5);

  const windows = useMemo(() => computeWindows(type, size, Math.min(hop, size), EVENTS), [type, size, hop]);

  const xPct = (t: number) => (t / T_MAX) * 100;

  // For sliding windows we stack them so overlaps are visible.
  const showHop = type === "hopping";
  const sizeLabel = type === "session" ? "Inactivity gap" : "Window size";

  const counts = windows.map((w) => w.count);
  const maxCount = Math.max(1, ...counts);
  const totalAttributions = counts.reduce((a, c) => a + c, 0);

  return (
    <div className="space-y-5">
      <SegmentedControl<WinType>
        value={type}
        onChange={setType}
        options={[
          { label: "Tumbling", value: "tumbling" },
          { label: "Hopping", value: "hopping" },
          { label: "Sliding", value: "sliding" },
          { label: "Session", value: "session" },
        ]}
      />

      <p className="text-[13px] leading-relaxed text-fg-muted">{DESCRIPTIONS[type]}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label={sizeLabel} value={size} min={4} max={20} step={1} onChange={setSize} format={(v) => v + " s"} />
        {showHop && (
          <Slider label="Hop" value={hop} min={1} max={size} step={1} onChange={setHop} format={(v) => v + " s"} />
        )}
      </div>

      {/* Timeline visual */}
      <div className="rounded-lg border border-line bg-ink-950/60 p-4">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-faint">event-time axis · 0–60 s</div>

        <div className="relative" style={{ height: type === "sliding" ? 150 : 116 }}>
          {/* window bands */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
            {windows.map((w, i) => {
              const color = WIN_COLORS[i % WIN_COLORS.length];
              // sliding windows stack to show overlap; others share one band.
              const band = type === "sliding" ? 8 + (i % 6) * 11 : 14;
              const bandH = type === "sliding" ? 9 : 44;
              return (
                <motion.rect
                  key={`${type}-${i}-${w.start}-${w.end}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25, delay: i * 0.02 }}
                  x={xPct(w.start)}
                  y={band}
                  width={Math.max(0.6, xPct(w.end - w.start))}
                  height={bandH}
                  rx={1.5}
                  fill={color}
                  fillOpacity={0.13}
                  stroke={color}
                  strokeOpacity={0.7}
                  strokeWidth={0.4}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>

          {/* window count labels (non-sliding) */}
          {type !== "sliding" &&
            windows.map((w, i) => (
              <div
                key={`lbl-${i}`}
                className="absolute -translate-x-1/2 font-mono text-[11px] font-semibold tabular-nums"
                style={{
                  left: `${xPct((w.start + w.end) / 2)}%`,
                  top: 62,
                  color: WIN_COLORS[i % WIN_COLORS.length],
                }}
              >
                {w.count}
              </div>
            ))}

          {/* events */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
            {EVENTS.map((e, i) => (
              <motion.circle
                key={i}
                cx={xPct(e)}
                cy={type === "sliding" ? 90 : 36}
                r={1.1}
                fill="var(--accent)"
                stroke="var(--color-ink-950)"
                strokeWidth={0.3}
                vectorEffect="non-scaling-stroke"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, delay: i * 0.015 }}
              />
            ))}
          </svg>
          {/* axis ticks */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between font-mono text-[8px] text-fg-faint">
            {[0, 15, 30, 45, 60].map((t) => (
              <span key={t}>{t}s</span>
            ))}
          </div>
        </div>
      </div>

      {/* count bars */}
      <div className="rounded-lg border border-line bg-ink-900/40 p-4">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
          emitted aggregates · count per window
        </div>
        <div className="flex items-end gap-1.5" style={{ height: 84 }}>
          {windows.map((w, i) => (
            <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
              <motion.div
                className="w-full rounded-sm"
                style={{ background: WIN_COLORS[i % WIN_COLORS.length], opacity: 0.55 }}
                initial={{ height: 0 }}
                animate={{ height: `${(w.count / maxCount) * 100}%` }}
                transition={{ duration: 0.35 }}
              />
              <span className="font-mono text-[8px] text-fg-faint tabular-nums">{w.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Windows" value={windows.length} tone="accent" />
        <Stat label="Events" value={EVENTS.length} tone="info" />
        <Stat
          label="Total attributions"
          value={totalAttributions}
          tone={totalAttributions > EVENTS.length ? "warn" : "ok"}
        />
      </div>
      <p className="text-[12px] leading-relaxed text-fg-faint">
        Note the <span className="text-[var(--color-warn)]">total attributions</span>: tumbling and session sum to exactly{" "}
        {EVENTS.length} (each event counted once), while hopping and sliding count events more than once because their
        windows overlap. Same stream, different question, different answer.
      </p>
    </div>
  );
}
