"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { IconCopy, IconCheck } from "@/components/icons";

/**
 * Lightweight code/query display with a copy button. No external highlighter
 * (keeps the dependency surface small). Rounded 2px-bordered figure with a
 * bold Archivo chrome header; the code itself is the only true monospace
 * (`font-code` = IBM Plex Mono).
 */
export function CodeBlock({
  code,
  lang,
  caption,
  className,
}: {
  code: string;
  lang?: string;
  caption?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <figure
      className={cn(
        "my-6 overflow-hidden rounded-[16px] border-2 border-line-strong bg-ink-950/70",
        className
      )}
    >
      <div className="flex items-center justify-between border-b-2 border-line-strong bg-ink-900/60 px-4 py-2.5">
        <span className="font-mono text-[10px] font-extrabold uppercase tracking-[0.16em] text-fg-faint">
          {lang ?? "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-faint transition-colors hover:text-accent"
        >
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-[13px] leading-relaxed">
        <code className="font-code text-fg/90">{code}</code>
      </pre>
      {caption && (
        <figcaption className="border-t-2 border-line-strong px-4 py-2.5 font-display text-[15px] italic text-fg-muted">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
