"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Slider, Stat, SegmentedControl } from "@/components/chapter";

/**
 * Throughput vs Response-Time curve.
 * Offered load rises along x; the system serves it up to its capacity, then
 * saturates. Throughput plateaus at capacity while response time follows the
 * M/M/1 "hockey stick" and blows up as ρ → 1. Users pick a scaling strategy
 * (scale up / scale out / elastic) and a server count to move the knee.
 */

type Strategy = "up" | "out" | "elastic";

const STRATEGIES: Record<
  Strategy,
  { label: string; perServer: number; note: string }
> = {
  // capacity per server unit, in k req/s — scale-up units are beefier but pricier/limited.
  up: { label: "Scale up", perServer: 120, note: "one beefy node — simple, but a ceiling and a single fault domain" },
  out: { label: "Scale out", perServer: 60, note: "many commodity nodes — near-linear for stateless work" },
  elastic: { label: "Elastic", perServer: 60, note: "auto-adds nodes when load climbs — great for spiky traffic" },
};

export function ThroughputDemo() {
  const [offered, setOffered] = useState(280); // offered load, k req/s
  const [servers, setServers] = useState(4);
  const [strategy, setStrategy] = useState<Strategy>("out");

  const cfg = STRATEGIES[strategy];

  // Elastic: capacity tracks load (with headroom), capped by the server budget.
  const effectiveServers =
    strategy === "elastic"
      ? Math.min(servers, Math.max(1, Math.ceil((offered * 1.25) / cfg.perServer)))
      : servers;
  const capacity = effectiveServers * cfg.perServer; // k req/s

  const rho = Math.min(offered / capacity, 1.4);
  const served = Math.min(offered, capacity); // throughput plateaus at capacity
  const baseRt = 40; // ms at idle

  // response time via queueing intuition; clamp so the curve stays drawable.
  const respTime = useMemo(() => {
    const safe = Math.min(rho, 0.985);
    return baseRt * (1 + safe / (1 - safe));
  }, [rho]);

  // ----- build the curve for the chart across offered load 0..maxX -----
  const maxX = 600; // k req/s axis
  const maxRt = 1200; // ms axis cap
  const W = 720;
  const H = 260;
  const padL = 44;
  const padB = 30;
  const padT = 12;
  const padR = 48;
  const plotW = W - padL - padR;
  const plotH = H - padB - padT;

  const xFor = (load: number) => padL + (load / maxX) * plotW;
  const yRt = (ms: number) => padT + (1 - Math.min(ms, maxRt) / maxRt) * plotH;
  const yTp = (k: number) => padT + (1 - Math.min(k, maxX) / maxX) * plotH;

  const rtPath = useMemo(() => {
    const pts: string[] = [];
    for (let load = 0; load <= maxX; load += 6) {
      const rr = Math.min(load / capacity, 0.985);
      const ms = baseRt * (1 + rr / (1 - rr));
      pts.push(`${xFor(load).toFixed(1)},${yRt(ms).toFixed(1)}`);
    }
    return "M" + pts.join(" L");
  }, [capacity]);

  const tpPath = useMemo(() => {
    const pts: string[] = [];
    for (let load = 0; load <= maxX; load += 6) {
      const t = Math.min(load, capacity);
      pts.push(`${xFor(load).toFixed(1)},${yTp(t).toFixed(1)}`);
    }
    return "M" + pts.join(" L");
  }, [capacity]);

  const knee = capacity; // throughput knee sits at capacity
  const saturated = rho >= 0.98;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Offered load"
          value={offered}
          min={20}
          max={maxX}
          step={10}
          onChange={setOffered}
          format={(v) => `${v}k req/s`}
        />
        <Slider
          label={strategy === "up" ? "Node size (units)" : "Server count (budget)"}
          value={servers}
          min={1}
          max={10}
          step={1}
          onChange={setServers}
          format={(v) => `${v}×`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<Strategy>
          value={strategy}
          onChange={setStrategy}
          options={[
            { label: "Scale up", value: "up" },
            { label: "Scale out", value: "out" },
            { label: "Elastic", value: "elastic" },
          ]}
        />
        <span className="font-mono text-[11px] text-fg-faint">{cfg.note}</span>
      </div>

      <div className="instrument overflow-hidden p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
          {/* gridlines */}
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <line
              key={g}
              x1={padL}
              x2={W - padR}
              y1={padT + g * plotH}
              y2={padT + g * plotH}
              stroke="var(--color-line)"
              strokeOpacity={0.4}
              strokeWidth={1}
            />
          ))}
          {/* axes */}
          <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="var(--color-line-strong)" />
          <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="var(--color-line-strong)" />

          {/* capacity line */}
          <line
            x1={xFor(knee)}
            y1={padT}
            x2={xFor(knee)}
            y2={padT + plotH}
            stroke="var(--color-ok)"
            strokeWidth={1.2}
            strokeDasharray="4 4"
            opacity={0.7}
          />
          <text x={xFor(knee) + 4} y={padT + 12} fontSize={9} fill="var(--color-ok)" className="font-mono">
            capacity {Math.round(knee)}k
          </text>

          {/* throughput curve */}
          <path d={tpPath} fill="none" stroke="var(--accent)" strokeWidth={2.4} />
          {/* response-time curve */}
          <path d={rtPath} fill="none" stroke="var(--color-warn)" strokeWidth={2.4} />

          {/* current operating point */}
          <motion.line
            x1={xFor(offered)}
            x2={xFor(offered)}
            y1={padT}
            y2={padT + plotH}
            stroke="var(--color-fg)"
            strokeOpacity={0.35}
            strokeWidth={1}
            animate={{ x1: xFor(offered), x2: xFor(offered) }}
          />
          <motion.circle
            cx={xFor(offered)}
            cy={yTp(served)}
            r={5}
            fill="var(--accent)"
            stroke="var(--color-ink-950)"
            strokeWidth={1.5}
            animate={{ cx: xFor(offered), cy: yTp(served) }}
          />
          <motion.circle
            cx={xFor(offered)}
            cy={yRt(respTime)}
            r={5}
            fill="var(--color-warn)"
            stroke="var(--color-ink-950)"
            strokeWidth={1.5}
            animate={{ cx: xFor(offered), cy: yRt(respTime) }}
          />

          {/* axis labels */}
          <text x={padL} y={H - 8} fontSize={9} fill="var(--color-fg-faint)" className="font-mono">
            offered load (k req/s) →
          </text>
          <text
            x={10}
            y={padT + 4}
            fontSize={9}
            fill="var(--accent)"
            className="font-mono"
            transform={`rotate(-90 10 ${padT + plotH / 2})`}
          >
            <tspan x={10}>throughput</tspan>
          </text>
          <text x={W - padR + 4} y={padT + 10} fontSize={9} fill="var(--color-warn)" className="font-mono">
            resp.
          </text>
          <text x={W - padR + 4} y={padT + 22} fontSize={9} fill="var(--color-warn)" className="font-mono">
            time
          </text>
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="utilisation ρ" value={(rho * 100).toFixed(0)} unit="%" tone={saturated ? "fault" : rho > 0.8 ? "warn" : "ok"} />
        <Stat label="throughput" value={Math.round(served)} unit="k req/s" tone="accent" />
        <Stat label="response time" value={Math.round(respTime)} unit="ms" tone="warn" />
        <Stat label="active nodes" value={effectiveServers} tone="info" />
      </div>

      <div className="rounded-lg border border-line bg-ink-900/60 p-4 font-mono text-[13px] leading-relaxed text-fg-muted">
        {rho < 0.7 && (
          <p>
            Comfortable: at <span className="accent-text">{Math.round(rho * 100)}%</span> utilisation, response
            time barely moves above its {baseRt}ms floor. You have headroom for spikes.
          </p>
        )}
        {rho >= 0.7 && rho < 0.98 && (
          <p className="text-warn">
            Approaching the knee. Throughput still tracks load, but response time is climbing fast — every extra
            request now waits behind a growing queue.
          </p>
        )}
        {saturated && (
          <p className="text-fault">
            Saturated. Offered load &gt; capacity ({Math.round(knee)}k): throughput is pinned at the ceiling, the
            queue grows without bound and response time runs away. {strategy === "elastic" ? "Elastic mode is already at its budget — raise it." : "Scale out, or switch to elastic."}
          </p>
        )}
        {strategy === "elastic" && (
          <p className="mt-2 text-info">
            Elastic: capacity auto-tracks load (you&apos;re using {effectiveServers} of {servers} budgeted nodes),
            so the knee follows you — until you hit the budget.
          </p>
        )}
      </div>
    </div>
  );
}
