import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  CornerUpLeft,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Send,
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
  localAuthorName: string;
  hasUnsavedChanges?: boolean;
  onSaveChanges?: () => Promise<void> | void;
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
  localAuthorName,
  hasUnsavedChanges = false,
  onSaveChanges,
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
  const [composerText, setComposerText] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showAttachInput, setShowAttachInput] = useState(false);
  const [attachPathInput, setAttachPathInput] = useState("");
  const [stagedAttachPaths, setStagedAttachPaths] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  // Clear reply target when switching post
  useEffect(() => {
    setReplyingTo(null);
  }, [post?.id]);

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

        {/* Right Toolbar: Unsaved Save Button + Order Toggle + In-Post Search */}
        <div className="flex shrink-0 items-center gap-2">
          {hasUnsavedChanges && onSaveChanges && (
            <button
              type="button"
              onClick={() => onSaveChanges()}
              title="Save unsaved changes to Edited backup (Ctrl+S)"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-sm hover:bg-amber-400 cursor-pointer"
            >
              <span>Save Changes (Ctrl+S)</span>
            </button>
          )}

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
                  onReplyMessage={(targetMsg) => setReplyingTo(targetMsg)}
                  onEditMessage={onEditMessage}
                  onDeleteMessage={onDeleteMessage}
                />
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* Bottom Message Composer (Saves non-destructively to *_edited.json) */}
      <footer className="shrink-0 border-t border-slate-800/90 bg-slate-950/95 px-6 py-3">
        {replyingTo && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-200">
            <div className="flex min-w-0 items-center gap-2">
              <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
              <span className="truncate">
                Replying to{" "}
                <strong className="font-semibold text-white">
                  @{replyingTo.author.name}
                </strong>
                : {replyingTo.content.slice(0, 80)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="rounded p-0.5 text-indigo-300 hover:bg-indigo-500/20 hover:text-white cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {showAttachInput && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/90 p-2">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
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
              placeholder="Enter local file path to stage in edited assets folder…"
              className="flex-1 rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddComposerAttachment}
              className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Stage File</span>
            </button>
          </div>
        )}

        {stagedAttachPaths.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {stagedAttachPaths.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500/15 px-2.5 py-1 text-xs text-indigo-200 ring-1 ring-indigo-500/30"
              >
                <Paperclip className="h-3 w-3 text-indigo-400" />
                <span className="max-w-xs truncate">{p}</span>
                <button
                  type="button"
                  onClick={() =>
                    setStagedAttachPaths((prev) => prev.filter((x) => x !== p))
                  }
                  className="text-indigo-300 hover:text-white cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setShowAttachInput((v) => !v)}
            title="Attach local files"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
              showAttachInput || stagedAttachPaths.length > 0
                ? "border-indigo-500/50 bg-indigo-600/20 text-indigo-300"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200"
            }`}
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmitComposer();
              }
            }}
            rows={1}
            placeholder={`Post in "${post.name}" as ${localAuthorName || "Local User"}… (Press Ctrl+S or Save to persist)`}
            className="max-h-32 min-h-[36px] flex-1 resize-y rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
          />

          <button
            type="button"
            disabled={
              sending || (!composerText.trim() && stagedAttachPaths.length === 0)
            }
            onClick={handleSubmitComposer}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Send</span>
          </button>
        </div>
      </footer>
    </main>
  );
}
