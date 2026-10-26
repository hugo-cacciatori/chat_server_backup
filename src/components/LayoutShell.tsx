import { useRef } from "react";
import { FolderSearch, PanelLeftOpen, Play, RotateCcw, Save, Settings } from "lucide-react";

interface PaneResizerProps {
  label: string;
  width: number;
  onResize: (width: number) => void;
  onReset: () => void;
}

const KEY_STEP = 16;

/** Vertical drag handle between panes (SPEC §7.4): drag, arrow keys, double-click to reset. */
export function PaneResizer({ label, width, onResize, onReset }: PaneResizerProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={(e) => {
        drag.current = { startX: e.clientX, startWidth: width };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        onResize(drag.current.startWidth + e.clientX - drag.current.startX);
      }}
      onPointerUp={(e) => {
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onResize(width - KEY_STEP);
        else if (e.key === "ArrowRight") onResize(width + KEY_STEP);
        else return;
        e.preventDefault();
      }}
      className="group relative z-10 -mx-[3px] w-1.5 shrink-0 cursor-col-resize"
    >
      <div className="mx-auto h-full w-px bg-line transition-colors group-hover:bg-accent/60 group-focus-visible:bg-accent" />
    </div>
  );
}

/** 40 px rail left by a collapsed pane, with a button to bring it back. */
export function CollapsedRail({ label, shortcut, onExpand }: { label: string; shortcut: string; onExpand: () => void }) {
  return (
    <div className="flex h-full w-10 shrink-0 flex-col items-center border-r border-line bg-surface-1 py-2">
      <button
        type="button"
        onClick={onExpand}
        title={`Show ${label} (${shortcut})`}
        aria-label={`Show ${label}`}
        className="rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
      >
        <PanelLeftOpen className="h-4 w-4" />
      </button>
    </div>
  );
}

interface SessionBarProps {
  dateLabel: string;
  onSave: () => void;
  onDiscard: () => void;
}

/** The only Save in the app (SPEC §7.8); shown only while there are unsaved edits. */
export function SessionBar({ dateLabel, onSave, onDiscard }: SessionBarProps) {
  return (
    <div
      role="status"
      className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-amber-400/10 px-5 py-1.5"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-ui text-ink">
        Unsaved changes
        <span className="text-ink-muted"> — they will be saved to the Edited copy of {dateLabel}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onDiscard}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-ui text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          title="Save (Ctrl+S)"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent-strong px-3 py-1 text-ui font-semibold text-white hover:bg-accent cursor-pointer"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </button>
      </div>
    </div>
  );
}

interface NoBackupsStateProps {
  folder: string;
  hasBotToken: boolean;
  onChooseFolder: () => void;
  onSetUpBot: () => void;
  onStartBot: () => void;
}

/** First run / empty folder (SPEC §7.11). */
export function NoBackupsState({ folder, hasBotToken, onChooseFolder, onSetUpBot, onStartBot }: NoBackupsStateProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md rounded-[10px] border border-line bg-surface-1 p-6 text-center">
        <h2 className="text-heading text-ink">No backups found</h2>
        <p className="mt-2 break-all text-ui text-ink-muted">
          Nothing was found in <span className="text-ink">{folder || "history"}</span>. Choose the folder that
          holds your dated backups, or create a backup with the export bot.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onChooseFolder}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-strong px-3 py-1.5 text-ui font-semibold text-white hover:bg-accent cursor-pointer"
          >
            <FolderSearch className="h-4 w-4" />
            Choose folder…
          </button>
          {hasBotToken ? (
            <button
              type="button"
              onClick={onStartBot}
              className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-3 py-1.5 text-ui text-ink hover:bg-surface-3 cursor-pointer"
            >
              <Play className="h-4 w-4" />
              Start export bot
            </button>
          ) : (
            <button
              type="button"
              onClick={onSetUpBot}
              className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-3 py-1.5 text-ui text-ink hover:bg-surface-3 cursor-pointer"
            >
              <Settings className="h-4 w-4" />
              Set up export bot
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
