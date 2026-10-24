import React, { useEffect, useMemo, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  MessageSquare,
  Search,
  X,
} from "lucide-react";
import type { Channel, Message, PostOrThread, ServerBackup } from "../types/backup";
import type { InternalServerTarget } from "../lib/links";
import { MessageCard } from "./MessageCard";

interface MessageStreamPaneProps {
  backup: ServerBackup | null;
  channel: Channel | null;
  post: PostOrThread | null;
  messageQuery: string;
  oldestFirst: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  highlightedMessageId: string | null;
  onChangeMessageQuery: (query: string) => void;
  onToggleOldestFirst: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onJumpToTarget: (target: InternalServerTarget) => void;
  onJumpToMessageInPost: (messageId: string) => void;
  onOpenExternalUrl: (url: string) => void;
  onOpenImageLightbox: (src: string, caption: string, filePath?: string | null) => void;
  onOpenPdfModal: (src: string, title: string, filePath?: string | null) => void;
  onOpenFileDefault: (filePath: string) => void;
  onRevealInExplorer: (filePath: string) => void;
}

function getDateSeparatorLabel(iso: string): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function MessageStreamPane({
  backup,
  channel,
  post,
  messageQuery,
  oldestFirst,
  canGoBack,
  canGoForward,
  highlightedMessageId,
  onChangeMessageQuery,
  onToggleOldestFirst,
  onGoBack,
  onGoForward,
  onJumpToTarget,
  onJumpToMessageInPost,
  onOpenExternalUrl,
  onOpenImageLightbox,
  onOpenPdfModal,
  onOpenFileDefault,
  onRevealInExplorer,
}: MessageStreamPaneProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (!highlightedMessageId) return;
    const el = document.getElementById(`msg-${highlightedMessageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedMessageId, post?.id]);

  const messageMap = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of post?.messages ?? []) {
      map.set(m.id, m);
    }
    return map;
  }, [post]);

  const visibleMessages = useMemo(() => {
    const base = post?.messages ?? [];
    const q = messageQuery.trim().toLowerCase();
    const filtered = !q
      ? base
      : base.filter(
          (m) =>
            m.content.toLowerCase().includes(q) ||
            m.author.name.toLowerCase().includes(q) ||
            m.attachments.some((a) => a.filename.toLowerCase().includes(q)) ||
            m.embeds.some(
              (e) =>
                e.title.toLowerCase().includes(q) ||
                e.description.toLowerCase().includes(q) ||
                e.author_name.toLowerCase().includes(q),
            ),
        );
    return oldestFirst ? filtered : [...filtered].reverse();
  }, [post, messageQuery, oldestFirst]);

  if (!channel || !post) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-slate-950 p-8 text-center text-sm text-slate-500">
        Select a post or thread to view its messages.
      </main>
    );
  }

  return (
    <main className="flex flex-1 min-w-0 flex-col bg-slate-950">
      {/* Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-800/90 bg-slate-950/90 px-5">
        <div className="flex min-w-0 items-center gap-3">
          {/* Navigation History Arrows */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={onGoBack}
              title="Back (Alt+Left)"
              className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!canGoForward}
              onClick={onGoForward}
              title="Forward (Alt+Right)"
              className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-bold text-white">
                {post.name}
              </h2>
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                <MessageSquare className="h-3 w-3 text-slate-400" />
                <span>{visibleMessages.length}</span>
              </span>
            </div>
            {post.applied_tags.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {post.applied_tags.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-1.5 py-0 text-[10px] font-medium text-indigo-300"
                  >
                    {t.emoji && <span>{t.emoji}</span>}
                    <span>{t.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Toolbar: Order Toggle + In-Post Search */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleOldestFirst}
            title="Toggle chronological order (Oldest first vs Newest first)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-700 hover:text-white cursor-pointer"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-indigo-400" />
            <span>{oldestFirst ? "Oldest first" : "Newest first"}</span>
          </button>

          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={messageQuery}
              onChange={(e) => onChangeMessageQuery(e.target.value)}
              placeholder="Search in post… (Ctrl+F)"
              className="w-full rounded-lg border border-slate-800 bg-slate-900 pl-8 pr-7 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            {messageQuery && (
              <button
                type="button"
                onClick={() => onChangeMessageQuery("")}
                aria-label="Clear message filter"
                className="absolute right-2 top-1.5 rounded p-0.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 py-5 space-y-2"
      >
        {visibleMessages.length === 0 ? (
          <div className="py-20 text-center text-xs text-slate-500">
            No matching messages in this post.
          </div>
        ) : (
          visibleMessages.map((msg, idx) => {
            const prevMsg = idx > 0 ? visibleMessages[idx - 1] : null;
            const curDate = getDateSeparatorLabel(msg.timestamp);
            const prevDate = prevMsg ? getDateSeparatorLabel(prevMsg.timestamp) : "";
            const showDateDivider = Boolean(curDate && curDate !== prevDate);
            const replyTarget = msg.reply_to_id
              ? messageMap.get(msg.reply_to_id) ?? null
              : null;

            return (
              <React.Fragment key={msg.id}>
                {showDateDivider && (
                  <div className="my-4 flex items-center gap-3 select-none">
                    <div className="h-px flex-1 bg-slate-800/80" />
                    <span className="rounded-full border border-slate-800 bg-slate-900/90 px-3 py-0.5 text-[11px] font-medium text-slate-400">
                      {curDate}
                    </span>
                    <div className="h-px flex-1 bg-slate-800/80" />
                  </div>
                )}

                <MessageCard
                  message={msg}
                  replyTargetMessage={replyTarget}
                  backup={backup}
                  channelId={channel.id}
                  postId={post.id}
                  isHighlighted={highlightedMessageId === msg.id}
                  searchQuery={messageQuery}
                  onJumpToTarget={onJumpToTarget}
                  onJumpToMessageInPost={onJumpToMessageInPost}
                  onOpenExternalUrl={onOpenExternalUrl}
                  onOpenImageLightbox={onOpenImageLightbox}
                  onOpenPdfModal={onOpenPdfModal}
                  onOpenFileDefault={onOpenFileDefault}
                  onRevealInExplorer={onRevealInExplorer}
                />
              </React.Fragment>
            );
          })
        )}
      </div>
    </main>
  );
}
