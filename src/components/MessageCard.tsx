import { memo, useState } from "react";
import {
  Check,
  Copy,
  CornerUpLeft,
  CornerUpRight,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { Message, ServerBackup } from "../types/backup";
import type { InternalServerTarget } from "../lib/links";
import { authorInitials, formatTimeOfDay, plainTextSnippet } from "../lib/ui";
import { RichContent } from "./RichContent";
import { EmbedCard } from "./EmbedCard";
import { AttachmentList } from "./Attachments";

interface MessageCardProps {
  message: Message;
  /** First message of a group shows avatar, name and time (SPEC §7.7). */
  isGroupStart?: boolean;
  replyTargetMessage?: Message | null;
  backup: ServerBackup | null;
  channelId: string;
  postId: string;
  isHighlighted?: boolean;
  searchQuery?: string;
  onJumpToTarget?: (target: InternalServerTarget) => void;
  onJumpToMessageInPost?: (messageId: string) => void;
  onOpenExternalUrl?: (url: string) => void;
  onOpenImageLightbox?: (src: string, caption: string, filePath?: string | null) => void;
  onOpenPdfModal?: (src: string, title: string, filePath?: string | null) => void;
  onOpenFileDefault?: (filePath: string) => void;
  onRevealInExplorer?: (filePath: string) => void;
  onReplyMessage?: (message: Message) => void;
  onEditMessage?: (
    messageId: string,
    newContent: string,
    newAttachmentPaths: string[],
  ) => Promise<void> | void;
  onDeleteMessage?: (messageId: string) => Promise<void> | void;
}

const AVATAR_PALETTE = [
  "bg-indigo-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-cyan-600",
  "bg-violet-600",
  "bg-teal-600",
];

function avatarColor(idOrName: string): string {
  let hash = 0;
  for (let i = 0; i < idOrName.length; i++) {
    hash = (hash * 31 + idOrName.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function formatMessageTimestamp(iso: string): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const toolButton =
  "rounded p-1.5 text-ink-muted hover:bg-surface-3 hover:text-ink cursor-pointer";

function LocalStateMarker({ state }: { state: Message["local_edit_state"] }) {
  if (state === "original") return null;
  const added = state === "added";
  return (
    <span className="inline-flex items-center gap-1 text-meta text-ink-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${added ? "bg-emerald-400" : "bg-amber-400"}`} aria-hidden="true" />
      {added ? "Added locally" : "Edited locally"}
    </span>
  );
}

function MessageCardImpl({
  message,
  isGroupStart = true,
  replyTargetMessage,
  backup,
  channelId,
  postId,
  isHighlighted,
  searchQuery,
  onJumpToTarget,
  onJumpToMessageInPost,
  onOpenExternalUrl,
  onOpenImageLightbox,
  onOpenPdfModal,
  onOpenFileDefault,
  onRevealInExplorer,
  onReplyMessage,
  onEditMessage,
  onDeleteMessage,
}: MessageCardProps) {
  const [copied, setCopied] = useState<"text" | "link" | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [editAttPathInput, setEditAttPathInput] = useState("");
  const [editAttPaths, setEditAttPaths] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const authorName = message.author.name || "Unknown";
  const showHeader = isGroupStart || Boolean(message.reply_to_id);

  const flashCopied = (what: "text" | "link") => {
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };

  const handleCopyLink = () => {
    const serverId = backup?.id || "0";
    const target = postId.endsWith("_main") ? channelId : postId;
    navigator.clipboard?.writeText(`https://archive.local/channels/${serverId}/${target}/${message.id}`);
    flashCopied("link");
  };

  const handleStartEdit = () => {
    setEditDraft(message.content);
    setEditAttPaths([]);
    setEditAttPathInput("");
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!onEditMessage) return;
    await onEditMessage(message.id, editDraft, editAttPaths);
    setIsEditing(false);
  };

  return (
    <article
      id={`msg-${message.id}`}
      data-message-id={message.id}
      aria-label={`${authorName}, ${formatMessageTimestamp(message.timestamp)}`}
      className={`group relative rounded-md px-2 py-1 transition-colors ${showHeader ? "mt-3" : ""} ${
        isHighlighted ? "bg-accent/10 shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-surface-1"
      }`}
    >
      {/* Actions: shown on hover or keyboard focus; opacity keeps them reachable with Tab */}
      <div
        role="toolbar"
        aria-label={`Actions for message from ${authorName}`}
        className="pointer-events-none absolute -top-3.5 right-2 z-10 flex items-center gap-0.5 rounded-md border border-line bg-surface-2 p-0.5 opacity-0 shadow-lg group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
      >
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(message.content || "");
            flashCopied("text");
          }}
          title="Copy text"
          aria-label="Copy text"
          className={toolButton}
        >
          {copied === "text" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
        <button type="button" onClick={handleCopyLink} title="Copy link" aria-label="Copy link" className={toolButton}>
          {copied === "link" ? <Check className="h-4 w-4 text-emerald-400" /> : <Link2 className="h-4 w-4" />}
        </button>
        {onReplyMessage && (
          <button
            type="button"
            onClick={() => onReplyMessage(message)}
            title="Reply"
            aria-label="Reply"
            className={toolButton}
          >
            <CornerUpLeft className="h-4 w-4" />
          </button>
        )}
        {onEditMessage && (
          <button type="button" onClick={handleStartEdit} title="Edit" aria-label="Edit" className={toolButton}>
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {onDeleteMessage &&
          (confirmingDelete ? (
            <span className="flex items-center gap-1 px-1 text-meta text-ink">
              Delete?
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  onDeleteMessage(message.id);
                }}
                className="rounded bg-rose-600 px-2 py-0.5 font-semibold text-white hover:bg-rose-500 cursor-pointer"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded px-1.5 py-0.5 text-ink-muted hover:text-ink cursor-pointer"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              title="Delete"
              aria-label="Delete"
              className="rounded p-1.5 text-rose-400 hover:bg-surface-3 hover:text-rose-300 cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ))}
      </div>

      {/* Reply reference */}
      {message.reply_to_id && (
        <div className="mb-1 flex items-center gap-1.5 pl-12 text-meta text-ink-muted">
          <CornerUpRight className="h-3.5 w-3.5 shrink-0" />
          {replyTargetMessage ? (
            <button
              type="button"
              onClick={() => onJumpToMessageInPost?.(replyTargetMessage.id)}
              className="flex min-w-0 items-center gap-1.5 hover:text-ink cursor-pointer"
            >
              <span className="shrink-0 font-semibold text-ink">{replyTargetMessage.author.name}</span>
              <span className="truncate">
                {plainTextSnippet(replyTargetMessage.content, 120) || "(attachment)"}
              </span>
            </button>
          ) : (
            <span>Reply to a message that is not in this backup</span>
          )}
        </div>
      )}

      <div className="flex gap-3">
        {/* Gutter: avatar on group start, time on hover otherwise */}
        <div className="w-9 shrink-0">
          {showHeader ? (
            <div
              className={`flex h-9 w-9 select-none items-center justify-center rounded-full text-meta font-semibold text-white ${avatarColor(
                message.author.id || authorName,
              )}`}
              aria-hidden="true"
            >
              {authorInitials(authorName)}
            </div>
          ) : (
            <time
              dateTime={message.timestamp}
              className="block pt-1 text-right text-meta text-ink-faint opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              {formatTimeOfDay(message.timestamp)}
            </time>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {showHeader && (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-title text-ink">{authorName}</span>
              {message.author.bot && (
                <span className="rounded bg-surface-3 px-1 text-meta text-ink-muted">Bot</span>
              )}
              <time dateTime={message.timestamp} className="text-meta text-ink-muted">
                {formatMessageTimestamp(message.timestamp)}
              </time>
              {message.edited_timestamp && (
                <span title={`Edited ${formatMessageTimestamp(message.edited_timestamp)}`} className="text-meta text-ink-muted">
                  (edited)
                </span>
              )}
              <LocalStateMarker state={message.local_edit_state} />
            </div>
          )}
          {!showHeader && message.local_edit_state !== "original" && (
            <LocalStateMarker state={message.local_edit_state} />
          )}

          <div className={showHeader ? "mt-0.5" : ""}>
            {isEditing ? (
              <div className="mt-1 space-y-2 rounded-[10px] border border-line bg-surface-1 p-2.5">
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  aria-label="Edit message"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setIsEditing(false);
                    } else if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSaveEdit();
                    }
                  }}
                  rows={3}
                  className="w-full resize-y rounded-md border border-line bg-surface-0 p-2 text-body text-ink focus:border-accent focus:outline-none"
                />
                <div className="flex items-center gap-1.5">
                  <Paperclip className="h-4 w-4 shrink-0 text-ink-muted" />
                  <input
                    type="text"
                    value={editAttPathInput}
                    onChange={(e) => setEditAttPathInput(e.target.value)}
                    placeholder="Add a file by path (optional)"
                    aria-label="Attachment file path"
                    className="min-w-0 flex-1 rounded-md border border-line bg-surface-0 px-2 py-1 text-ui text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const p = editAttPathInput.trim();
                      if (!p) return;
                      setEditAttPaths((prev) => (prev.includes(p) ? prev : [...prev, p]));
                      setEditAttPathInput("");
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-2 py-1 text-ui text-ink cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Attach
                  </button>
                </div>
                {editAttPaths.length > 0 && (
                  <ul className="space-y-1">
                    {editAttPaths.map((p) => (
                      <li key={p} className="flex items-center gap-1.5 text-meta text-ink-muted">
                        <span className="min-w-0 flex-1 truncate" title={p}>
                          {p}
                        </span>
                        <button
                          type="button"
                          aria-label="Remove attachment"
                          onClick={() => setEditAttPaths((prev) => prev.filter((x) => x !== p))}
                          className="rounded p-0.5 hover:bg-surface-3 hover:text-ink cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-meta text-ink-muted">Enter to save · Shift+Enter for a new line · Esc to cancel</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="rounded-md px-2.5 py-1 text-ui text-ink-muted hover:bg-surface-3 hover:text-ink cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveEdit()}
                      className="rounded-md bg-accent-strong px-3 py-1 text-ui font-semibold text-white hover:bg-accent cursor-pointer"
                    >
                      Save edit
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <RichContent
                content={message.content}
                backup={backup}
                searchQuery={searchQuery}
                onJumpToTarget={onJumpToTarget}
                onOpenExternalUrl={onOpenExternalUrl}
                hideEmpty={message.attachments.length > 0 || message.embeds.length > 0}
              />
            )}
          </div>

          <AttachmentList
            attachments={message.attachments}
            onOpenImageLightbox={onOpenImageLightbox}
            onOpenPdfModal={onOpenPdfModal}
            onOpenFileDefault={onOpenFileDefault}
            onRevealInExplorer={onRevealInExplorer}
          />

          {message.embeds.length > 0 && (
            <div className="mt-2 flex max-w-[35rem] flex-col gap-2">
              {message.embeds.map((embed, idx) => (
                <EmbedCard
                  key={idx}
                  embed={embed}
                  backup={backup}
                  searchQuery={searchQuery}
                  onJumpToTarget={onJumpToTarget}
                  onOpenExternalUrl={onOpenExternalUrl}
                  onOpenImageLightbox={(src, cap) => onOpenImageLightbox?.(src, cap, null)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export const MessageCard = memo(MessageCardImpl);
