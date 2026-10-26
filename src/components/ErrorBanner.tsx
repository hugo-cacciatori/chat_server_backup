import { AlertTriangle, X } from "lucide-react";

interface ErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
}

/** Error notice at the bottom right, above the composer so it never covers it (SPEC §7.10). */
export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-24 right-6 z-[60] flex max-w-md items-start gap-2.5 rounded-[10px] border border-rose-500/40 bg-surface-2 px-4 py-3 text-ui text-ink shadow-2xl"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="rounded p-0.5 text-ink-muted hover:bg-surface-3 hover:text-ink cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
