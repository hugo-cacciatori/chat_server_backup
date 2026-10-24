import { useState } from "react";
import {
  Archive,
  ExternalLink,
  FolderOpen,
  FolderSearch,
  Hash,
  LayoutList,
  Lock,
  PencilLine,
  RotateCcw,
  Save,
  Search,
  Server,
  Settings,
  Trash2,
  UserCircle2,
} from "lucide-react";
import type { BackupDescriptor, Channel, ServerBackup } from "../types/backup";

interface SidebarChannelsProps {
  backups: BackupDescriptor[];
  selectedBackupPath: string;
  currentBackup: ServerBackup | null;
  selectedChannelId: string;
  backupRootPath: string;
  localAuthorName: string;
  hasUnsavedChanges: boolean;
  hasEditedBackupForDate: boolean;
  onSelectBackup: (jsonPath: string) => void;
  onSelectChannel: (channelId: string) => void;
  onOpenGlobalSearch: () => void;
  onChangeBackupRoot: (newRoot: string) => void;
  onBrowseBackupRoot?: () => Promise<void> | void;
  onOpenSettings?: () => void;
  onOpenFolderInExplorer?: (folderPath: string) => void;
  onSaveChanges?: () => Promise<void> | void;
  onDiscardChanges?: () => void;
  onDeleteEditedBackup?: () => Promise<void> | void;
  onChangeLocalAuthor?: (authorName: string) => Promise<void> | void;
}

export function SidebarChannels({
  backups,
  selectedBackupPath,
  currentBackup,
  selectedChannelId,
  backupRootPath,
  localAuthorName,
  hasUnsavedChanges,
  hasEditedBackupForDate,
  onSelectBackup,
  onSelectChannel,
  onOpenGlobalSearch,
  onChangeBackupRoot,
  onBrowseBackupRoot,
  onOpenSettings,
  onOpenFolderInExplorer,
  onSaveChanges,
  onDiscardChanges,
  onDeleteEditedBackup,
  onChangeLocalAuthor,
}: SidebarChannelsProps) {
  const [editingRoot, setEditingRoot] = useState(false);
  const [rootInput, setRootInput] = useState(backupRootPath);
  const [authorInput, setAuthorInput] = useState(localAuthorName);

  const channels = currentBackup?.channels ?? [];
  const forumChannels = channels.filter((c) => c.type === "forum");
  const textChannels = channels.filter((c) => c.type !== "forum");

  const handleSaveRoot = (e: React.FormEvent) => {
    e.preventDefault();
    setEditingRoot(false);
    onChangeBackupRoot(rootInput.trim());
    if (onChangeLocalAuthor && authorInput.trim()) {
      onChangeLocalAuthor(authorInput.trim());
    }
  };

  const renderChannelButton = (ch: Channel) => {
    const isSelected = ch.id === selectedChannelId;
    const isForum = ch.type === "forum";
    const Icon = isForum ? LayoutList : Hash;
    return (
      <button
        key={ch.id}
        type="button"
        onClick={() => onSelectChannel(ch.id)}
        className={`group flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all cursor-pointer ${
          isSelected
            ? "bg-indigo-600/20 text-white ring-1 ring-indigo-500/40"
            : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            className={`h-4 w-4 shrink-0 ${
              isSelected
                ? "text-indigo-400"
                : "text-slate-500 group-hover:text-slate-300"
            }`}
          />
          <span className="truncate">{ch.name}</span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            isSelected
              ? "bg-indigo-500/30 text-indigo-200"
              : "bg-slate-900 text-slate-400 group-hover:bg-slate-800"
          }`}
        >
          {ch.posts.length}
        </span>
      </button>
    );
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-800/90 bg-slate-950 select-none">
      {/* Server Header */}
      <div className="border-b border-slate-800/90 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 ring-1 ring-indigo-500/30">
              <Server className="h-4 w-4" />
            </div>
            <h1 className="truncate text-sm font-bold text-white">
              {currentBackup?.name || "Chat Server Backup"}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onOpenSettings) {
                onOpenSettings();
              } else {
                setRootInput(backupRootPath);
                setAuthorInput(localAuthorName);
                setEditingRoot((v) => !v);
              }
            }}
            title="Open Settings (Ctrl+,)"
            aria-label="Open Settings"
            className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            <Settings className="h-3.5 w-3.5 text-indigo-400" />
            <span>Settings</span>
          </button>
        </div>

        {/* Status Badge & Explicit Save / Delete Edited Backup Controls */}
        {currentBackup && (
          <div className="mt-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5">
              {hasUnsavedChanges ? (
                <span className="inline-flex w-full items-center gap-1.5 rounded-md bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-400/40">
                  <PencilLine className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                  <span className="truncate">Unsaved Changes (Not Saved Yet)</span>
                </span>
              ) : currentBackup.is_edited ? (
                <span className="inline-flex w-full items-center gap-1.5 rounded-md bg-indigo-500/15 px-2.5 py-1 text-[11px] font-medium text-indigo-300 ring-1 ring-indigo-500/30">
                  <PencilLine className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Edited Backup</span>
                </span>
              ) : (
                <span className="inline-flex w-full items-center gap-1.5 rounded-md bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Original Backup (Immutable)</span>
                </span>
              )}
            </div>

            {hasUnsavedChanges && onSaveChanges && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onSaveChanges()}
                  title="Save changes to the Edited backup (Ctrl+S)"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>Save (Ctrl+S)</span>
                </button>
                {onDiscardChanges && (
                  <button
                    type="button"
                    onClick={onDiscardChanges}
                    title="Discard unsaved session changes"
                    className="flex items-center justify-center gap-1 rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-[11px] font-medium text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Discard</span>
                  </button>
                )}
              </div>
            )}

            {hasEditedBackupForDate && onDeleteEditedBackup && (
              <button
                type="button"
                onClick={() => onDeleteEditedBackup()}
                title="Delete the saved Edited backup for this date and return to Original"
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-300 hover:border-rose-500/50 hover:bg-rose-500/20 hover:text-rose-200 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Edited Backup</span>
              </button>
            )}
          </div>
        )}

        {/* Direct Backup Folder Bar (right above Snapshot Selector) */}
        <div className="mt-2.5">
          <div className="mb-1 flex items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <FolderOpen className="h-3 w-3" />
              <span>Backup Folder</span>
            </span>
            <div className="flex items-center gap-1">
              {onBrowseBackupRoot && (
                <button
                  type="button"
                  onClick={() => onBrowseBackupRoot()}
                  title="Browse and select a backup history folder on your PC"
                  aria-label="Browse backup folder"
                  className="inline-flex items-center gap-1 rounded bg-indigo-600/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer"
                >
                  <FolderSearch className="h-3 w-3" />
                  <span>Browse…</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setRootInput(backupRootPath);
                  setAuthorInput(localAuthorName);
                  setEditingRoot((v) => !v);
                }}
                title="Edit folder path manually"
                aria-label="Edit backup folder path"
                className="rounded p-1 text-slate-400 hover:bg-slate-900 hover:text-slate-200 cursor-pointer"
              >
                <PencilLine className="h-3 w-3" />
              </button>
              {onOpenFolderInExplorer && backupRootPath && (
                <button
                  type="button"
                  onClick={() => onOpenFolderInExplorer(backupRootPath)}
                  title="Open backup folder in File Explorer"
                  aria-label="Open backup folder in File Explorer"
                  className="rounded p-1 text-slate-400 hover:bg-slate-900 hover:text-slate-200 cursor-pointer"
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onBrowseBackupRoot) {
                void onBrowseBackupRoot();
              } else {
                setRootInput(backupRootPath);
                setAuthorInput(localAuthorName);
                setEditingRoot((v) => !v);
              }
            }}
            title={`Active backup folder: ${backupRootPath || "history"} (Click to browse)`}
            className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-slate-800/90 bg-slate-900/70 px-2.5 py-1.5 text-left font-mono text-[11px] text-slate-300 hover:border-slate-700 hover:bg-slate-900 hover:text-white transition-colors cursor-pointer"
          >
            <span className="truncate">{backupRootPath || "history"}</span>
          </button>
        </div>

        {/* Inline Backup Folder & Local Author Profile Editor */}
        {editingRoot && (
          <form onSubmit={handleSaveRoot} className="mt-2 space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-400">
                Backup history directory:
              </label>
              <input
                type="text"
                value={rootInput}
                onChange={(e) => setRootInput(e.target.value)}
                placeholder="history"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                <UserCircle2 className="h-3 w-3 text-indigo-400" />
                <span>Local author name:</span>
              </label>
              <input
                type="text"
                value={authorInput}
                onChange={(e) => setAuthorInput(e.target.value)}
                placeholder="Local User"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setEditingRoot(false)}
                className="rounded px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 cursor-pointer"
              >
                Apply
              </button>
            </div>
          </form>
        )}

        {/* Snapshot Selector */}
        <div className="mt-2.5">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <Archive className="h-3 w-3" />
            <span>Snapshot</span>
          </div>
          <select
            aria-label="Select backup snapshot"
            value={selectedBackupPath}
            onChange={(e) => onSelectBackup(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none cursor-pointer"
          >
            {backups.length === 0 ? (
              <option value="">No backups found</option>
            ) : (
              backups.map((b) => (
                <option key={b.json_path} value={b.json_path}>
                  {b.display_label}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Global Search Button (Ctrl+K) */}
        <button
          type="button"
          onClick={onOpenGlobalSearch}
          className="mt-2.5 flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-400 hover:border-slate-700 hover:bg-slate-900 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <span className="inline-flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <span>Search backup…</span>
          </span>
          <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Channels List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
        {forumChannels.length > 0 && (
          <div>
            <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Forums ({forumChannels.length})
            </div>
            <div className="space-y-0.5">{forumChannels.map(renderChannelButton)}</div>
          </div>
        )}

        {textChannels.length > 0 && (
          <div>
            <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Text Channels ({textChannels.length})
            </div>
            <div className="space-y-0.5">{textChannels.map(renderChannelButton)}</div>
          </div>
        )}

        {channels.length === 0 && (
          <div className="px-2 py-8 text-center text-xs text-slate-500">
            No channels loaded.
          </div>
        )}
      </div>
    </aside>
  );
}
