"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getChapter, PARTS } from "@/lib/chapters";
import { ThemeToggle } from "./ThemeToggle";

export function SiteNav() {
  const pathname = usePathname();
  const slug = pathname.startsWith("/chapters/") ? pathname.split("/")[2] : null;
  const chapter = slug ? getChapter(slug) : undefined;

  return (
    <>
      {/* multi-colour Swiss rule */}
      <div
        className="h-1.5 w-full"
        style={{
          background:
            "linear-gradient(90deg,var(--color-fault) 0 25%,var(--color-warn) 25% 50%,var(--color-ok) 50% 75%,var(--color-info) 75% 100%)",
        }}
      />
      <header className="sticky top-0 z-40 border-b border-line-strong bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/" className="font-display text-lg font-medium tracking-tight text-fg sm:text-xl">
            Designing Data-Intensive Applications<span className="accent-text">.</span>
          </Link>

          <nav className="flex items-center gap-5">
            <Link
              href="/"
              className="hidden font-sans text-xs font-medium uppercase tracking-[0.16em] text-fg-muted transition-colors hover:text-fg sm:inline"
            >
              Index
            </Link>
            {chapter && (
              <span className="hidden items-center gap-2 font-sans text-xs uppercase tracking-[0.16em] text-fg-faint md:flex">
                <span>{PARTS[chapter.part].label}</span>
                <span className="accent-text">·</span>
                <span className="text-fg-muted">{chapter.title.split(" ").slice(0, 2).join(" ")}</span>
              </span>
            )}
            <ThemeToggle />
          </nav>
        </div>
      </header>
    </>
  );
}
