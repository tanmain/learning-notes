"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button, SegmentedControl, Stat, Toggle } from "@/components/chapter";

/**
 * The end-to-end argument for exactly-once / effectively-once semantics.
 *
 * A client submits a "charge $10" request. The network is flaky, so the
 * client RETRIES on timeout. Two strategies:
 *   - "naive": the request carries no operation id. Every delivery that
 *     reaches the database is applied -> double charges on retry.
 *   - "op-id" (end-to-end): the client mints ONE request id up front and
 *     re-sends it on retry. The database dedupes by request id, so the charge
 *     is applied exactly once no matter how many times it arrives.
 *
 * The point of the chapter: lower-level reliability (TCP retransmission) does
 * NOT solve this — duplicate *requests* (timeout + resend) slip past it. Only
 * an id threaded from the client all the way to the storage layer does.
 */

type Strategy = "naive" | "opid";
type Stage = "client" | "wire" | "db";

type Packet = {
  id: number;
  opId: string;
  attempt: number;
  stage: Stage;
  fate: "pending" | "applied" | "deduped" | "lost";
};

let pid = 0;

export function EndToEndDemo() {
  const [strategy, setStrategy] = useState<Strategy>("naive");
  const [lossy, setLossy] = useState(true);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [balance, setBalance] = useState(0);
  const [charges, setCharges] = useState(0);
  const [sends, setSends] = useState(0);
  // The set of op-ids the "database" has already applied. A ref so the dedup
  // decision is read synchronously on arrival (no nested setState updaters).
  const appliedOps = useRef<Set<string>>(new Set());
  const opCounter = useRef(0);

  /** Fire one request that may be retried. opId is stable across retries. */
  const fire = useCallback(
    (opId: string, attempt: number) => {
      const id = ++pid;
      setSends((s) => s + 1);
      setPackets((prev) => [
        ...prev,
        { id, opId, attempt, stage: "client", fate: "pending" },
      ]);

      // travel: client -> wire
      window.setTimeout(() => {
        setPackets((prev) => prev.map((p) => (p.id === id ? { ...p, stage: "wire" } : p)));
      }, 350);

      // on the wire: maybe drop (simulating a timeout that triggers a retry)
      const dropped = lossy && Math.random() < 0.45;
      window.setTimeout(() => {
        if (dropped) {
          setPackets((prev) => prev.map((p) => (p.id === id ? { ...p, stage: "wire", fate: "lost" } : p)));
          // client times out and retries with the SAME opId (end-to-end id survives)
          window.setTimeout(() => fire(opId, attempt + 1), 500);
          return;
        }
        // reaches the DB
        setPackets((prev) => prev.map((p) => (p.id === id ? { ...p, stage: "db" } : p)));

        // the database's exactly-once decision, made synchronously on arrival
        const isDup = strategy === "opid" && appliedOps.current.has(opId);
        if (isDup) {
          setPackets((prev) => prev.map((p) => (p.id === id ? { ...p, fate: "deduped" } : p)));
          return;
        }
        if (strategy === "opid") appliedOps.current.add(opId);
        setBalance((b) => b + 10);
        setCharges((c) => c + 1);
        setPackets((prev) => prev.map((p) => (p.id === id ? { ...p, fate: "applied" } : p)));
      }, 800);
    },
    [lossy, strategy]
  );

  const submit = useCallback(() => {
    const opId = `op-${String(++opCounter.current).padStart(3, "0")}`;
    fire(opId, 1);
  }, [fire]);

  const reset = useCallback(() => {
    setPackets([]);
    appliedOps.current = new Set();
    setBalance(0);
    setCharges(0);
    setSends(0);
    opCounter.current = 0;
  }, []);

  const intended = opCounter.current;
  const overcharged = charges > intended;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<Strategy>
          value={strategy}
          onChange={(v) => {
            setStrategy(v);
            reset();
          }}
          options={[
            { label: "naive (no id)", value: "naive" },
            { label: "end-to-end op-id", value: "opid" },
          ]}
        />
        <Toggle label="flaky network" checked={lossy} onChange={setLossy} />
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={submit}>submit “charge $10”</Button>
          <Button size="sm" variant="ghost" onClick={reset}>reset</Button>
        </div>
      </div>

      {/* the three stages */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {(["client", "wire", "db"] as Stage[]).map((stage) => (
          <div key={stage} className="panel relative min-h-[150px] overflow-hidden p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="kicker">
                {stage === "client" ? "browser" : stage === "wire" ? "network" : "database"}
              </span>
              {stage === "db" && (
                <span className="font-mono text-[10px] accent-text">dedupe: {strategy === "opid" ? "on" : "off"}</span>
              )}
            </div>
            <div className="flex flex-wrap content-start gap-1.5">
              <AnimatePresence>
                {packets
                  .filter((p) => p.stage === stage)
                  .map((p) => (
                    <motion.div
                      key={p.id}
                      layout
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      title={`${p.opId} · attempt ${p.attempt}`}
                      className="flex flex-col items-center rounded border px-1.5 py-1 font-mono text-[9px]"
                      style={{
                        borderColor: fateColor(p.fate),
                        background: `color-mix(in oklab, ${fateColor(p.fate)} 14%, var(--color-ink-850))`,
                        color: fateColor(p.fate),
                      }}
                    >
                      <span className="font-bold">{p.opId}</span>
                      <span className="opacity-70">
                        {p.fate === "applied"
                          ? "✓ applied"
                          : p.fate === "deduped"
                            ? "↺ deduped"
                            : p.fate === "lost"
                              ? "✕ timed out"
                              : `try ${p.attempt}`}
                      </span>
                    </motion.div>
                  ))}
              </AnimatePresence>
            </div>
            {/* flow arrow */}
            {stage !== "db" && (
              <div className="pointer-events-none absolute right-[-7px] top-1/2 z-10 -translate-y-1/2 text-fg-faint">
                →
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ledger */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="user intended" value={intended} unit="charges" tone="info" />
        <Stat label="actually charged" value={charges} tone={overcharged ? "fault" : "ok"} />
        <Stat label="account balance" value={`$${balance}`} tone={overcharged ? "fault" : "accent"} />
        <Stat label="packets sent" value={sends} tone="default" />
      </div>

      <div
        className="rounded-lg border-l-2 px-4 py-3 text-[13px] leading-relaxed"
        style={{
          borderColor: overcharged ? "var(--color-fault)" : "var(--color-ok)",
          background: overcharged
            ? "color-mix(in oklab, var(--color-fault) 9%, var(--color-ink-850))"
            : "color-mix(in oklab, var(--color-ok) 9%, var(--color-ink-850))",
          color: "var(--color-fg)",
        }}
      >
        {strategy === "naive" ? (
          overcharged ? (
            <>
              <strong className="text-fault">Double-charged.</strong> A timed-out request was resent, but the
              first delivery had <em>already</em> succeeded — the database had no way to tell the retry from a
              genuinely new charge. TCP retransmission can&apos;t save you here: the duplicate is a duplicate{" "}
              <em>request</em>, not a duplicate packet.
            </>
          ) : (
            <>Submit a few requests on a flaky network. Without an end-to-end id, each retry that lands is a brand-new charge — wait for a double-charge.</>
          )
        ) : (
          <>
            <strong className="text-ok">Exactly-once, effectively.</strong> The client mints one{" "}
            <code>op-id</code> and re-sends <em>that same id</em> on every retry. The database remembers which ids
            it has applied, so duplicate deliveries are <em>deduped</em> — the charge happens once no matter how
            many copies arrive. The id is threaded end-to-end, from browser to storage.
          </>
        )}
      </div>
    </div>
  );
}

function fateColor(fate: Packet["fate"]): string {
  switch (fate) {
    case "applied":
      return "var(--accent)";
    case "deduped":
      return "var(--color-info)";
    case "lost":
      return "var(--color-warn)";
    default:
      return "var(--color-fg-muted)";
  }
}
