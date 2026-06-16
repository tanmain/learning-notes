"use client";

import { useEffect, useState } from "react";

/** Toggles the `.light` class on <html> and persists the choice. Default dark. */
export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("light");
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem("ddia-theme", next ? "light" : "dark");
    } catch {}
    setLight(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light or dark theme"
      className="flex items-center gap-2 rounded-full border-2 border-line-strong px-3.5 py-2 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted transition-all hover:-translate-y-0.5 hover:border-accent hover:text-fg"
    >
      <span aria-hidden>{light ? "☾" : "☀"}</span>
      <span className="hidden sm:inline">{light ? "Dark" : "Light"}</span>
    </button>
  );
}
