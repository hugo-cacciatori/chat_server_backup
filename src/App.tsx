import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  BackupDescriptor,
  BackupMutationResult,
  BotRuntimeStatus,
  PostOrThread,
  ServerBackup,
} from "./types/backup";
import {
  resolveTargetInBackup,
  type InternalServerTarget,
} from "./lib/links";
import {
  addMessageInMemory,
  createPostInMemory,
  deleteMessageInMemory,
  editMessageInMemory,
} from "./lib/editing";
import { SidebarChannels } from "./components/SidebarChannels";
import {
  PostListPane,
  filterAndSortPosts,
  type PostSortMode,
  type TagMatchMode,
} from "./components/PostListPane";
import { MessageStreamPane } from "./components/MessageStreamPane";
import { GlobalSearchModal } from "./components/GlobalSearchModal";
import { LightboxModal } from "./components/LightboxModal";
import {
  UnsavedEditsPromptModal,
  type SwitchReason,
} from "./components/UnsavedEditsPromptModal";
import { ErrorBanner } from "./components/ErrorBanner";
import {
  CollapsedRail,
  NoBackupsState,
  PaneResizer,
  SessionBar,
} from "./components/LayoutShell";
import {
  DEFAULT_LAYOUT,
  clampPostListWidth,
  clampSidebarWidth,
  fitPaneWidths,
  loadLayout,
  saveLayout,
  type PaneLayout,
} from "./lib/layout";
import { groupChannelsByCategory } from "./lib/ui";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { keepIfUnchanged } from "./lib/state";
import { PdfReaderModal } from "./components/PdfReaderModal";
import { SettingsModal, type SettingsDraft } from "./components/SettingsModal";

/** A switch away from the current backup, held until the user answers the unsaved-edits prompt. */
type PendingSwitch =
  | { kind: "snapshot"; reason: SwitchReason; jsonPath: string; label: string }
  | { kind: "folder"; reason: SwitchReason; root: string; label: string };

interface NavHistoryEntry {
  channelId: string;
  postId: string;
  messageId: string | null;
}

interface AppSettings {
  backup_root: string;
  recent_backup_roots?: string[];
  local_author_name: string;
  local_author_id: string;
  bot_token?: string;
}

/** The post shown first when a channel opens: the top of the list in its current order (SPEC §7.6). */
function firstPostInListOrder(posts: PostOrThread[], sortMode: PostSortMode): string {
  return filterAndSortPosts(posts, "", new Set(), "any", sortMode)[0]?.id ?? "";
}

export function App() {
  const [backups, setBackups] = useState<BackupDescriptor[]>([]);
  const [backupRootPath, setBackupRootPath] = useState<string>("history");
  const [recentBackupRoots, setRecentBackupRoots] = useState<string[]>([]);
  const [localAuthorName, setLocalAuthorName] = useState<string>("Local User");
  const [localAuthorId, setLocalAuthorId] = useState<string>("local-user-1");
  const [botToken, setBotToken] = useState<string>("");
  const [botStatus, setBotStatus] = useState<BotRuntimeStatus>({
    state: "stopped",
    status_text: "Bot stopped",
    bot_username: null,
    completed_exports: 0,
    last_export_path: null,
    last_error: null,
    has_token_configured: false,
  });
  const lastCompletedExportsRef = useRef<number>(0);
  const knownOriginalPathsRef = useRef<Set<string>>(new Set());
  const hasInitializedDiscoveryRef = useRef<boolean>(false);
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch | null>(null);
  const [isSavingForSwitch, setIsSavingForSwitch] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [discoveryDone, setDiscoveryDone] = useState<boolean>(false);

  // Pane widths and collapsed state (SPEC §7.4)
  const [layout, setLayout] = useState<PaneLayout>(loadLayout);
  const [windowWidth, setWindowWidth] = useState<number>(() => window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  useEffect(() => saveLayout(layout), [layout]);
  const paneWidths = fitPaneWidths(layout, windowWidth);
  const [selectedBackupPath, setSelectedBackupPath] = useState<string>("");
  const [currentBackup, setCurrentBackup] = useState<ServerBackup | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [selectedPostId, setSelectedPostId] = useState<string>("");
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(
    null,
  );

  // Filters & sorting
  const [postQuery, setPostQuery] = useState<string>("");
  const [activeTagIds, setActiveTagIds] = useState<Set<string>>(new Set());
  const [tagMatchMode, setTagMatchMode] = useState<TagMatchMode>("any");
  const [sortMode, setSortMode] = useState<PostSortMode>("recent");
  const sortModeRef = useRef<PostSortMode>(sortMode);
  sortModeRef.current = sortMode;
  const [messageQuery, setMessageQuery] = useState<string>("");
  const [oldestFirst, setOldestFirst] = useState<boolean>(true);

  // Navigation history (Back / Forward)
  const [history, setHistory] = useState<NavHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Modals
  const [globalSearchOpen, setGlobalSearchOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [lightboxState, setLightboxState] = useState<{
    src: string | null;
    caption: string;
    filePath?: string | null;
  }>({ src: null, caption: "", filePath: null });
  const [pdfModalState, setPdfModalState] = useState<{
    src: string | null;
    title: string;
    filePath?: string | null;
  }>({ src: null, title: "", filePath: null });

  const pushHistory = useCallback(
    (channelId: string, postId: string, messageId: string | null = null) => {
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        const last = sliced[sliced.length - 1];
        if (
          last &&
          last.channelId === channelId &&
          last.postId === postId &&
          last.messageId === messageId
        ) {
          return prev;
        }
        const next = [...sliced, { channelId, postId, messageId }];
        setHistoryIndex(next.length - 1);
        return next;
      });
    },
    [historyIndex],
  );

  const reportError = useCallback((context: string, err: unknown) => {
    console.error(`${context}:`, err);
    setErrorMessage(`${context}: ${String(err)}`);
  }, []);

  const loadSnapshot = useCallback((jsonPath: string) => {
    if (!jsonPath) return;
    invoke<ServerBackup>("load_backup_command", {
      jsonPath,
      sortChronological: true,
    })
      .then((loaded) => {
        setSelectedBackupPath(jsonPath);
        setHasUnsavedChanges(false);
        setCurrentBackup(loaded);
        setPostQuery("");
        setActiveTagIds(new Set());
        setMessageQuery("");
        setHighlightedMessageId(null);

        const firstChannel = groupChannelsByCategory(loaded.channels)[0]?.channels[0] ?? null;
        const chId = firstChannel?.id ?? "";
        const pId = firstChannel ? firstPostInListOrder(firstChannel.posts, sortModeRef.current) : "";

        setSelectedChannelId(chId);
        setSelectedPostId(pId);
        if (chId && pId) {
          setHistory([{ channelId: chId, postId: pId, messageId: null }]);
          setHistoryIndex(0);
        } else {
          setHistory([]);
          setHistoryIndex(-1);
        }
      })
      .catch((err) => reportError("Could not load backup", err));
  }, [reportError]);

  // Initial discovery on mount
  useEffect(() => {
    invoke<AppSettings>("get_app_settings")
      .then((cfg) => {
        if (cfg.backup_root) {
          setBackupRootPath(cfg.backup_root);
        }
        if (Array.isArray(cfg.recent_backup_roots)) {
          setRecentBackupRoots(cfg.recent_backup_roots);
        }
        if (cfg.local_author_name) {
          setLocalAuthorName(cfg.local_author_name);
        }
        if (cfg.local_author_id) {
          setLocalAuthorId(cfg.local_author_id);
        }
        if (typeof cfg.bot_token === "string") {
          setBotToken(cfg.bot_token);
        }
        invoke<BotRuntimeStatus>("get_export_bot_status")
          .then((st) => {
            setBotStatus(st);
            lastCompletedExportsRef.current = st.completed_exports;
          })
          .catch(() => {});
        return invoke<BackupDescriptor[]>("list_discovered_backups", {
          customDir: cfg.backup_root || null,
        });
      })
      .catch(() =>
        invoke<BackupDescriptor[]>("list_discovered_backups", {
          customDir: null,
        }),
      )
      .then((items) => {
        knownOriginalPathsRef.current = new Set(
          items.filter((b) => !b.is_edited).map((b) => b.json_path.toLowerCase()),
        );
        hasInitializedDiscoveryRef.current = true;
        setBackups((prev) => keepIfUnchanged(prev, items));
        setDiscoveryDone(true);
        if (items.length > 0) {
          loadSnapshot(items[0].json_path);
        }
      })
      .catch(() => {
        // Running outside Tauri host (e.g. unit test)
      });
  }, [loadSnapshot]);

  // Global keyboard shortcuts: Ctrl+K (search), Ctrl+, (Settings), Ctrl+B / Ctrl+Shift+B (panes), Alt+Left/Right (history)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setGlobalSearchOpen((open) => !open);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((open) => !open);
      } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyB") {
        e.preventDefault();
        setLayout((l) =>
          e.shiftKey
            ? { ...l, postListCollapsed: !l.postListCollapsed }
            : { ...l, sidebarCollapsed: !l.sidebarCollapsed },
        );
      } else if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        if (historyIndex > 0) {
          const target = history[historyIndex - 1];
          setHistoryIndex(historyIndex - 1);
          setSelectedChannelId(target.channelId);
          setSelectedPostId(target.postId);
          setHighlightedMessageId(target.messageId);
        }
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        if (historyIndex >= 0 && historyIndex < history.length - 1) {
          const target = history[historyIndex + 1];
          setHistoryIndex(historyIndex + 1);
          setSelectedChannelId(target.channelId);
          setSelectedPostId(target.postId);
          setHighlightedMessageId(target.messageId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [history, historyIndex]);

  const selectedChannel = useMemo(
    () =>
      currentBackup?.channels.find((c) => c.id === selectedChannelId) ?? null,
    [currentBackup, selectedChannelId],
  );

  const selectedPost = useMemo(
    () => selectedChannel?.posts.find((p) => p.id === selectedPostId) ?? null,
    [selectedChannel, selectedPostId],
  );

  const handleSelectChannel = (channelId: string) => {
    const ch = currentBackup?.channels.find((c) => c.id === channelId);
    if (!ch) return;
    setSelectedChannelId(channelId);
    setPostQuery("");
    setActiveTagIds(new Set());
    setMessageQuery("");
    setHighlightedMessageId(null);

    const firstPostId = firstPostInListOrder(ch.posts, sortMode);
    setSelectedPostId(firstPostId);
    if (firstPostId) {
      pushHistory(channelId, firstPostId, null);
    }
  };

  const handleSelectPost = (postId: string) => {
    setSelectedPostId(postId);
    setMessageQuery("");
    setHighlightedMessageId(null);
    if (selectedChannelId) {
      pushHistory(selectedChannelId, postId, null);
    }
  };

  const handleToggleTag = (tagId: string) => {
    setActiveTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  const handleNavigateToLocation = useCallback(
    (channelId: string, postId: string, messageId: string | null) => {
      // Clear any filters that might hide the destination post or message
      setPostQuery("");
      setActiveTagIds(new Set());
      setMessageQuery("");

      setSelectedChannelId(channelId);
      setSelectedPostId(postId);
      setHighlightedMessageId(messageId);
      pushHistory(channelId, postId, messageId);
    },
    [pushHistory],
  );

  const handleJumpToInternalTarget = useCallback(
    (target: InternalServerTarget) => {
      const resolved = resolveTargetInBackup(currentBackup, target);
      if (!resolved) {
        return;
      }
      handleNavigateToLocation(
        resolved.channel.id,
        resolved.post.id,
        resolved.message?.id ?? null,
      );
    },
    [currentBackup, handleNavigateToLocation],
  );

  const applyBackupRoot = useCallback(
    (newRoot: string) => {
      setBackupRootPath(newRoot);
      invoke<BackupDescriptor[]>("set_backup_root", {
        backupRoot: newRoot,
      })
        .then((items) => {
          knownOriginalPathsRef.current = new Set(
            items
              .filter((b) => !b.is_edited)
              .map((b) => b.json_path.toLowerCase()),
          );
          hasInitializedDiscoveryRef.current = true;
          setDiscoveryDone(true);
          setBackups((prev) => keepIfUnchanged(prev, items));
          if (items.length > 0) {
            loadSnapshot(items[0].json_path);
          } else {
            setCurrentBackup(null);
            setSelectedBackupPath("");
            setHasUnsavedChanges(false);
          }
          return invoke<AppSettings>("get_app_settings");
        })
        .then((cfg) => {
          if (cfg.backup_root) {
            setBackupRootPath(cfg.backup_root);
          }
          if (Array.isArray(cfg.recent_backup_roots)) {
            setRecentBackupRoots(cfg.recent_backup_roots);
          }
        })
        .catch((err) => reportError("Could not change backup folder", err));
    },
    [loadSnapshot, reportError],
  );

  const requestBackupRootChange = useCallback(
    (newRoot: string) => {
      if (hasUnsavedChanges && currentBackup) {
        setPendingSwitch({ kind: "folder", reason: "folder", root: newRoot, label: newRoot });
      } else {
        applyBackupRoot(newRoot);
      }
    },
    [hasUnsavedChanges, currentBackup, applyBackupRoot],
  );

  const requestSnapshotSwitch = useCallback(
    (jsonPath: string, label: string, reason: SwitchReason) => {
      if (!jsonPath) return;
      if (hasUnsavedChanges && currentBackup) {
        if (reason !== "new-backup" && jsonPath === selectedBackupPath) return;
        setPendingSwitch({ kind: "snapshot", reason, jsonPath, label });
      } else {
        loadSnapshot(jsonPath);
      }
    },
    [hasUnsavedChanges, currentBackup, selectedBackupPath, loadSnapshot],
  );

  const handleBrowseBackupRoot = useCallback(async () => {
    try {
      const picked = await invoke<string | null>("pick_backup_folder", {
        initialDir: backupRootPath || null,
      });
      if (picked && picked.trim()) {
        requestBackupRootChange(picked.trim());
      }
    } catch (err) {
      reportError("Could not open the folder picker", err);
    }
  }, [backupRootPath, requestBackupRootChange, reportError]);

  const pickFolder = useCallback(async (): Promise<string | null> => {
    try {
      const picked = await invoke<string | null>("pick_backup_folder", {
        initialDir: backupRootPath || null,
      });
      return picked?.trim() || null;
    } catch (err) {
      reportError("Could not open the folder picker", err);
      return null;
    }
  }, [backupRootPath, reportError]);

  const handleRemoveRecentBackupRoot = useCallback(async (folderPath: string) => {
    try {
      const cfg = await invoke<AppSettings>("remove_recent_backup_root", {
        folderPath,
      });
      if (Array.isArray(cfg.recent_backup_roots)) {
        setRecentBackupRoots(cfg.recent_backup_roots);
      }
    } catch (err) {
      reportError("Could not remove recent backup folder", err);
    }
  }, [reportError]);

  const handleOpenExternalUrl = (url: string) => {
    invoke("open_external_url", { url }).catch((err) =>
      reportError("Could not open link", err),
    );
  };

  const handleOpenFileDefault = (filePath: string) => {
    invoke("open_path_in_os", { path: filePath, revealInFolder: false }).catch(
      (err) => reportError("Could not open file", err),
    );
  };

  const handleRevealInExplorer = (filePath: string) => {
    invoke("open_path_in_os", { path: filePath, revealInFolder: true }).catch(
      (err) => reportError("Could not show file in Explorer", err),
    );
  };

  const applyMutationResult = useCallback(
    async (res: BackupMutationResult) => {
      setCurrentBackup(res.backup);
      setSelectedBackupPath(res.saved_path);
      setHasUnsavedChanges(false);
      if (res.active_post_id) {
        setSelectedPostId(res.active_post_id);
      } else {
        const ch =
          res.backup.channels.find((c) => c.id === selectedChannelId) ??
          res.backup.channels[0] ??
          null;
        if (ch) {
          setSelectedChannelId(ch.id);
          const stillHasPost = ch.posts.some((p) => p.id === selectedPostId);
          if (!stillHasPost) {
            setSelectedPostId(ch.posts[0]?.id ?? "");
          }
        }
      }
      if (res.active_message_id) {
        setHighlightedMessageId(res.active_message_id);
      }
      try {
        const items = await invoke<BackupDescriptor[]>(
          "list_discovered_backups",
          {
            customDir: backupRootPath || null,
          },
        );
        setBackups((prev) => keepIfUnchanged(prev, items));
      } catch (err) {
        reportError("Could not refresh the backup list", err);
      }
    },
    [backupRootPath, selectedChannelId, selectedPostId, reportError],
  );

  const handleChangeLocalAuthor = async (
    authorName: string,
    authorId?: string,
  ) => {
    setLocalAuthorName(authorName);
    if (authorId) {
      setLocalAuthorId(authorId);
    }
    try {
      await invoke<AppSettings>("set_local_author_profile", {
        authorName,
        authorId: authorId ?? null,
      });
    } catch (err) {
      reportError("Could not save local author profile", err);
    }
  };

  const handleSaveBotToken = useCallback(async (newToken: string) => {
    setBotToken(newToken);
    try {
      await invoke<AppSettings>("set_bot_token", {
        botToken: newToken,
      });
      const st = await invoke<BotRuntimeStatus>("get_export_bot_status");
      setBotStatus(st);
    } catch (err) {
      reportError("Could not save bot token", err);
    }
  }, [reportError]);

  const handleStartExportBot = useCallback(async () => {
    if (!botToken.trim() && !botStatus.has_token_configured) {
      setSettingsOpen(true);
      return;
    }
    try {
      const st = await invoke<BotRuntimeStatus>("start_export_bot");
      setBotStatus(st);
    } catch (err) {
      const msg = String(err);
      setBotStatus((prev) => ({
        ...prev,
        state: "error",
        status_text: msg,
        last_error: msg,
      }));
      if (msg.toLowerCase().includes("token")) {
        setSettingsOpen(true);
      }
    }
  }, [botToken, botStatus.has_token_configured]);

  const handleStopExportBot = useCallback(async () => {
    try {
      const st = await invoke<BotRuntimeStatus>("stop_export_bot");
      setBotStatus(st);
    } catch (err) {
      reportError("Could not stop export bot", err);
    }
  }, [reportError]);

  const handleNewBackupArrival = useCallback(
    (jsonPath: string, displayLabel: string) =>
      requestSnapshotSwitch(jsonPath, displayLabel, "new-backup"),
    [requestSnapshotSwitch],
  );

  // Continuously watch the active history folder while the app is running for newly added backups
  useEffect(() => {
    const watcher = window.setInterval(() => {
      if (!hasInitializedDiscoveryRef.current) return;
      invoke<BackupDescriptor[]>("list_discovered_backups", {
        customDir: backupRootPath || null,
      })
        .then((items) => {
          setBackups((prev) => keepIfUnchanged(prev, items));
          const originals = items.filter((b) => !b.is_edited);
          const newlyAdded = originals.find(
            (b) => !knownOriginalPathsRef.current.has(b.json_path.toLowerCase()),
          );
          if (newlyAdded) {
            for (const orig of originals) {
              knownOriginalPathsRef.current.add(orig.json_path.toLowerCase());
            }
            handleNewBackupArrival(
              newlyAdded.json_path,
              newlyAdded.display_label,
            );
          } else {
            for (const orig of originals) {
              knownOriginalPathsRef.current.add(orig.json_path.toLowerCase());
            }
          }
        })
        .catch(() => {});
    }, 2000);

    return () => window.clearInterval(watcher);
  }, [backupRootPath, handleNewBackupArrival]);

  // Poll Export Bot runtime status while active and auto-reload snapshots on export completion
  useEffect(() => {
    const isRunning =
      botStatus.state === "starting" ||
      botStatus.state === "connected" ||
      botStatus.state === "exporting" ||
      botStatus.state === "completed";
    if (!isRunning) return;

    const timer = window.setInterval(() => {
      invoke<BotRuntimeStatus>("get_export_bot_status")
        .then((st) => {
          setBotStatus((prev) => keepIfUnchanged(prev, st));
          if (st.completed_exports > lastCompletedExportsRef.current) {
            lastCompletedExportsRef.current = st.completed_exports;
            invoke<BackupDescriptor[]>("list_discovered_backups", {
              customDir: backupRootPath || null,
            })
              .then((items) => {
                setBackups((prev) => keepIfUnchanged(prev, items));
                for (const orig of items.filter((b) => !b.is_edited)) {
                  knownOriginalPathsRef.current.add(
                    orig.json_path.toLowerCase(),
                  );
                }
                const targetDesc =
                  items.find(
                    (b) =>
                      st.last_export_path &&
                      b.json_path.toLowerCase() ===
                        st.last_export_path.toLowerCase(),
                  ) ??
                  items.find((b) => !b.is_edited) ??
                  items[0] ??
                  null;
                if (targetDesc) {
                  handleNewBackupArrival(
                    targetDesc.json_path,
                    targetDesc.display_label,
                  );
                } else if (st.last_export_path) {
                  handleNewBackupArrival(st.last_export_path, "New Backup");
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }, 1000);

    return () => window.clearInterval(timer);
  }, [botStatus.state, backupRootPath, handleNewBackupArrival]);

  const completeSwitch = useCallback(
    (target: PendingSwitch) => {
      if (target.kind === "snapshot") {
        loadSnapshot(target.jsonPath);
      } else {
        applyBackupRoot(target.root);
      }
    },
    [loadSnapshot, applyBackupRoot],
  );

  const handleSaveAndSwitch = useCallback(async () => {
    if (!pendingSwitch) return;
    const target = pendingSwitch;
    if (currentBackup && hasUnsavedChanges) {
      setIsSavingForSwitch(true);
      try {
        await invoke<BackupMutationResult>("save_backup_changes", {
          backup: currentBackup,
        });
      } catch (err) {
        // Stay on the current backup with the edits intact.
        setIsSavingForSwitch(false);
        setPendingSwitch(null);
        reportError("Edits were not saved, staying on the current backup", err);
        return;
      }
      setIsSavingForSwitch(false);
      setHasUnsavedChanges(false);
      if (target.kind === "snapshot") {
        invoke<BackupDescriptor[]>("list_discovered_backups", {
          customDir: backupRootPath || null,
        })
          .then((items) => setBackups((prev) => keepIfUnchanged(prev, items)))
          .catch((err) => reportError("Could not refresh the backup list", err));
      }
    }
    setPendingSwitch(null);
    completeSwitch(target);
  }, [
    pendingSwitch,
    currentBackup,
    hasUnsavedChanges,
    backupRootPath,
    completeSwitch,
    reportError,
  ]);

  const handleDiscardAndSwitch = useCallback(() => {
    if (!pendingSwitch) return;
    const target = pendingSwitch;
    setPendingSwitch(null);
    completeSwitch(target);
  }, [pendingSwitch, completeSwitch]);

  const handleSendMessage = (
    content: string,
    attachmentPaths: string[],
    replyToId: string | null,
  ) => {
    if (!currentBackup || !selectedChannelId || !selectedPostId) return;
    const { backup: updated, createdMessageId } = addMessageInMemory(
      currentBackup,
      selectedChannelId,
      selectedPostId,
      { name: localAuthorName, id: localAuthorId },
      content,
      attachmentPaths,
      replyToId,
    );
    setCurrentBackup(updated);
    setHasUnsavedChanges(true);
    setHighlightedMessageId(createdMessageId);
  };

  const handleEditMessage = (
    messageId: string,
    newContent: string,
    newAttachmentPaths: string[],
  ) => {
    if (!currentBackup || !selectedChannelId || !selectedPostId) return;
    const { backup: updated } = editMessageInMemory(
      currentBackup,
      selectedChannelId,
      selectedPostId,
      messageId,
      newContent,
      newAttachmentPaths,
    );
    setCurrentBackup(updated);
    setHasUnsavedChanges(true);
    setHighlightedMessageId(messageId);
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!currentBackup || !selectedChannelId || !selectedPostId) return;
    const { backup: updated } = deleteMessageInMemory(
      currentBackup,
      selectedChannelId,
      selectedPostId,
      messageId,
    );
    setCurrentBackup(updated);
    setHasUnsavedChanges(true);
  };

  const handleCreatePost = (
    title: string,
    initialContent: string,
    tagIds: string[],
    attachmentPaths: string[],
  ) => {
    if (!currentBackup || !selectedChannelId) return;
    const { backup: updated, createdPostId, createdMessageId } =
      createPostInMemory(
        currentBackup,
        selectedChannelId,
        title,
        { name: localAuthorName, id: localAuthorId },
        initialContent,
        tagIds,
        attachmentPaths,
      );
    setCurrentBackup(updated);
    setHasUnsavedChanges(true);
    setSelectedPostId(createdPostId);
    setHighlightedMessageId(createdMessageId);
  };

  const handleSaveChanges = useCallback(async () => {
    if (!currentBackup || !hasUnsavedChanges) return;
    try {
      const res = await invoke<BackupMutationResult>("save_backup_changes", {
        backup: currentBackup,
      });
      await applyMutationResult(res);
    } catch (err) {
      reportError("Save failed, your edits are still unsaved", err);
    }
  }, [currentBackup, hasUnsavedChanges, applyMutationResult, reportError]);

  const handleDiscardChanges = useCallback(() => {
    if (!selectedBackupPath) return;
    loadSnapshot(selectedBackupPath);
  }, [selectedBackupPath, loadSnapshot]);

  const handleDeleteEditedBackup = useCallback(async () => {
    if (!selectedBackupPath) return;
    try {
      const res = await invoke<BackupMutationResult>(
        "delete_edited_backup_command",
        {
          jsonPath: selectedBackupPath,
        },
      );
      await applyMutationResult(res);
    } catch (err) {
      reportError("Could not delete edited backup", err);
    }
  }, [selectedBackupPath, applyMutationResult, reportError]);

  // Destructive actions wait for confirmation (SPEC §2.2.1).
  const [pendingConfirm, setPendingConfirm] = useState<"delete-edited" | "discard" | null>(
    null,
  );
  const cancelConfirm = useCallback(() => setPendingConfirm(null), []);
  const confirmPendingAction = useCallback(() => {
    const action = pendingConfirm;
    setPendingConfirm(null);
    if (action === "delete-edited") void handleDeleteEditedBackup();
    else if (action === "discard") handleDiscardChanges();
  }, [pendingConfirm, handleDeleteEditedBackup, handleDiscardChanges]);

  // Global keyboard shortcut: Ctrl+S (Save Changes)
  useEffect(() => {
    const handleSaveKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSaveChanges();
      }
    };
    window.addEventListener("keydown", handleSaveKey);
    return () => window.removeEventListener("keydown", handleSaveKey);
  }, [handleSaveChanges]);

  const handleSaveSettings = (draft: SettingsDraft) => {
    if (draft.folder !== backupRootPath.trim()) requestBackupRootChange(draft.folder);
    if (draft.authorName !== localAuthorName || draft.authorId !== localAuthorId) {
      void handleChangeLocalAuthor(draft.authorName, draft.authorId);
    }
    if (draft.botToken !== botToken.trim()) void handleSaveBotToken(draft.botToken);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-0 text-ink">
      {/* Left pane: snapshot, search, channels, status footer */}
      {layout.sidebarCollapsed ? (
        <CollapsedRail
          label="sidebar"
          shortcut="Ctrl+B"
          onExpand={() => setLayout((l) => ({ ...l, sidebarCollapsed: false }))}
        />
      ) : (
        <>
          <div className="h-full shrink-0" style={{ width: paneWidths.sidebar }}>
            <SidebarChannels
              backups={backups}
              selectedBackupPath={selectedBackupPath}
              currentBackup={currentBackup}
              selectedChannelId={selectedChannelId}
              backupRootPath={backupRootPath}
              canDeleteEditedBackup={Boolean(currentBackup?.is_edited)}
              botStatus={botStatus}
              onSelectBackup={(jsonPath) =>
                requestSnapshotSwitch(
                  jsonPath,
                  backups.find((b) => b.json_path === jsonPath)?.display_label ?? jsonPath,
                  "snapshot",
                )
              }
              onSelectChannel={handleSelectChannel}
              onOpenGlobalSearch={() => setGlobalSearchOpen(true)}
              onBrowseBackupRoot={handleBrowseBackupRoot}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenFolderInExplorer={handleOpenFileDefault}
              onStartExportBot={handleStartExportBot}
              onStopExportBot={handleStopExportBot}
              onDeleteEditedBackup={() => setPendingConfirm("delete-edited")}
              onCollapse={() => setLayout((l) => ({ ...l, sidebarCollapsed: true }))}
            />
          </div>
          <PaneResizer
            label="Resize sidebar"
            width={paneWidths.sidebar}
            onResize={(w) => setLayout((l) => ({ ...l, sidebarWidth: clampSidebarWidth(w) }))}
            onReset={() => setLayout((l) => ({ ...l, sidebarWidth: DEFAULT_LAYOUT.sidebarWidth }))}
          />
        </>
      )}

      {/* Middle pane: posts / threads */}
      {layout.postListCollapsed ? (
        <CollapsedRail
          label="post list"
          shortcut="Ctrl+Shift+B"
          onExpand={() => setLayout((l) => ({ ...l, postListCollapsed: false }))}
        />
      ) : (
        <>
          <div className="h-full shrink-0" style={{ width: paneWidths.postList }}>
            <PostListPane
              channel={selectedChannel}
              selectedPostId={selectedPostId}
              postQuery={postQuery}
              activeTagIds={activeTagIds}
              tagMatchMode={tagMatchMode}
              sortMode={sortMode}
              onChangePostQuery={setPostQuery}
              onToggleTag={handleToggleTag}
              onClearTags={() => setActiveTagIds(new Set())}
              onChangeTagMatchMode={setTagMatchMode}
              onChangeSortMode={setSortMode}
              onSelectPost={handleSelectPost}
              onCreatePost={handleCreatePost}
              onCollapse={() => setLayout((l) => ({ ...l, postListCollapsed: true }))}
            />
          </div>
          <PaneResizer
            label="Resize post list"
            width={paneWidths.postList}
            onResize={(w) => setLayout((l) => ({ ...l, postListWidth: clampPostListWidth(w) }))}
            onReset={() => setLayout((l) => ({ ...l, postListWidth: DEFAULT_LAYOUT.postListWidth }))}
          />
        </>
      )}

      {/* Right pane: session bar + messages */}
      <div className="flex min-w-0 flex-1 flex-col">
        {hasUnsavedChanges && currentBackup && (
          <SessionBar
            dateLabel={currentBackup.date_label}
            onSave={() => void handleSaveChanges()}
            onDiscard={() => setPendingConfirm("discard")}
          />
        )}
        {discoveryDone && backups.length === 0 ? (
          <NoBackupsState
            folder={backupRootPath}
            hasBotToken={botStatus.has_token_configured || Boolean(botToken.trim())}
            onChooseFolder={() => void handleBrowseBackupRoot()}
            onSetUpBot={() => setSettingsOpen(true)}
            onStartBot={() => void handleStartExportBot()}
          />
        ) : (
          <MessageStreamPane
            backup={currentBackup}
            channel={selectedChannel}
            post={selectedPost}
            messageQuery={messageQuery}
            oldestFirst={oldestFirst}
            canGoBack={historyIndex > 0}
            canGoForward={historyIndex >= 0 && historyIndex < history.length - 1}
            highlightedMessageId={highlightedMessageId}
            onChangeMessageQuery={setMessageQuery}
            onToggleOldestFirst={() => setOldestFirst((v) => !v)}
            onGoBack={() => {
              if (historyIndex > 0) {
                const target = history[historyIndex - 1];
                setHistoryIndex(historyIndex - 1);
                setSelectedChannelId(target.channelId);
                setSelectedPostId(target.postId);
                setHighlightedMessageId(target.messageId);
              }
            }}
            onGoForward={() => {
              if (historyIndex >= 0 && historyIndex < history.length - 1) {
                const target = history[historyIndex + 1];
                setHistoryIndex(historyIndex + 1);
                setSelectedChannelId(target.channelId);
                setSelectedPostId(target.postId);
                setHighlightedMessageId(target.messageId);
              }
            }}
            onJumpToTarget={handleJumpToInternalTarget}
            onJumpToMessageInPost={(msgId) => setHighlightedMessageId(msgId)}
            onOpenExternalUrl={handleOpenExternalUrl}
            onOpenImageLightbox={(src, caption, filePath) =>
              setLightboxState({ src, caption, filePath })
            }
            onOpenPdfModal={(src, title, filePath) =>
              setPdfModalState({ src, title, filePath })
            }
            onOpenFileDefault={handleOpenFileDefault}
            onRevealInExplorer={handleRevealInExplorer}
            onSendMessage={handleSendMessage}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
          />
        )}
      </div>

      {/* Global Search Modal (Ctrl+K) */}
      <GlobalSearchModal
        isOpen={globalSearchOpen}
        backup={currentBackup}
        onClose={() => setGlobalSearchOpen(false)}
        onSelectResult={(chId, pId, msgId) =>
          handleNavigateToLocation(chId, pId, msgId)
        }
      />

      {/* Image Lightbox Modal */}
      <LightboxModal
        src={lightboxState.src}
        caption={lightboxState.caption}
        filePath={lightboxState.filePath}
        onClose={() =>
          setLightboxState({ src: null, caption: "", filePath: null })
        }
        onRevealInExplorer={handleRevealInExplorer}
      />

      {/* Full-Viewport PDF Reader Modal */}
      <PdfReaderModal
        src={pdfModalState.src}
        title={pdfModalState.title}
        filePath={pdfModalState.filePath}
        onClose={() =>
          setPdfModalState({ src: null, title: "", filePath: null })
        }
        onOpenFileDefault={handleOpenFileDefault}
        onRevealInExplorer={handleRevealInExplorer}
      />

      {/* Settings Modal (Ctrl+,) */}
      <SettingsModal
        isOpen={settingsOpen}
        backupRootPath={backupRootPath}
        recentBackupRoots={recentBackupRoots}
        localAuthorName={localAuthorName}
        localAuthorId={localAuthorId}
        botToken={botToken}
        snapshotCount={backups.length}
        onClose={() => setSettingsOpen(false)}
        onPickFolder={pickFolder}
        onSave={handleSaveSettings}
        onRemoveRecentBackupRoot={handleRemoveRecentBackupRoot}
        onOpenFolderInExplorer={handleOpenFileDefault}
      />

      {/* Prompt before any switch away from unsaved edits */}
      <UnsavedEditsPromptModal
        isOpen={pendingSwitch !== null}
        reason={pendingSwitch?.reason ?? "snapshot"}
        targetLabel={pendingSwitch?.label ?? ""}
        currentDateLabel={currentBackup?.date_label ?? "Current Backup"}
        isSaving={isSavingForSwitch}
        onSaveAndSwitch={handleSaveAndSwitch}
        onDiscardAndSwitch={handleDiscardAndSwitch}
        onStayHere={() => setPendingSwitch(null)}
      />

      <ConfirmDialog
        isOpen={pendingConfirm === "delete-edited"}
        title="Delete edited copy?"
        confirmLabel="Delete edited copy"
        onConfirm={confirmPendingAction}
        onCancel={cancelConfirm}
      >
        <p>
          This permanently removes{" "}
          <code className="font-mono text-ink">
            server_export_{currentBackup?.date_label}_edited.json
          </code>{" "}
          and the{" "}
          <code className="font-mono text-ink">
            assets_{currentBackup?.date_label}_edited/
          </code>{" "}
          folder, then returns to the Original backup.
        </p>
        <p className="text-ink-muted">
          {hasUnsavedChanges ? "Your unsaved edits are lost too. " : ""}The Original backup is
          never touched. This cannot be undone.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={pendingConfirm === "discard"}
        title="Discard unsaved changes?"
        confirmLabel="Discard changes"
        onConfirm={confirmPendingAction}
        onCancel={cancelConfirm}
      >
        <p>
          Your unsaved edits to{" "}
          <span className="font-semibold text-ink">
            {currentBackup?.date_label} ({currentBackup?.is_edited ? "Edited" : "Original"})
          </span>{" "}
          are dropped and the backup reloads from disk.
        </p>
      </ConfirmDialog>

      <ErrorBanner message={errorMessage} onDismiss={() => setErrorMessage(null)} />
    </div>
  );
}
