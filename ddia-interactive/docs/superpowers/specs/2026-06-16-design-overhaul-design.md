# DDIA Interactive — Visual Overhaul Spec

**Date:** 2026-06-16
**Status:** Approved (mockup `playful.html`)
**Goal:** Replace the dark "control-room" look with an **editorial-Swiss, playful** system — elegant serif headlines, clean sans reading, bold grotesque figures, a confident multi-colour palette with per-chapter accents, rounded corners + hard-offset colour shadows, **light/dark themes (dark default)**, and tasteful motion. Content, demos, quiz/chat, and manifest data are unchanged — they re-skin through shared tokens + components.

## Design principles
- **Elegant where you read, playful where you interact.** Prose and headlines are calm and editorial; figures, demos, chips, and buttons are bold, colourful, rounded, with sticker-style offset shadows.
- **Swiss structure:** strong grid, numbered sections, hairline rules, confident type, decisive colour.
- **One source of truth:** all visual change lives in `globals.css` tokens + the shared component layer; the 12 chapters inherit it.

## Type system
| Role | Font | Notes |
|---|---|---|
| Display (h1–h3, section titles, quotes, captions, big "specimen" numbers) | **Cormorant Garamond** (+ italic) | serif, elegant, large |
| Body, UI labels, nav, prose | **Jost** | geometric sans; 300 prose, 500/600 letter-spaced caps for labels |
| Figures, data, metrics, buttons, § chips | **Archivo** (700–900) | bold grotesque — the "data voice" |
| Code only | **IBM Plex Mono** | real monospace, `CodeBlock` only |

Token remap (preserves existing class contract so chapters re-skin):
`--font-display=Cormorant`, `--font-sans=--font-body=Jost`, **`--font-mono=Archivo`** (re-skins all demo labels/metrics to bold grotesque), add **`--font-code=IBM Plex Mono`** used only by `CodeBlock`.

## Colour (CSS variables, themed)
**Dark (default):** `--bg #101015`, `--panel #17171f`, `--panel-2 #1d1d27`; `--fg #f1ece0`, `--muted #a7a294`, `--faint #6f6a5b`; `--line` 13% / `--line-strong` 26% of `#f0ece4`; semantic `ok #4fd79b`, `warn #f1b64c`, `fault #ff5b45`, `info #7b86ff`, `special #ff8fb0`; `--shadow #000`.
**Light:** `--bg #f5f0e6`, `--panel #fdfaf3`, `--panel-2 #f4eee2`; `--fg #1c1813`, `--muted #615a4b`, `--faint #948c78`; lines of `#1c1813`; semantic deeper (`green #2ba668`, `amber #cf8a13`, `red #e23b27`, `indigo #3f49d8`, `pink #e85d8a`); `--shadow #1c1813`.
**Per-chapter accent:** keep the manifest's warm→cool spectrum as `--accent`/`--accent-2` (set by `ChapterShell`). Each chapter's pop = its own accent; semantic colours are fixed for data states.

Legacy `--color-ink-*` tokens are remapped onto the new surfaces (`ink-950→bg`, `ink-850→panel`, `ink-800→panel-2`, lighter steps → borders) so existing chapter Tailwind (`bg-ink-850`, `text-fg-muted`, `border-line`, `text-ok`…) re-skins automatically.

## Shape, shadow, motion
- **Rounding:** cards/figures radius 14–18px, chips 8–12px, buttons/pills 999px.
- **Hard-offset colour shadows** on figures/cards/buttons/blocks (5–8px, accent/semantic/`--shadow`); hover **lifts** (translate −2px,−2px; shadow grows).
- **Borders:** 2px on figures/cards (Swiss weight); 1–2px hairline section rules that **draw in** on reveal.
- **Motion (respect `prefers-reduced-motion`):** prose/headlines = graceful fade-up (~0.9s, `cubic-bezier(.22,1,.36,1)`, staggered); figures/cards = springy pop (scale .96→1 + rise, `cubic-bezier(.34,1.56,.64,1)`). Implement reveals with framer-motion `whileInView` (already installed).

## Layout
- **Top bar** replaces the left sidebar: 4-colour rule strip, brand→home, "Index" + part/chapter context, **ThemeToggle**. Sticky, blurred.
- **Home = Index:** Cormorant hero + 12 chapter cards (rounded, offset shadow, per-chapter accent tab) grouped by Part + "what every chapter gives you" strip + footer.
- **Chapter (`ChapterShell`):** part eyebrow → Cormorant title → italic subtitle → **specimen** metadata grid (Chapter / Sections / Reading / Demos) → hero diagram framed as a catalogued **object** (rounded, faint grid, offset shadow, "Fig." caption) → sections → playful prev/next cards → footer.
- **Section:** two-column grid — sticky meta column (**§ number chip via CSS counter** + Cormorant title + tag pills) and content column (prose, demos). Auto-numbered so chapter code needn't change.

## Theme system
`.light` class on `<html>` selects the light tokens (default = dark, no class). `ThemeToggle` (new client component) toggles the class + persists to `localStorage["ddia-theme"]`. An inline script in `layout.tsx` applies the stored class before paint (no flash). `<html>/<body>` already carry `suppressHydrationWarning`.

## Files changed (shared layer — propagates to all chapters)
`globals.css` (tokens, fonts, helper classes `.kicker`/`.label`, `.panel`, `.instrument`, `.glass`, `.prose-ddia`, `.hairline`, accent helpers; add reveal/offset-shadow helpers), `layout.tsx` (fonts + theme script + top-bar shell), `SiteNav.tsx` (→ top bar), **`ThemeToggle.tsx` (new)**, `ChapterShell.tsx`, `content.tsx`, `controls.tsx`, `DemoFrame.tsx`, `CodeBlock.tsx`, `quiz/Quiz.tsx`, `chat/AskClaude.tsx`, `Background.tsx` (simplify), `app/page.tsx` (home/index), `ReadingProgress.tsx` (minor).

## Out of scope (unchanged)
Chapter prose/content, demo logic, quiz/chat API routes, manifest data (accents reused). The 12 chapter pages + their demo components are **not** edited; they re-skin via tokens. Spot-check several after build.

## Verification
`npm run build` green (TS strict), then dev-server smoke test: home + several chapters render in **both** themes, demos recolour correctly, toggle works without flash. User reviews the final result.
