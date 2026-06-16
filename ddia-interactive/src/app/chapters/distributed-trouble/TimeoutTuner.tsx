"use client";

import { useMemo, useState } from "react";
import { Slider, Stat } from "@/components/chapter";

/**
 * Timeout-tuning visualiser.
 *
 * Real network round-trip times follow a long-tailed distribution: most
 * requests are fast, but a fat tail of stragglers (queueing, GC, congestion)
 * stretches far to the right. You drag the timeout line; everything to its
 * RIGHT is wrongly declared "dead" (false positives), while a higher timeout
 * means you wait longer to detect a genuinely dead node. There is no setting
 * that gives you both — Kleppmann's "no correct value for timeouts".
 */

// A fixed log-normal-ish RTT sample (ms) so the picture is stable & readable.
const SAMPLE: number[] = (() => {
  const xs: number[] = [];
  // Dense fast cluster
  for (let i = 0; i < 70; i++) xs.push(20 + Math.round((Math.sin(i * 1.7) + 1) * 25) + (i % 7) * 4);
  // Mid bumps
  for (let i = 0; i < 22; i++) xs.push(120 + ((i * 37) % 110));
  // Long tail (stragglers / pauses)
  for (let i = 0; i < 12; i++) xs.push(280 + ((i * 91) % 700));
  return xs;
})();

const MAX_RTT = 1000;
const BINS = 40;

export function TimeoutTuner() {
  const [timeout, setTimeout] = useState(300);

  const { bars, falsePos, p99, slowestLive, detectDelay } = useMemo(() => {
    const binW = MAX_RTT / BINS;
    const counts = new Array<number>(BINS).fill(0);
    for (const v of SAMPLE) {
      const b = Math.min(BINS - 1, Math.floor(v / binW));
      counts[b]++;
    }
    const peak = Math.max(...counts);
    const bars = counts.map((c, i) => ({
      h: c / peak,
      from: i * binW,
      to: (i + 1) * binW,
    }));
    const beyond = SAMPLE.filter((v) => v > timeout).length;
    const falsePos = Math.round((beyond / SAMPLE.length) * 100);
    const sorted = [...SAMPLE].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const slowestLive = sorted[sorted.length - 1];
    // Detection delay for a truly dead node ≈ the timeout itself.
    const detectDelay = timeout;
    return { bars, falsePos, p99, slowestLive, detectDelay };
  }, [timeout]);

  const W = 480;
  const H = 150;
  const X = (ms: number) => (ms / MAX_RTT) * W;

  return (
    <div className="space-y-5">
      <Slider
        label="Failure-detector timeout"
        value={timeout}
        min={40}
        max={950}
        step={10}
        onChange={setTimeout}
        format={(v) => `${v} ms`}
      />

      <div className="overflow-hidden rounded-lg border border-line bg-ink-950/60 p-4">
        <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full">
          {/* histogram bars */}
          {bars.map((b, i) => {
            const dead = b.from >= timeout;
            const barW = (W / BINS) - 1.5;
            return (
              <rect
                key={i}
                x={X(b.from)}
                y={H - b.h * (H - 10)}
                width={barW}
                height={b.h * (H - 10)}
                rx={1}
                fill={dead ? "var(--color-fault)" : "var(--accent)"}
                opacity={dead ? 0.65 : 0.85}
              />
            );
          })}

          {/* baseline */}
          <line x1={0} y1={H} x2={W} y2={H} stroke="var(--color-line-strong)" strokeWidth={1} />

          {/* timeout line */}
          <line x1={X(timeout)} y1={0} x2={X(timeout)} y2={H} stroke="var(--color-fg)" strokeWidth={1.6} strokeDasharray="4 3" />
          <rect x={X(timeout) - 1} y={0} width={2} height={H} fill="var(--color-fg)" opacity={0.15} />
          <text x={X(timeout)} y={H + 14} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg)">
            timeout {timeout}ms
          </text>

          {/* region labels */}
          <text x={8} y={16} className="font-mono" fontSize={8} fill="var(--accent)">
            ✓ judged alive
          </text>
          <text x={W - 8} y={16} textAnchor="end" className="font-mono" fontSize={8} fill="var(--color-fault)">
            ✗ wrongly declared dead
          </text>
          <text x={W - 8} y={H + 26} textAnchor="end" className="font-mono" fontSize={7.5} fill="var(--color-fg-faint)">
            round-trip time (ms) — long tail →
          </text>
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="False 'dead' verdicts" value={falsePos} unit="%" tone={falsePos > 0 ? "fault" : "ok"} />
        <Stat label="p99 RTT" value={Math.round(p99)} unit="ms" tone="accent" />
        <Stat label="Slowest live node" value={Math.round(slowestLive)} unit="ms" tone="warn" />
        <Stat label="Dead-node detect lag" value={detectDelay} unit="ms" tone="info" />
      </div>

      <p className="rounded-lg border border-line bg-ink-900/40 p-3 text-sm leading-relaxed text-fg-muted">
        Drag the line. Push it <strong className="text-fg">left</strong> and you detect real failures fast — but the
        fat tail of slow-yet-alive nodes gets wrongly evicted, triggering needless failovers and duplicated work.
        Push it <strong className="text-fg">right</strong> and false positives vanish — but a genuinely dead node now
        goes unnoticed for that whole interval. Because delays are <em>unbounded</em>, no single value wins both.
      </p>
    </div>
  );
}
