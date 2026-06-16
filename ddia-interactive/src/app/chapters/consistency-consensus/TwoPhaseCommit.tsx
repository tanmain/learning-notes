"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button, SegmentedControl, Stat } from "@/components/chapter";
import { IconReset, IconStep, IconPlay } from "@/components/icons";

/**
 * Two-Phase Commit — the atomic-commit stepper.
 *
 * A coordinator drives N participants through:
 *   Phase 1 (prepare): each participant votes YES (promising it can commit) or
 *     NO. A YES vote is a binding promise; the participant locks the rows and
 *     fsyncs its prepared state to disk.
 *   Phase 2 (commit/abort): if ALL voted YES the coordinator fsyncs "commit"
 *     to its own log, then tells everyone to commit; a single NO → abort.
 *
 * The point of the demo is the failure modes the chapter stresses:
 *   • One NO vote aborts the whole transaction (unanimity required).
 *   • If the coordinator crashes after participants prepared but before the
 *     decision is delivered, those participants are stuck IN DOUBT — holding
 *     locks, unable to commit or abort — until the coordinator recovers. This
 *     is why 2PC is a *blocking* protocol.
 */

type Phase = "idle" | "prepared" | "decided";
type Vote = "?" | "yes" | "no";
type PState = "idle" | "prepared" | "committed" | "aborted" | "in-doubt";

type Participant = { id: string; vote: Vote; state: PState };

type Scenario = "happy" | "veto" | "crash";

const PARTS = ["db-A", "db-B", "db-C"];

function freshParts(): Participant[] {
  return PARTS.map((id) => ({ id, vote: "?", state: "idle" }));
}

export function TwoPhaseCommit() {
  const [scenario, setScenario] = useState<Scenario>("happy");
  const [phase, setPhase] = useState<Phase>("idle");
  const [parts, setParts] = useState<Participant[]>(freshParts);
  const [coordDown, setCoordDown] = useState(false);
  const [fsyncs, setFsyncs] = useState(0);
  const [step, setStep] = useState(0);
  const [note, setNote] = useState<string>("Coordinator idle. Begin the transaction to send prepare requests.");

  function reset() {
    setPhase("idle");
    setParts(freshParts());
    setCoordDown(false);
    setFsyncs(0);
    setStep(0);
    setNote("Coordinator idle. Begin the transaction to send prepare requests.");
  }

  function changeScenario(s: Scenario) {
    setScenario(s);
    reset();
  }

  /* ---- Phase 1: send prepare, collect votes ---- */
  function prepare() {
    const votes: Vote[] = scenario === "veto" ? ["yes", "no", "yes"] : ["yes", "yes", "yes"];
    setParts((prev) =>
      prev.map((p, i) => ({
        ...p,
        vote: votes[i],
        // A participant that votes YES prepares: it fsyncs and holds locks.
        state: votes[i] === "yes" ? "prepared" : "aborted",
      })),
    );
    // each YES participant performs one fsync of its prepared record
    const yeses = votes.filter((v) => v === "yes").length;
    setFsyncs((f) => f + yeses);
    setPhase("prepared");
    setStep(1);
    setNote(
      scenario === "veto"
        ? "Phase 1 done. db-B voted NO — it could not satisfy a constraint. The transaction must abort."
        : "Phase 1 done. Every participant voted YES and fsynced a prepared record, locking its rows. They now await the verdict.",
    );
  }

  /* ---- Phase 2: decide & deliver ---- */
  function decide() {
    const allYes = parts.every((p) => p.vote === "yes");

    if (scenario === "crash" && allYes) {
      // Coordinator dies right after participants prepared, before deciding.
      setCoordDown(true);
      setParts((prev) => prev.map((p) => (p.state === "prepared" ? { ...p, state: "in-doubt" } : p)));
      setPhase("decided");
      setStep(2);
      setNote(
        "Coordinator CRASHED before writing its decision. Participants are prepared but in doubt — locks held, unable to commit or abort. They must block until the coordinator recovers.",
      );
      return;
    }

    if (allYes) {
      // Coordinator fsyncs its commit decision FIRST (the point of no return),
      // then broadcasts commit.
      setFsyncs((f) => f + 1);
      setParts((prev) => prev.map((p) => ({ ...p, state: "committed" })));
      setNote("Phase 2: coordinator fsynced COMMIT to its log (point of no return), then told everyone to commit. Atomic success.");
    } else {
      setParts((prev) => prev.map((p) => ({ ...p, state: "aborted" })));
      setNote("Phase 2: at least one NO vote → coordinator broadcasts ABORT. All participants roll back; locks released.");
    }
    setPhase("decided");
    setStep(2);
  }

  /* ---- recover a crashed coordinator ---- */
  function recover() {
    setCoordDown(false);
    setFsyncs((f) => f + 1);
    setParts((prev) => prev.map((p) => (p.state === "in-doubt" ? { ...p, state: "committed" } : p)));
    setNote("Coordinator recovered, read its log, and re-sent the decision. The in-doubt transactions finally commit — but they blocked the whole time.");
  }

  const outcome: "pending" | "committed" | "aborted" | "blocked" = (() => {
    if (parts.some((p) => p.state === "in-doubt")) return "blocked";
    if (phase !== "decided") return "pending";
    return parts.every((p) => p.state === "committed") ? "committed" : "aborted";
  })();

  const W = 720;
  const H = 230;
  const coordX = W / 2;
  const coordY = 34;
  const partY = 178;

  return (
    <div className="space-y-5">
      {/* scenario picker */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="kicker">Scenario</span>
          <SegmentedControl
            value={scenario}
            onChange={changeScenario}
            options={[
              { label: "All commit", value: "happy" },
              { label: "One vetoes", value: "veto" },
              { label: "Coordinator crashes", value: "crash" },
            ]}
          />
        </div>
        <Button onClick={reset} variant="ghost" size="sm">
          <IconReset size={14} /> Reset
        </Button>
      </div>

      {/* diagram */}
      <div className="overflow-x-auto rounded-lg border border-line bg-ink-950/60 p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]">
          {/* edges coordinator <-> participants */}
          {parts.map((p, i) => {
            const px = (W / (parts.length + 1)) * (i + 1);
            const active = phase !== "idle";
            const color =
              p.state === "committed"
                ? "var(--color-ok)"
                : p.state === "aborted"
                  ? "var(--color-fault)"
                  : p.state === "in-doubt"
                    ? "var(--color-warn)"
                    : "var(--color-line-strong)";
            return (
              <g key={`edge-${p.id}`}>
                <line x1={coordX} y1={coordY + 18} x2={px} y2={partY - 22} stroke={color} strokeWidth={active ? 1.8 : 1} strokeDasharray={active ? undefined : "3 5"} opacity={0.8} />
                {/* phase-1 vote token travelling up */}
                {phase !== "idle" && (
                  <motion.circle
                    key={`vote-${p.id}-${phase}`}
                    r={4}
                    fill={p.vote === "yes" ? "var(--color-ok)" : p.vote === "no" ? "var(--color-fault)" : "var(--color-fg-faint)"}
                    initial={{ cx: px, cy: partY - 22, opacity: 0 }}
                    animate={{ cx: coordX, cy: coordY + 18, opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 0.9 }}
                  />
                )}
              </g>
            );
          })}

          {/* coordinator */}
          <g>
            <motion.rect
              x={coordX - 58}
              y={coordY - 16}
              width={116}
              height={36}
              rx={8}
              fill="var(--color-ink-900)"
              stroke={coordDown ? "var(--color-fault)" : "var(--accent)"}
              strokeWidth={1.8}
              initial={{ opacity: coordDown ? 0.5 : 1 }}
              animate={{ opacity: coordDown ? 0.5 : 1 }}
            />
            <text x={coordX} y={coordY + 6} textAnchor="middle" className="font-mono" style={{ fontSize: 11, fontWeight: 700, fill: coordDown ? "var(--color-fault)" : "var(--color-fg)" }}>
              {coordDown ? "coordinator ✕" : "coordinator"}
            </text>
          </g>

          {/* participants */}
          {parts.map((p, i) => {
            const px = (W / (parts.length + 1)) * (i + 1);
            const color =
              p.state === "committed"
                ? "var(--color-ok)"
                : p.state === "aborted"
                  ? "var(--color-fault)"
                  : p.state === "in-doubt"
                    ? "var(--color-warn)"
                    : p.state === "prepared"
                      ? "var(--accent)"
                      : "var(--color-line-strong)";
            return (
              <g key={p.id}>
                <rect x={px - 46} y={partY - 18} width={92} height={40} rx={8} fill="var(--color-ink-900)" stroke={color} strokeWidth={1.6} />
                <text x={px} y={partY - 2} textAnchor="middle" className="font-mono" style={{ fontSize: 11, fontWeight: 700, fill: "var(--color-fg)" }}>
                  {p.id}
                </text>
                <text x={px} y={partY + 13} textAnchor="middle" className="font-mono" style={{ fontSize: 8.5, fill: color }}>
                  {p.state === "idle" ? "—" : p.state}
                </text>
                {/* lock indicator while prepared / in-doubt */}
                {(p.state === "prepared" || p.state === "in-doubt") && (
                  <text x={px + 40} y={partY - 8} textAnchor="middle" className="font-mono" style={{ fontSize: 11, fill: "var(--color-warn)" }}>
                    🔒
                  </text>
                )}
              </g>
            );
          })}

          {/* phase labels */}
          <text x={14} y={coordY + 4} className="font-mono" style={{ fontSize: 8, letterSpacing: "0.12em", fill: "var(--color-fg-faint)" }}>
            COORD
          </text>
        </svg>
      </div>

      {/* step controls */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button onClick={prepare} disabled={phase !== "idle"} variant="solid">
          <IconPlay size={14} /> 1 · Send prepare
        </Button>
        <Button onClick={decide} disabled={phase !== "prepared"} variant="outline">
          <IconStep size={14} /> 2 · Decide &amp; deliver
        </Button>
        {coordDown && (
          <Button onClick={recover} variant="outline">
            <IconReset size={14} /> Recover coordinator
          </Button>
        )}
      </div>

      {/* narration */}
      <div
        className="rounded-lg border px-4 py-3 font-mono text-[12px] leading-relaxed"
        style={{
          borderColor:
            outcome === "committed"
              ? "color-mix(in oklab, var(--color-ok) 45%, transparent)"
              : outcome === "aborted"
                ? "color-mix(in oklab, var(--color-fault) 45%, transparent)"
                : outcome === "blocked"
                  ? "color-mix(in oklab, var(--color-warn) 45%, transparent)"
                  : "var(--color-line)",
          background:
            outcome === "committed"
              ? "color-mix(in oklab, var(--color-ok) 8%, transparent)"
              : outcome === "aborted"
                ? "color-mix(in oklab, var(--color-fault) 8%, transparent)"
                : outcome === "blocked"
                  ? "color-mix(in oklab, var(--color-warn) 8%, transparent)"
                  : "transparent",
          color: "var(--color-fg)",
        }}
      >
        <span className="text-fg-faint">step {step}/2 · </span>
        {note}
      </div>

      {/* stats */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Outcome" value={outcome} tone={outcome === "committed" ? "ok" : outcome === "aborted" ? "fault" : outcome === "blocked" ? "warn" : "default"} />
        <Stat label="Disk fsyncs" value={fsyncs} tone="accent" />
        <Stat label="Locks held" value={parts.filter((p) => p.state === "prepared" || p.state === "in-doubt").length} tone={parts.some((p) => p.state === "in-doubt") ? "warn" : "default"} />
      </div>

      <p className="font-mono text-[11px] leading-relaxed text-fg-faint">
        Notice the <span className="accent-text">fsync count</span>: every prepared participant forces a record to disk, and the
        coordinator forces its decision too — that durability is exactly why distributed transactions carry a heavy latency
        penalty. In the <span className="text-warn">crash</span> scenario the participants stay locked and in-doubt; only the
        coordinator&apos;s recovery can release them.
      </p>
    </div>
  );
}
