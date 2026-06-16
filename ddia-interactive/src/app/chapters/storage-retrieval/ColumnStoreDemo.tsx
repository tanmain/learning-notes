"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SegmentedControl, Toggle, Stat, CodeBlock } from "@/components/chapter";

/* ------------------------------------------------------------------ model */

type Layout = "row" | "column";

type Col = { key: string; label: string; cardinality: number; cells: string[] };

/** A tiny fact table: 8 rows of a "sales" event stream. */
const ROWS = 8;
const COLUMNS: Col[] = [
  { key: "id", label: "id", cardinality: 8, cells: ["1", "2", "3", "4", "5", "6", "7", "8"] },
  {
    key: "product",
    label: "product",
    cardinality: 3,
    cells: ["book", "book", "pen", "book", "pen", "mug", "book", "pen"],
  },
  {
    key: "country",
    label: "country",
    cardinality: 2,
    cells: ["US", "US", "DE", "DE", "US", "US", "DE", "US"],
  },
  { key: "qty", label: "qty", cardinality: 5, cells: ["2", "1", "3", "1", "5", "2", "1", "4"] },
  {
    key: "price",
    label: "price",
    cardinality: 6,
    cells: ["19", "19", "4", "19", "4", "9", "19", "4"],
  },
];

const QUERY_COLS = ["product", "qty"] as const; // SELECT product, SUM(qty) ...
const NEEDED: ReadonlySet<string> = new Set(QUERY_COLS);
/** "bytes" model: 1 unit per cell. Compression on a column ~ distinct-runs. */
const TOTAL_CELLS = COLUMNS.length * ROWS;

export function ColumnStoreDemo() {
  const [layout, setLayout] = useState<Layout>("column");
  const [compress, setCompress] = useState<boolean>(true);

  const scanned = useMemo(() => {
    if (layout === "row") {
      // row store must read every field of every row, then discard unused
      return TOTAL_CELLS;
    }
    // column store reads only the needed columns
    let units = 0;
    for (const c of COLUMNS) {
      if (!NEEDED.has(c.key)) continue;
      units += compress ? c.cardinality : ROWS; // pay per distinct value when compressed
    }
    return units;
  }, [layout, compress]);

  const saved = Math.round((1 - scanned / TOTAL_CELLS) * 100);

  return (
    <div className="space-y-5">
      <CodeBlock
        lang="sql"
        code={`SELECT product, SUM(qty)\nFROM sales\nGROUP BY product;   -- touches 2 of 5 columns`}
      />

      <div className="flex flex-wrap items-center gap-4">
        <SegmentedControl<Layout>
          value={layout}
          onChange={setLayout}
          options={[
            { label: "Row-oriented", value: "row" },
            { label: "Column-oriented", value: "column" },
          ]}
        />
        <Toggle label="Column compression" checked={compress} onChange={setCompress} />
      </div>

      {/* the storage layout */}
      <div className="rounded-lg border border-line bg-ink-950/40 p-4">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
          {layout === "row" ? "rows laid contiguously on disk" : "columns laid contiguously on disk"}
        </div>

        {layout === "row" ? (
          <div className="space-y-1.5">
            {Array.from({ length: ROWS }).map((_, r) => (
              <div key={r} className="flex flex-wrap gap-1">
                <span className="w-12 shrink-0 py-0.5 font-mono text-[10px] text-fg-faint">row {r + 1}</span>
                {COLUMNS.map((c) => {
                  const read = NEEDED.has(c.key);
                  return (
                    <motion.span
                      key={c.key}
                      initial={{ opacity: read ? 1 : 0.28 }}
                      animate={{ opacity: read ? 1 : 0.28 }}
                      className={
                        "rounded border px-1.5 py-0.5 font-mono text-[10px] " +
                        (read
                          ? "border-info/50 bg-info/10 text-info"
                          : "border-line bg-ink-850 text-fg-faint")
                      }
                    >
                      {c.cells[r]}
                    </motion.span>
                  );
                })}
              </div>
            ))}
            <p className="mt-2 font-mono text-[10px] text-warn">
              The disk read pulls in <span className="text-fault">every field of every row</span>; the
              unused columns (dimmed) are parsed and thrown away.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {COLUMNS.map((c) => {
              const read = NEEDED.has(c.key);
              // run-length view when compressing
              const runs: { v: string; n: number }[] = [];
              for (const v of c.cells) {
                const last = runs[runs.length - 1];
                if (last && last.v === v) last.n += 1;
                else runs.push({ v, n: 1 });
              }
              return (
                <motion.div
                  key={c.key}
                  initial={{ opacity: read ? 1 : 0.3 }}
                  animate={{ opacity: read ? 1 : 0.3 }}
                  className={
                    "flex items-center gap-2 rounded-md border p-2 " +
                    (read ? "border-accent/40 bg-accent/5" : "border-line bg-ink-900/40")
                  }
                >
                  <span className="w-16 shrink-0 font-mono text-[10px] accent-text">{c.label}</span>
                  <div className="flex flex-wrap gap-1">
                    {compress
                      ? runs.map((run, i) => (
                          <span
                            key={i}
                            className="rounded border border-line bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted"
                          >
                            {run.v}
                            {run.n > 1 && <span className="text-ok">×{run.n}</span>}
                          </span>
                        ))
                      : c.cells.map((cell, i) => (
                          <span
                            key={i}
                            className="rounded border border-line bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted"
                          >
                            {cell}
                          </span>
                        ))}
                  </div>
                </motion.div>
              );
            })}
            <p className="mt-1 font-mono text-[10px] text-ok">
              Only <span className="accent-text">product</span> and <span className="accent-text">qty</span>{" "}
              are read.{" "}
              {compress
                ? "Run-length encoding collapses repeated values — fewer bytes off disk."
                : "Toggle compression to collapse repeated values."}
            </p>
          </div>
        )}
      </div>

      {/* metrics */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Cells on disk" value={TOTAL_CELLS} tone="default" />
        <Stat label="Cells actually read" value={scanned} tone={layout === "row" ? "fault" : "ok"} />
        <Stat
          label="I/O avoided"
          value={layout === "row" ? 0 : saved}
          unit="%"
          tone={layout === "row" ? "warn" : "accent"}
        />
      </div>

      {/* bar comparison */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 font-mono text-[10px] text-fg-faint">read</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-ink-800">
            <motion.div
              className="h-full rounded"
              style={{ background: layout === "row" ? "var(--color-fault)" : "var(--accent)" }}
              animate={{ width: `${(scanned / TOTAL_CELLS) * 100}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
            />
          </div>
          <span className="w-10 text-right font-mono text-[10px] text-fg-muted">{scanned}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 font-mono text-[10px] text-fg-faint">total</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-ink-800">
            <div className="h-full w-full rounded bg-ink-700" />
          </div>
          <span className="w-10 text-right font-mono text-[10px] text-fg-muted">{TOTAL_CELLS}</span>
        </div>
      </div>
    </div>
  );
}
