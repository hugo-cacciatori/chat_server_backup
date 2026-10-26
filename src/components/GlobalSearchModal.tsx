import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Hash, LayoutList, Paperclip, Search, X } from "lucide-react";
import type { ServerBackup } from "../types/backup";
import { useDialogFocus } from "../lib/useDialogFocus";
import { cleanDisplayFilename, formatShortDate, plainTextSnippet } from "../lib/ui";

export const SEARCH_RESULT_LIMIT = 60;

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
  limit = SEARCH_RESULT_LIMIT,
): GlobalSearchResult[] {
  if (!backup) return [];
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const results: GlobalSearchResult[] = [];
  for (const ch of backup.channels) {
    for (const post of ch.posts) {
      const postTitleMatches = post.name.toLowerCase().includes(q);
      for (const msg of post.messages) {
        const matches =
          postTitleMatches ||
          msg.content.toLowerCase().includes(q) ||
          msg.author.name.toLowerCase().includes(q) ||
          msg.attachments.some((a) => a.filename.toLowerCase().includes(q)) ||
          msg.embeds.some(
            (e) => e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q),
          );
        if (!matches) continue;
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
            plainTextSnippet(msg.content, 180) ||
            plainTextSnippet(msg.embeds[0]?.description ?? "", 180) ||
            "(attachments only)",
          attachmentNames: msg.attachments.map((a) => cleanDisplayFilename(a.filename)),
        });
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}

/** Move the highlighted result by `delta`, clamped to the list; -1 when there are no results. */
export function moveActiveIndex(current: number, delta: number, count: number): number {
  if (count === 0) return -1;
  return Math.min(count - 1, Math.max(0, current + delta));
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-amber-400/30 px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function GlobalSearchModal({ isOpen, backup, onClose, onSelectResult }: GlobalSearchModalProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(panelRef, isOpen, inputRef);

  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`#search-result-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

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

  const openResult = (index: number) => {
    const r = results[index];
    if (!r) return;
    onSelectResult(r.channelId, r.postId, r.messageId);
    onClose();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => moveActiveIndex(i, e.key === "ArrowDown" ? 1 : -1, results.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      openResult(activeIndex);
    }
  };

  const showResults = Boolean(query.trim()) && results.length > 0;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-20">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search backup"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-[10px] border border-line bg-surface-1 shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search backup"
            aria-expanded={showResults}
            aria-controls="global-search-results"
            aria-activedescendant={showResults ? `search-result-${activeIndex}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search messages, titles, authors, embeds and file names"
            className="flex-1 bg-transparent text-body text-ink placeholder:text-ink-faint focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="rounded p-1 text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="font-sans text-meta text-ink-faint">Esc</kbd>
        </div>

        <div
          ref={listRef}
          id="global-search-results"
          role="listbox"
          aria-label="Search results"
          className="flex-1 overflow-y-auto p-1.5"
        >
          {!query.trim() ? (
            <p className="py-12 text-center text-ui text-ink-muted">
              Type a word, file name or author. ↑ ↓ to move, Enter to open.
            </p>
          ) : results.length === 0 ? (
            <p className="py-12 text-center text-ui text-ink-muted">No results for “{query}”.</p>
          ) : (
            results.map((r, index) => {
              const ChIcon = r.channelType === "forum" ? LayoutList : Hash;
              const isActive = index === activeIndex;
              return (
                <button
                  key={`${r.postId}-${r.messageId}`}
                  id={`search-result-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  tabIndex={-1}
                  onClick={() => openResult(index)}
                  onMouseMove={() => setActiveIndex(index)}
                  className={`flex w-full flex-col rounded-md px-3 py-2 text-left cursor-pointer ${
                    isActive ? "bg-surface-3" : ""
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-meta text-ink-muted">
                    <ChIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[10rem] shrink-0 truncate">{r.channelName}</span>
                    <span>/</span>
                    <span className="min-w-0 truncate text-ink">{r.postName}</span>
                    <span className="ml-auto shrink-0">
                      {r.authorName} · {formatShortDate(r.timestamp)}
                    </span>
                    <CornerDownLeft
                      className={`h-3.5 w-3.5 shrink-0 text-accent ${isActive ? "opacity-100" : "opacity-0"}`}
                    />
                  </span>
                  <span className="mt-1 line-clamp-2 text-ui text-ink">
                    <Highlighted text={r.snippet} query={query} />
                  </span>
                  {r.attachmentNames.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-meta text-ink-muted">
                      {r.attachmentNames.map((name, i) => (
                        <span key={i} className="inline-flex min-w-0 items-center gap-1">
                          <Paperclip className="h-3 w-3 shrink-0" />
                          <span className="max-w-[14rem] truncate">
                            <Highlighted text={name} query={query} />
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {results.length >= SEARCH_RESULT_LIMIT && (
          <div className="border-t border-line px-4 py-2 text-meta text-ink-muted">
            Showing the first {SEARCH_RESULT_LIMIT} results — refine your search to see more.
          </div>
        )}
      </div>
    </div>
  );
}
