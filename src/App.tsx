import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BackupDescriptor, ServerBackup } from "./types/backup";
import {
  resolveTargetInBackup,
  type InternalServerTarget,
} from "./lib/links";
import { SidebarChannels } from "./components/SidebarChannels";
import {
  PostListPane,
  type PostSortMode,
  type TagMatchMode,
} from "./components/PostListPane";
import { MessageStreamPane } from "./components/MessageStreamPane";
import { GlobalSearchModal } from "./components/GlobalSearchModal";
import { LightboxModal } from "./components/LightboxModal";

interface NavHistoryEntry {
  channelId: string;
  postId: string;
  messageId: string | null;
}

interface AppSettings {
  backup_root: string;
  local_author_name: string;
  local_author_id: string;
}

export function App() {
  const [backups, setBackups] = useState<BackupDescriptor[]>([]);
  const [backupRootPath, setBackupRootPath] = useState<string>("history");
  const [selectedBackupPath, setSelectedBackupPath] = useState<string>("");
  const [currentBackup, setCurrentBackup] = useState<ServerBackup | null>(null);

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
  const [lightboxState, setLightboxState] = useState<{
    src: string | null;
    caption: string;
    filePath?: string | null;
  }>({ src: null, caption: "", filePath: null });

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

  const loadSnapshot = useCallback((jsonPath: string) => {
    if (!jsonPath) return;
    setSelectedBackupPath(jsonPath);
    invoke<ServerBackup>("load_backup_command", {
      jsonPath,
      sortChronological: true,
    })
      .then((loaded) => {
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
      .catch((err) => {
        console.error("Failed to load backup:", err);
      });
  }, []);

  // Initial discovery on mount
  useEffect(() => {
    invoke<AppSettings>("get_app_settings")
      .then((cfg) => {
        if (cfg.backup_root) {
          setBackupRootPath(cfg.backup_root);
        }
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
        setBackups(items);
        if (items.length > 0) {
          loadSnapshot(items[0].json_path);
        }
      })
      .catch(() => {
        // Running outside Tauri host (e.g. unit test)
      });
  }, [loadSnapshot]);

  // Global keyboard shortcuts: Ctrl+K (Global Search), Alt+Left (Back), Alt+Right (Forward)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setGlobalSearchOpen((open) => !open);
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

  const handleChangeBackupRoot = (newRoot: string) => {
    setBackupRootPath(newRoot);
    invoke<BackupDescriptor[]>("set_backup_root", {
      backupRoot: newRoot,
    })
      .then((items) => {
        setBackups(items);
        if (items.length > 0) {
          loadSnapshot(items[0].json_path);
        } else {
          setCurrentBackup(null);
          setSelectedBackupPath("");
        }
      })
      .catch((err) => console.error("Failed to set backup root:", err));
  };

  const handleOpenExternalUrl = (url: string) => {
    invoke("open_external_url", { url }).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
  };

  const handleOpenFileDefault = (filePath: string) => {
    invoke("open_path_in_os", { path: filePath, revealInFolder: false }).catch(
      (err) => console.error("Failed to open file:", err),
    );
  };

  const handleRevealInExplorer = (filePath: string) => {
    invoke("open_path_in_os", { path: filePath, revealInFolder: true }).catch(
      (err) => console.error("Failed to reveal file in Explorer:", err),
    );
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Left Pane: Server & Channels */}
      <SidebarChannels
        backups={backups}
        selectedBackupPath={selectedBackupPath}
        currentBackup={currentBackup}
        selectedChannelId={selectedChannelId}
        backupRootPath={backupRootPath}
        onSelectBackup={loadSnapshot}
        onSelectChannel={handleSelectChannel}
        onOpenGlobalSearch={() => setGlobalSearchOpen(true)}
        onChangeBackupRoot={handleChangeBackupRoot}
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
        onOpenFileDefault={handleOpenFileDefault}
        onRevealInExplorer={handleRevealInExplorer}
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
    </div>
  );
}
