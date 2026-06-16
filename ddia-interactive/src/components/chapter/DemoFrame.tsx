import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Unified "instrument" figure frame for any interactive demo or sandbox.
 * Rounded card with a 2px border + hard-offset shadow (sticker look); the
 * header carries a bold Archivo label + a live accent pill, the title is set
 * in Cormorant. Gives every chapter's demos consistent editorial chrome.
 */
export function DemoFrame({
  label = "Live demo",
  title,
  description,
  right,
  children,
  className,
}: {
  label?: string;
  title?: ReactNode;
  description?: ReactNode;
  /** Optional right-aligned header slot (badge, status, etc.). */
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("instrument my-8 overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 border-b-2 border-line-strong bg-ink-900/50 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-2 rounded-full border-2 accent-border px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-accent anim-pulse-glow" />
            <span className="font-mono text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">
              {label}
            </span>
          </span>
        </div>
        {right && (
          <div className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-fg-faint">
            {right}
          </div>
        )}
      </div>
      <div className="p-5 sm:p-6">
        {title && (
          <h3 className="font-display text-2xl font-medium tracking-tight">
            {title}
          </h3>
        )}
        {description && (
          <p className="mt-1.5 mb-5 max-w-2xl text-sm leading-relaxed text-fg-muted">
            {description}
          </p>
        )}
        {children}
      </div>
    </figure>
  );
}
