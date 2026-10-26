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

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const PAN_STEP = 40;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +z.toFixed(2)));

/** Image viewer: wheel / +/- to zoom, drag or arrow keys to pan above 100 %, 0 to reset (SPEC §7.10). */
export function LightboxModal({ src, caption, filePath, onClose, onRevealInExplorer }: LightboxModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(dialogRef, Boolean(src));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  useEffect(reset, [src]);

  useEffect(() => {
    if (zoom <= 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  useEffect(() => {
    if (!src) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") setZoom((z) => clampZoom(z + 0.25));
      else if (e.key === "-") setZoom((z) => clampZoom(z - 0.25));
      else if (e.key === "0") reset();
      else if (e.key.startsWith("Arrow") && zoom > 1) {
        e.preventDefault();
        const dx = e.key === "ArrowLeft" ? PAN_STEP : e.key === "ArrowRight" ? -PAN_STEP : 0;
        const dy = e.key === "ArrowUp" ? PAN_STEP : e.key === "ArrowDown" ? -PAN_STEP : 0;
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [src, zoom, onClose]);

  if (!src) return null;

  const toolButton = "rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer";

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={caption || "Image"}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-black/85"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-2 border-b border-line bg-surface-1 px-4 py-2"
      >
        <div className="min-w-0 flex-1 truncate text-ui text-ink">{caption}</div>
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z - 0.25))}
          title="Zoom out (-)"
          aria-label="Zoom out"
          className={toolButton}
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="w-12 text-center font-mono text-meta text-ink-muted">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z + 0.25))}
          title="Zoom in (+)"
          aria-label="Zoom in"
          className={toolButton}
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button type="button" onClick={reset} title="Reset (0)" aria-label="Reset zoom" className={toolButton}>
          <RotateCcw className="h-4 w-4" />
        </button>
        {filePath && onRevealInExplorer && (
          <button
            type="button"
            onClick={() => onRevealInExplorer(filePath)}
            title="Show in Explorer"
            aria-label="Show in Explorer"
            className={toolButton}
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={onClose} title="Close (Esc)" aria-label="Close image" className={toolButton}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div
        onWheel={(e) => {
          e.stopPropagation();
          setZoom((z) => clampZoom(z + (e.deltaY < 0 ? 0.15 : -0.15)));
        }}
        className="flex flex-1 items-center justify-center overflow-hidden p-6"
      >
        <img
          src={src}
          alt={caption}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            if (zoom <= 1) return;
            drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            setPan({ x: d.panX + (e.clientX - d.x) / zoom, y: d.panY + (e.clientY - d.y) / zoom });
          }}
          onPointerUp={(e) => {
            drag.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)` }}
          className={`max-h-[82vh] max-w-[90vw] select-none rounded-md object-contain ${
            zoom > 1 ? "cursor-grab active:cursor-grabbing" : ""
          } ${drag.current ? "" : "transition-transform duration-100"}`}
        />
      </div>
    </div>
  );
}
