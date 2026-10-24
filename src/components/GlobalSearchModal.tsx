import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Hash, LayoutList, Paperclip, Search, X } from "lucide-react";
import type { ServerBackup } from "../types/backup";
import { formatMessageTimestamp } from "./MessageCard";

export interface GlobalSearchResult {
  channelId: string;
  channelName: string;
  channelType: string;
  postId: string;
  postName: string;
  messageId: string;
  authorName: string;
  timestamp: string;
  snippet: string;
  attachmentNames: string[];
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  backup: ServerBackup | null;
  onClose: () => void;
  onSelectResult: (channelId: string, postId: string, messageId: string) => void;
}

export function searchAcrossBackup(
  backup: ServerBackup | null,
  rawQuery: string,
  limit = 60,
): GlobalSearchResult[] {
  if (!backup) return [];
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const results: GlobalSearchResult[] = [];
  for (const ch of backup.channels) {
    for (const post of ch.posts) {
      const postTitleMatches = post.name.toLowerCase().includes(q);
      for (const msg of post.messages) {
        const contentMatches = msg.content.toLowerCase().includes(q);
        const authorMatches = msg.author.name.toLowerCase().includes(q);
        const attMatches = msg.attachments.some((a) =>
          a.filename.toLowerCase().includes(q),
        );
        const embedMatches = msg.embeds.some(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            e.description.toLowerCase().includes(q),
        );

        if (
          postTitleMatches ||
          contentMatches ||
          authorMatches ||
          attMatches ||
          embedMatches
        ) {
          results.push({
            channelId: ch.id,
            channelName: ch.name,
            channelType: ch.type,
            postId: post.id,
            postName: post.name,
            messageId: msg.id,
            authorName: msg.author.name,
            timestamp: msg.timestamp,
            snippet:
              msg.content.slice(0, 180) ||
              msg.embeds[0]?.description?.slice(0, 180) ||
              "(attachment message)",
            attachmentNames: msg.attachments.map((a) => a.filename),
          });
          if (results.length >= limit) {
            return results;
          }
        }
      }
    }
  }
  return results;
}

export function GlobalSearchModal({
  isOpen,
  backup,
  onClose,
  onSelectResult,
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const results = useMemo(() => searchAcrossBackup(backup, query), [backup, query]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/80 pt-20 backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
      >
        {/* Search Input Header */}
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-indigo-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages, post titles, authors, embeds, or filenames across the backup…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {!query.trim() ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Type a keyword, filename, or author name to search across all channels and posts.
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No results matching "{query}".
            </div>
          ) : (
            results.map((r) => {
              const ChIcon = r.channelType === "forum" ? LayoutList : Hash;
              return (
                <button
                  key={`${r.postId}-${r.messageId}`}
                  type="button"
                  onClick={() => {
                    onSelectResult(r.channelId, r.postId, r.messageId);
                    onClose();
                  }}
                  className="group flex w-full flex-col rounded-xl border border-transparent bg-slate-950/50 p-3 text-left hover:border-indigo-500/40 hover:bg-indigo-600/10 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-1.5 text-indigo-300 font-medium">
                      <ChIcon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{r.channelName}</span>
                      <span className="text-slate-600">/</span>
                      <span className="truncate text-white font-semibold">
                        {r.postName}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-400">
                      <span>@{r.authorName}</span>
                      <span>•</span>
                      <span>{formatMessageTimestamp(r.timestamp)}</span>
                      <CornerDownLeft className="h-3.5 w-3.5 text-indigo-400 opacity-0 group-hover:opacity-100" />
                    </div>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-slate-300">
                    {r.snippet}
                  </p>
                  {r.attachmentNames.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.attachmentNames.map((name, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300"
                        >
                          <Paperclip className="h-2.5 w-2.5 text-indigo-400" />
                          <span className="truncate max-w-xs">{name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
