import { useState } from "react";
import {
  Archive,
  FolderCog,
  Hash,
  LayoutList,
  Lock,
  PencilLine,
  Search,
  Server,
} from "lucide-react";
import type { BackupDescriptor, Channel, ServerBackup } from "../types/backup";

interface SidebarChannelsProps {
  backups: BackupDescriptor[];
  selectedBackupPath: string;
  currentBackup: ServerBackup | null;
  selectedChannelId: string;
  backupRootPath: string;
  onSelectBackup: (jsonPath: string) => void;
  onSelectChannel: (channelId: string) => void;
  onOpenGlobalSearch: () => void;
  onChangeBackupRoot: (newRoot: string) => void;
}

export function SidebarChannels({
  backups,
  selectedBackupPath,
  currentBackup,
  selectedChannelId,
  backupRootPath,
  onSelectBackup,
  onSelectChannel,
  onOpenGlobalSearch,
  onChangeBackupRoot,
}: SidebarChannelsProps) {
  const [editingRoot, setEditingRoot] = useState(false);
  const [rootInput, setRootInput] = useState(backupRootPath);

  const channels = currentBackup?.channels ?? [];
  const forumChannels = channels.filter((c) => c.type === "forum");
  const textChannels = channels.filter((c) => c.type !== "forum");

  const handleSaveRoot = (e: React.FormEvent) => {
    e.preventDefault();
    setEditingRoot(false);
    onChangeBackupRoot(rootInput.trim());
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
              setRootInput(backupRootPath);
              setEditingRoot((v) => !v);
            }}
            title="Configure backup folder path"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-900 hover:text-slate-200 cursor-pointer"
          >
            <FolderCog className="h-4 w-4" />
          </button>
        </div>

        {/* Status Badge: Original vs Edited */}
        {currentBackup && (
          <div className="mt-2.5 flex items-center gap-1.5">
            {currentBackup.is_edited ? (
              <span className="inline-flex w-full items-center gap-1.5 rounded-md bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-300 ring-1 ring-amber-500/30">
                <PencilLine className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Edited Snapshot</span>
              </span>
            ) : (
              <span className="inline-flex w-full items-center gap-1.5 rounded-md bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Original Backup (Immutable)</span>
              </span>
            )}
          </div>
        )}

        {/* Backup Folder Path Editor */}
        {editingRoot && (
          <form onSubmit={handleSaveRoot} className="mt-2.5 space-y-1.5">
            <label className="block text-[11px] font-medium text-slate-400">
              Backup history directory:
            </label>
            <input
              type="text"
              value={rootInput}
              onChange={(e) => setRootInput(e.target.value)}
              placeholder="history"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
            />
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
