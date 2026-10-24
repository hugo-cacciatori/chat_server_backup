import { useEffect, useId, useRef, useState } from "react";
import {
  ExternalLink,
  FolderOpen,
  Music,
  Pause,
  Play,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { AttachmentRef } from "../types/backup";

const MEDIA_PLAY_EVENT = "chat-backup:media-play";

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
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${rem.toString().padStart(2, "0")}`;
}

interface MediaCardCommonProps {
  att: AttachmentRef;
  displayName: string;
  assetUrl: string;
  onOpenFileDefault?: (filePath: string) => void;
  onRevealInExplorer?: (filePath: string) => void;
}

export function AudioAttachmentCard({
  att,
  displayName,
  assetUrl,
  onOpenFileDefault,
  onRevealInExplorer,
}: MediaCardCommonProps) {
  const playerId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom.detail !== playerId && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    };
    window.addEventListener(MEDIA_PLAY_EVENT, handleOtherPlay);
    return () => window.removeEventListener(MEDIA_PLAY_EVENT, handleOtherPlay);
  }, [playerId]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      window.dispatchEvent(new CustomEvent(MEDIA_PLAY_EVENT, { detail: playerId }));
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const progressRatio = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div className="mt-2 max-w-lg rounded-xl border border-slate-800 bg-slate-900/85 p-3.5 shadow-sm">
      <audio
        ref={audioRef}
        preload="metadata"
        src={assetUrl}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
      />

      {/* Top Row: Icon + Filename + Format Badge + OS Actions */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            <Music className="h-3.5 w-3.5" />
          </div>
          <span className="truncate font-semibold text-slate-100" title={att.filename}>
            {displayName}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-emerald-300 ring-1 ring-emerald-500/30">
            {att.extension}
          </span>
          {att.resolved_path && onOpenFileDefault && (
            <button
              type="button"
              onClick={() => onOpenFileDefault(att.resolved_path!)}
              title="Open in external audio player"
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          {att.resolved_path && onRevealInExplorer && (
            <button
              type="button"
              onClick={() => onRevealInExplorer(att.resolved_path!)}
              title="Show in Explorer"
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom Row: Play/Pause + Seek Slider + Timecode + Volume */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause audio" : "Play audio"}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
            playing
              ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20"
              : "bg-indigo-600 text-white hover:bg-indigo-500"
          }`}
        >
          {playing ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current ml-0.5" />
          )}
        </button>

        <div className="flex flex-1 flex-col gap-1">
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              setCurrentTime(next);
              if (audioRef.current) {
                audioRef.current.currentTime = next;
              }
            }}
            className="h-1.5 w-full cursor-pointer accent-indigo-500"
          />
          <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
            <span>{formatDurationSeconds(currentTime)}</span>
            <span>{Math.round(progressRatio * 100)}%</span>
            <span>{formatDurationSeconds(duration)}</span>
          </div>
        </div>

        {/* Mute & Volume */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const nextMuted = !muted;
              setMuted(nextMuted);
              if (audioRef.current) {
                audioRef.current.muted = nextMuted;
              }
            }}
            title={muted ? "Unmute" : "Mute"}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-3.5 w-3.5 text-rose-400" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVolume(v);
              setMuted(v === 0);
              if (audioRef.current) {
                audioRef.current.volume = v;
                audioRef.current.muted = v === 0;
              }
            }}
            className="h-1 w-14 cursor-pointer accent-slate-400"
          />
        </div>
      </div>
    </div>
  );
}

export function VideoAttachmentCard({
  att,
  displayName,
  assetUrl,
  onOpenFileDefault,
  onRevealInExplorer,
}: MediaCardCommonProps) {
  const playerId = useId();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom.detail !== playerId && videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    };
    window.addEventListener(MEDIA_PLAY_EVENT, handleOtherPlay);
    return () => window.removeEventListener(MEDIA_PLAY_EVENT, handleOtherPlay);
  }, [playerId]);

  return (
    <div className="mt-2 max-w-xl overflow-hidden rounded-xl border border-slate-800 bg-slate-900/85 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 px-3.5 py-2 text-xs text-slate-300">
        <span className="inline-flex min-w-0 items-center gap-2 font-medium">
          <Video className="h-4 w-4 shrink-0 text-indigo-400" />
          <span className="truncate text-slate-100" title={att.filename}>
            {displayName}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-300">
            {att.extension}
          </span>
          {att.resolved_path && onOpenFileDefault && (
            <button
              type="button"
              onClick={() => onOpenFileDefault(att.resolved_path!)}
              title="Open in external video player"
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          {att.resolved_path && onRevealInExplorer && (
            <button
              type="button"
              onClick={() => onRevealInExplorer(att.resolved_path!)}
              title="Show in Explorer"
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <video
        ref={videoRef}
        controls
        preload="metadata"
        src={assetUrl}
        onPlay={() =>
          window.dispatchEvent(new CustomEvent(MEDIA_PLAY_EVENT, { detail: playerId }))
        }
        className="max-h-96 w-full bg-slate-950"
      />
    </div>
  );
}
