import { useEffect, useRef } from "react";
import { ArchiveRestore, RotateCcw, Save, X } from "lucide-react";
import { useDialogFocus } from "../lib/useDialogFocus";

export type SwitchReason = "new-backup" | "snapshot" | "folder";

interface UnsavedEditsPromptModalProps {
  isOpen: boolean;
  reason: SwitchReason;
  targetLabel: string;
  currentDateLabel: string;
  isSaving?: boolean;
  onSaveAndSwitch: () => Promise<void> | void;
  onDiscardAndSwitch: () => void;
  onStayHere: () => void;
}

const TITLES: Record<SwitchReason, string> = {
  "new-backup": "New Backup Available",
  snapshot: "Switch Snapshot?",
  folder: "Change Backup Folder?",
};

export function UnsavedEditsPromptModal({
  isOpen,
  reason,
  targetLabel,
  currentDateLabel,
  isSaving = false,
  onSaveAndSwitch,
  onDiscardAndSwitch,
  onStayHere,
}: UnsavedEditsPromptModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(dialogRef, isOpen);
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) {
        e.preventDefault();
        onStayHere();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, onStayHere]);

  if (!isOpen) return null;

  const editedTargetLabel = `${currentDateLabel || "Current Backup"} (Edited)`;
  const title = TITLES[reason];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onStayHere();
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
              <h2 className="text-sm font-bold text-white">{title}</h2>
              <p className="text-[11px] text-slate-400">{targetLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onStayHere}
            disabled={isSaving}
            aria-label="Stay on current backup"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3 p-5">
          <p className="text-xs leading-relaxed text-slate-200">
            {reason === "new-backup" ? (
              <>
                A new backup (
                <span className="font-semibold text-white">{targetLabel}</span>)
                was added to your history folder, but you have unsaved edits.
              </>
            ) : (
              <>
                You have unsaved edits. Switching to{" "}
                <span className="font-semibold text-white">{targetLabel}</span>{" "}
                discards them unless you save first.
              </>
            )}
          </p>
          <p className="text-xs leading-relaxed text-slate-300">
            Save your current edits to{" "}
            <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-indigo-200 ring-1 ring-indigo-500/30">
              {editedTargetLabel}
            </span>{" "}
            before switching?
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t border-slate-800 bg-slate-950/60 px-5 py-3.5">
          <button
            type="button"
            onClick={() => void onSaveAndSwitch()}
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors cursor-pointer disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" />
            <span>
              {isSaving ? "Saving…" : <>Save to &ldquo;{editedTargetLabel}&rdquo; &amp; Switch</>}
            </span>
          </button>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onDiscardAndSwitch}
              disabled={isSaving}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 hover:border-rose-500/50 hover:bg-rose-500/20 hover:text-rose-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Discard Edits &amp; Switch</span>
            </button>

            <button
              type="button"
              onClick={onStayHere}
              disabled={isSaving}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              Stay Here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
