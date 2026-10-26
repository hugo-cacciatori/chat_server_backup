import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useDialogFocus } from "../lib/useDialogFocus";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation for destructive actions; focus starts on Cancel so Enter never destroys by accident. */
export function ConfirmDialog({
  isOpen,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useDialogFocus(dialogRef, isOpen, cancelRef);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
        className="w-full max-w-md overflow-hidden rounded-[10px] border border-line bg-surface-1 shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-rose-500/15 text-rose-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <h2 id="confirm-dialog-title" className="text-heading text-ink">
            {title}
          </h2>
        </div>
        <div className="space-y-2 p-5 text-ui text-ink">{children}</div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-md bg-surface-3 px-3.5 py-1.5 text-ui font-medium text-ink hover:bg-line cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-rose-600 px-3.5 py-1.5 text-ui font-semibold text-white hover:bg-rose-500 cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
