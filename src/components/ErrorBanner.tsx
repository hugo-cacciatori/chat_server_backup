import { AlertTriangle, X } from "lucide-react";

interface ErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-[60] flex max-w-xl -translate-x-1/2 items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/95 px-4 py-3 text-xs text-rose-100 shadow-2xl"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
      <span className="min-w-0 flex-1 break-words leading-relaxed">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="rounded p-0.5 text-rose-300 hover:bg-rose-500/20 hover:text-white cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
