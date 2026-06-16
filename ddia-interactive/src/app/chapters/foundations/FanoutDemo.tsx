"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Slider, Stat, SegmentedControl } from "@/components/chapter";

/**
 * Twitter fan-out demo — the chapter's load-parameter case study.
 * Two operations: post a tweet (~4.6k/s) and load a home timeline (~300k/s).
 *   Approach 1 — fan-out on READ: posting is a single insert; reading does a big
 *     merge/JOIN across everyone you follow.  Cheap writes, expensive reads.
 *   Approach 2 — fan-out on WRITE: posting writes the tweet into every follower's
 *     precomputed timeline cache; reading is a single lookup. Cheap reads, but a
 *     celebrity post means millions of writes (write amplification).
 *   Hybrid — fan-out on write for normal users, fan-out on read for celebrities.
 */

type Approach = "read" | "write" | "hybrid";

const POST_RATE = 4600; // tweets/sec (avg)
const READ_RATE = 300_000; // timeline loads/sec
const AVG_FOLLOWERS = 200; // for a typical user
const CELEB_THRESHOLD = 1_000_000; // hybrid treats >1M followers as celebrity

function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "k";
  return String(Math.round(n));
}

export function FanoutDemo() {
  const [approach, setApproach] = useState<Approach>("write");
  const [celebFollowers, setCelebFollowers] = useState(30_000_000); // up to 30M

  const model = useMemo(() => {
    // Per-OPERATION work
    let writesPerPost: number; // timeline rows written when *this* celeb posts
    let readWork: number; // rows merged on a home-timeline read
    let postLabel: string;
    let readLabel: string;

    if (approach === "read") {
      writesPerPost = 1; // one global insert
      readWork = AVG_FOLLOWERS; // merge tweets from everyone you follow
      postLabel = "1 insert into the global tweet table";
      readLabel = "merge timelines from ~200 followees on every read";
    } else if (approach === "write") {
      writesPerPost = celebFollowers; // write into every follower's cache
      readWork = 1; // single cache lookup
      postLabel = "write the tweet into every follower's timeline cache";
      readLabel = "1 lookup of a precomputed timeline";
    } else {
      // hybrid: celebrities are read-merged, everyone else is write-fanned
      const isCeleb = celebFollowers >= CELEB_THRESHOLD;
      writesPerPost = isCeleb ? 1 : celebFollowers;
      readWork = isCeleb ? 1 + 50 : 1; // mostly cache + merge a few celeb feeds
      postLabel = isCeleb
        ? "celebrity → skip fan-out; store once, merge at read time"
        : "normal user → fan-out to followers";
      readLabel = isCeleb
        ? "1 cache lookup + merge a handful of celebrity feeds"
        : "1 cache lookup of a precomputed timeline";
    }

    return { writesPerPost, readWork, postLabel, readLabel };
  }, [approach, celebFollowers]);

  // Bar magnitudes (log-ish scale for display)
  const writeBar = Math.min(1, Math.log10(model.writesPerPost + 1) / 8);
  const readBar = Math.min(1, Math.log10(model.readWork + 1) / 8);

  const danger = model.writesPerPost > 5_000_000;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Approach>
          value={approach}
          onChange={setApproach}
          options={[
            { label: "Fan-out on read", value: "read" },
            { label: "Fan-out on write", value: "write" },
            { label: "Hybrid", value: "hybrid" },
          ]}
        />
        <div className="font-mono text-[11px] text-fg-faint">
          post {fmt(POST_RATE)}/s · read {fmt(READ_RATE)}/s
        </div>
      </div>

      <Slider
        label="Followers of the user who just tweeted"
        value={celebFollowers}
        min={200}
        max={30_000_000}
        step={200}
        onChange={setCelebFollowers}
        format={(v) => fmt(v) + " followers"}
      />

      {/* The two operations side by side */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* POST */}
        <div className="rounded-lg border border-line bg-ink-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-fg-muted">Post a tweet</span>
            <span className="font-mono text-[10px] text-fg-faint">write path</span>
          </div>
          <svg viewBox="0 0 300 70" className="w-full">
            <text x={0} y={12} fontSize={10} fill="var(--color-fg-faint)" className="font-mono">
              timeline writes this post triggers
            </text>
            <rect x={0} y={20} width={300} height={16} rx={4} fill="var(--color-ink-800)" />
            <motion.rect
              x={0}
              y={20}
              height={16}
              rx={4}
              fill={danger ? "var(--color-fault)" : "var(--accent)"}
              animate={{ width: Math.max(4, writeBar * 300) }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
            />
            <text x={0} y={56} fontSize={13} fontWeight={700} fill={danger ? "var(--color-fault)" : "var(--accent)"} className="font-mono">
              {fmt(model.writesPerPost)} writes
            </text>
          </svg>
          <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">{model.postLabel}</p>
        </div>

        {/* READ */}
        <div className="rounded-lg border border-line bg-ink-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-fg-muted">Load home timeline</span>
            <span className="font-mono text-[10px] text-fg-faint">read path</span>
          </div>
          <svg viewBox="0 0 300 70" className="w-full">
            <text x={0} y={12} fontSize={10} fill="var(--color-fg-faint)" className="font-mono">
              rows merged per timeline read
            </text>
            <rect x={0} y={20} width={300} height={16} rx={4} fill="var(--color-ink-800)" />
            <motion.rect
              x={0}
              y={20}
              height={16}
              rx={4}
              fill="var(--color-info)"
              animate={{ width: Math.max(4, readBar * 300) }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
            />
            <text x={0} y={56} fontSize={13} fontWeight={700} fill="var(--color-info)" className="font-mono">
              {fmt(model.readWork)} {model.readWork === 1 ? "lookup" : "rows"}
            </text>
          </svg>
          <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">{model.readLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="writes / celeb post" value={fmt(model.writesPerPost)} tone={danger ? "fault" : "accent"} />
        <Stat label="work / timeline read" value={fmt(model.readWork)} tone="info" />
        <Stat
          label="read : write ratio"
          value={`${Math.round(READ_RATE / POST_RATE)}:1`}
          tone="special"
        />
      </div>

      <div className="rounded-lg border border-line bg-ink-900/60 p-4 font-mono text-[13px] leading-relaxed text-fg-muted">
        {approach === "read" && (
          <p>
            <span className="accent-text">Fan-out on read</span> keeps posting trivial, but each of the{" "}
            {fmt(READ_RATE)} reads/sec does a big merge. Reads outnumber writes ~65:1, so this puts the cost on
            the hot path — Twitter found it couldn&apos;t keep up.
          </p>
        )}
        {approach === "write" && !danger && (
          <p>
            <span className="accent-text">Fan-out on write</span> makes reads a single fast lookup. For a typical
            user this is a great trade — you do the work once at write time, not on every read.
          </p>
        )}
        {approach === "write" && danger && (
          <p className="text-fault">
            Write amplification: this one celebrity post fans out to{" "}
            <span className="font-bold">{fmt(model.writesPerPost)} timeline writes</span>. Multiply by the post
            rate and the write path melts. The naïve cache breaks for the long tail of huge accounts.
          </p>
        )}
        {approach === "hybrid" && (
          <p className="text-special">
            <span className="accent-text">Hybrid</span> (Twitter&apos;s real answer): fan-out on write for the{" "}
            ~99.9% of normal accounts (fast reads), but skip fan-out for celebrities (&gt;1M followers) and merge
            their feeds at read time. You pay a tiny merge cost on reads to avoid the millions-of-writes spike.
            {celebFollowers >= CELEB_THRESHOLD ? " This user is a celebrity → read-merged." : " This user is normal → write-fanned."}
          </p>
        )}
      </div>
    </div>
  );
}
