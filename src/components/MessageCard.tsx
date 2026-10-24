import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Check,
  Copy,
  CornerUpRight,
  FolderOpen,
  Link2,
} from "lucide-react";
import type { AttachmentRef, Message, ServerBackup } from "../types/backup";
import type { InternalServerTarget } from "../lib/links";
import { RichContent } from "./RichContent";
import { EmbedCard } from "./EmbedCard";
import { AudioAttachmentCard, VideoAttachmentCard } from "./MediaCards";
import { DocumentAttachmentCard } from "./DocumentCards";

interface MessageCardProps {
  message: Message;
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
}

const AVATAR_PALETTE = [
  "bg-indigo-600 text-indigo-100",
  "bg-emerald-600 text-emerald-100",
  "bg-amber-600 text-amber-100",
  "bg-rose-600 text-rose-100",
  "bg-cyan-600 text-cyan-100",
  "bg-violet-600 text-violet-100",
  "bg-teal-600 text-teal-100",
];

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "mkv"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "flac", "wav", "ogg", "m4a"]);

function getAvatarColorClass(idOrName: string): string {
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
  return dt.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function cleanDisplayFilename(filename: string): string {
  return filename.replace(/^(?:\d+_)+/, "") || filename;
}

function toAssetUrl(resolvedPath: string | null): string {
  if (!resolvedPath) return "";
  try {
    return convertFileSrc(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

function AttachmentItem({
  att,
  onOpenImageLightbox,
  onOpenPdfModal,
  onOpenFileDefault,
  onRevealInExplorer,
}: {
  att: AttachmentRef;
  onOpenImageLightbox?: (src: string, caption: string, filePath?: string | null) => void;
  onOpenPdfModal?: (src: string, title: string, filePath?: string | null) => void;
  onOpenFileDefault?: (filePath: string) => void;
  onRevealInExplorer?: (filePath: string) => void;
}) {
  const ext = att.extension.toLowerCase();
  const displayName = cleanDisplayFilename(att.filename);
  const assetUrl = toAssetUrl(att.resolved_path);

  if (IMAGE_EXTENSIONS.has(ext) && att.exists && assetUrl) {
    return (
      <div className="mt-2 inline-block max-w-lg overflow-hidden rounded-xl border border-slate-800 bg-slate-900/75 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-3 py-1.5 text-xs text-slate-300">
          <span className="truncate font-medium" title={att.filename}>
            {displayName}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {att.resolved_path && onRevealInExplorer && (
              <button
                type="button"
                onClick={() => onRevealInExplorer(att.resolved_path!)}
                title="Show in Explorer"
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <img
          src={assetUrl}
          alt={displayName}
          onClick={() => onOpenImageLightbox?.(assetUrl, displayName, att.resolved_path)}
          className="max-h-72 max-w-full cursor-zoom-in bg-slate-950 object-contain"
        />
      </div>
    );
  }

  if (VIDEO_EXTENSIONS.has(ext) && att.exists && assetUrl) {
    return (
      <VideoAttachmentCard
        att={att}
        displayName={displayName}
        assetUrl={assetUrl}
        onOpenFileDefault={onOpenFileDefault}
        onRevealInExplorer={onRevealInExplorer}
      />
    );
  }

  if (AUDIO_EXTENSIONS.has(ext) && att.exists && assetUrl) {
    return (
      <AudioAttachmentCard
        att={att}
        displayName={displayName}
        assetUrl={assetUrl}
        onOpenFileDefault={onOpenFileDefault}
        onRevealInExplorer={onRevealInExplorer}
      />
    );
  }

  return (
    <DocumentAttachmentCard
      att={att}
      displayName={displayName}
      assetUrl={assetUrl}
      onOpenPdfModal={onOpenPdfModal}
      onOpenFileDefault={onOpenFileDefault}
      onRevealInExplorer={onRevealInExplorer}
    />
  );
}

export function MessageCard({
  message,
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
}: MessageCardProps) {
  const [copiedText, setCopiedText] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const authorName = message.author.name || "Unknown";
  const initial = (authorName[0] || "?").toUpperCase();
  const avatarColor = getAvatarColorClass(message.author.id || authorName);

  const handleCopyText = () => {
    navigator.clipboard?.writeText(message.content || "");
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 1600);
  };

  const handleCopyLink = () => {
    const serverId = backup?.id || "0";
    const targetChannelOrPost = postId.endsWith("_main") ? channelId : postId;
    const url = `https://archive.local/channels/${serverId}/${targetChannelOrPost}/${message.id}`;
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1600);
  };

  return (
    <article
      id={`msg-${message.id}`}
      data-message-id={message.id}
      className={`group relative rounded-xl px-4 py-3 transition-all duration-200 ${
        isHighlighted
          ? "bg-indigo-500/15 ring-2 ring-indigo-500/60"
          : "hover:bg-slate-900/50"
      }`}
    >
      {/* Hover Action Toolbar */}
      <div className="invisible group-hover:visible absolute -top-2.5 right-4 z-10 flex items-center gap-0.5 rounded-lg border border-slate-700/80 bg-slate-900 px-1.5 py-1 shadow-lg">
        <button
          type="button"
          onClick={handleCopyText}
          title="Copy message text"
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
        >
          {copiedText ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleCopyLink}
          title="Copy internal jump link"
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
        >
          {copiedLink ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Linked</span>
            </>
          ) : (
            <>
              <Link2 className="h-3 w-3" />
              <span>Link</span>
            </>
          )}
        </button>
      </div>

      {/* Reply Reference Header */}
      {message.reply_to_id && (
        <div className="mb-1.5 flex items-center gap-1.5 pl-12 text-xs text-slate-400">
          <CornerUpRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          {replyTargetMessage ? (
            <button
              type="button"
              onClick={() => onJumpToMessageInPost?.(replyTargetMessage.id)}
              className="inline-flex items-center gap-1.5 truncate hover:text-indigo-300 cursor-pointer"
            >
              <span className="font-semibold text-slate-300">
                @{replyTargetMessage.author.name}
              </span>
              <span className="truncate text-slate-400 max-w-md">
                {replyTargetMessage.content || "(attachment)"}
              </span>
            </button>
          ) : (
            <span>Replying to message #{message.reply_to_id}</span>
          )}
        </div>
      )}

      <div className="flex items-start gap-3.5">
        <div
          className={`flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full text-sm font-bold shadow-sm ${avatarColor}`}
        >
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-slate-100">
              {authorName}
            </span>
            {message.author.bot && (
              <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300 ring-1 ring-indigo-500/30">
                BOT
              </span>
            )}
            <time className="text-xs text-slate-400">
              {formatMessageTimestamp(message.timestamp)}
            </time>
            {message.edited_timestamp && (
              <span
                title={`Edited ${formatMessageTimestamp(message.edited_timestamp)}`}
                className="text-[11px] italic text-slate-400"
              >
                (edited)
              </span>
            )}
            {message.local_edit_state === "added" && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                Added locally
              </span>
            )}
            {message.local_edit_state === "edited" && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-500/30">
                Edited locally
              </span>
            )}
          </div>

          <div className="mt-1">
            <RichContent
              content={message.content}
              backup={backup}
              searchQuery={searchQuery}
              onJumpToTarget={onJumpToTarget}
              onOpenExternalUrl={onOpenExternalUrl}
            />
          </div>

          {message.attachments.length > 0 && (
            <div className="mt-1 flex flex-col gap-1.5">
              {message.attachments.map((att, idx) => (
                <AttachmentItem
                  key={`${att.relative_path}-${idx}`}
                  att={att}
                  onOpenImageLightbox={onOpenImageLightbox}
                  onOpenPdfModal={onOpenPdfModal}
                  onOpenFileDefault={onOpenFileDefault}
                  onRevealInExplorer={onRevealInExplorer}
                />
              ))}
            </div>
          )}

          {message.embeds.length > 0 && (
            <div className="mt-1 flex flex-col gap-2">
              {message.embeds.map((embed, idx) => (
                <EmbedCard
                  key={idx}
                  embed={embed}
                  backup={backup}
                  searchQuery={searchQuery}
                  onJumpToTarget={onJumpToTarget}
                  onOpenExternalUrl={onOpenExternalUrl}
                  onOpenImageLightbox={(src, cap) =>
                    onOpenImageLightbox?.(src, cap, null)
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
