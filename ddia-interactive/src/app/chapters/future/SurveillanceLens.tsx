"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Toggle } from "@/components/chapter";

/**
 * "Doing the right thing" — Kleppmann's thought experiment.
 *
 * He suggests re-reading the data industry's own marketing copy with the word
 * "data" replaced by "surveillance" to expose what is really being described.
 * This component makes that swap interactive: flip the lens and watch benign
 * data-economy phrases turn into their surveillance equivalents.
 */

type Line = { data: string; surveillance: string };

const LINES: Line[] = [
  {
    data: "We collect data about our users to improve their experience.",
    surveillance: "We collect surveillance on our users to improve their experience.",
  },
  {
    data: "In our data-driven business, data is our most valuable asset.",
    surveillance: "In our surveillance-driven business, surveillance is our most valuable asset.",
  },
  {
    data: "We help advertisers reach the right people with data.",
    surveillance: "We help advertisers reach the right people with surveillance.",
  },
  {
    data: "Sign in to let us personalize your feed using your data.",
    surveillance: "Sign in to let us personalize your feed using your surveillance.",
  },
];

export function SurveillanceLens() {
  const [lens, setLens] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] text-fg-faint">
          a thought experiment — flip the lens
        </span>
        <Toggle
          label={lens ? "surveillance" : "data"}
          checked={lens}
          onChange={setLens}
        />
      </div>

      <ul className="space-y-2.5">
        {LINES.map((l, i) => (
          <li
            key={i}
            className="rounded-lg border p-3.5 transition-colors"
            style={{
              borderColor: lens ? "color-mix(in oklab, var(--color-fault) 45%, var(--color-line))" : "var(--color-line)",
              background: lens
                ? "color-mix(in oklab, var(--color-fault) 8%, var(--color-ink-850))"
                : "var(--color-ink-850)",
            }}
          >
            <motion.p
              key={lens ? `s-${i}` : `d-${i}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              className="font-body text-[15px] italic leading-relaxed"
              style={{ color: lens ? "var(--color-fg)" : "var(--color-fg-muted)" }}
            >
              {(lens ? l.surveillance : l.data).split(/(surveillance)/i).map((part, j) =>
                /surveillance/i.test(part) ? (
                  <strong key={j} className="not-italic text-fault">
                    {part}
                  </strong>
                ) : (
                  <span key={j}>{part}</span>
                )
              )}
            </motion.p>
          </li>
        ))}
      </ul>

      <p className="font-mono text-[11px] leading-relaxed text-fg-faint">
        {lens
          ? "When activity is tracked as a side-effect of something else, the relationship stops being a service to the user and becomes surveillance — funded by advertisers, the real customers."
          : "Toggle the lens to replace “data” with “surveillance” and re-read the same sentences."}
      </p>
    </div>
  );
}
