import type { SVGProps } from "react";

/**
 * Inline SVG icon set (stroke-based, inherits currentColor).
 * Self-contained so the site has zero icon-library dependency.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export const IconMenu = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 6h18M3 12h18M3 18h18" /></svg>
);
export const IconClose = (p: IconProps) => (
  <svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const IconArrowRight = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconArrowLeft = (p: IconProps) => (
  <svg {...base(p)}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
);
export const IconChevronRight = (p: IconProps) => (
  <svg {...base(p)}><path d="m9 18 6-6-6-6" /></svg>
);
export const IconChevronDown = (p: IconProps) => (
  <svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>
);
export const IconSpark = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></svg>
);
export const IconBook = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14ZM4 19.5A2.5 2.5 0 0 0 6.5 22H20" /></svg>
);
export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}><path d="M20 6 9 17l-5-5" /></svg>
);
export const IconX = (p: IconProps) => (
  <svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const IconReset = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg>
);
export const IconPlay = (p: IconProps) => (
  <svg {...base(p)}><path d="m6 4 14 8-14 8V4Z" /></svg>
);
export const IconPause = (p: IconProps) => (
  <svg {...base(p)}><path d="M7 4v16M17 4v16" /></svg>
);
export const IconDatabase = (p: IconProps) => (
  <svg {...base(p)}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>
);
export const IconBolt = (p: IconProps) => (
  <svg {...base(p)}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>
);
export const IconExternal = (p: IconProps) => (
  <svg {...base(p)}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
);
export const IconBeaker = (p: IconProps) => (
  <svg {...base(p)}><path d="M9 3h6M10 3v6.5L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9.5V3M7 15h10" /></svg>
);
export const IconSend = (p: IconProps) => (
  <svg {...base(p)}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" /></svg>
);
export const IconLink = (p: IconProps) => (
  <svg {...base(p)}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" /></svg>
);
export const IconAlert = (p: IconProps) => (
  <svg {...base(p)}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01" /></svg>
);
export const IconScale = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0l-3-7ZM19 7l-3 7a3 3 0 0 0 6 0l-3-7ZM7 21h10" /></svg>
);
export const IconCopy = (p: IconProps) => (
  <svg {...base(p)}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);
export const IconStep = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 4v16M9 12l11-8v16L9 12Z" /></svg>
);
