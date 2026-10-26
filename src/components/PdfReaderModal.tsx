import { useEffect, useRef } from "react";
import { ExternalLink, FileText, FolderOpen, X } from "lucide-react";
import { useDialogFocus } from "../lib/useDialogFocus";

interface PdfReaderModalProps {
  src: string | null;
  title: string;
  filePath?: string | null;
  onClose: () => void;
  onOpenFileDefault?: (filePath: string) => void;
  onRevealInExplorer?: (filePath: string) => void;
}

export function PdfReaderModal({
  src,
  title,
  filePath,
  onClose,
  onOpenFileDefault,
  onRevealInExplorer,
}: PdfReaderModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(dialogRef, Boolean(src));
  useEffect(() => {
    if (!src) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-black/85"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-between border-b border-line bg-surface-1 px-4 py-2"
      >
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-ink-muted" />
          <span className="truncate font-semibold text-ink">{title}</span>
        </div>

        <div className="flex items-center gap-2">
          {filePath && onOpenFileDefault && (
            <button
              type="button"
              onClick={() => onOpenFileDefault(filePath)}
              className="inline-flex items-center gap-1 rounded-md bg-accent-strong px-2.5 py-1 text-ui font-medium text-white hover:bg-accent cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open in PDF App</span>
            </button>
          )}
          {filePath && onRevealInExplorer && (
            <button
              type="button"
              onClick={() => onRevealInExplorer(filePath)}
              className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2.5 py-1 text-ui font-medium text-ink hover:bg-surface-3 cursor-pointer"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span>Explorer</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close PDF reader"
            className="ml-2 rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        className="flex-1 p-4"
      >
        <iframe
          src={src}
          title={title}
          className="h-full w-full rounded-md bg-white"
        />
      </div>
    </div>
  );
}
