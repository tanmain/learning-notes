"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Slider, Toggle, Stat, Button } from "@/components/chapter";

/**
 * Tail-Latency Amplifier — a driveable model of "The Tail at Scale" (Dean &
 * Barroso, CACM 2013). ONE end-user request fans out to N backend shards in
 * parallel and can only return once the SLOWEST shard answers. The user drives it:
 *   • drag the fan-out slider (1..40 shards),
 *   • CLICK individual shards to flip them "slow" (a fat-tailed straggler),
 *   • FIRE single requests or run a live stream and watch real samples land,
 *   • toggle HEDGED REQUESTS (fire a backup after p95, keep the faster) and see
 *     the measured tail collapse.
 * The headline lesson: a per-CALL slow rate of ~1% becomes a per-REQUEST slow
 * rate of 1-(1-p)^n — so the same backend looks fine at fan-out 1 and awful at 40.
 */

// deterministic-ish PRNG so a "shard latency" feels stable per shard but varies per fire.
function rand(): number {
  return Math.random();
}

const SLO_MS = 200; // a request is "slow" if it exceeds this (the SLA line)
const BASE_MED = 40; // healthy shard median (ms)

// One latency sample (ms) for a shard. Slow shards have a much fatter tail.
function sampleShard(slow: boolean): number {
  const u = rand();
  // healthy: tight log-normal around BASE_MED, rare small hiccup
  const base = BASE_MED + Math.exp(2.1 + 0.8 * (u - 0.5) * 2);
  const hiccupP = slow ? 0.4 : 0.04;
  const hiccup = rand() < hiccupP ? (slow ? 220 + rand() * 520 : 140 + rand() * 180) : 0;
  return Math.round(base + hiccup);
}

type Fire = { id: number; latency: number; slow: boolean; hedged: boolean };

export function TailAmplifier() {
  const [fanout, setFanout] = useState(8);
  const [slowShards, setSlowShards] = useState<Set<number>>(new Set([3]));
  const [hedge, setHedge] = useState(false);
  const [live, setLive] = useState(false);

  // history of fired requests (cap to keep the math + render light)
  const [history, setHistory] = useState<Fire[]>([]);
  // the shard latencies of the MOST RECENT fire, for the live diagram
  const [lastShardLatencies, setLastShardLatencies] = useState<number[]>([]);
  const [winnerIdx, setWinnerIdx] = useState<number>(-1); // slowest shard = the one we waited on
  const fireId = useRef(0);

  // keep a slow shard inside range if fan-out shrinks
  useEffect(() => {
    setSlowShards((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < fanout) next.add(i);
      });
      return next;
    });
  }, [fanout]);

  const toggleShard = useCallback((i: number) => {
    setSlowShards((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const fireOnce = useCallback(() => {
    const latencies: number[] = [];
    for (let i = 0; i < fanout; i++) latencies.push(sampleShard(slowShards.has(i)));

    // request latency = slowest shard (must wait for all parallel calls)
    let slowestIdx = 0;
    for (let i = 1; i < latencies.length; i++) if (latencies[i] > latencies[slowestIdx]) slowestIdx = i;
    let reqLatency = latencies[slowestIdx];
    let hedgedUsed = false;

    // Hedged requests (The Tail at Scale): if the request is dragging past a
    // threshold, fire a backup of the slowest call and keep whichever returns first.
    if (hedge && reqLatency > 150) {
      const backup = sampleShard(false); // backup likely lands on a healthy replica
      const effectiveSlowest = Math.min(latencies[slowestIdx], 150 + backup * 0.6);
      // recompute the request latency against the (now faster) slowest call
      let newMax = 0;
      for (let i = 0; i < latencies.length; i++) {
        const v = i === slowestIdx ? effectiveSlowest : latencies[i];
        if (v > newMax) newMax = v;
      }
      if (newMax < reqLatency) {
        reqLatency = Math.round(newMax);
        hedgedUsed = true;
      }
    }

    const slow = reqLatency > SLO_MS;
    fireId.current += 1;
    setLastShardLatencies(latencies);
    setWinnerIdx(slowestIdx);
    setHistory((h) => {
      const next = [...h, { id: fireId.current, latency: reqLatency, slow, hedged: hedgedUsed }];
      return next.length > 400 ? next.slice(next.length - 400) : next;
    });
  }, [fanout, slowShards, hedge]);

  // live stream
  useEffect(() => {
    if (!live) return;
    const id = setInterval(fireOnce, 280);
    return () => clearInterval(id);
  }, [live, fireOnce]);

  const reset = useCallback(() => {
    setHistory([]);
    setLastShardLatencies([]);
    setWinnerIdx(-1);
    setLive(false);
  }, []);

  // ---- aggregate stats from history ----
  const stats = useMemo(() => {
    const n = history.length;
    if (n === 0)
      return { n: 0, slowPct: 0, p50: 0, p99: 0, mean: 0, hedgedPct: 0 };
    const sorted = [...history].map((f) => f.latency).sort((a, b) => a - b);
    const slowCount = history.filter((f) => f.slow).length;
    const hedgedCount = history.filter((f) => f.hedged).length;
    const q = (p: number) => sorted[Math.min(n - 1, Math.floor(p * n))];
    const mean = sorted.reduce((s, v) => s + v, 0) / n;
    return {
      n,
      slowPct: (slowCount / n) * 100,
      p50: q(0.5),
      p99: q(0.99),
      mean: Math.round(mean),
      hedgedPct: (hedgedCount / n) * 100,
    };
  }, [history]);

  // per-CALL slow probability (a single shard exceeding SLO is rare unless it's a straggler).
  // Empirically ~1% for a healthy shard at this config; stragglers ~30%.
  const perCallSlow = useMemo(() => {
    const slowN = slowShards.size;
    const healthyN = fanout - slowN;
    // healthy shard ~1% chance to exceed SLO; slow shard ~32%.
    const pHealthy = 0.01;
    const pSlow = 0.32;
    // probability the WHOLE request is slow = 1 - P(all calls fast)
    const pAllFast = Math.pow(1 - pHealthy, healthyN) * Math.pow(1 - pSlow, slowN);
    return {
      perCallHealthy: pHealthy * 100,
      perRequest: (1 - pAllFast) * 100,
    };
  }, [fanout, slowShards]);

  // histogram of fired-request latencies
  const hist = useMemo(() => {
    const BINS = 40;
    const domainMax = 600;
    const counts = new Array<number>(BINS).fill(0);
    for (const f of history) {
      const b = Math.min(BINS - 1, Math.floor((f.latency / domainMax) * BINS));
      counts[b] += 1;
    }
    return { counts, domainMax, max: Math.max(...counts, 1) };
  }, [history]);

  // ---- shard grid geometry ----
  const cols = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(fanout))));
  const rows = Math.ceil(fanout / cols);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Fan-out (parallel backend shards / request)"
          value={fanout}
          min={1}
          max={40}
          step={1}
          onChange={setFanout}
          format={(v) => `${v} shards`}
        />
        <div className="flex flex-col justify-center gap-2.5">
          <Toggle label="Hedged requests (fire a backup, keep the faster)" checked={hedge} onChange={setHedge} />
          <p className="font-mono text-[10px] leading-relaxed text-fg-faint">
            Click any shard below to flip it into a <span className="text-warn">slow straggler</span>.
          </p>
        </div>
      </div>

      {/* Fan-out diagram: one request -> N shards -> wait for the slowest */}
      <div className="instrument overflow-hidden p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
            1 request → {fanout} parallel calls → return on the <span className="text-warn">slowest</span>
          </span>
          {lastShardLatencies.length > 0 && (
            <span className="font-mono text-[11px]">
              last request:{" "}
              <span style={{ color: stats.n && history[history.length - 1]?.slow ? "var(--color-fault)" : "var(--color-ok)" }}>
                {history[history.length - 1]?.latency}ms
              </span>
            </span>
          )}
        </div>

        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          role="group"
          aria-label="backend shards — click to toggle slow"
        >
          {Array.from({ length: fanout }).map((_, i) => {
            const isSlow = slowShards.has(i);
            const lat = lastShardLatencies[i];
            const isWinner = i === winnerIdx && lastShardLatencies.length > 0;
            const fastBound = lat !== undefined && lat <= SLO_MS;
            const color = isSlow ? "var(--color-warn)" : "var(--color-ok)";
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleShard(i)}
                title={isSlow ? "slow straggler — click to heal" : "healthy — click to make it a straggler"}
                className="group relative rounded-md border-2 px-1.5 py-2 text-center transition-all"
                style={{
                  borderColor: isWinner
                    ? "var(--color-fault)"
                    : `color-mix(in oklab, ${color} 55%, transparent)`,
                  background: `color-mix(in oklab, ${color} ${isSlow ? 14 : 8}%, var(--color-ink-850))`,
                }}
              >
                {isWinner && (
                  <motion.span
                    className="absolute inset-0 rounded-md"
                    style={{ border: "2px solid var(--color-fault)" }}
                    initial={{ opacity: 0.9 }}
                    animate={{ opacity: [0.9, 0.2, 0.9] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
                <span className="block font-mono text-[9px] uppercase tracking-wide text-fg-faint">
                  s{i + 1}
                </span>
                <span
                  className="block font-mono text-[11px] font-bold tabular-nums"
                  style={{ color: lat === undefined ? "var(--color-fg-faint)" : fastBound ? "var(--color-ok)" : "var(--color-fault)" }}
                >
                  {lat === undefined ? "—" : `${lat}`}
                </span>
                <span className="block font-mono text-[8px]" style={{ color }}>
                  {isSlow ? "▲ slow" : "● ok"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 font-mono text-[9px] text-fg-faint">
          grid: {rows}×{cols} · <span className="text-fault">red ring</span> = the slowest call this request had to wait for
        </div>
      </div>

      {/* Fire controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="solid" size="sm" onClick={fireOnce}>
          ⚡ Fire one request
        </Button>
        <Button variant={live ? "outline" : "ghost"} size="sm" onClick={() => setLive((v) => !v)}>
          {live ? "❚❚ Stop stream" : "▶ Run live stream"}
        </Button>
        <Button variant="ghost" size="sm" onClick={reset}>
          Reset
        </Button>
        <span className="font-mono text-[11px] text-fg-faint">
          SLO line = <span className="text-warn">{SLO_MS}ms</span> · slow shards: {slowShards.size}
        </span>
      </div>

      {/* Histogram of measured request latencies */}
      <div className="instrument overflow-hidden p-4">
        <svg viewBox="0 0 720 180" className="block w-full">
          <line x1={8} y1={150} x2={712} y2={150} stroke="var(--color-line)" strokeWidth={1} />
          {/* SLO marker */}
          {(() => {
            const x = 8 + Math.min(1, SLO_MS / hist.domainMax) * 704;
            return (
              <g>
                <line x1={x} y1={6} x2={x} y2={150} stroke="var(--color-warn)" strokeWidth={1.4} strokeDasharray="3 3" />
                <text x={x + 3} y={16} fontSize={10} fill="var(--color-warn)" className="font-mono" fontWeight={700}>
                  SLO {SLO_MS}ms
                </text>
              </g>
            );
          })()}
          {/* p99 marker */}
          {stats.n > 0 &&
            (() => {
              const x = 8 + Math.min(1, stats.p99 / hist.domainMax) * 704;
              if (x > 712) return null;
              return (
                <g>
                  <line x1={x} y1={6} x2={x} y2={150} stroke="var(--color-fault)" strokeWidth={1.4} strokeDasharray="2 2" />
                  <text x={x + 3} y={28} fontSize={9} fill="var(--color-fault)" className="font-mono" fontWeight={700}>
                    p99 {stats.p99}ms
                  </text>
                </g>
              );
            })()}
          {hist.counts.map((c, i) => {
            const x = 8 + (i / hist.counts.length) * 704;
            const w = 704 / hist.counts.length - 1.5;
            const h = (c / hist.max) * 124;
            const binMid = ((i + 0.5) / hist.counts.length) * hist.domainMax;
            const slow = binMid > SLO_MS;
            return (
              <motion.rect
                key={i}
                x={x}
                width={Math.max(0.5, w)}
                rx={1}
                fill={slow ? "var(--color-fault)" : "var(--accent)"}
                fillOpacity={slow ? 0.85 : 0.6}
                initial={false}
                animate={{ height: h, y: 150 - h }}
                transition={{ duration: 0.25 }}
              />
            );
          })}
          <text x={712} y={172} fontSize={9} textAnchor="end" fill="var(--color-fg-faint)" className="font-mono">
            request latency → {hist.domainMax}ms
          </text>
          <text x={8} y={172} fontSize={9} fill="var(--color-fg-faint)" className="font-mono">
            {stats.n > 0 ? `${stats.n} requests fired` : "fire some requests →"}
          </text>
        </svg>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="measured p99" value={stats.n ? stats.p99 : "—"} unit={stats.n ? "ms" : ""} tone="fault" />
        <Stat label="measured p50" value={stats.n ? stats.p50 : "—"} unit={stats.n ? "ms" : ""} tone="info" />
        <Stat
          label="requests over SLO"
          value={stats.n ? stats.slowPct.toFixed(1) : "—"}
          unit={stats.n ? "%" : ""}
          tone={stats.slowPct > 5 ? "fault" : stats.slowPct > 1 ? "warn" : "ok"}
        />
        <Stat
          label="predicted slow rate"
          value={perCallSlow.perRequest.toFixed(1)}
          unit="%"
          tone={perCallSlow.perRequest > 5 ? "warn" : "ok"}
        />
      </div>

      {/* Interpretation */}
      <div className="rounded-lg border border-line bg-ink-900/60 p-4 font-mono text-[13px] leading-relaxed text-fg-muted">
        <p>
          The amplification law: each healthy call is slow only{" "}
          <span className="accent-text">~{perCallSlow.perCallHealthy.toFixed(0)}%</span> of the time, but a request
          waits for the slowest of <span className="accent-text">{fanout}</span> calls — so the chance the{" "}
          <em>whole request</em> is slow climbs to{" "}
          <span className={perCallSlow.perRequest > 5 ? "text-warn" : "text-ok"}>
            1 − (1 − p)
            <sup>{fanout}</sup> ≈ {perCallSlow.perRequest.toFixed(1)}%
          </span>
          {slowShards.size > 0 && (
            <>
              {" "}
              (amplified further by your {slowShards.size} straggler{slowShards.size > 1 ? "s" : ""})
            </>
          )}
          .
        </p>
        {stats.n >= 20 && stats.slowPct > 5 && !hedge && (
          <p className="mt-2 text-warn">
            Over {stats.slowPct.toFixed(0)}% of your requests breached the {SLO_MS}ms SLO — the tail, not the median
            ({stats.p50}ms), is what your users feel. Try turning on <span className="accent-text">hedged requests</span>.
          </p>
        )}
        {hedge && stats.n >= 20 && (
          <p className="mt-2 text-ok">
            Hedging kicked in on <span className="accent-text">{stats.hedgedPct.toFixed(0)}%</span> of requests:
            firing a backup of the laggard and keeping the faster reply pulls p99 down to {stats.p99}ms — the core
            short-term fix from <em>The Tail at Scale</em>.
          </p>
        )}
        {stats.n === 0 && (
          <p className="mt-2 text-fg-faint">
            Fire a request (or run the stream), then drag fan-out up and watch the measured slow-rate track the
            prediction. Click a shard to inject a straggler.
          </p>
        )}
      </div>

      <AnimatePresence>
        {fanout >= 25 && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="font-mono text-[11px] leading-relaxed text-fg-faint"
          >
            This is exactly why Google&apos;s search results, which fan out to thousands of leaf servers, obsess over
            shaving every backend&apos;s tail: at high fan-out a 1-in-100 hiccup is no longer rare per request.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
