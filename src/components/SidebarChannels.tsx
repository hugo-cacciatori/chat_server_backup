import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Folder,
  Hash,
  LayoutList,
  Lock,
  PanelLeftClose,
  PencilLine,
  Play,
  Search,
  Settings,
  Square,
} from "lucide-react";
import type {
  BackupDescriptor,
  BotRuntimeStatus,
  Channel,
  ServerBackup,
} from "../types/backup";
import { groupChannelsByCategory } from "../lib/ui";

interface SidebarChannelsProps {
  backups: BackupDescriptor[];
  selectedBackupPath: string;
  currentBackup: ServerBackup | null;
  selectedChannelId: string;
  backupRootPath: string;
  canDeleteEditedBackup: boolean;
  botStatus?: BotRuntimeStatus;
  onSelectBackup: (jsonPath: string) => void;
  onSelectChannel: (channelId: string) => void;
  onOpenGlobalSearch: () => void;
  onBrowseBackupRoot?: () => Promise<void> | void;
  onOpenSettings?: () => void;
  onOpenFolderInExplorer?: (folderPath: string) => void;
  onStartExportBot?: () => Promise<void> | void;
  onStopExportBot?: () => Promise<void> | void;
  onDeleteEditedBackup?: () => Promise<void> | void;
  onCollapse?: () => void;
}

/** "2026-10-20 (Edited)" → "2026-10-20 · Edited" (SPEC §7.5). */
export function snapshotOptionLabel(b: BackupDescriptor): string {
  return `${b.date_label} · ${b.is_edited ? "Edited" : "Original"}`;
}

const BOT_STATES: Record<string, { label: string; dot: string }> = {
  starting: { label: "Starting", dot: "bg-amber-400 animate-pulse" },
  connected: { label: "Connected", dot: "bg-emerald-400" },
  exporting: { label: "Exporting", dot: "bg-accent animate-pulse" },
  completed: { label: "Export complete", dot: "bg-emerald-400" },
  error: { label: "Error", dot: "bg-rose-400" },
  stopped: { label: "Stopped", dot: "bg-ink-faint" },
};

export function SidebarChannels({
  backups,
  selectedBackupPath,
  currentBackup,
  selectedChannelId,
  backupRootPath,
  canDeleteEditedBackup,
  botStatus,
  onSelectBackup,
  onSelectChannel,
  onOpenGlobalSearch,
  onBrowseBackupRoot,
  onOpenSettings,
  onOpenFolderInExplorer,
  onStartExportBot,
  onStopExportBot,
  onDeleteEditedBackup,
  onCollapse,
}: SidebarChannelsProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const groups = useMemo(
    () => groupChannelsByCategory(currentBackup?.channels ?? []),
    [currentBackup],
  );

  const toggleCategory = (name: string) =>
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const state = botStatus?.state ?? "stopped";
  const bot = BOT_STATES[state] ?? BOT_STATES.stopped;
  const botRunning = ["starting", "connected", "exporting", "completed"].includes(state);
  const needsToken = botStatus?.has_token_configured === false && state === "stopped";

  const renderChannel = (ch: Channel) => {
    const isSelected = ch.id === selectedChannelId;
    const Icon = ch.type === "forum" ? LayoutList : Hash;
    return (
      <button
        key={ch.id}
        type="button"
        onClick={() => onSelectChannel(ch.id)}
        aria-current={isSelected ? "true" : undefined}
        className={`relative flex w-full items-center gap-2 rounded-md py-1.5 pl-2.5 pr-2 text-left text-ui transition-colors cursor-pointer ${
          isSelected
            ? "bg-surface-3 text-ink before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-accent"
            : "text-ink-muted hover:bg-surface-2 hover:text-ink"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0 opacity-80" />
        <span className="min-w-0 flex-1 truncate">{ch.name}</span>
        <span className="text-meta text-ink-muted">{ch.posts.length}</span>
      </button>
    );
  };

  return (
    <aside className="flex h-full w-full flex-col bg-surface-1 select-none">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line pl-3.5 pr-1.5">
        <h1
          className="min-w-0 flex-1 truncate text-title text-ink"
          title={currentBackup?.name || "Chat Server Backup"}
        >
          {currentBackup?.name || "Chat Server Backup"}
        </h1>
        <button
          type="button"
          onClick={() => onOpenSettings?.()}
          title="Settings (Ctrl+,)"
          aria-label="Settings"
          className="rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
        >
          <Settings className="h-4 w-4" />
        </button>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title="Hide sidebar (Ctrl+B)"
            aria-label="Hide sidebar"
            className="rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Snapshot + search */}
      <div className="space-y-2.5 border-b border-line px-3 py-3">
        <div>
          <label htmlFor="snapshot-select" className="mb-1 block text-meta text-ink-muted">
            Snapshot
          </label>
          <select
            id="snapshot-select"
            aria-label="Select backup snapshot"
            value={selectedBackupPath}
            onChange={(e) => onSelectBackup(e.target.value)}
            className="w-full rounded-md border border-line bg-surface-2 px-2 py-1.5 text-ui text-ink focus:border-accent focus:outline-none cursor-pointer"
          >
            {backups.length === 0 ? (
              <option value="">No backups found</option>
            ) : (
              backups.map((b) => (
                <option key={b.json_path} value={b.json_path}>
                  {snapshotOptionLabel(b)}
                </option>
              ))
            )}
          </select>
          {currentBackup && (
            <div className="mt-1.5 flex items-center justify-between gap-2 text-meta text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                {currentBackup.is_edited ? (
                  <>
                    <PencilLine className="h-3.5 w-3.5" />
                    Edited copy
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    Original · read-only
                  </>
                )}
              </span>
              {canDeleteEditedBackup && onDeleteEditedBackup && (
                <button
                  type="button"
                  onClick={() => onDeleteEditedBackup()}
                  className="rounded px-1 text-rose-400 hover:bg-surface-2 hover:text-rose-300 cursor-pointer"
                >
                  Delete edited copy…
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenGlobalSearch}
          className="flex w-full items-center gap-2 rounded-md border border-line bg-surface-2 px-2 py-1.5 text-ui text-ink-muted hover:text-ink cursor-pointer"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="font-sans text-meta text-ink-faint">Ctrl+K</kbd>
        </button>
      </div>

      {/* Channels grouped by category */}
      <nav aria-label="Channels" className="flex-1 space-y-3 overflow-y-auto px-2 py-3">
        {groups.map((group) => {
          const name = group.category;
          const collapsed = name !== null && collapsedCategories.has(name);
          return (
            <div key={name ?? "__none"}>
              {name !== null && (
                <button
                  type="button"
                  onClick={() => toggleCategory(name)}
                  aria-expanded={!collapsed}
                  className="mb-0.5 flex w-full items-center gap-1 rounded px-1 py-0.5 text-meta text-ink-muted hover:text-ink cursor-pointer"
                >
                  {collapsed ? (
                    <ChevronRight className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  <span className="truncate">{name}</span>
                </button>
              )}
              {!collapsed && <div className="space-y-px">{group.channels.map(renderChannel)}</div>}
            </div>
          );
        })}
        {groups.length === 0 && (
          <p className="px-2 py-6 text-center text-ui text-ink-muted">No channels loaded.</p>
        )}
      </nav>

      {/* Status footer: export bot + backup folder */}
      <div className="shrink-0 space-y-1 border-t border-line px-2 py-2">
        <div className="flex items-center gap-2 rounded-md px-1.5 py-1">
          <span className={`h-2 w-2 shrink-0 rounded-full ${bot.dot}`} aria-hidden="true" />
          {needsToken ? (
            <button
              type="button"
              onClick={() => onOpenSettings?.()}
              className="min-w-0 flex-1 truncate text-left text-ui text-amber-300 hover:text-amber-200 cursor-pointer"
            >
              Set up export bot
            </button>
          ) : (
            <span
              className={`min-w-0 flex-1 truncate text-ui ${state === "error" ? "text-rose-300" : "text-ink-muted"}`}
              title={botStatus?.status_text || bot.label}
            >
              <span className="text-ink">Export bot</span> · {bot.label}
              {botStatus?.status_text && state !== "stopped" ? ` — ${botStatus.status_text}` : ""}
            </span>
          )}
          {botRunning ? (
            <button
              type="button"
              onClick={() => onStopExportBot?.()}
              title="Stop export bot"
              aria-label="Stop export bot"
              className="rounded-md p-1 text-ink-muted hover:bg-surface-2 hover:text-rose-300 cursor-pointer"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStartExportBot?.()}
              title="Start export bot"
              aria-label="Start export bot"
              className="rounded-md p-1 text-ink-muted hover:bg-surface-2 hover:text-emerald-300 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onBrowseBackupRoot?.()}
            title={`Backup folder: ${backupRootPath || "history"} — click to choose another`}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-ui text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            <Folder className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{backupRootPath || "history"}</span>
          </button>
          {onOpenFolderInExplorer && backupRootPath && (
            <button
              type="button"
              onClick={() => onOpenFolderInExplorer(backupRootPath)}
              title="Open backup folder in Explorer"
              aria-label="Open backup folder in Explorer"
              className="rounded-md p-1 text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
