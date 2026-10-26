import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
} from "@tanstack/react-virtual";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  CornerUpLeft,
  Paperclip,
  Search,
  Send,
  X,
} from "lucide-react";
import type { Channel, Message, PostOrThread, ServerBackup } from "../types/backup";
import type { InternalServerTarget } from "../lib/links";
import { messageGroupStarts, plainTextSnippet } from "../lib/ui";
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
  onSendMessage: (
    content: string,
    attachmentPaths: string[],
    replyToId: string | null,
  ) => Promise<void> | void;
  onEditMessage: (
    messageId: string,
    newContent: string,
    newAttachmentPaths: string[],
  ) => Promise<void> | void;
  onDeleteMessage: (messageId: string) => Promise<void> | void;
}

/** Reading column shared by messages and the composer (SPEC §7.3). */
const READING_COLUMN = "mx-auto w-full max-w-[47.5rem]";

function dateDividerLabel(iso: string): string {
  const dt = new Date(iso);
  if (!iso || Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
}: MessageStreamPaneProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [composerText, setComposerText] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showAttachInput, setShowAttachInput] = useState(false);
  const [attachPathInput, setAttachPathInput] = useState("");
  const [stagedAttachPaths, setStagedAttachPaths] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  // Clear the reply target when switching post
  useEffect(() => {
    setReplyingTo(null);
  }, [post?.id]);

  const handleReply = useCallback((target: Message) => {
    setReplyingTo(target);
    composerRef.current?.focus();
  }, []);

  const handleAddComposerAttachment = () => {
    const p = attachPathInput.trim();
    if (!p) return;
    setStagedAttachPaths((prev) => (prev.includes(p) ? prev : [...prev, p]));
    setAttachPathInput("");
  };

  const handleSubmitComposer = async () => {
    if (sending) return;
    const trimmed = composerText.trim();
    if (!trimmed && stagedAttachPaths.length === 0) return;
    setSending(true);
    try {
      await onSendMessage(trimmed, stagedAttachPaths, replyingTo?.id ?? null);
      setComposerText("");
      setStagedAttachPaths([]);
      setAttachPathInput("");
      setShowAttachInput(false);
      setReplyingTo(null);
    } finally {
      setSending(false);
    }
  };

  // Ctrl+F focuses the in-post search (Ctrl+Shift+F belongs to the post filter).
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === "KeyF") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

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

  const groupStarts = useMemo(() => messageGroupStarts(visibleMessages), [visibleMessages]);

  // Keep the message whose audio/video is playing mounted, so scrolling away never stops playback.
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const messageIdOf = (e: Event) =>
      (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-message-id]")?.dataset
        .messageId ?? null;
    const handlePlay = (e: Event) => setPlayingMessageId(messageIdOf(e));
    const handleStop = (e: Event) => {
      const id = messageIdOf(e);
      setPlayingMessageId((current) => (current === id ? null : current));
    };
    // Media events do not bubble, so listen in the capture phase.
    container.addEventListener("play", handlePlay, true);
    container.addEventListener("pause", handleStop, true);
    container.addEventListener("ended", handleStop, true);
    return () => {
      container.removeEventListener("play", handlePlay, true);
      container.removeEventListener("pause", handleStop, true);
      container.removeEventListener("ended", handleStop, true);
    };
  }, [post?.id]);

  const pinnedIndex = playingMessageId
    ? visibleMessages.findIndex((m) => m.id === playingMessageId)
    : -1;
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      if (pinnedIndex < 0 || indexes.includes(pinnedIndex)) return indexes;
      return [...indexes, pinnedIndex].sort((a, b) => a - b);
    },
    [pinnedIndex],
  );

  const virtualizer = useVirtualizer({
    count: visibleMessages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 96,
    overscan: 6,
    getItemKey: (index) => visibleMessages[index].id,
    rangeExtractor,
  });

  // Jump to the highlighted message; otherwise start a newly opened post at the top.
  useEffect(() => {
    const index = highlightedMessageId
      ? visibleMessages.findIndex((m) => m.id === highlightedMessageId)
      : -1;
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: "center" });
    } else {
      virtualizer.scrollToOffset(0);
    }
    // Only re-run when the target or the post changes, not on every edit.
  }, [highlightedMessageId, post?.id]);

  if (!channel || !post) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-center text-ui text-ink-muted">
        Select a post to read its messages.
      </main>
    );
  }

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Header */}
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-1.5">
        <div className="flex items-center">
          <button
            type="button"
            disabled={!canGoBack}
            onClick={onGoBack}
            title="Back (Alt+Left)"
            aria-label="Back"
            className="rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!canGoForward}
            onClick={onGoForward}
            title="Forward (Alt+Right)"
            aria-label="Forward"
            className="rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="min-w-48 flex-1">
          <h2 className="truncate text-heading text-ink" title={post.name}>
            {post.name}
          </h2>
          <p className="flex flex-wrap items-center gap-x-1.5 text-meta text-ink-muted">
            <span>
              {visibleMessages.length === post.messages.length
                ? `${post.messages.length} messages`
                : `${visibleMessages.length} of ${post.messages.length} messages`}
            </span>
            {post.applied_tags.map((t) => (
              <span key={t.id}>
                · {t.emoji ? `${t.emoji} ` : ""}
                {t.name}
              </span>
            ))}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative w-44 xl:w-56">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              ref={searchInputRef}
              type="text"
              value={messageQuery}
              onChange={(e) => onChangeMessageQuery(e.target.value)}
              placeholder="Search in post"
              aria-label="Search in post (Ctrl+F)"
              className="w-full rounded-md border border-line bg-surface-2 py-1.5 pl-7 pr-7 text-ui text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
            {messageQuery && (
              <button
                type="button"
                onClick={() => onChangeMessageQuery("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-muted hover:text-ink cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onToggleOldestFirst}
            title={oldestFirst ? "Showing oldest first" : "Showing newest first"}
            aria-label={oldestFirst ? "Oldest first, switch to newest first" : "Newest first, switch to oldest first"}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-ui text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            <ArrowDownUp className="h-4 w-4" />
            <span className="hidden xl:inline">{oldestFirst ? "Oldest first" : "Newest first"}</span>
          </button>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-2">
        {visibleMessages.length === 0 ? (
          <p className="py-20 text-center text-ui text-ink-muted">
            {messageQuery.trim() ? "No messages match your search." : "This post has no messages."}
          </p>
        ) : (
          <div className={`relative ${READING_COLUMN}`} style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const idx = item.index;
              const msg = visibleMessages[idx];
              const prevMsg = idx > 0 ? visibleMessages[idx - 1] : null;
              const curDate = dateDividerLabel(msg.timestamp);
              const showDateDivider = Boolean(curDate && curDate !== (prevMsg ? dateDividerLabel(prevMsg.timestamp) : ""));

              return (
                <div
                  key={item.key}
                  data-index={idx}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  {showDateDivider && (
                    <div className="flex items-center gap-3 pb-1 pt-5 select-none" role="separator" aria-label={curDate}>
                      <div className="h-px flex-1 bg-line" />
                      <span className="text-meta text-ink-muted">{curDate}</span>
                      <div className="h-px flex-1 bg-line" />
                    </div>
                  )}
                  <MessageCard
                    message={msg}
                    isGroupStart={groupStarts[idx]}
                    replyTargetMessage={msg.reply_to_id ? messageMap.get(msg.reply_to_id) ?? null : null}
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
                    onReplyMessage={handleReply}
                    onEditMessage={onEditMessage}
                    onDeleteMessage={onDeleteMessage}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer: a compact field that grows (SPEC §7.7) */}
      <footer className="shrink-0 px-6 pb-4">
        <div className={READING_COLUMN}>
          {replyingTo && (
            <div className="mb-1.5 flex items-center gap-2 text-meta text-ink-muted">
              <CornerUpLeft className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Replying to <span className="font-semibold text-ink">{replyingTo.author.name}</span>:{" "}
                {plainTextSnippet(replyingTo.content, 80)}
              </span>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                aria-label="Cancel reply"
                className="rounded p-0.5 hover:bg-surface-2 hover:text-ink cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {showAttachInput && (
            <div className="mb-1.5 flex items-center gap-1.5">
              <input
                type="text"
                value={attachPathInput}
                onChange={(e) => setAttachPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddComposerAttachment();
                  }
                }}
                placeholder="Path of a file to attach"
                aria-label="Attachment file path"
                autoFocus
                className="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-ui text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddComposerAttachment}
                className="rounded-md bg-surface-3 px-2.5 py-1 text-ui text-ink cursor-pointer"
              >
                Add
              </button>
            </div>
          )}

          {stagedAttachPaths.length > 0 && (
            <ul className="mb-1.5 space-y-1">
              {stagedAttachPaths.map((p) => (
                <li key={p} className="flex items-center gap-1.5 text-meta text-ink-muted">
                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate" title={p}>
                    {p}
                  </span>
                  <button
                    type="button"
                    onClick={() => setStagedAttachPaths((prev) => prev.filter((x) => x !== p))}
                    aria-label="Remove attachment"
                    className="rounded p-0.5 hover:bg-surface-2 hover:text-ink cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-1 rounded-[10px] border border-line bg-surface-1 p-1 focus-within:border-accent">
            <button
              type="button"
              onClick={() => setShowAttachInput((v) => !v)}
              title="Attach a file"
              aria-label="Attach a file"
              aria-expanded={showAttachInput}
              className={`rounded-md p-2 cursor-pointer ${
                showAttachInput || stagedAttachPaths.length > 0
                  ? "text-accent"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <textarea
              ref={composerRef}
              value={composerText}
              onChange={(e) => {
                setComposerText(e.target.value);
                // Grow with the content up to ~8 lines.
                e.currentTarget.style.height = "auto";
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 192)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmitComposer();
                }
              }}
              rows={1}
              aria-label="Add a local message"
              placeholder="Add a local message…"
              className="max-h-48 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-body text-ink placeholder:text-ink-faint focus:outline-none"
            />
            <button
              type="button"
              disabled={sending || (!composerText.trim() && stagedAttachPaths.length === 0)}
              onClick={() => void handleSubmitComposer()}
              title="Send (Enter)"
              aria-label="Send"
              className="rounded-md p-2 text-accent hover:bg-surface-2 disabled:text-ink-faint disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
