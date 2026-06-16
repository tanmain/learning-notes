"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Toggle, Stat, Button, SegmentedControl } from "@/components/chapter";

/**
 * Fault Tolerance Lab.
 * A 5-node cluster behind a load balancer. The user injects one of the three
 * fault classes from the chapter (hardware / software / human) and toggles the
 * matching mitigation. The lab shows the distinction the chapter hammers on:
 * a *fault* = a component deviating from spec; a *failure* = the system as a
 * whole stops serving. Good design tolerates faults so they never become failures.
 */

type FaultKind = "none" | "hardware" | "software" | "human";

const FAULTS: { value: FaultKind; label: string }[] = [
  { value: "none", label: "Healthy" },
  { value: "hardware", label: "Hardware" },
  { value: "software", label: "Software bug" },
  { value: "human", label: "Human error" },
];

type NodeState = "ok" | "down" | "buggy" | "degraded";

const NODE_COLOR: Record<NodeState, string> = {
  ok: "var(--color-ok)",
  down: "var(--color-fault)",
  buggy: "var(--color-warn)",
  degraded: "var(--color-special)",
};

export function FaultLab() {
  const [fault, setFault] = useState<FaultKind>("none");
  const [redundancy, setRedundancy] = useState(true); // tolerate machine loss
  const [staged, setStaged] = useState(true); // staged rollout + sandbox + fast rollback

  const NODES = 5;

  const { nodeStates, failure, headline, detail } = useMemo(() => {
    const states: NodeState[] = Array.from({ length: NODES }, () => "ok");
    let failed = false;
    let head = "System healthy";
    let det = "All nodes within spec. The load balancer spreads traffic evenly.";

    if (fault === "hardware") {
      // a single machine dies (disk crash / RAM fault / power loss)
      states[2] = "down";
      if (redundancy) {
        head = "Fault tolerated";
        det =
          "One node is lost, but with redundancy the remaining nodes absorb its share. This is exactly what lets you do a rolling upgrade — patch one node at a time with zero downtime.";
        failed = false;
      } else {
        // no redundancy: the lost node took unique state with it
        states[0] = "degraded";
        states[1] = "degraded";
        head = "FAILURE: data unavailable";
        det =
          "Without redundancy the dead node held the only copy of its shard. Requests that need it error out — a single fault became a system-wide failure.";
        failed = true;
      }
    } else if (fault === "software") {
      // a systematic bug — correlated, hits every node running that code
      if (staged) {
        // canary catches it on one node before full rollout
        states[2] = "buggy";
        head = "Bug contained to canary";
        det =
          "Software faults are systematic — the same bad input crashes every node running the code. A staged rollout exposes it on one canary first; you halt and roll back before it spreads. Tolerating ≠ ignoring: you still need monitoring to catch it.";
        failed = false;
      } else {
        for (let i = 0; i < NODES; i++) states[i] = "buggy";
        head = "FAILURE: correlated crash";
        det =
          "A software bug is not independent like a dropped disk — it hits all nodes at once. Redundancy does NOT save you here: every replica runs the same buggy code and falls over together.";
        failed = true;
      }
    } else if (fault === "human") {
      // bad config push — leading cause of outages
      if (staged) {
        states[2] = "degraded";
        head = "Mistake caught early";
        det =
          "A bad config is the #1 cause of outages. A sandbox to rehearse in, a staged rollout, and fast rollback turn a potential outage into a 30-second blip on one node.";
        failed = false;
      } else {
        for (let i = 0; i < NODES; i++) states[i] = "down";
        head = "FAILURE: bad config everywhere";
        det =
          "The operator pushed a broken config to the whole fleet at once. No sandbox, no canary, no quick rollback — every node took it and the service is down. Minimise the blast radius and make the right thing the easy thing.";
        failed = true;
      }
    }

    return { nodeStates: states, failure: failed, headline: head, detail: det };
  }, [fault, redundancy, staged]);

  // availability estimate: nines depend on whether faults are tolerated
  const upNodes = nodeStates.filter((s) => s === "ok" || s === "degraded").length;
  const availability = failure ? 0 : Math.round((upNodes / NODES) * 1000) / 10;

  const relevantMitigation =
    fault === "hardware" ? "redundancy" : fault === "none" ? null : "staged";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="kicker mb-2">Inject a fault</div>
          <SegmentedControl<FaultKind> value={fault} onChange={setFault} options={FAULTS} />
        </div>
        <div className="flex flex-col gap-2.5">
          <div
            className={
              relevantMitigation === "redundancy" ? "accent-text transition-colors" : "transition-colors"
            }
          >
            <Toggle label="Redundancy (tolerate machine loss)" checked={redundancy} onChange={setRedundancy} />
          </div>
          <div className={relevantMitigation === "staged" ? "accent-text transition-colors" : "transition-colors"}>
            <Toggle label="Sandbox + staged rollout + rollback" checked={staged} onChange={setStaged} />
          </div>
        </div>
      </div>

      {/* Cluster diagram */}
      <div className="instrument overflow-hidden p-5">
        <svg viewBox="0 0 720 220" className="block w-full">
          {/* clients */}
          <text x={20} y={20} fontSize={10} fill="var(--color-fg-faint)" className="font-mono">
            CLIENTS
          </text>
          {[0, 1, 2].map((c) => (
            <circle key={c} cx={36} cy={70 + c * 40} r={9} fill="url(#fl-node)" stroke="var(--color-line-strong)" />
          ))}
          <defs>
            <radialGradient id="fl-node" cx="50%" cy="35%" r="75%">
              <stop offset="0%" stopColor="var(--color-ink-800)" />
              <stop offset="100%" stopColor="var(--color-ink-850)" />
            </radialGradient>
          </defs>

          {/* load balancer */}
          <g transform="translate(150, 90)">
            <rect x={-34} y={-26} width={68} height={56} rx={9} fill="url(#fl-node)" stroke="var(--accent)" strokeOpacity={0.6} />
            <text x={0} y={-4} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--accent)" className="font-mono">
              LB
            </text>
            <text x={0} y={12} textAnchor="middle" fontSize={8} fill="var(--color-fg-faint)" className="font-mono">
              router
            </text>
          </g>

          {/* lines clients -> LB */}
          {[0, 1, 2].map((c) => (
            <line key={c} x1={45} y1={70 + c * 40} x2={116} y2={90} stroke="var(--color-line)" strokeWidth={1} />
          ))}

          {/* nodes */}
          {nodeStates.map((s, i) => {
            const x = 300 + (i % 3) * 130;
            const y = i < 3 ? 55 : 150;
            const color = NODE_COLOR[s];
            const dead = s === "down";
            return (
              <g key={i} transform={`translate(${x}, ${y})`}>
                <line x1={-116 - (i % 3) * 0} y1={i < 3 ? 35 : -60} x2={-40} y2={0} stroke="var(--color-line)" strokeWidth={1} strokeOpacity={dead ? 0.2 : 0.6} />
                <motion.rect
                  x={-40}
                  y={-26}
                  width={80}
                  height={52}
                  rx={9}
                  fill="url(#fl-node)"
                  stroke={color}
                  strokeWidth={1.6}
                  initial={{
                    strokeOpacity: dead ? 0.5 : 0.9,
                    opacity: dead ? 0.45 : 1,
                  }}
                  animate={{
                    strokeOpacity: dead ? 0.5 : 0.9,
                    opacity: dead ? 0.45 : 1,
                  }}
                />
                {(s === "buggy" || s === "down") && (
                  <motion.rect
                    x={-40}
                    y={-26}
                    width={80}
                    height={52}
                    rx={9}
                    fill="none"
                    stroke={color}
                    animate={{ strokeOpacity: [0.2, 0.9, 0.2] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
                <text x={0} y={-4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--color-fg)" className="font-mono">
                  node {i + 1}
                </text>
                <text x={0} y={11} textAnchor="middle" fontSize={8} fill={color} className="font-mono">
                  {s === "ok" ? "● serving" : s === "down" ? "✕ down" : s === "buggy" ? "▲ crashing" : "◆ extra load"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Verdict */}
      <div
        className="rounded-lg border-l-2 p-4"
        style={{
          borderColor: failure ? "var(--color-fault)" : fault === "none" ? "var(--color-ok)" : "var(--color-ok)",
          background: `color-mix(in oklab, ${failure ? "var(--color-fault)" : "var(--color-ok)"} 9%, var(--color-ink-850))`,
        }}
      >
        <div
          className="mb-1 font-mono text-xs uppercase tracking-wider"
          style={{ color: failure ? "var(--color-fault)" : "var(--color-ok)" }}
        >
          {failure ? "FAILURE" : "FAULT TOLERATED"} · {headline}
        </div>
        <p className="text-[14px] leading-relaxed text-fg">{detail}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="fault present" value={fault === "none" ? "no" : "yes"} tone={fault === "none" ? "ok" : "warn"} />
        <Stat
          label="became a failure?"
          value={failure ? "yes" : "no"}
          tone={failure ? "fault" : "ok"}
        />
        <Stat label="serving capacity" value={availability} unit="%" tone={availability === 100 ? "ok" : availability === 0 ? "fault" : "warn"} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] leading-relaxed text-fg-faint">
          Tip: toggle the wrong mitigation for a fault and watch it fail — redundancy can&apos;t stop a{" "}
          <span className="text-warn">correlated software bug</span>, and only staged rollout + rollback contain{" "}
          <span className="text-special">human error</span>.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setFault("none");
            setRedundancy(true);
            setStaged(true);
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
