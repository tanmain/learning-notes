import { IconBook, IconArrowRight } from "@/components/icons";

/**
 * A grid of external source links, styled as sticker cards. Presentational only.
 * Every URL must be a real link found via research — not invented.
 */
export function FurtherReading({
  title = "Further reading",
  sources,
}: {
  title?: string;
  sources: { title: string; url: string; note?: string }[];
}) {
  if (!sources?.length) return null;
  return (
    <div className="my-8">
      <div className="kicker mb-4 flex items-center gap-2 accent-text">
        <IconBook size={16} />
        <span>{title}</span>
      </div>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {sources.map((s) => (
          <li key={s.url}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="panel pop-shadow group flex h-full items-start gap-3 p-4 hover:border-accent"
            >
              <IconArrowRight
                size={16}
                className="mt-1 shrink-0 text-fg-faint transition-all group-hover:translate-x-0.5 group-hover:text-accent"
              />
              <span className="min-w-0">
                <span className="block font-sans text-[15px] font-medium leading-snug text-fg transition-colors group-hover:text-accent">
                  {s.title}
                </span>
                {s.note && (
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-fg-muted">{s.note}</span>
                )}
                <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-wide text-fg-faint">
                  {hostOf(s.url)}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
