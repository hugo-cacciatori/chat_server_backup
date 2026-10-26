import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  BackupDescriptor,
  BackupMutationResult,
  BotRuntimeStatus,
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
import { PdfReaderModal } from "./components/PdfReaderModal";
import { SettingsModal } from "./components/SettingsModal";

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

        const firstChannel = loaded.channels[0] ?? null;
        const firstPost = firstChannel?.posts[0] ?? null;
        const chId = firstChannel?.id ?? "";
        const pId = firstPost?.id ?? "";

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
        setBackups(items);
        if (items.length > 0) {
          loadSnapshot(items[0].json_path);
        }
      })
      .catch(() => {
        // Running outside Tauri host (e.g. unit test)
      });
  }, [loadSnapshot]);

  // Global keyboard shortcuts: Ctrl+K (Global Search), Ctrl+, (Settings), Alt+Left (Back), Alt+Right (Forward)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setGlobalSearchOpen((open) => !open);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((open) => !open);
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

    const firstPostId = ch.posts[0]?.id ?? "";
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
          setBackups(items);
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
        setBackups(items);
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
          setBackups(items);
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
          setBotStatus(st);
          if (st.completed_exports > lastCompletedExportsRef.current) {
            lastCompletedExportsRef.current = st.completed_exports;
            invoke<BackupDescriptor[]>("list_discovered_backups", {
              customDir: backupRootPath || null,
            })
              .then((items) => {
                setBackups(items);
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
          .then(setBackups)
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
      localAuthorName,
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
        localAuthorName,
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

  const hasEditedBackupForDate = useMemo(() => {
    if (!currentBackup) return false;
    return (
      currentBackup.is_edited ||
      backups.some(
        (b) => b.date_label === currentBackup.date_label && b.is_edited,
      )
    );
  }, [currentBackup, backups]);

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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Left Pane: Server & Channels */}
      <SidebarChannels
        backups={backups}
        selectedBackupPath={selectedBackupPath}
        currentBackup={currentBackup}
        selectedChannelId={selectedChannelId}
        backupRootPath={backupRootPath}
        localAuthorName={localAuthorName}
        hasUnsavedChanges={hasUnsavedChanges}
        hasEditedBackupForDate={hasEditedBackupForDate}
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
        onChangeBackupRoot={requestBackupRootChange}
        onBrowseBackupRoot={handleBrowseBackupRoot}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenFolderInExplorer={handleOpenFileDefault}
        onStartExportBot={handleStartExportBot}
        onStopExportBot={handleStopExportBot}
        onSaveChanges={handleSaveChanges}
        onDiscardChanges={handleDiscardChanges}
        onDeleteEditedBackup={handleDeleteEditedBackup}
        onChangeLocalAuthor={handleChangeLocalAuthor}
      />

      {/* Middle Pane: Posts / Threads & Multi-Tag Filter Bar */}
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
      />

      {/* Right Pane: Message Stream */}
      <MessageStreamPane
        backup={currentBackup}
        channel={selectedChannel}
        post={selectedPost}
        messageQuery={messageQuery}
        oldestFirst={oldestFirst}
        canGoBack={historyIndex > 0}
        canGoForward={historyIndex >= 0 && historyIndex < history.length - 1}
        highlightedMessageId={highlightedMessageId}
        localAuthorName={localAuthorName}
        hasUnsavedChanges={hasUnsavedChanges}
        onSaveChanges={handleSaveChanges}
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
        onBrowseBackupRoot={handleBrowseBackupRoot}
        onApplyBackupRoot={requestBackupRootChange}
        onRemoveRecentBackupRoot={handleRemoveRecentBackupRoot}
        onOpenFolderInExplorer={handleOpenFileDefault}
        onSaveAuthorProfile={(name, id) => {
          void handleChangeLocalAuthor(name, id);
        }}
        onSaveBotToken={handleSaveBotToken}
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

      <ErrorBanner message={errorMessage} onDismiss={() => setErrorMessage(null)} />
    </div>
  );
}
