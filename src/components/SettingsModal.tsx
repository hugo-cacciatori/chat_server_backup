import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, FolderOpen, FolderSearch, Trash2, X } from "lucide-react";
import { useDialogFocus } from "../lib/useDialogFocus";

/** Every editable setting; applied together by the single Save (SPEC §7.10). */
export interface SettingsDraft {
  folder: string;
  botToken: string;
  authorName: string;
  authorId: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  backupRootPath: string;
  recentBackupRoots: string[];
  localAuthorName: string;
  localAuthorId: string;
  botToken?: string;
  snapshotCount: number;
  onClose: () => void;
  /** Opens the native folder picker and returns the chosen path without applying it. */
  onPickFolder: () => Promise<string | null>;
  onSave: (draft: SettingsDraft) => void;
  onRemoveRecentBackupRoot?: (folderPath: string) => void;
  onOpenFolderInExplorer?: (folderPath: string) => void;
}

const inputClass =
  "w-full rounded-md border border-line bg-surface-0 px-2.5 py-1.5 text-ui text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";
const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-md bg-surface-3 px-2.5 py-1.5 text-ui text-ink hover:text-white cursor-pointer";

export function SettingsModal({
  isOpen,
  backupRootPath,
  recentBackupRoots,
  localAuthorName,
  localAuthorId,
  botToken = "",
  snapshotCount,
  onClose,
  onPickFolder,
  onSave,
  onRemoveRecentBackupRoot,
  onOpenFolderInExplorer,
}: SettingsModalProps) {
  const dialogRef = useRef<HTMLFormElement | null>(null);
  useDialogFocus(dialogRef, isOpen);
  const [folder, setFolder] = useState(backupRootPath);
  const [authorName, setAuthorName] = useState(localAuthorName);
  const [authorId, setAuthorId] = useState(localAuthorId);
  const [token, setToken] = useState(botToken);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFolder(backupRootPath);
      setAuthorName(localAuthorName);
      setAuthorId(localAuthorId);
      setToken(botToken);
      setShowToken(false);
    }
  }, [isOpen, backupRootPath, localAuthorName, localAuthorId, botToken]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      folder: folder.trim(),
      botToken: token.trim(),
      authorName: authorName.trim() || localAuthorName,
      authorId: authorId.trim() || localAuthorId,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[10px] border border-line bg-surface-1 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="settings-title" className="text-heading text-ink">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {/* Backup folder */}
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="settings-folder" className="text-title text-ink">
                Backup folder
              </label>
              <span className="text-meta text-ink-muted">
                {snapshotCount} {snapshotCount === 1 ? "snapshot" : "snapshots"} in the current folder
              </span>
            </div>
            <p className="text-ui text-ink-muted">
              The folder that holds dated backups, such as <code className="text-ink">2026-10-24/server_export_2026-10-24.json</code>.
              Leave empty to use the <code className="text-ink">history</code> folder next to the app.
            </p>
            <input
              id="settings-folder"
              type="text"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="history"
              className={`${inputClass} font-mono`}
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={async () => {
                  const picked = await onPickFolder();
                  if (picked) setFolder(picked);
                }}
                className={secondaryButton}
              >
                <FolderSearch className="h-4 w-4" />
                Browse…
              </button>
              {onOpenFolderInExplorer && backupRootPath && (
                <button type="button" onClick={() => onOpenFolderInExplorer(backupRootPath)} className={secondaryButton}>
                  <FolderOpen className="h-4 w-4" />
                  Open in Explorer
                </button>
              )}
            </div>

            {recentBackupRoots.length > 0 && (
              <div className="pt-1">
                <div className="mb-1 text-meta text-ink-muted">Recent folders</div>
                <ul className="max-h-36 overflow-y-auto rounded-md border border-line">
                  {recentBackupRoots.map((recent) => {
                    const isChosen = recent.toLowerCase() === folder.trim().toLowerCase();
                    const isCurrent = recent.toLowerCase() === backupRootPath.toLowerCase();
                    return (
                      <li key={recent} className="flex items-center border-b border-line last:border-0">
                        <button
                          type="button"
                          onClick={() => setFolder(recent)}
                          aria-pressed={isChosen}
                          title={recent}
                          className={`min-w-0 flex-1 truncate px-2.5 py-1.5 text-left font-mono text-meta cursor-pointer ${
                            isChosen ? "bg-surface-3 text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                          }`}
                        >
                          {recent}
                          {isCurrent && <span className="ml-2 font-sans text-ink-faint">current</span>}
                        </button>
                        {onRemoveRecentBackupRoot && !isCurrent && (
                          <button
                            type="button"
                            onClick={() => onRemoveRecentBackupRoot(recent)}
                            title="Remove from recent folders"
                            aria-label={`Remove ${recent} from recent folders`}
                            className="p-1.5 text-ink-faint hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          {/* Export bot token */}
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="settings-token" className="text-title text-ink">
                Export bot token
              </label>
              <span className={`text-meta ${token.trim() ? "text-emerald-400" : "text-amber-300"}`}>
                {token.trim() ? "Token set" : "No token"}
              </span>
            </div>
            <p className="text-ui text-ink-muted">
              Stored only on this PC in <code className="text-ink">%LOCALAPPDATA%\ChatServerBackup\settings.json</code> and
              passed to the export bot through its environment.
            </p>
            <div className="relative">
              <input
                id="settings-token"
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste the bot token"
                autoComplete="off"
                className={`${inputClass} pr-9 font-mono`}
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                aria-label={showToken ? "Hide token" : "Show token"}
                title={showToken ? "Hide token" : "Show token"}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink cursor-pointer"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </section>

          {/* Local author */}
          <section className="space-y-2">
            <h3 className="text-title text-ink">Local author</h3>
            <p className="text-ui text-ink-muted">Used for messages and posts you add in the app.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="settings-author-name" className="mb-1 block text-meta text-ink-muted">
                  Display name
                </label>
                <input
                  id="settings-author-name"
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Local User"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="settings-author-id" className="mb-1 block text-meta text-ink-muted">
                  Author ID
                </label>
                <input
                  id="settings-author-id"
                  type="text"
                  value={authorId}
                  onChange={(e) => setAuthorId(e.target.value)}
                  placeholder="local-user-1"
                  className={`${inputClass} font-mono`}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-ui text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-accent-strong px-4 py-1.5 text-ui font-semibold text-white hover:bg-accent cursor-pointer"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
