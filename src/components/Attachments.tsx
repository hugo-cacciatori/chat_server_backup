import { useEffect, useId, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  File,
  FileArchive,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  Music,
  Pause,
  Play,
} from "lucide-react";
import type { AttachmentInspection, AttachmentRef } from "../types/backup";
import { tokenizeCodeLine } from "../lib/markdown";
import { cleanDisplayFilename } from "../lib/ui";

// Attachment rendering (SPEC §7.9): image grid, compact media players, file rows with previews.

const MEDIA_PLAY_EVENT = "chat-backup:media-play";
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "mkv"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "flac", "wav", "ogg", "m4a"]);
const CODE_PREVIEW_LINES = 12;
const DOCX_PREVIEW_PARAGRAPHS = 8;
const ARCHIVE_PREVIEW_ENTRIES = 15;

export function formatByteSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes) || bytes < 0) {
    return "";
  }
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatDurationSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

function toAssetUrl(resolvedPath: string | null): string {
  if (!resolvedPath) return "";
  try {
    return convertFileSrc(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

// Attachment files never change in place, so one inspection per path serves every remount
// of a virtualized message card.
const inspectionCache = new Map<string, Promise<AttachmentInspection>>();

function inspectAttachmentCached(path: string): Promise<AttachmentInspection> {
  let pending = inspectionCache.get(path);
  if (!pending) {
    pending = invoke<AttachmentInspection>("inspect_attachment", { path });
    pending.catch(() => inspectionCache.delete(path));
    inspectionCache.set(path, pending);
  }
  return pending;
}

export interface AttachmentActions {
  onOpenImageLightbox?: (src: string, caption: string, filePath?: string | null) => void;
  onOpenPdfModal?: (src: string, title: string, filePath?: string | null) => void;
  onOpenFileDefault?: (filePath: string) => void;
  onRevealInExplorer?: (filePath: string) => void;
}

const iconButton =
  "rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer";

function FileActions({ att, onOpenFileDefault, onRevealInExplorer }: { att: AttachmentRef } & AttachmentActions) {
  if (!att.exists || !att.resolved_path) return null;
  const path = att.resolved_path;
  return (
    <>
      {onOpenFileDefault && (
        <button type="button" onClick={() => onOpenFileDefault(path)} title="Open" aria-label="Open" className={iconButton}>
          <ExternalLink className="h-4 w-4" />
        </button>
      )}
      {onRevealInExplorer && (
        <button
          type="button"
          onClick={() => onRevealInExplorer(path)}
          title="Show in Explorer"
          aria-label="Show in Explorer"
          className={iconButton}
        >
          <FolderOpen className="h-4 w-4" />
        </button>
      )}
    </>
  );
}

/** All attachments of one message: images as a grid, then players and file rows. */
export function AttachmentList({ attachments, ...actions }: { attachments: AttachmentRef[] } & AttachmentActions) {
  const isShownImage = (a: AttachmentRef) =>
    IMAGE_EXTENSIONS.has(a.extension.toLowerCase()) && a.exists && Boolean(a.resolved_path);
  const images = attachments.filter(isShownImage);
  const others = attachments.filter((a) => !isShownImage(a));
  if (attachments.length === 0) return null;

  return (
    <div className="mt-2 flex max-w-[35rem] flex-col gap-2">
      {images.length === 1 && <SingleImage att={images[0]} {...actions} />}
      {images.length > 1 && (
        <div className="grid grid-cols-[repeat(auto-fill,10rem)] gap-1.5">
          {images.map((att, i) => (
            <ImageTile key={`${att.relative_path}-${i}`} att={att} {...actions} />
          ))}
        </div>
      )}
      {others.map((att, i) => {
        const ext = att.extension.toLowerCase();
        const key = `${att.relative_path}-${i}`;
        if (att.exists && att.resolved_path && AUDIO_EXTENSIONS.has(ext)) {
          return <AudioAttachment key={key} att={att} {...actions} />;
        }
        if (att.exists && att.resolved_path && VIDEO_EXTENSIONS.has(ext)) {
          return <VideoAttachment key={key} att={att} {...actions} />;
        }
        return <FileAttachment key={key} att={att} {...actions} />;
      })}
    </div>
  );
}

function SingleImage({ att, onOpenImageLightbox }: { att: AttachmentRef } & AttachmentActions) {
  const name = cleanDisplayFilename(att.filename);
  const src = toAssetUrl(att.resolved_path);
  return (
    <button
      type="button"
      onClick={() => onOpenImageLightbox?.(src, name, att.resolved_path)}
      aria-label={`Open image ${name}`}
      title={name}
      className="block w-fit cursor-zoom-in overflow-hidden rounded-[10px] bg-surface-1"
    >
      <img src={src} alt={name} className="block max-h-[22.5rem] max-w-full object-contain sm:max-w-[30rem]" />
    </button>
  );
}

function ImageTile({ att, onOpenImageLightbox }: { att: AttachmentRef } & AttachmentActions) {
  const name = cleanDisplayFilename(att.filename);
  const src = toAssetUrl(att.resolved_path);
  return (
    <button
      type="button"
      onClick={() => onOpenImageLightbox?.(src, name, att.resolved_path)}
      aria-label={`Open image ${name}`}
      title={name}
      className="h-40 w-40 cursor-zoom-in overflow-hidden rounded-md bg-surface-1"
    >
      <img src={src} alt={name} className="h-full w-full object-cover" />
    </button>
  );
}

function usePauseOthers(ref: React.RefObject<HTMLMediaElement | null>) {
  const playerId = useId();
  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== playerId && ref.current && !ref.current.paused) {
        ref.current.pause();
      }
    };
    window.addEventListener(MEDIA_PLAY_EVENT, handleOtherPlay);
    return () => window.removeEventListener(MEDIA_PLAY_EVENT, handleOtherPlay);
  }, [playerId, ref]);
  return () => window.dispatchEvent(new CustomEvent(MEDIA_PLAY_EVENT, { detail: playerId }));
}

function AudioAttachment({ att, ...actions }: { att: AttachmentRef } & AttachmentActions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const announcePlay = usePauseOthers(audioRef);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const name = cleanDisplayFilename(att.filename);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      announcePlay();
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-line bg-surface-1 px-3 py-2">
      <audio
        ref={audioRef}
        preload="metadata"
        src={toAssetUrl(att.resolved_path)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
      />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? `Pause ${name}` : `Play ${name}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-strong text-white hover:bg-accent cursor-pointer"
      >
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Music className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
          <span className="truncate text-ui text-ink" title={att.filename}>
            {name}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="range"
            aria-label={`Seek ${name}`}
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              setCurrentTime(next);
              if (audioRef.current) audioRef.current.currentTime = next;
            }}
            className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--color-accent)]"
          />
          <span className="shrink-0 font-mono text-meta text-ink-muted">
            {formatDurationSeconds(currentTime)} / {formatDurationSeconds(duration)}
          </span>
        </div>
      </div>
      <FileActions att={att} {...actions} />
    </div>
  );
}

function VideoAttachment({ att, ...actions }: { att: AttachmentRef } & AttachmentActions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const announcePlay = usePauseOthers(videoRef);
  const name = cleanDisplayFilename(att.filename);
  return (
    <figure className="overflow-hidden rounded-[10px] border border-line bg-surface-1">
      <video
        ref={videoRef}
        controls
        preload="metadata"
        src={toAssetUrl(att.resolved_path)}
        onPlay={announcePlay}
        className="block max-h-[19.7rem] w-full bg-black"
      />
      <figcaption className="flex items-center gap-2 px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-ui text-ink" title={att.filename}>
          {name}
        </span>
        <span className="text-meta uppercase text-ink-muted">{att.extension}</span>
        <FileActions att={att} {...actions} />
      </figcaption>
    </figure>
  );
}

type PreviewKind = "text" | "docx" | "archive" | "pdf" | null;

function previewKind(ext: string, inspection: AttachmentInspection | null): PreviewKind {
  if (ext === "pdf") return "pdf";
  if (inspection?.kind === "text" && inspection.text_preview) return "text";
  if (inspection?.kind === "docx" && inspection.docx_preview?.paragraphs.length) return "docx";
  if (inspection?.kind === "archive" && inspection.archive_entries?.length) return "archive";
  return null;
}

function FileAttachment({ att, ...actions }: { att: AttachmentRef } & AttachmentActions) {
  const ext = att.extension.toLowerCase();
  const name = cleanDisplayFilename(att.filename);
  const [inspection, setInspection] = useState<AttachmentInspection | null>(null);
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!att.exists || !att.resolved_path) return;
    let cancelled = false;
    inspectAttachmentCached(att.resolved_path)
      .then((info) => {
        if (!cancelled) setInspection(info);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [att.exists, att.resolved_path]);

  const kind = att.exists ? previewKind(ext, inspection) : null;
  // Code and text previews start open; the others open on demand (SPEC §7.9).
  const isOpen = open ?? kind === "text";
  const Icon =
    kind === "text" ? FileCode : kind === "archive" ? FileArchive : kind ? FileText : File;
  const assetUrl = toAssetUrl(att.resolved_path);

  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-surface-1">
      <div className="flex min-h-12 items-center gap-3 px-3 py-1.5">
        <Icon className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-ui text-ink" title={att.filename}>
            {name}
          </div>
          <div className="text-meta text-ink-muted">
            <span className="uppercase">{ext || "file"}</span>
            {inspection?.file_size !== undefined && ` · ${formatByteSize(inspection.file_size)}`}
            {kind === "text" && inspection?.text_preview &&
              ` · ${inspection.text_preview.total_lines} lines`}
            {!att.exists && <span className="text-rose-400"> · Missing on disk</span>}
          </div>
        </div>
        {kind && (
          <button
            type="button"
            onClick={() => setOpen(!isOpen)}
            aria-expanded={isOpen}
            className="rounded-md px-2 py-1 text-ui text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            {isOpen ? "Hide" : "Preview"}
          </button>
        )}
        {kind === "pdf" && actions.onOpenPdfModal && (
          <button
            type="button"
            onClick={() => actions.onOpenPdfModal?.(assetUrl, name, att.resolved_path)}
            title="Open in reader"
            aria-label="Open in reader"
            className={iconButton}
          >
            <BookOpen className="h-4 w-4" />
          </button>
        )}
        <FileActions att={att} {...actions} />
      </div>

      {isOpen && kind === "text" && inspection?.text_preview && (
        <CodePreview content={inspection.text_preview.content} language={inspection.text_preview.language} />
      )}
      {isOpen && kind === "docx" && inspection?.docx_preview && (
        <ExpandableList
          items={inspection.docx_preview.paragraphs}
          initial={DOCX_PREVIEW_PARAGRAPHS}
          noun="paragraphs"
          render={(p, i) => (
            <p key={i} className="text-body text-ink">
              {p}
            </p>
          )}
          className="space-y-2 px-4 py-3"
        />
      )}
      {isOpen && kind === "archive" && inspection?.archive_entries && (
        <ExpandableList
          items={inspection.archive_entries}
          initial={ARCHIVE_PREVIEW_ENTRIES}
          noun="entries"
          render={(item, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5 font-mono text-meta">
              {item.is_dir ? (
                <Folder className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
              ) : (
                <File className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
              )}
              <span className="min-w-0 flex-1 break-all text-ink">{item.path}</span>
              <span className="shrink-0 text-ink-muted">{item.is_dir ? "" : formatByteSize(item.uncompressed_size)}</span>
            </div>
          )}
          className="px-3 py-2"
        />
      )}
      {isOpen && kind === "pdf" && (
        <iframe src={assetUrl} title={name} className="block h-[30rem] w-full border-t border-line bg-white" />
      )}
    </div>
  );
}

function ExpandableList<T>({
  items,
  initial,
  noun,
  render,
  className,
}: {
  items: T[];
  initial: number;
  noun: string;
  render: (item: T, index: number) => React.ReactNode;
  className: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, initial);
  return (
    <div className="border-t border-line">
      <div className={className}>{shown.map(render)}</div>
      {items.length > initial && (
        <ShowMoreButton expanded={expanded} label={`Show all ${items.length} ${noun}`} onToggle={() => setExpanded((v) => !v)} />
      )}
    </div>
  );
}

function ShowMoreButton({ expanded, label, onToggle }: { expanded: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-center justify-center gap-1 border-t border-line py-1.5 text-ui text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
    >
      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      {expanded ? "Show less" : label}
    </button>
  );
}

export function CodeLines({ lines, startAt = 1 }: { lines: string[]; startAt?: number }) {
  return (
    <table className="w-full border-collapse font-mono text-meta">
      <tbody>
        {lines.map((line, idx) => (
          <tr key={idx}>
            <td className="w-8 select-none pr-3 text-right align-top text-ink-faint">{idx + startAt}</td>
            <td className="whitespace-pre-wrap break-all text-ink">
              {line === ""
                ? " "
                : tokenizeCodeLine(line).map((tok, i) => {
                    const cls =
                      tok.type === "keyword"
                        ? "text-accent"
                        : tok.type === "string"
                          ? "text-emerald-300"
                          : tok.type === "comment"
                            ? "italic text-ink-faint"
                            : tok.type === "number"
                              ? "text-amber-300"
                              : undefined;
                    return (
                      <span key={i} className={cls}>
                        {tok.value}
                      </span>
                    );
                  })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CodePreview({ content, language }: { content: string; language: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => content.split("\n"), [content]);
  const shown = expanded ? lines : lines.slice(0, CODE_PREVIEW_LINES);

  return (
    <div className="border-t border-line">
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-meta text-ink-muted">{language}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-meta text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="overflow-x-auto bg-surface-0/60 px-3 py-2">
        <CodeLines lines={shown} />
      </div>
      {lines.length > CODE_PREVIEW_LINES && (
        <ShowMoreButton
          expanded={expanded}
          label={`Show all ${lines.length} lines`}
          onToggle={() => setExpanded((v) => !v)}
        />
      )}
    </div>
  );
}
