import { useEffect, useRef, useState } from "react";
import { FolderOpen, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useDialogFocus } from "../lib/useDialogFocus";

interface LightboxModalProps {
  src: string | null;
  caption: string;
  filePath?: string | null;
  onClose: () => void;
  onRevealInExplorer?: (path: string) => void;
}

export function LightboxModal({
  src,
  caption,
  filePath,
  onClose,
  onRevealInExplorer,
}: LightboxModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(dialogRef, Boolean(src));
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1);
  }, [src]);

  useEffect(() => {
    if (!src) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)));
      if (e.key === "-") setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)));
      if (e.key === "0") setZoom(1);
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
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-2.5 text-xs text-slate-200"
      >
        <div className="truncate font-medium text-slate-100">{caption}</div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))}
            title="Zoom out (-)"
            className="rounded p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-14 text-center font-mono text-xs text-slate-300">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
            title="Zoom in (+)"
            className="rounded p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="Reset zoom (0)"
            className="rounded p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          {filePath && onRevealInExplorer && (
            <button
              type="button"
              onClick={() => onRevealInExplorer(filePath)}
              title="Show in Explorer"
              className="ml-1 inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span>Explorer</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close lightbox"
            className="ml-2 rounded-full bg-slate-800 p-1.5 text-slate-300 hover:bg-rose-500/20 hover:text-rose-300 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        onWheel={(e) => {
          e.stopPropagation();
          const delta = e.deltaY < 0 ? 0.15 : -0.15;
          setZoom((z) => Math.min(4, Math.max(0.25, +(z + delta).toFixed(2))));
        }}
        className="flex flex-1 items-center justify-center overflow-auto p-6"
      >
        <img
          src={src}
          alt={caption}
          onClick={(e) => e.stopPropagation()}
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
          className="max-h-[82vh] max-w-[90vw] rounded-lg object-contain shadow-2xl transition-transform duration-100"
        />
      </div>
    </div>
  );
}
