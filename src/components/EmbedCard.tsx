import { ExternalLink } from "lucide-react";
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
    return "#6366f1";
  }
  return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}

export function EmbedCard({
  embed,
  backup,
  searchQuery,
  onJumpToTarget,
  onOpenExternalUrl,
  onOpenImageLightbox,
}: EmbedCardProps) {
  const borderColor = formatEmbedColor(embed.color);

  return (
    <div
      style={{ borderLeftColor: borderColor }}
      className="mt-2 max-w-2xl rounded-r-lg border border-slate-800 border-l-4 bg-slate-900/80 p-3.5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          {embed.author_name && (
            <div className="text-xs font-semibold text-slate-300">
              {embed.author_name}
            </div>
          )}

          {embed.title && (
            <div className="font-semibold text-sm">
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
                  className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 hover:underline"
                >
                  <span>{embed.title}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
              ) : (
                <span className="text-white">{embed.title}</span>
              )}
            </div>
          )}

          {embed.description && (
            <div className="text-xs text-slate-300">
              <RichContent
                content={embed.description}
                backup={backup}
                searchQuery={searchQuery}
                onJumpToTarget={onJumpToTarget}
                onOpenExternalUrl={onOpenExternalUrl}
              />
            </div>
          )}

          {embed.fields.length > 0 && (
            <div className="mt-2 grid grid-cols-12 gap-2 pt-1">
              {embed.fields.map((field, idx) => (
                <div
                  key={idx}
                  className={field.inline ? "col-span-4 min-w-0" : "col-span-12 min-w-0"}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {field.name}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-200 break-words">
                    <RichContent
                      content={field.value}
                      backup={backup}
                      searchQuery={searchQuery}
                      onJumpToTarget={onJumpToTarget}
                      onOpenExternalUrl={onOpenExternalUrl}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {embed.thumbnail_url && (
          <img
            src={embed.thumbnail_url}
            alt={embed.title || "Embed thumbnail"}
            onClick={() =>
              onOpenImageLightbox?.(embed.thumbnail_url, embed.title || "Thumbnail")
            }
            className="h-16 w-16 shrink-0 rounded-md object-cover bg-slate-950 cursor-zoom-in border border-slate-800"
          />
        )}
      </div>

      {embed.image_url && (
        <img
          src={embed.image_url}
          alt={embed.title || "Embed image"}
          onClick={() => onOpenImageLightbox?.(embed.image_url, embed.title || "Image")}
          className="mt-3 max-h-72 max-w-full rounded-md object-contain bg-slate-950 cursor-zoom-in border border-slate-800"
        />
      )}

      {embed.footer_text && (
        <div className="mt-2 border-t border-slate-800/70 pt-1.5 text-[11px] text-slate-400">
          {embed.footer_text}
        </div>
      )}
    </div>
  );
}
