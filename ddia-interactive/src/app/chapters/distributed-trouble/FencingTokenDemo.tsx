"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Toggle, Button, Stat } from "@/components/chapter";
import { IconReset, IconStep, IconCheck, IconX } from "@/components/icons";

/**
 * Fencing tokens — stopping a stale lock holder from corrupting state.
 *
 * Storyboard (step through it):
 *  1. Client 1 acquires the lease + fencing token 33. Begins a long write.
 *  2. Client 1 hits a stop-the-world GC pause. Its lease silently expires.
 *  3. The lock service hands the lease to Client 2 with a HIGHER token 34.
 *     Client 2 writes safely.
 *  4. Client 1 wakes up — oblivious — and sends its delayed write with the
 *     STALE token 33.
 *
 * With fencing ON, the storage server remembers it already accepted token 34
 * and REJECTS the stale token-33 write. With fencing OFF, the zombie write
 * lands and clobbers Client 2's data: split-brain corruption.
 */

type Step = 0 | 1 | 2 | 3 | 4;

const STEPS: { title: string; detail: string }[] = [
  {
    title: "Client 1 acquires the lease",
    detail: "The lock service grants Client 1 the lease and fencing token 33. Client 1 starts a write to storage.",
  },
  {
    title: "Client 1 freezes (stop-the-world GC)",
    detail: "Mid-write, Client 1 pauses for a multi-second garbage collection. It has no idea time is passing — and its lease quietly expires.",
  },
  {
    title: "Lease reassigned to Client 2",
    detail: "Seeing the lease expire, the lock service grants it to Client 2 with the next token, 34. Client 2 writes successfully.",
  },
  {
    title: "Client 1 wakes up — still thinks it holds the lock",
    detail: "The GC pause ends. Client 1 resumes and sends its long-delayed write, stamped with its now-stale token 33.",
  },
  {
    title: "The storage server decides",
    detail: "The server has already accepted token 34. Does it accept the late token-33 write?",
  },
];

export function FencingTokenDemo() {
  const [fencing, setFencing] = useState(true);
  const [step, setStep] = useState<Step>(0);

  const next = () => setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  const reset = () => setStep(0);

  // Highest token the storage server has durably accepted.
  const serverToken = step >= 3 ? 34 : step >= 1 ? 33 : 0;
  const staleArrives = step >= 4;
  // Final outcome at step 4.
  const accepted = staleArrives && !fencing; // accepted the stale write?
  const rejected = staleArrives && fencing;

  // Stored value reflects who wrote last and won.
  let stored = "—";
  if (step >= 1) stored = "C1: data v1 (token 33)";
  if (step >= 3) stored = "C2: data v2 (token 34)";
  if (accepted) stored = "C1: stale write (token 33) ✗ corrupt";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Toggle label="Fencing tokens" checked={fencing} onChange={setFencing} />
        <span className="font-mono text-[11px] text-fg-faint">
          step {step + 1} / 5
        </span>
      </div>

      {/* Scene */}
      <div className="overflow-hidden rounded-lg border border-line bg-ink-950/60 p-4">
        <svg viewBox="0 0 500 220" className="w-full">
          {/* Client 1 */}
          <g opacity={step === 1 ? 0.45 : 1}>
            <rect x={20} y={30} width={120} height={56} rx={10} fill="var(--color-ink-800)" stroke={step === 1 ? "var(--color-warn)" : "var(--accent)"} strokeWidth={1.6} />
            <text x={80} y={52} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--accent)">CLIENT 1</text>
            <text x={80} y={68} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-muted)">
              {step === 1 ? "GC PAUSE 💤" : "token 33"}
            </text>
            {step === 1 && (
              <motion.rect
                x={20} y={30} width={120} height={56} rx={10}
                fill="none" stroke="var(--color-warn)" strokeWidth={1.6}
                animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.4, repeat: Infinity }}
              />
            )}
          </g>

          {/* Client 2 */}
          <g opacity={step >= 2 ? 1 : 0.3}>
            <rect x={20} y={134} width={120} height={56} rx={10} fill="var(--color-ink-800)" stroke="var(--color-special)" strokeWidth={1.6} />
            <text x={80} y={156} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-special)">CLIENT 2</text>
            <text x={80} y={172} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-muted)">
              {step >= 2 ? "token 34" : "waiting"}
            </text>
          </g>

          {/* Storage server */}
          <rect x={330} y={78} width={150} height={64} rx={10} fill="var(--color-ink-800)" stroke="var(--color-ok)" strokeWidth={1.6} />
          <text x={405} y={100} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-ok)">STORAGE</text>
          <text x={405} y={116} textAnchor="middle" className="font-mono" fontSize={7.5} fill="var(--color-fg-muted)">
            max token seen: {serverToken || "—"}
          </text>
          <text x={405} y={130} textAnchor="middle" className="font-mono" fontSize={7} fill="var(--color-fg-faint)">
            {fencing ? "fencing: ON" : "fencing: OFF"}
          </text>

          {/* Client 2's accepted write (step >=3) */}
          <AnimatePresence>
            {step >= 3 && (
              <motion.g key="c2write" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <motion.circle
                  r={4} fill="var(--color-special)" cy={162}
                  initial={{ cx: 140 }} animate={{ cx: 330 }} transition={{ duration: 0.6 }}
                />
                <line x1={140} y1={162} x2={330} y2={120} stroke="var(--color-special)" strokeWidth={1} strokeDasharray="3 4" opacity={0.4} />
              </motion.g>
            )}
          </AnimatePresence>

          {/* Client 1's stale write (step 4) */}
          <AnimatePresence>
            {staleArrives && (
              <motion.g key="stale" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <motion.circle
                  r={4.5}
                  fill={rejected ? "var(--color-fault)" : "var(--color-warn)"}
                  cy={58}
                  initial={{ cx: 140 }}
                  animate={{ cx: rejected ? 300 : 330 }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                />
                <line x1={140} y1={58} x2={330} y2={100} stroke={rejected ? "var(--color-fault)" : "var(--color-warn)"} strokeWidth={1} strokeDasharray="3 4" opacity={0.4} />
                {rejected && (
                  <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ transformOrigin: "305px 80px" }}>
                    <circle cx={305} cy={80} r={11} fill="var(--color-ink-900)" stroke="var(--color-fault)" strokeWidth={1.6} />
                    <path d="M300 75 l10 10 M310 75 l-10 10" stroke="var(--color-fault)" strokeWidth={1.8} strokeLinecap="round" />
                    <text x={305} y={104} textAnchor="middle" className="font-mono" fontSize={7} fill="var(--color-fault)">33 &lt; 34</text>
                  </motion.g>
                )}
              </motion.g>
            )}
          </AnimatePresence>
        </svg>
      </div>

      {/* Step narration */}
      <div className="rounded-lg border border-line bg-ink-900/50 p-4">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs text-accent">{String(step + 1).padStart(2, "0")}</span>
          <h4 className="font-display text-base font-bold">{STEPS[step].title}</h4>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{STEPS[step].detail}</p>
      </div>

      {/* Outcome at the final step */}
      <AnimatePresence>
        {staleArrives && (
          <motion.div
            key={`outcome-${fencing}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-start gap-3 rounded-lg border-l-2 p-4 ${
              rejected ? "border-ok bg-ok/10" : "border-fault bg-fault/10"
            }`}
          >
            <span className="mt-0.5 shrink-0" style={{ color: rejected ? "var(--color-ok)" : "var(--color-fault)" }}>
              {rejected ? <IconCheck size={18} /> : <IconX size={18} />}
            </span>
            <div className="text-sm leading-relaxed text-fg">
              {rejected ? (
                <>
                  <strong className="text-ok">Stale write rejected.</strong> The server already accepted token 34,
                  so token 33 is fenced out. Client 2&apos;s data stands. The zombie can&apos;t corrupt anything.
                </>
              ) : (
                <>
                  <strong className="text-fault">Corruption.</strong> With no fencing token, the server can&apos;t
                  tell the resurrected Client 1 is stale. Its old write overwrites Client 2&apos;s — split-brain
                  data loss, raised as no error at all.
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Stored value" value={<span className="text-sm">{stored}</span>} tone={accepted ? "fault" : step >= 3 ? "special" : "default"} />
        <Stat label="Server max token" value={serverToken || "—"} tone="ok" />
        <Stat
          label="Integrity"
          value={accepted ? "VIOLATED" : staleArrives ? "intact" : "—"}
          tone={accepted ? "fault" : "ok"}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={next} disabled={step >= 4}>
          <IconStep size={14} /> {step >= 4 ? "Storyboard complete" : "Next step"}
        </Button>
        <Button onClick={reset} variant="ghost" size="sm">
          <IconReset size={13} /> Restart
        </Button>
        <span className="self-center font-mono text-[11px] text-fg-faint">
          flip fencing off, replay, and watch the zombie write land
        </span>
      </div>
    </div>
  );
}
