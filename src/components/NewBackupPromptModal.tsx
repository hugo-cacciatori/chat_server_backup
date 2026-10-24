import { useEffect } from "react";
import { ArchiveRestore, RotateCcw, Save, X } from "lucide-react";

interface NewBackupPromptModalProps {
  isOpen: boolean;
  newBackupLabel: string;
  currentDateLabel: string;
  onSaveAndSwitch: () => Promise<void> | void;
  onDiscardAndSwitch: () => void;
  onStayHere: () => void;
}

export function NewBackupPromptModal({
  isOpen,
  newBackupLabel,
  currentDateLabel,
  onSaveAndSwitch,
  onDiscardAndSwitch,
  onStayHere,
}: NewBackupPromptModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onStayHere();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onStayHere]);

  if (!isOpen) return null;

  const editedTargetLabel = `${currentDateLabel || "Current Backup"} (Edited)`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="New Backup Available"
      onClick={(e) => {
        if (e.target === e.currentTarget) onStayHere();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 ring-1 ring-indigo-500/30">
              <ArchiveRestore className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                New Backup Available
              </h2>
              <p className="text-[11px] text-slate-400">{newBackupLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onStayHere}
            aria-label="Stay on current backup"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3 p-5">
          <p className="text-xs leading-relaxed text-slate-200">
            A new backup (
            <span className="font-semibold text-white">{newBackupLabel}</span>)
            was added to your history folder, but you have unsaved edits.
          </p>
          <p className="text-xs leading-relaxed text-slate-300">
            Save your current edits to{" "}
            <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-indigo-200 ring-1 ring-indigo-500/30">
              {editedTargetLabel}
            </span>{" "}
            before switching to the new backup?
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t border-slate-800 bg-slate-950/60 px-5 py-3.5">
          <button
            type="button"
            onClick={() => void onSaveAndSwitch()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Save to &ldquo;{editedTargetLabel}&rdquo; &amp; Switch</span>
          </button>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onDiscardAndSwitch}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 hover:border-rose-500/50 hover:bg-rose-500/20 hover:text-rose-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Discard Edits &amp; Switch</span>
            </button>

            <button
              type="button"
              onClick={onStayHere}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
            >
              Stay Here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
