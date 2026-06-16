"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Slider, Stat, Button, Toggle } from "@/components/chapter";
import { IconPlay, IconReset } from "@/components/icons";

/**
 * The Timeout Dilemma sandbox.
 *
 * You send a request across an asynchronous packet network with adjustable
 * one-way delay, jitter, and packet-loss probability, then pick a timeout.
 * The demo simulates the request leg + (maybe) the response leg and classifies
 * the outcome the way a real client must — from the OUTSIDE, with no oracle:
 *
 *   • REPLY      — response returned before the deadline (success)
 *   • TIMED OUT  — no reply by the deadline. The client gives up and declares
 *                  the node dead… but the truth (below the dashed line) might
 *                  be "lost request", "lost response", or "still working".
 *
 * Running many trials tallies how often a "dead" verdict was actually wrong —
 * the false-positive rate that makes short timeouts dangerous.
 */

type Truth = "delivered" | "req-lost" | "resp-lost" | "slow";
type Verdict = "reply" | "timeout";

type Trial = {
  truth: Truth;
  verdict: Verdict;
  rtt: number; // round-trip time when a reply actually came back
};

type Phase = "idle" | "req" | "compute" | "resp" | "done";

const CLIENT_X = 70;
const SERVER_X = 430;
const TRACK_Y = 70;

function simulate(delay: number, jitter: number, loss: number): Omit<Trial, "verdict"> {
  const j = () => delay + (Math.random() * 2 - 1) * jitter;
  const reqLost = Math.random() < loss;
  if (reqLost) return { truth: "req-lost", rtt: Infinity };

  const reqLeg = Math.max(2, j());
  // Server occasionally hits a slow path (GC pause / disk / scheduling).
  const slow = Math.random() < 0.18;
  const compute = slow ? 80 + Math.random() * 900 : 6 + Math.random() * 30;

  const respLost = Math.random() < loss;
  if (respLost) return { truth: "resp-lost", rtt: Infinity };

  const respLeg = Math.max(2, j());
  const rtt = reqLeg + compute + respLeg;
  return { truth: slow ? "slow" : "delivered", rtt };
}

const TRUTH_LABEL: Record<Truth, string> = {
  delivered: "node replied — message just hadn't arrived yet",
  "req-lost": "request was dropped — node never saw it",
  "resp-lost": "node did the work, but its reply was dropped",
  slow: "node is alive but stalled (GC / disk / scheduling)",
};

const TRUTH_TONE: Record<Truth, string> = {
  delivered: "var(--color-ok)",
  "req-lost": "var(--color-fault)",
  "resp-lost": "var(--color-fault)",
  slow: "var(--color-warn)",
};

export function TimeoutDilemmaDemo() {
  const [delay, setDelay] = useState(120);
  const [jitter, setJitter] = useState(60);
  const [loss, setLoss] = useState(20);
  const [timeout, setTimeoutMs] = useState(400);
  const [autoretry, setAutoretry] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [trial, setTrial] = useState<Trial | null>(null); // resolved result on screen
  const [active, setActive] = useState<Trial | null>(null); // in-flight trial (drives animation)
  const [runId, setRunId] = useState(0); // stable key per trial for AnimatePresence
  const [history, setHistory] = useState<Trial[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  const run = useCallback(() => {
    clearTimers();
    const base = simulate(delay, jitter, loss);
    const verdict: Verdict = base.rtt <= timeout ? "reply" : "timeout";
    const t: Trial = { ...base, verdict };

    setTrial(null);
    setActive(t);
    setRunId((n) => n + 1);
    setPhase("req");

    // Visual schedule (scaled to feel responsive but proportional).
    const scale = Math.min(1, 700 / Math.max(timeout, 1));
    const reqDur = 360 * scale;
    const computeDur = 240 * scale;

    timers.current.push(
      setTimeout(() => {
        // If request was lost, it never reaches the server.
        if (t.truth !== "req-lost") setPhase("compute");
      }, reqDur),
      setTimeout(() => {
        if (t.truth === "delivered" || t.truth === "slow" || t.truth === "resp-lost") {
          setPhase("resp");
        }
      }, reqDur + computeDur)
    );

    // Resolve the verdict at the (scaled) deadline or arrival, whichever first.
    const resolveAt = verdict === "reply" ? reqDur + computeDur + reqDur : 1000 * scale + 360;
    timers.current.push(
      setTimeout(() => {
        setPhase("done");
        setTrial(t);
        setHistory((h) => [t, ...h].slice(0, 40));
      }, resolveAt)
    );
  }, [delay, jitter, loss, timeout]);

  // Auto-retry: if the last trial timed out and autoretry is on, fire again.
  useEffect(() => {
    if (!autoretry || phase !== "done" || !trial) return;
    if (trial.verdict !== "timeout") return;
    const id = setTimeout(() => run(), 650);
    return () => clearTimeout(id);
  }, [autoretry, phase, trial, run]);

  const reset = () => {
    clearTimers();
    setPhase("idle");
    setTrial(null);
    setActive(null);
    setHistory([]);
  };

  // Aggregate stats over history.
  const total = history.length;
  const timeouts = history.filter((t) => t.verdict === "timeout").length;
  // A "dead" verdict is WRONG when we timed out but the node was actually
  // alive (slow, or the node processed it and only the response was lost).
  const wrongDeaths = history.filter(
    (t) => t.verdict === "timeout" && (t.truth === "slow" || t.truth === "resp-lost")
  ).length;
  const falsePos = timeouts > 0 ? Math.round((wrongDeaths / timeouts) * 100) : 0;
  const fastReplies = history.filter((t) => t.verdict === "reply");
  const p50 =
    fastReplies.length > 0
      ? Math.round(
          [...fastReplies.map((t) => t.rtt)].sort((a, b) => a - b)[
            Math.floor(fastReplies.length / 2)
          ]
        )
      : 0;

  const reqActive = phase === "req" || phase === "compute" || phase === "resp" || phase === "done";
  const respActive =
    phase === "resp" || (phase === "done" && active?.verdict === "reply");
  const reqLost = active?.truth === "req-lost";
  const respLost = active?.truth === "resp-lost";

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Slider label="One-way delay" value={delay} min={10} max={500} step={10} onChange={setDelay} format={(v) => `${v} ms`} />
        <Slider label="Jitter (±)" value={jitter} min={0} max={300} step={10} onChange={setJitter} format={(v) => `${v} ms`} />
        <Slider label="Packet loss" value={loss} min={0} max={70} step={5} onChange={setLoss} format={(v) => `${v} %`} />
        <Slider label="Timeout" value={timeout} min={100} max={2500} step={50} onChange={setTimeoutMs} format={(v) => `${v} ms`} />
      </div>

      {/* Wire diagram */}
      <div className="relative overflow-hidden rounded-lg border border-line bg-ink-950/60 p-4">
        <svg viewBox="0 0 500 150" className="w-full">
          {/* request track */}
          <line x1={CLIENT_X} y1={TRACK_Y - 16} x2={SERVER_X} y2={TRACK_Y - 16} stroke="var(--color-line)" strokeWidth={1.5} strokeDasharray="4 6" />
          {/* response track */}
          <line x1={CLIENT_X} y1={TRACK_Y + 16} x2={SERVER_X} y2={TRACK_Y + 16} stroke="var(--color-line)" strokeWidth={1.5} strokeDasharray="4 6" />

          <text x={CLIENT_X} y={TRACK_Y - 26} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">request →</text>
          <text x={SERVER_X} y={TRACK_Y + 32} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">← response</text>

          {/* Client node */}
          <circle cx={CLIENT_X} cy={TRACK_Y} r={22} fill="var(--color-ink-800)" stroke="var(--accent)" strokeWidth={2} />
          <text x={CLIENT_X} y={TRACK_Y + 3} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--accent)">CLIENT</text>

          {/* Server node */}
          <motion.circle
            cx={SERVER_X}
            cy={TRACK_Y}
            r={22}
            fill="var(--color-ink-800)"
            stroke={
              phase === "compute"
                ? "var(--color-warn)"
                : active && phase === "done"
                ? TRUTH_TONE[active.truth]
                : "var(--color-fg-faint)"
            }
            strokeWidth={2}
            animate={phase === "compute" ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={{ duration: 0.6, repeat: phase === "compute" ? Infinity : 0 }}
          />
          <text x={SERVER_X} y={TRACK_Y + 3} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">NODE</text>

          {/* Request packet — travels client→server; a lost request dies mid-wire */}
          <AnimatePresence>
            {reqActive && (
              <motion.circle
                key={`req-${runId}`}
                r={4}
                fill={reqLost ? "var(--color-fault)" : "var(--accent)"}
                cy={TRACK_Y - 16}
                initial={{ cx: CLIENT_X }}
                animate={{ cx: reqLost ? (CLIENT_X + SERVER_X) / 2 : SERVER_X }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>

          {/* Response packet — travels server→client; a lost response dies mid-wire */}
          <AnimatePresence>
            {respActive && !respLost && (
              <motion.circle
                key={`resp-${runId}`}
                r={4}
                fill="var(--color-ok)"
                cy={TRACK_Y + 16}
                initial={{ cx: SERVER_X }}
                animate={{ cx: CLIENT_X }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              />
            )}
            {phase === "resp" && respLost && (
              <motion.circle
                key={`resp-lost-${runId}`}
                r={4}
                fill="var(--color-fault)"
                cy={TRACK_Y + 16}
                initial={{ cx: SERVER_X }}
                animate={{ cx: (CLIENT_X + SERVER_X) / 2 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>

          {/* Status banner inside the wire */}
          <text x={250} y={130} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-fg-muted)">
            {phase === "idle" && "press Send request"}
            {phase === "req" && "request in flight…"}
            {phase === "compute" && "node is processing…"}
            {phase === "resp" && "response in flight…"}
            {phase === "done" && trial?.verdict === "reply" && `✓ reply in ${Math.round(trial.rtt)} ms`}
            {phase === "done" && trial?.verdict === "timeout" && `✗ timed out at ${timeout} ms`}
          </text>
        </svg>
      </div>

      {/* Verdict vs Truth */}
      <AnimatePresence mode="wait">
        {phase === "done" && trial && (
          <motion.div
            key={`verdict-${total}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2"
          >
            <div className="bg-ink-900 p-4">
              <div className="kicker mb-1.5">What the client sees</div>
              <div
                className="font-mono text-sm font-semibold"
                style={{ color: trial.verdict === "reply" ? "var(--color-ok)" : "var(--color-fault)" }}
              >
                {trial.verdict === "reply" ? "REPLY RECEIVED" : "TIMEOUT → declare node dead"}
              </div>
            </div>
            <div className="bg-ink-900 p-4">
              <div className="kicker mb-1.5">The actual truth</div>
              <div className="font-mono text-sm font-semibold" style={{ color: TRUTH_TONE[trial.truth] }}>
                {TRUTH_LABEL[trial.truth]}
              </div>
              {trial.verdict === "timeout" && (trial.truth === "slow" || trial.truth === "resp-lost") && (
                <div className="mt-1.5 text-xs italic text-fault">
                  False positive: the node was alive. Failover here risks split-brain or a double-executed action.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={phase !== "idle" && phase !== "done"}>
          <IconPlay size={14} /> Send request
        </Button>
        <Button variant="ghost" size="sm" onClick={reset}>
          <IconReset size={13} /> Reset
        </Button>
        <Toggle label="Auto-retry on timeout" checked={autoretry} onChange={setAutoretry} />
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Trials" value={total} tone="default" />
        <Stat label="Timed out" value={total ? `${Math.round((timeouts / total) * 100)}` : 0} unit="%" tone="warn" />
        <Stat label="Median reply" value={p50 || "—"} unit={p50 ? "ms" : ""} tone="accent" />
        <Stat
          label='"Dead" but alive'
          value={timeouts ? falsePos : 0}
          unit="%"
          tone={falsePos > 0 ? "fault" : "ok"}
        />
      </div>

      {/* Trial strip */}
      {history.length > 0 && (
        <div className="rounded-lg border border-line bg-ink-950/40 p-3">
          <div className="kicker mb-2">Recent verdicts (newest first)</div>
          <div className="flex flex-wrap gap-1.5">
            {history.map((t, i) => {
              const wrong = t.verdict === "timeout" && (t.truth === "slow" || t.truth === "resp-lost");
              return (
                <span
                  key={i}
                  title={`${t.verdict === "reply" ? "reply" : "timeout"} · ${TRUTH_LABEL[t.truth]}`}
                  className="h-4 w-4 rounded-sm"
                  style={{
                    background:
                      t.verdict === "reply"
                        ? "var(--color-ok)"
                        : wrong
                        ? "var(--color-fault)"
                        : "color-mix(in oklab, var(--color-warn) 70%, transparent)",
                    outline: wrong ? "1.5px solid var(--color-fault)" : "none",
                    outlineOffset: 1,
                  }}
                />
              );
            })}
          </div>
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-fg-faint">
            green = reply · amber = honest timeout (request truly lost) · red = the node was alive but you called it dead
          </p>
        </div>
      )}
    </div>
  );
}
