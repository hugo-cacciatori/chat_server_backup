import { useEffect } from "react";
import { ExternalLink, FileText, FolderOpen, X } from "lucide-react";

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
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-5 py-2.5 text-xs"
      >
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-rose-400" />
          <span className="truncate font-semibold text-white">{title}</span>
        </div>

        <div className="flex items-center gap-2">
          {filePath && onOpenFileDefault && (
            <button
              type="button"
              onClick={() => onOpenFileDefault(filePath)}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open in PDF App</span>
            </button>
          )}
          {filePath && onRevealInExplorer && (
            <button
              type="button"
              onClick={() => onRevealInExplorer(filePath)}
              className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span>Explorer</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close PDF reader"
            className="ml-2 rounded-full bg-slate-800 p-1.5 text-slate-300 hover:bg-rose-500/20 hover:text-rose-300 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        className="flex-1 bg-slate-950 p-4"
      >
        <iframe
          src={src}
          title={title}
          className="h-full w-full rounded-xl border border-slate-800 bg-white shadow-2xl"
        />
      </div>
    </div>
  );
}
