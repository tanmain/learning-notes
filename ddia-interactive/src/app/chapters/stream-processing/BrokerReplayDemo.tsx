"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button, Stat } from "@/components/chapter";

/**
 * Hands-on log-based broker: the reader DRIVES everything.
 *
 * Unlike the auto-running LogConsumerDemo (which shows lag + segment trimming),
 * this one is fully manual so you can feel the mechanics DDIA describes:
 *
 *  - APPEND events to a single append-only partition. Each gets the next
 *    monotonically increasing offset. Reading never deletes, so the log only
 *    grows here (no trimming) — the point is offsets, fan-out, and replay.
 *  - TWO INDEPENDENT CONSUMER GROUPS read the SAME log at their OWN committed
 *    offsets ("analytics" and "search-index"). Step either one forward to
 *    consume the next record; its committed offset is the high-water mark of
 *    what it has processed. Fan-out is free: advancing one never affects the
 *    other (this is the whole advantage over destructive AMQP/JMS reads).
 *  - REPLAY a group from offset 0 to re-derive its state from history — the
 *    same log, read again, with zero producer involvement. This is exactly how
 *    you rebuild a search index or warehouse from a Kafka topic.
 *  - CRASH + RESTART a group to show at-least-once delivery: a group that
 *    processed records but had not yet *committed* the offset reprocesses them
 *    on restart (DDIA: "those messages will be processed a second time").
 *
 * The visual is the log as a row of offset cells with each group's cursor
 * pinned under the next offset it will read.
 */

type EventKind = "click" | "purchase" | "signup";

type LogEvent = { offset: number; kind: EventKind; key: string };

type Group = {
  id: "analytics" | "search";
  label: string;
  color: string;
  /** next offset to read; everything below it is committed/processed */
  committed: number;
  /** offset already read-but-not-yet-committed (uncommitted progress) */
  inflight: number;
};

const KIND_META: Record<EventKind, { glyph: string; tone: string; label: string }> = {
  click: { glyph: "▷", tone: "var(--accent)", label: "click" },
  purchase: { glyph: "$", tone: "var(--color-ok)", label: "purchase" },
  signup: { glyph: "+", tone: "var(--accent-2)", label: "signup" },
};

// A small deterministic seed so the log starts non-empty and legible.
const SEED: LogEvent[] = [
  { offset: 0, kind: "signup", key: "u17" },
  { offset: 1, kind: "click", key: "u17" },
  { offset: 2, kind: "click", key: "u4" },
  { offset: 3, kind: "purchase", key: "u17" },
  { offset: 4, kind: "click", key: "u4" },
];

const KEYS = ["u4", "u17", "u23", "u31", "u8"];
const KIND_CYCLE: EventKind[] = ["click", "click", "purchase", "signup", "click"];

const VISIBLE = 14;

export function BrokerReplayDemo() {
  const [log, setLog] = useState<LogEvent[]>(SEED);
  const [groups, setGroups] = useState<Group[]>([
    { id: "analytics", label: "analytics", color: "var(--color-special)", committed: 5, inflight: 5 },
    { id: "search", label: "search-index", color: "var(--accent-2)", committed: 2, inflight: 2 },
  ]);
  const appendCount = useRef(SEED.length);

  const head = log.length; // next offset the producer will write

  const append = (kind?: EventKind) => {
    setLog((l) => {
      const off = l.length;
      const k = kind ?? KIND_CYCLE[appendCount.current % KIND_CYCLE.length];
      const key = KEYS[appendCount.current % KEYS.length];
      appendCount.current += 1;
      return [...l, { offset: off, kind: k, key }];
    });
  };

  // Step a group forward by one record: read the record at `committed`, then
  // commit (advance committed). We model the read and the commit as one click
  // for clarity, but track `inflight` so the crash button has something to lose.
  const step = (id: Group["id"]) =>
    setGroups((gs) =>
      gs.map((g) => {
        if (g.id !== id) return g;
        if (g.committed >= head) return g; // at head, nothing new
        return { ...g, committed: g.committed + 1, inflight: g.committed + 1 };
      })
    );

  // Read-without-commit: advance inflight but NOT committed, to set up a crash.
  const readNoCommit = (id: Group["id"]) =>
    setGroups((gs) =>
      gs.map((g) => {
        if (g.id !== id) return g;
        if (g.inflight >= head) return g;
        return { ...g, inflight: g.inflight + 1 };
      })
    );

  // Crash + restart: any uncommitted progress is lost — the group resumes from
  // its last *committed* offset, so read-but-uncommitted records replay.
  const crash = (id: Group["id"]) =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, inflight: g.committed } : g)));

  const replay = (id: Group["id"]) =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, committed: 0, inflight: 0 } : g)));

  const skipToHead = (id: Group["id"]) =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, committed: head, inflight: head } : g)));

  const reset = () => {
    appendCount.current = SEED.length;
    setLog(SEED);
    setGroups([
      { id: "analytics", label: "analytics", color: "var(--color-special)", committed: 5, inflight: 5 },
      { id: "search", label: "search-index", color: "var(--accent-2)", committed: 2, inflight: 2 },
    ]);
  };

  // Derive a per-group running tally (purchases counted) from committed records,
  // proving that "current state = fold over the log up to my offset".
  const purchasesUpTo = (committed: number) =>
    log.slice(0, committed).filter((e) => e.kind === "purchase").length;

  // Window of offsets to render (tail VISIBLE).
  const start = Math.max(0, head - VISIBLE);
  const cells = log.slice(start);

  return (
    <div className="space-y-5">
      {/* Producer controls */}
      <div className="rounded-lg border border-line bg-ink-900/40 p-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
          producer · append to the head of partition 0
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(KIND_META) as EventKind[]).map((k) => (
            <Button key={k} onClick={() => append(k)} variant="outline" size="sm">
              <span style={{ color: KIND_META[k].tone }}>{KIND_META[k].glyph}</span>
              &nbsp;append {KIND_META[k].label}
            </Button>
          ))}
          <Button onClick={reset} variant="ghost" size="sm">
            Reset
          </Button>
        </div>
      </div>

      {/* The log */}
      <div className="rounded-lg border border-line bg-ink-950/60 p-4">
        <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-fg-faint">
          <span>partition 0 — append-only · reading never deletes</span>
          <span>
            head @ <span className="text-accent">offset {head}</span>
          </span>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max items-stretch gap-1">
            {cells.map((e) => {
              const meta = KIND_META[e.kind];
              const aHere = groups[0].committed === e.offset;
              const bHere = groups[1].committed === e.offset;
              return (
                <div key={e.offset} className="flex w-12 flex-col items-center">
                  {/* group A cursor (top) — points at next offset it will read */}
                  <div className="flex h-4 items-end">
                    {aHere && (
                      <span className="font-mono text-[9px] font-bold" style={{ color: groups[0].color }}>
                        ▼A
                      </span>
                    )}
                  </div>
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    className="flex h-12 w-full flex-col items-center justify-center rounded border"
                    style={{ borderColor: meta.tone, background: `color-mix(in oklab, ${meta.tone} 12%, transparent)` }}
                    title={`offset ${e.offset} · ${meta.label} · ${e.key}`}
                  >
                    <span className="font-mono text-[13px] font-bold" style={{ color: meta.tone }}>
                      {meta.glyph}
                    </span>
                    <span className="font-mono text-[8px] text-fg-faint">{e.key}</span>
                  </motion.div>
                  <span className="mt-0.5 font-mono text-[9px] text-fg-faint">{e.offset}</span>
                  {/* group B cursor (bottom) */}
                  <div className="flex h-4 items-start">
                    {bHere && (
                      <span className="font-mono text-[9px] font-bold" style={{ color: groups[1].color }}>
                        ▲B
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {/* head sentinel cell so a cursor sitting at head is visible */}
            <div className="flex w-12 flex-col items-center">
              <div className="flex h-4 items-end">
                {groups[0].committed === head && (
                  <span className="font-mono text-[9px] font-bold" style={{ color: groups[0].color }}>
                    ▼A
                  </span>
                )}
              </div>
              <div className="flex h-12 w-full items-center justify-center rounded border border-dashed border-line">
                <span className="font-mono text-[8px] text-fg-faint">head</span>
              </div>
              <span className="mt-0.5 font-mono text-[9px] text-fg-faint">{head}</span>
              <div className="flex h-4 items-start">
                {groups[1].committed === head && (
                  <span className="font-mono text-[9px] font-bold" style={{ color: groups[1].color }}>
                    ▲B
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-1 text-right font-mono text-[9px] text-fg-faint">
          two consumer groups · independent committed offsets · fan-out is free
        </div>
      </div>

      {/* Consumer groups */}
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((g, i) => {
          const lag = Math.max(0, head - g.committed);
          const willReplay = g.inflight - g.committed; // read-but-uncommitted
          return (
            <div
              key={g.id}
              className="rounded-lg border bg-ink-900/50 p-3"
              style={{ borderColor: `color-mix(in oklab, ${g.color} 45%, var(--color-line))` }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wide" style={{ color: g.color }}>
                  group {i === 0 ? "A" : "B"} · {g.label}
                </span>
                <span className="font-mono text-[10px] text-fg-faint">
                  offset <span style={{ color: g.color }}>{g.committed}</span> / {head}
                </span>
              </div>

              <div className="mb-2 grid grid-cols-2 gap-2">
                <Stat label="Lag" value={lag} unit="off" tone={lag === 0 ? "ok" : lag > 4 ? "warn" : "info"} />
                <Stat label="Purchases seen" value={purchasesUpTo(g.committed)} tone="special" />
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Button onClick={() => step(g.id)} variant="solid" size="sm" disabled={g.committed >= head}>
                  Consume next →
                </Button>
                <Button onClick={() => readNoCommit(g.id)} variant="outline" size="sm" disabled={g.inflight >= head}>
                  Read, don&apos;t commit
                </Button>
                <Button onClick={() => crash(g.id)} variant="ghost" size="sm" disabled={willReplay === 0}>
                  Crash + restart
                </Button>
                <Button onClick={() => replay(g.id)} variant="ghost" size="sm" disabled={g.committed === 0}>
                  Replay from 0
                </Button>
                <Button onClick={() => skipToHead(g.id)} variant="ghost" size="sm" disabled={g.committed >= head}>
                  Skip to head
                </Button>
              </div>

              {willReplay > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-2 font-mono text-[10px] leading-relaxed text-[var(--color-warn)]"
                >
                  {willReplay} record{willReplay > 1 ? "s" : ""} read but not committed — a crash now would{" "}
                  <strong>reprocess</strong> {willReplay === 1 ? "it" : "them"} (at-least-once).
                </motion.p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[13px] leading-relaxed text-fg-muted">
        Append events with the producer, then step each group&apos;s cursor with{" "}
        <span className="accent-text">Consume next</span>. The two groups read the <em>same</em> log at their own
        committed offsets, so advancing one never touches the other — that is free{" "}
        <span className="accent-text">fan-out</span>. Hit <em>Replay from 0</em> to re-derive a group&apos;s state from
        the whole history (rebuilding a search index from the topic), and notice &ldquo;purchases seen&rdquo; equals the
        purchases <em>folded over the log up to that offset</em>. To feel at-least-once delivery, click{" "}
        <em>Read, don&apos;t commit</em> a few times, then <em>Crash + restart</em>: progress rewinds to the last
        committed offset and those records are processed again.
      </p>
    </div>
  );
}
