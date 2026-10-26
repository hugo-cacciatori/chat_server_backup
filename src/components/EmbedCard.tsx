import type { EmbedData, ServerBackup } from "../types/backup";
import type { InternalServerTarget } from "../lib/links";
import { RichContent } from "./RichContent";

interface EmbedCardProps {
  embed: EmbedData;
  backup: ServerBackup | null;
  searchQuery?: string;
  onJumpToTarget?: (target: InternalServerTarget) => void;
  onOpenExternalUrl?: (url: string) => void;
  onOpenImageLightbox?: (src: string, caption: string) => void;
}

function formatEmbedColor(color: number | null): string {
  if (color === null || color < 0) {
    return "var(--color-line)";
  }
  return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** Rich embed: tinted card with the embed's own colour as a left bar (SPEC §7.2 calm surfaces). */
export function EmbedCard({
  embed,
  backup,
  searchQuery,
  onJumpToTarget,
  onOpenExternalUrl,
  onOpenImageLightbox,
}: EmbedCardProps) {
  const contentProps = { backup, searchQuery, onJumpToTarget, onOpenExternalUrl };

  return (
    <div
      style={{ borderLeftColor: formatEmbedColor(embed.color) }}
      className="rounded-md border-l-4 bg-surface-1 px-3.5 py-3"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {embed.author_name && <div className="text-meta font-semibold text-ink-muted">{embed.author_name}</div>}

          {embed.title && (
            <div className="text-title">
              {embed.url ? (
                <a
                  href={embed.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (onOpenExternalUrl) {
                      e.preventDefault();
                      onOpenExternalUrl(embed.url);
                    }
                  }}
                  className="text-accent hover:underline"
                >
                  {embed.title}
                </a>
              ) : (
                <span className="text-ink">{embed.title}</span>
              )}
            </div>
          )}

          {embed.description && <RichContent content={embed.description} {...contentProps} />}

          {embed.fields.length > 0 && (
            <dl className="grid grid-cols-3 gap-x-4 gap-y-2 pt-1">
              {embed.fields.map((field, idx) => (
                <div key={idx} className={`min-w-0 ${field.inline ? "col-span-1" : "col-span-3"}`}>
                  <dt className="text-meta font-semibold text-ink-muted">{field.name}</dt>
                  <dd className="break-words">
                    <RichContent content={field.value} {...contentProps} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {embed.thumbnail_url && (
          <button
            type="button"
            onClick={() => onOpenImageLightbox?.(embed.thumbnail_url, embed.title || "Thumbnail")}
            aria-label={`Open image ${embed.title || "thumbnail"}`}
            className="shrink-0 cursor-zoom-in"
          >
            <img
              src={embed.thumbnail_url}
              alt={embed.title || "Embed thumbnail"}
              className="h-16 w-16 rounded-md bg-surface-0 object-cover"
            />
          </button>
        )}
      </div>

      {embed.image_url && (
        <button
          type="button"
          onClick={() => onOpenImageLightbox?.(embed.image_url, embed.title || "Image")}
          aria-label={`Open image ${embed.title || "from embed"}`}
          className="mt-3 block cursor-zoom-in"
        >
          <img
            src={embed.image_url}
            alt={embed.title || "Embed image"}
            className="max-h-72 max-w-full rounded-md bg-surface-0 object-contain"
          />
        </button>
      )}

      {embed.footer_text && <div className="mt-2 text-meta text-ink-muted">{embed.footer_text}</div>}
    </div>
  );
}
