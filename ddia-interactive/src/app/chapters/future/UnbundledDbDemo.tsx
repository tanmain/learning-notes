"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button, Toggle, Stat } from "@/components/chapter";

/**
 * The unbundled database / dataflow visualizer — the centerpiece.
 *
 * A single append-only EVENT LOG is the source of truth. Several DERIVED
 * CONSUMERS each fold the log into their own read-optimised view:
 *   - search index  (set of indexed titles)
 *   - cache          (latest value per key)
 *   - aggregate      (running count / sum)
 *
 * The user can:
 *   - append product events to the log
 *   - ADD A NEW consumer at any time and watch it REPROCESS the whole log
 *     from offset 0 to rebuild its state (the key "reprocessing" idea)
 *   - CRASH a consumer and watch its view go STALE while the others stay live —
 *     the asynchronous log contains the fault locally (fault isolation). Restart
 *     it and it simply catches back up; it never blocked the writer or its peers.
 *   - toggle IDEMPOTENCE to see why deterministic + idempotent derivation is
 *     what keeps every view correct even when the same event is delivered twice.
 */

type EventKind = "create" | "price" | "delete";
type LogEvent = {
  offset: number;
  kind: EventKind;
  sku: string;
  title: string;
  price: number;
  /** A duplicate of an earlier event (same op id) injected to test idempotence. */
  dupOf?: number;
};

type ConsumerId = "search" | "cache" | "agg";

type Consumer = {
  id: ConsumerId;
  name: string;
  sub: string;
  color: string;
  /** offset of the next event this consumer will read (its "cursor"). */
  cursor: number;
  /** offsets already applied — used for idempotent de-duplication. */
  applied: Set<number>;
  /** A crashed consumer stops advancing its cursor — its view goes stale. */
  crashed: boolean;
};

const COLORS: Record<ConsumerId, string> = {
  search: "var(--accent)",
  cache: "var(--accent-2)",
  agg: "var(--color-special)",
};

const CATALOG = [
  { sku: "kbd", title: "Mechanical Keyboard", price: 89 },
  { sku: "mse", title: "Wireless Mouse", price: 39 },
  { sku: "mon", title: "4K Monitor", price: 320 },
  { sku: "cam", title: "Webcam Pro", price: 75 },
  { sku: "hub", title: "USB-C Hub", price: 45 },
];

function freshConsumer(id: ConsumerId): Consumer {
  const meta: Record<ConsumerId, { name: string; sub: string }> = {
    search: { name: "search index", sub: "indexed titles" },
    cache: { name: "cache / KV", sub: "latest price by SKU" },
    agg: { name: "aggregate", sub: "live catalog size + value" },
  };
  return { id, ...meta[id], color: COLORS[id], cursor: 0, applied: new Set(), crashed: false };
}

/** Pure, deterministic fold of the log up to a consumer's cursor. */
function project(id: ConsumerId, log: LogEvent[], upto: number, idempotent: boolean) {
  // De-duplicate by the *original* op id when idempotent; otherwise apply blindly.
  const seen = new Set<number>();
  const slice = log.slice(0, upto).filter((e) => {
    const opId = e.dupOf ?? e.offset;
    if (idempotent) {
      if (seen.has(opId)) return false;
      seen.add(opId);
    }
    return true;
  });

  if (id === "search") {
    const titles = new Map<string, string>();
    for (const e of slice) {
      if (e.kind === "delete") titles.delete(e.sku);
      else titles.set(e.sku, e.title);
    }
    return { type: "search" as const, titles: [...titles.values()] };
  }
  if (id === "cache") {
    const prices = new Map<string, number>();
    for (const e of slice) {
      if (e.kind === "delete") prices.delete(e.sku);
      else prices.set(e.sku, e.price);
    }
    return { type: "cache" as const, prices: [...prices.entries()] };
  }
  // aggregate — a running counter folded over the stream. Unlike the set/map
  // projections above (which are naturally last-write-wins per key), this one
  // is ADDITIVE, so a duplicate delivery double-counts when dedup is off — which
  // is exactly why the idempotence toggle visibly matters here.
  const live = new Map<string, number>();
  let applied = 0;
  for (const e of slice) {
    applied += 1;
    if (e.kind === "delete") live.delete(e.sku);
    else live.set(e.sku, e.price);
  }
  const count = live.size;
  const value = [...live.values()].reduce((a, b) => a + b, 0);
  return { type: "agg" as const, count, value, applied };
}

export function UnbundledDbDemo() {
  const [log, setLog] = useState<LogEvent[]>([]);
  const [consumers, setConsumers] = useState<Consumer[]>([
    freshConsumer("search"),
    freshConsumer("cache"),
  ]);
  const [idempotent, setIdempotent] = useState(true);
  const [nextSku, setNextSku] = useState(0);
  /** When live, healthy consumers stream the log automatically (real dataflow). */
  const [live, setLive] = useState(true);

  const append = useCallback((evt: Omit<LogEvent, "offset">) => {
    setLog((prev) => [...prev, { ...evt, offset: prev.length }]);
  }, []);

  const addProduct = useCallback(() => {
    const item = CATALOG[nextSku % CATALOG.length];
    setNextSku((n) => n + 1);
    append({ kind: "create", sku: item.sku, title: item.title, price: item.price });
  }, [append, nextSku]);

  const changePrice = useCallback(() => {
    setLog((prev) => {
      const live = prev.filter((e) => e.kind !== "delete");
      if (live.length === 0) return prev;
      const target = live[live.length - 1];
      const delta = [-10, -5, 5, 12, 20][prev.length % 5];
      return [
        ...prev,
        {
          offset: prev.length,
          kind: "price",
          sku: target.sku,
          title: target.title,
          price: Math.max(5, target.price + delta),
        },
      ];
    });
  }, []);

  const deleteLast = useCallback(() => {
    setLog((prev) => {
      const live = prev.filter((e) => e.kind !== "delete");
      if (live.length === 0) return prev;
      const target = live[live.length - 1];
      return [
        ...prev,
        { offset: prev.length, kind: "delete", sku: target.sku, title: target.title, price: target.price },
      ];
    });
  }, []);

  /** Inject a duplicate delivery of the most recent event (tests idempotence). */
  const injectDuplicate = useCallback(() => {
    setLog((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      return [...prev, { ...last, offset: prev.length, dupOf: last.dupOf ?? last.offset }];
    });
  }, []);

  /**
   * Advance every *healthy* consumer's cursor toward the head of the log.
   * `step` lets the live ticker move one offset at a time so you can watch a
   * crashed consumer fall further behind; the manual button passes Infinity to
   * fully catch up. Crashed consumers are skipped — that is the fault isolation.
   */
  const flush = useCallback(
    (step = Infinity) => {
      setConsumers((prev) =>
        prev.map((c) => {
          if (c.crashed || c.cursor >= log.length) return c;
          const target = Math.min(log.length, c.cursor + step);
          const applied = new Set(c.applied);
          for (let o = c.cursor; o < target; o++) applied.add(o);
          return { ...c, cursor: target, applied };
        })
      );
    },
    [log.length]
  );

  /** Add a brand-new derived consumer; it starts at offset 0 and reprocesses. */
  const addConsumer = useCallback(
    (id: ConsumerId) => {
      setConsumers((prev) => {
        if (prev.some((c) => c.id === id)) return prev;
        return [...prev, freshConsumer(id)];
      });
    },
    []
  );

  const removeConsumer = useCallback((id: ConsumerId) => {
    setConsumers((prev) => prev.filter((c) => c.id !== id));
  }, []);

  /** Replay one consumer from scratch (rebuild its state from the log). */
  const reprocess = useCallback((id: ConsumerId) => {
    setConsumers((prev) => prev.map((c) => (c.id === id ? freshConsumer(id) : c)));
  }, []);

  /** Crash a consumer: it stops reading the log, so its view goes stale. */
  const crashConsumer = useCallback((id: ConsumerId) => {
    setConsumers((prev) => prev.map((c) => (c.id === id ? { ...c, crashed: true } : c)));
  }, []);

  /** Restart a crashed consumer: it resumes from its saved cursor and catches up. */
  const restartConsumer = useCallback((id: ConsumerId) => {
    setConsumers((prev) => prev.map((c) => (c.id === id ? { ...c, crashed: false } : c)));
  }, []);

  const reset = useCallback(() => {
    setLog([]);
    setConsumers([freshConsumer("search"), freshConsumer("cache")]);
    setNextSku(0);
    setIdempotent(true);
    setLive(true);
  }, []);

  /**
   * The live dataflow ticker. While "live", healthy consumers stream the log one
   * offset at a time on a short interval — so the moment you crash one, you watch
   * its lag grow while every other view keeps tracking the head.
   */
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => flushRef.current(1), 550);
    return () => window.clearInterval(t);
  }, [live]);

  const head = log.length;
  const lagging = consumers.some((c) => !c.crashed && c.cursor < head);
  const anyStale = consumers.some((c) => c.crashed && c.cursor < head);
  const dupCount = log.filter((e) => e.dupOf !== undefined).length;

  const available = (["search", "cache", "agg"] as ConsumerId[]).filter(
    (id) => !consumers.some((c) => c.id === id)
  );

  return (
    <div className="space-y-5">
      {/* ---- write controls ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={addProduct}>+ product</Button>
        <Button size="sm" variant="outline" onClick={changePrice} disabled={head === 0}>
          change price
        </Button>
        <Button size="sm" variant="outline" onClick={deleteLast} disabled={head === 0}>
          delete item
        </Button>
        <Button size="sm" variant="ghost" onClick={injectDuplicate} disabled={head === 0} title="Deliver the most recent event a second time">
          inject duplicate
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <Toggle label="live dataflow" checked={live} onChange={setLive} />
          <Toggle label="idempotent" checked={idempotent} onChange={setIdempotent} />
          <Button size="sm" variant="ghost" onClick={reset}>reset</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,200px)_1fr]">
        {/* ---- the log spine ---- */}
        <div className="panel flex flex-col overflow-hidden p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="kicker">event log</span>
            <span className="font-mono text-[10px] accent-text">head @ {head}</span>
          </div>
          <div className="flex max-h-[280px] flex-col-reverse gap-1 overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {log.map((e) => (
                <motion.div
                  key={e.offset}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 rounded border px-2 py-1.5 font-mono text-[11px]"
                  style={{
                    borderColor:
                      e.dupOf !== undefined ? "var(--color-warn)" : "var(--color-line)",
                    background:
                      e.dupOf !== undefined
                        ? "color-mix(in oklab, var(--color-warn) 10%, var(--color-ink-850))"
                        : "var(--color-ink-850)",
                  }}
                >
                  <span className="text-fg-faint">#{String(e.offset).padStart(2, "0")}</span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] uppercase"
                    style={{
                      color:
                        e.kind === "delete"
                          ? "var(--color-fault)"
                          : e.kind === "price"
                            ? "var(--color-info)"
                            : "var(--accent)",
                      background: "var(--color-ink-800)",
                    }}
                  >
                    {e.kind}
                  </span>
                  <span className="truncate text-fg-muted">{e.sku}</span>
                  {e.kind !== "delete" && <span className="ml-auto text-fg">${e.price}</span>}
                  {e.dupOf !== undefined && (
                    <span className="ml-auto text-[9px] text-warn">dup #{e.dupOf}</span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {head === 0 && (
              <p className="py-6 text-center font-mono text-[11px] text-fg-faint">
                empty — append an event
              </p>
            )}
          </div>
        </div>

        {/* ---- derived consumers ---- */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="kicker">derived views</span>
            <div className="ml-auto flex items-center gap-2">
              {live ? (
                <span className="font-mono text-[10px] text-fg-faint">streaming live · crash one to see it stall</span>
              ) : (
                <Button
                  size="sm"
                  onClick={() => flush(Infinity)}
                  disabled={!lagging}
                  variant={lagging ? "solid" : "ghost"}
                >
                  {lagging ? "apply pending →" : "all caught up"}
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <AnimatePresence>
              {consumers.map((c) => (
                <ConsumerCard
                  key={c.id}
                  consumer={c}
                  log={log}
                  head={head}
                  idempotent={idempotent}
                  onReprocess={() => reprocess(c.id)}
                  onRemove={() => removeConsumer(c.id)}
                  onCrash={() => crashConsumer(c.id)}
                  onRestart={() => restartConsumer(c.id)}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* add-a-new-consumer tray */}
          {available.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line p-3">
              <span className="font-mono text-[11px] text-fg-faint">add a new consumer:</span>
              {available.map((id) => (
                <Button key={id} size="sm" variant="outline" onClick={() => addConsumer(id)}>
                  + {freshConsumer(id).name}
                </Button>
              ))}
              <span className="w-full font-mono text-[10px] text-fg-faint sm:w-auto sm:ml-auto">
                it rebuilds from offset 0 by replaying the log
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ---- status line ---- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="log offsets" value={head} tone="accent" />
        <Stat
          label="stale views"
          value={anyStale ? consumers.filter((c) => c.crashed).length : 0}
          tone={anyStale ? "warn" : "ok"}
        />
        <Stat label="duplicates sent" value={dupCount} tone={dupCount > 0 && !idempotent ? "fault" : "default"} />
        <Stat
          label="integrity"
          value={!idempotent && dupCount > 0 ? "diverged" : "intact"}
          tone={!idempotent && dupCount > 0 ? "fault" : "ok"}
        />
      </div>

      <p className="font-mono text-[10.5px] leading-relaxed text-fg-faint">
        {anyStale ? (
          <>
            A crashed consumer&apos;s view is <span className="text-warn">stale</span> — but the writer kept
            appending and every healthy view stayed live. The fault is contained locally; restart the consumer and
            it replays from its saved cursor to catch up. This isolation is exactly what an asynchronous log buys
            you over a distributed transaction, where one stuck participant blocks everyone.
          </>
        ) : (
          <>
            One immutable log, many derived views — each folding the same events into its own shape. Crash a view
            to watch the fault stay contained; add a new one to watch it rebuild from offset 0.
          </>
        )}
      </p>
    </div>
  );
}

function ConsumerCard({
  consumer,
  log,
  head,
  idempotent,
  onReprocess,
  onRemove,
  onCrash,
  onRestart,
}: {
  consumer: Consumer;
  log: LogEvent[];
  head: number;
  idempotent: boolean;
  onReprocess: () => void;
  onRemove: () => void;
  onCrash: () => void;
  onRestart: () => void;
}) {
  const view = useMemo(
    () => project(consumer.id, log, consumer.cursor, idempotent),
    [consumer.id, consumer.cursor, log, idempotent]
  );
  const lag = head - consumer.cursor;
  const pct = head === 0 ? 100 : Math.round((consumer.cursor / head) * 100);
  const stale = consumer.crashed && lag > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: consumer.crashed ? 0.82 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="flex flex-col rounded-lg border bg-ink-900/60 p-3"
      style={{
        borderColor: consumer.crashed
          ? "color-mix(in oklab, var(--color-fault) 55%, var(--color-line))"
          : `color-mix(in oklab, ${consumer.color} 40%, var(--color-line))`,
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold" style={{ color: consumer.crashed ? "var(--color-fault)" : consumer.color }}>
              {consumer.name}
            </span>
            {consumer.crashed && (
              <span className="rounded bg-fault/15 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wide text-fault">
                crashed
              </span>
            )}
          </div>
          <div className="font-mono text-[10px] text-fg-faint">{consumer.sub}</div>
        </div>
        <div className="flex items-center gap-1">
          {consumer.crashed ? (
            <button
              type="button"
              onClick={onRestart}
              title="Restart: resume from the saved cursor and catch up"
              className="rounded border border-ok/50 px-1.5 py-0.5 font-mono text-[9px] uppercase text-ok transition-colors hover:bg-ok/10"
            >
              restart
            </button>
          ) : (
            <button
              type="button"
              onClick={onCrash}
              title="Crash this consumer — its view goes stale while the others stay live"
              className="rounded border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase text-fg-faint transition-colors hover:border-fault hover:text-fault"
            >
              crash
            </button>
          )}
          <button
            type="button"
            onClick={onReprocess}
            title="Reprocess: rebuild this view from offset 0"
            className="rounded border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase text-fg-faint transition-colors hover:border-line-strong hover:text-fg"
          >
            reprocess
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Remove this consumer"
            className="rounded border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase text-fg-faint transition-colors hover:border-fault hover:text-fault"
          >
            ✕
          </button>
        </div>
      </div>

      {/* cursor progress */}
      <div className="mb-2">
        <div className="mb-1 flex justify-between font-mono text-[9px] text-fg-faint">
          <span>cursor @ {consumer.cursor}/{head}</span>
          <span style={{ color: stale ? "var(--color-fault)" : lag > 0 ? "var(--color-warn)" : "var(--color-ok)" }}>
            {stale ? `${lag} stale` : lag > 0 ? `${lag} behind` : "live"}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-ink-700">
          <motion.div
            className="h-full rounded-full"
            style={{ background: consumer.crashed ? "var(--color-fault)" : consumer.color }}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 26 }}
          />
        </div>
      </div>

      {/* the projected state */}
      <div className="min-h-[64px] rounded border border-line bg-ink-950/60 p-2 font-mono text-[11px]">
        {view.type === "search" && (
          <div className="flex flex-wrap gap-1">
            {view.titles.length === 0 ? (
              <span className="text-fg-faint">∅ no documents</span>
            ) : (
              view.titles.map((t) => (
                <span key={t} className="rounded bg-ink-800 px-1.5 py-0.5 text-fg-muted">
                  {t}
                </span>
              ))
            )}
          </div>
        )}
        {view.type === "cache" && (
          <div className="space-y-0.5">
            {view.prices.length === 0 ? (
              <span className="text-fg-faint">∅ empty</span>
            ) : (
              view.prices.map(([sku, p]) => (
                <div key={sku} className="flex justify-between">
                  <span className="text-fg-muted">{sku}</span>
                  <span className="text-fg">${p}</span>
                </div>
              ))
            )}
          </div>
        )}
        {view.type === "agg" && (
          <div className="flex h-full items-center justify-around">
            <div className="text-center">
              <div className="text-lg" style={{ color: consumer.color }}>{view.count}</div>
              <div className="text-[9px] text-fg-faint">live items</div>
            </div>
            <div className="text-center">
              <div className="text-lg" style={{ color: consumer.color }}>${view.value}</div>
              <div className="text-[9px] text-fg-faint">value</div>
            </div>
            <div className="text-center">
              <div className="text-lg" style={{ color: consumer.color }}>{view.applied}</div>
              <div className="text-[9px] text-fg-faint">events folded</div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
