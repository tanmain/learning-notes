"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------- Button */

export function Button({
  children,
  onClick,
  variant = "solid",
  size = "md",
  disabled,
  type = "button",
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "solid" | "outline" | "ghost";
  size?: "sm" | "md";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  const variants: Record<typeof variant, string> = {
    // accent-filled "sticker" pill: hard offset shadow + springy hover-lift
    solid:
      "border-2 border-accent bg-accent text-white accent-glow hover:-translate-x-0.5 hover:-translate-y-0.5",
    outline:
      "border-2 accent-border text-accent hover:-translate-x-0.5 hover:-translate-y-0.5 hover:accent-soft-bg",
    ghost:
      "border-2 border-line text-fg-muted hover:border-line-strong hover:text-fg",
  };
  const sizes: Record<typeof size, string> = {
    sm: "px-4 py-1.5 text-[11px]",
    md: "px-6 py-2.5 text-xs",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-mono font-extrabold uppercase tracking-[0.1em] transition-[transform,box-shadow,background-color,border-color,color] duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- Slider */

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  className,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="kicker">{label}</span>
        <span className="font-mono text-base font-extrabold tabular-nums accent-text">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-ink-800"
        style={{ accentColor: "var(--accent)" }}
      />
    </label>
  );
}

/* ------------------------------------------------------------------- Toggle */

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3"
    >
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border-2 transition-colors",
          checked ? "accent-bg accent-border" : "border-line-strong bg-ink-800"
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] rounded-full transition-all duration-300 ease-[cubic-bezier(.34,1.56,.64,1)]",
            checked ? "left-[22px] bg-white" : "left-[3px] bg-fg-faint"
          )}
          style={{ height: 16, width: 16 }}
        />
      </span>
      <span className="kicker">{label}</span>
    </button>
  );
}

/* -------------------------------------------------------- SegmentedControl */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-full border-2 border-line-strong bg-ink-850 p-1",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] transition-all duration-300",
              active
                ? "bg-accent text-white accent-glow"
                : "text-fg-muted hover:text-fg"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------- Stat */

const STAT_TONES: Record<string, string> = {
  default: "var(--color-fg)",
  accent: "var(--accent)",
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  fault: "var(--color-fault)",
  info: "var(--color-info)",
  special: "var(--color-special)",
};

export function Stat({
  label,
  value,
  unit,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: keyof typeof STAT_TONES;
  className?: string;
}) {
  const toneColor = STAT_TONES[tone];
  // Tint the card border to match the tone (default stays neutral hairline).
  const borderStyle: CSSProperties =
    tone === "default"
      ? {}
      : { borderColor: `color-mix(in oklab, ${toneColor} 55%, transparent)` };
  return (
    <div
      className={cn(
        "rounded-md border-2 border-line-strong bg-ink-800 px-4 py-3.5",
        className
      )}
      style={borderStyle}
    >
      <div className="kicker">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span
          className="font-mono text-3xl font-black leading-none tabular-nums"
          style={{ color: toneColor }}
        >
          {value}
        </span>
        {unit && (
          <span className="font-body text-sm font-normal text-fg-muted">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
