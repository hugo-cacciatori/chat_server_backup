import { useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  FolderOpen,
  FolderSearch,
  History,
  RotateCcw,
  Settings,
  Trash2,
  UserCircle2,
  X,
} from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  backupRootPath: string;
  recentBackupRoots: string[];
  localAuthorName: string;
  localAuthorId: string;
  snapshotCount: number;
  onClose: () => void;
  onBrowseBackupRoot: () => Promise<void> | void;
  onApplyBackupRoot: (newRoot: string) => void;
  onRemoveRecentBackupRoot?: (folderPath: string) => void;
  onOpenFolderInExplorer?: (folderPath: string) => void;
  onSaveAuthorProfile: (authorName: string, authorId: string) => void;
}

export function SettingsModal({
  isOpen,
  backupRootPath,
  recentBackupRoots,
  localAuthorName,
  localAuthorId,
  snapshotCount,
  onClose,
  onBrowseBackupRoot,
  onApplyBackupRoot,
  onRemoveRecentBackupRoot,
  onOpenFolderInExplorer,
  onSaveAuthorProfile,
}: SettingsModalProps) {
  const [folderInput, setFolderInput] = useState(backupRootPath);
  const [authorNameInput, setAuthorNameInput] = useState(localAuthorName);
  const [authorIdInput, setAuthorIdInput] = useState(localAuthorId);

  useEffect(() => {
    if (isOpen) {
      setFolderInput(backupRootPath);
      setAuthorNameInput(localAuthorName);
      setAuthorIdInput(localAuthorId);
    }
  }, [isOpen, backupRootPath, localAuthorName, localAuthorId]);

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

  const handleApplyFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApplyBackupRoot(folderInput.trim());
  };

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    if (folderInput.trim() !== backupRootPath.trim()) {
      onApplyBackupRoot(folderInput.trim());
    }
    if (authorNameInput.trim()) {
      onSaveAuthorProfile(
        authorNameInput.trim(),
        authorIdInput.trim() || "local-user-1",
      );
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 ring-1 ring-indigo-500/30">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Settings</h2>
              <p className="text-[11px] text-slate-400">
                Configure backup folder location and local author profile
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Backup History Folder Section */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="settings-backup-folder-input"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-200"
              >
                <FolderOpen className="h-3.5 w-3.5 text-indigo-400" />
                <span>Backup History Folder</span>
              </label>
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
                {snapshotCount}{" "}
                {snapshotCount === 1 ? "snapshot found" : "snapshots found"}
              </span>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-400">
              Select the root{" "}
              <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-200">
                history
              </code>{" "}
              folder containing dated backup subdirectories (e.g.{" "}
              <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-200">
                2026-10-24/server_export_2026-10-24.json
              </code>
              ).
            </p>

            <form onSubmit={handleApplyFolderSubmit} className="flex gap-2">
              <input
                id="settings-backup-folder-input"
                aria-label="Backup folder path"
                type="text"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="history"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
              >
                Load Path
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => onBrowseBackupRoot()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors cursor-pointer"
              >
                <FolderSearch className="h-3.5 w-3.5" />
                <span>Browse Folder…</span>
              </button>

              {onOpenFolderInExplorer && backupRootPath && (
                <button
                  type="button"
                  onClick={() => onOpenFolderInExplorer(backupRootPath)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open in Explorer</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setFolderInput("");
                  onApplyBackupRoot("");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:border-slate-700 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset to Default</span>
              </button>
            </div>
          </section>

          {/* Recent Backup Folders Section */}
          {recentBackupRoots.length > 0 && (
            <section className="space-y-2 border-t border-slate-800/80 pt-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <History className="h-3.5 w-3.5 text-indigo-400" />
                <span>Recent Backup Folders</span>
              </div>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-1.5">
                {recentBackupRoots.map((folder) => {
                  const isCurrent =
                    folder.toLowerCase() === backupRootPath.toLowerCase();
                  return (
                    <div
                      key={folder}
                      className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                        isCurrent
                          ? "bg-indigo-600/15 text-indigo-200 ring-1 ring-indigo-500/30"
                          : "text-slate-300 hover:bg-slate-900"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setFolderInput(folder);
                          onApplyBackupRoot(folder);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left font-mono text-[11px] cursor-pointer"
                        title={`Switch to ${folder}`}
                      >
                        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{folder}</span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                            <Check className="h-3 w-3" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setFolderInput(folder);
                              onApplyBackupRoot(folder);
                            }}
                            className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-200 hover:bg-indigo-600 hover:text-white cursor-pointer"
                          >
                            Switch
                          </button>
                        )}
                        {onRemoveRecentBackupRoot && !isCurrent && (
                          <button
                            type="button"
                            onClick={() => onRemoveRecentBackupRoot(folder)}
                            title="Remove from recent folders"
                            aria-label={`Remove ${folder} from recent folders`}
                            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Local Author Profile Section */}
          <section className="space-y-3 border-t border-slate-800/80 pt-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <UserCircle2 className="h-3.5 w-3.5 text-indigo-400" />
              <span>Local Author Profile (Offline Editing)</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Used when you post new messages or create new forum threads locally
              in an archive.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="settings-author-name"
                  className="block text-[11px] font-medium text-slate-400"
                >
                  Display Name
                </label>
                <input
                  id="settings-author-name"
                  aria-label="Local author name"
                  type="text"
                  value={authorNameInput}
                  onChange={(e) => setAuthorNameInput(e.target.value)}
                  placeholder="Local User"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="settings-author-id"
                  className="block text-[11px] font-medium text-slate-400"
                >
                  Author ID
                </label>
                <input
                  id="settings-author-id"
                  aria-label="Local author ID"
                  type="text"
                  value={authorIdInput}
                  onChange={(e) => setAuthorIdInput(e.target.value)}
                  placeholder="local-user-1"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/60 px-5 py-3">
          <span className="text-[11px] text-slate-500">
            Shortcut: <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">Ctrl+,</kbd>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors cursor-pointer"
            >
              Save & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
