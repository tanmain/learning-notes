"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Slider, Stat, SegmentedControl, Toggle } from "@/components/chapter";

/**
 * Latency Playground
 * ------------------
 * Generates a synthetic stream of request latencies, bins them into a histogram,
 * and overlays mean / p50 / p95 / p99 / p999 markers so you can SEE why the mean
 * lies and why the tail dominates. A "fan-out" control samples N backend calls per
 * request and keeps the slowest, demonstrating tail-latency amplification.
 *
 * Model (deliberately simple but faithful):
 *   service time ~ log-normal-ish base, plus a queueing tax that grows sharply as
 *   utilisation (load) approaches 1 — like a real M/M/1 queue where waiting time
 *   blows up near saturation. The randomness is seeded so the chart is stable
 *   between renders but changes when you press "New sample".
 */

// --- deterministic PRNG (mulberry32) so the histogram is reproducible ---
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One service-time sample (ms) at a given utilisation rho in [0,1).
function sampleLatency(rnd: () => number, rho: number): number {
  // Base service time: log-normal-ish, median ~38ms.
  const u = rnd();
  const base = 18 + Math.exp(2.9 + 1.05 * (u - 0.5) * 2); // skewed right
  // Queueing tax: mean wait ~ rho/(1-rho) * serviceTime (M/M/1 intuition).
  const safeRho = Math.min(rho, 0.985);
  const queueFactor = safeRho / (1 - safeRho);
  const wait = queueFactor * (12 + rnd() * 40);
  // Rare hiccup (GC pause / retry / packet loss) — fattens the extreme tail.
  const hiccup = rnd() < 0.012 ? 250 + rnd() * 700 : 0;
  return base + wait + hiccup;
}

const N = 4000; // sample size

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}

type View = "linear" | "log";

export function LatencyPlayground() {
  const [loadPct, setLoadPct] = useState(70); // utilisation %
  const [fanout, setFanout] = useState(1); // parallel backend calls per request
  const [view, setView] = useState<View>("linear");
  const [tailZoom, setTailZoom] = useState(false);
  const [seed, setSeed] = useState(12345);

  const { samples, stats, bins, maxX } = useMemo(() => {
    const rnd = mulberry32(seed);
    const rho = loadPct / 100;
    const out = new Array<number>(N);
    for (let i = 0; i < N; i++) {
      // fan-out: a request fires `fanout` parallel calls and waits for the slowest.
      let worst = 0;
      for (let k = 0; k < fanout; k++) {
        const s = sampleLatency(rnd, rho);
        if (s > worst) worst = s;
      }
      out[i] = worst;
    }
    const sorted = [...out].sort((a, b) => a - b);
    const mean = out.reduce((s, v) => s + v, 0) / out.length;
    const st = {
      mean,
      p50: quantile(sorted, 0.5),
      p95: quantile(sorted, 0.95),
      p99: quantile(sorted, 0.99),
      p999: quantile(sorted, 0.999),
      max: sorted[sorted.length - 1],
    };

    // histogram domain: cap at p999 unless zooming the tail, so bars stay readable.
    const domainMax = tailZoom ? Math.min(st.max, st.p999 * 1.6) : st.p99 * 1.25;
    const BINS = 46;
    const counts = new Array<number>(BINS).fill(0);
    for (const v of sorted) {
      const b = Math.min(BINS - 1, Math.floor((v / domainMax) * BINS));
      if (b >= 0) counts[b] += 1;
    }
    return { samples: sorted, stats: st, bins: counts, maxX: domainMax };
  }, [loadPct, fanout, seed, tailZoom]);

  const maxCount = Math.max(...bins, 1);
  const W = 720;
  const H = 230;
  const padL = 8;
  const padR = 8;
  const plotW = W - padL - padR;
  const plotH = H - 28;

  const xFor = (ms: number) => padL + Math.min(1, ms / maxX) * plotW;
  const barH = (c: number) =>
    view === "log"
      ? (Math.log10(c + 1) / Math.log10(maxCount + 1)) * plotH
      : (c / maxCount) * plotH;

  const markers: { label: string; v: number; color: string }[] = [
    { label: "mean", v: stats.mean, color: "var(--color-fault)" },
    { label: "p50", v: stats.p50, color: "var(--color-info)" },
    { label: "p95", v: stats.p95, color: "var(--accent)" },
    { label: "p99", v: stats.p99, color: "var(--color-warn)" },
  ];
  if (tailZoom) markers.push({ label: "p999", v: stats.p999, color: "var(--color-special)" });

  // how far the mean sits below p99 — the "the mean lies" headline
  const meanVsP99 = Math.round(((stats.p99 - stats.mean) / stats.mean) * 100);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Load (server utilisation)"
          value={loadPct}
          min={10}
          max={98}
          step={1}
          onChange={setLoadPct}
          format={(v) => v + "%"}
        />
        <Slider
          label="Fan-out (parallel backend calls / request)"
          value={fanout}
          min={1}
          max={50}
          step={1}
          onChange={setFanout}
          format={(v) => `${v}×`}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl<View>
            value={view}
            onChange={setView}
            options={[
              { label: "Linear y", value: "linear" },
              { label: "Log y", value: "log" },
            ]}
          />
          <Toggle label="Zoom the tail (show p999)" checked={tailZoom} onChange={setTailZoom} />
        </div>
        <button
          type="button"
          onClick={() => setSeed((s) => (s * 1103515245 + 12345) & 0x7fffffff)}
          className="rounded-lg border border-line px-3 py-1.5 font-mono text-xs text-fg-muted transition-all hover:border-line-strong hover:text-fg"
        >
          ↻ New sample
        </button>
      </div>

      {/* Histogram */}
      <div className="instrument overflow-hidden p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
          {/* baseline */}
          <line x1={padL} y1={plotH} x2={W - padR} y2={plotH} stroke="var(--color-line)" strokeWidth={1} />

          {/* bars */}
          {bins.map((c, i) => {
            const x = padL + (i / bins.length) * plotW;
            const w = plotW / bins.length - 1.5;
            const h = barH(c);
            const binMid = ((i + 0.5) / bins.length) * maxX;
            const inTail = binMid >= stats.p95;
            return (
              <motion.rect
                key={`${seed}-${i}`}
                x={x}
                width={Math.max(0.5, w)}
                initial={{ height: 0, y: plotH }}
                animate={{ height: h, y: plotH - h }}
                transition={{ duration: 0.4, delay: i * 0.004 }}
                rx={1}
                fill={inTail ? "var(--color-warn)" : "var(--accent)"}
                fillOpacity={inTail ? 0.85 : 0.6}
              />
            );
          })}

          {/* percentile markers */}
          {markers.map((m) => {
            const x = xFor(m.v);
            if (x > W - padR) return null;
            return (
              <g key={m.label}>
                <line x1={x} y1={6} x2={x} y2={plotH} stroke={m.color} strokeWidth={1.4} strokeDasharray="3 3" />
                <rect x={x - 1} y={6} width={2} height={6} fill={m.color} />
                <text
                  x={x + 3}
                  y={16}
                  fontSize={10}
                  fill={m.color}
                  className="font-mono"
                  fontWeight={700}
                >
                  {m.label}
                </text>
                <text x={x + 3} y={28} fontSize={9} fill={m.color} className="font-mono" opacity={0.85}>
                  {Math.round(m.v)}ms
                </text>
              </g>
            );
          })}

          {/* x-axis label */}
          <text x={W - padR} y={H - 4} fontSize={9} textAnchor="end" fill="var(--color-fg-faint)" className="font-mono">
            response time → {Math.round(maxX)}ms {tailZoom ? "(tail view)" : "(clipped at p99)"}
          </text>
          <text x={padL} y={H - 4} fontSize={9} fill="var(--color-fg-faint)" className="font-mono">
            count {view === "log" ? "(log)" : "(linear)"} ·{" "}
            <tspan fill="var(--accent)">body</tspan> /{" "}
            <tspan fill="var(--color-warn)">tail ≥ p95</tspan>
          </text>
        </svg>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="mean" value={Math.round(stats.mean)} unit="ms" tone="fault" />
        <Stat label="p50 (median)" value={Math.round(stats.p50)} unit="ms" tone="info" />
        <Stat label="p95" value={Math.round(stats.p95)} unit="ms" tone="accent" />
        <Stat label="p99" value={Math.round(stats.p99)} unit="ms" tone="warn" />
        <Stat label="p999" value={Math.round(stats.p999)} unit="ms" tone="special" />
      </div>

      {/* Live readout / interpretation */}
      <div className="rounded-lg border border-line bg-ink-900/60 p-4 font-mono text-[13px] leading-relaxed text-fg-muted">
        <p>
          At <span className="accent-text">{loadPct}% load</span> with{" "}
          <span className="accent-text">{fanout}× fan-out</span>: the{" "}
          <span className="text-fault">mean ({Math.round(stats.mean)}ms)</span> sits{" "}
          <span className="text-warn">{meanVsP99}% below p99 ({Math.round(stats.p99)}ms)</span> — half your
          traffic is faster than {Math.round(stats.p50)}ms, yet 1 user in 100 waits ≥ {Math.round(stats.p99)}ms.
        </p>
        {fanout > 1 && (
          <p className="mt-2 text-special">
            Fan-out effect: every request now waits for the slowest of {fanout} calls, so a tail event that hits
            ~1% of <em>calls</em> hits ~{Math.round((1 - Math.pow(0.99, fanout)) * 100)}% of <em>requests</em>.
          </p>
        )}
        {loadPct >= 90 && (
          <p className="mt-2 text-warn">
            Near saturation, queueing delay explodes (the M/M/1 wait ~ ρ/(1−ρ)): the whole distribution slides
            right and the tail balloons. Add capacity before ρ gets this close to 1.
          </p>
        )}
        <p className="mt-2 text-fg-faint">n = {samples.length.toLocaleString()} requests sampled.</p>
      </div>
    </div>
  );
}
