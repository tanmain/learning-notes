import { IconPlay } from "@/components/icons";

/**
 * Privacy-friendly responsive YouTube embed, framed as an "instrument" to match
 * the chapter figures. Purely presentational (no hooks) so it works in server
 * components. Pass a REAL video id sourced from a real youtube.com/watch?v=<id>
 * URL — never an invented one.
 */
export function YouTubeEmbed({
  videoId,
  title,
  channel,
}: {
  videoId: string;
  title: string;
  channel?: string;
}) {
  return (
    <figure className="instrument my-8 overflow-hidden p-0">
      <div className="flex items-center gap-2.5 border-b-2 border-line-strong bg-ink-900/50 px-5 py-3.5">
        <IconPlay size={16} className="accent-text" />
        <span className="font-mono text-[11px] font-extrabold uppercase tracking-[0.18em] text-fg-muted">
          Watch it explained
        </span>
      </div>
      <div className="relative aspect-video w-full bg-ink-950">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      <figcaption className="flex flex-col gap-0.5 border-t-2 border-line-strong px-5 py-3">
        <span className="font-display text-[1.05rem] italic leading-snug text-fg">{title}</span>
        <a
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-faint transition-colors hover:text-accent"
        >
          {channel ? `${channel} · ` : ""}watch on YouTube ↗
        </a>
      </figcaption>
    </figure>
  );
}
