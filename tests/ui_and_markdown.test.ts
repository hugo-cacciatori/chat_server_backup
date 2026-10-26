import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseMarkdownBlocks, tokenizeCodeLine } from "../src/lib/markdown";
import { parseInternalChannelUrl, resolveTargetInBackup } from "../src/lib/links";
import { filterAndSortPosts } from "../src/components/PostListPane";
import { moveActiveIndex, searchAcrossBackup } from "../src/components/GlobalSearchModal";
import { MessageCard } from "../src/components/MessageCard";
import { cleanDisplayFilename } from "../src/lib/ui";
import { ConfirmDialog } from "../src/components/ConfirmDialog";
import { keepIfUnchanged } from "../src/lib/state";
import { SidebarChannels } from "../src/components/SidebarChannels";
import { SettingsModal } from "../src/components/SettingsModal";
import { UnsavedEditsPromptModal } from "../src/components/UnsavedEditsPromptModal";
import { ErrorBanner } from "../src/components/ErrorBanner";
import {
  formatByteSize,
  formatDurationSeconds,
} from "../src/components/Attachments";
import {
  addMessageInMemory,
  createPostInMemory,
  deleteMessageInMemory,
  editMessageInMemory,
} from "../src/lib/editing";
import type { ServerBackup } from "../src/types/backup";

const sampleBackup: ServerBackup = {
  id: "1175623460161065030",
  name: "Engineering Archive",
  date_label: "2026-10-20",
  source_path: "history/2026-10-20/server_export_2026-10-20.json",
  original_source_path: "history/2026-10-20/server_export_2026-10-20.json",
  is_edited: false,
  based_on_export: "server_export_2026-10-20.json",
  last_modified_at: null,
  schema_version: 1,
  channels: [
    {
      id: "1542028566022201344",
      name: "memory-manager",
      type: "forum",
      category: null,
      position: 0,
      available_tags: [
        { id: "tag_docs", name: "docs", moderated: false, emoji: "📄" },
        { id: "tag_music", name: "music", moderated: false, emoji: "🎵" },
      ],
      posts: [
        {
          id: "post_1",
          parent_id: "1542028566022201344",
          name: "Alpha architecture",
          type: "thread",
          applied_tags: [{ id: "tag_docs", name: "docs", moderated: false, emoji: "📄" }],
          messages: [
            {
              id: "msg_10",
              author: { id: "u1", name: "hugo", bot: false },
              content: "Initial design notes for storage engine",
              timestamp: "2026-10-18T10:00:00+00:00",
              attachments: [
                {
                  relative_path: "assets_2026-10-20/1_spec.pdf",
                  filename: "1_spec.pdf",
                  resolved_path: null,
                  extension: "pdf",
                  exists: true,
                },
              ],
              embeds: [],
              edited_timestamp: null,
              reply_to_id: null,
              local_edit_state: "original",
            },
          ],
        },
        {
          id: "post_2",
          parent_id: "1542028566022201344",
          name: "Beta mix stems",
          type: "thread",
          applied_tags: [
            { id: "tag_docs", name: "docs", moderated: false, emoji: "📄" },
            { id: "tag_music", name: "music", moderated: false, emoji: "🎵" },
          ],
          messages: [
            {
              id: "msg_20",
              author: { id: "u1", name: "hugo", bot: false },
              content: "Prechorus vocal take",
              timestamp: "2026-10-20T15:00:00+00:00",
              attachments: [],
              embeds: [],
              edited_timestamp: null,
              reply_to_id: null,
              local_edit_state: "original",
            },
            {
              id: "msg_21",
              author: { id: "u1", name: "hugo", bot: false },
              content: "Second vocal take",
              timestamp: "2026-10-20T15:05:00+00:00",
              attachments: [],
              embeds: [],
              edited_timestamp: null,
              reply_to_id: "msg_20",
              local_edit_state: "original",
            },
          ],
        },
      ],
    },
  ],
};

describe("Markdown & Code Tokenizer", () => {
  it("parses headings, code blocks, blockquotes, lists, spoilers, and links", () => {
    const raw = [
      "# Main Heading",
      "> Quoted line",
      "- First item with **bold** and ||secret||",
      "- Second item with https://archive.local/channels/1175623460161065030/post_1/msg_10).",
      "```python",
      "def greet(name):",
      "    # comment",
      '    return "hello"',
      "```",
    ].join("\n");

    const blocks = parseMarkdownBlocks(raw);
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "blockquote",
      "list",
      "code_block",
    ]);

    const codeBlock = blocks[3];
    if (codeBlock.type === "code_block") {
      expect(codeBlock.language).toBe("python");
      const tokens = tokenizeCodeLine('def greet(): # comment');
      expect(tokens.some((t) => t.type === "keyword" && t.value === "def")).toBe(true);
      expect(tokens.some((t) => t.type === "comment")).toBe(true);
    }
  });
});

describe("Internal Target Resolution & Post Filtering", () => {
  it("resolves internal message and post jump links against the backup", () => {
    const target = parseInternalChannelUrl(
      "https://chat.example.org/channels/1175623460161065030/1542028566022201344/msg_21",
    );
    expect(target).not.toBeNull();
    const resolved = resolveTargetInBackup(sampleBackup, target!);
    expect(resolved?.post.id).toBe("post_2");
    expect(resolved?.message?.id).toBe("msg_21");
    expect(resolved?.label).toContain("Beta mix stems");
  });

  it("filters posts by ANY and ALL tag match modes and sorts accurately", () => {
    const posts = sampleBackup.channels[0].posts;

    // ANY mode with tag_docs matches both post_1 and post_2
    const anyDocs = filterAndSortPosts(
      posts,
      "",
      new Set(["tag_docs"]),
      "any",
      "recent",
    );
    expect(anyDocs.map((p) => p.id)).toEqual(["post_2", "post_1"]);

    // ALL mode with both tag_docs and tag_music matches only post_2
    const allBoth = filterAndSortPosts(
      posts,
      "",
      new Set(["tag_docs", "tag_music"]),
      "all",
      "title",
    );
    expect(allBoth.map((p) => p.id)).toEqual(["post_2"]);
  });

  it("searches globally across messages and attachment filenames", () => {
    const byContent = searchAcrossBackup(sampleBackup, "prechorus");
    expect(byContent).toHaveLength(1);
    expect(byContent[0].postId).toBe("post_2");

    const byFilename = searchAcrossBackup(sampleBackup, "1_spec.pdf");
    expect(byFilename).toHaveLength(1);
    expect(byFilename[0].postId).toBe("post_1");
  });
});

describe("Media & Document Formatting Helpers", () => {
  it("strips numeric ID prefixes from exported asset filenames", () => {
    expect(cleanDisplayFilename("1488296472926945421_mix_master.flac")).toBe(
      "mix_master.flac",
    );
    expect(cleanDisplayFilename("notes.docx")).toBe("notes.docx");
  });

  it("formats byte sizes and audio durations cleanly", () => {
    expect(formatByteSize(512)).toBe("512 B");
    expect(formatByteSize(2048)).toBe("2.0 KB");
    expect(formatByteSize(5 * 1024 * 1024)).toBe("5.00 MB");
    expect(formatDurationSeconds(0)).toBe("0:00");
    expect(formatDurationSeconds(125)).toBe("2:05");
  });
});

describe("In-Memory Session Editing (Unsaved Until Explicit Save)", () => {
  it("keeps new posts, messages, edits, and deletions in memory without turning Original into Edited prematurely", () => {
    const channelId = "1542028566022201344";
    const { backup: afterPost, createdPostId } = createPostInMemory(
      sampleBackup,
      channelId,
      "test",
      { name: "Hugo", id: "hugo-1" },
      "Starter body",
      ["tag_docs"],
      [],
    );
    expect(afterPost.is_edited).toBe(false);
    expect(afterPost.source_path).toBe(sampleBackup.source_path);
    expect(afterPost.channels[0].posts).toHaveLength(3);

    const { backup: afterMsg, createdMessageId } = addMessageInMemory(
      afterPost,
      channelId,
      createdPostId,
      { name: "Hugo", id: "hugo-1" },
      "Follow-up message",
      [],
      null,
    );
    const createdPost = afterMsg.channels[0].posts.find(
      (p) => p.id === createdPostId,
    )!;
    expect(createdPost.messages).toHaveLength(2);
    expect(createdPost.messages[1].author).toEqual({ id: "hugo-1", name: "Hugo", bot: false });

    const { backup: afterEdit } = editMessageInMemory(
      afterMsg,
      channelId,
      createdPostId,
      createdMessageId,
      "Follow-up message (edited)",
      [],
    );
    const editedMsg = afterEdit.channels[0].posts
      .find((p) => p.id === createdPostId)!
      .messages.find((m) => m.id === createdMessageId)!;
    expect(editedMsg.content).toBe("Follow-up message (edited)");

    const { backup: afterDelete } = deleteMessageInMemory(
      afterEdit,
      channelId,
      createdPostId,
      createdMessageId,
    );
    expect(
      afterDelete.channels[0].posts.find((p) => p.id === createdPostId)!
        .messages,
    ).toHaveLength(1);
  });
});

describe("Sidebar & Settings (SPEC §7.5, §7.10)", () => {
  it("renders the sidebar status footer, snapshot labels and the single-Save Settings form", () => {
    const sidebarHtml = renderToStaticMarkup(
      createElement(SidebarChannels, {
        backups: [
          {
            date_label: "2026-10-20",
            json_path: "F:/server_backup/history/2026-10-20/server_export_2026-10-20.json",
            is_edited: false,
            display_label: "2026-10-20 (Original)",
            based_on_filename: "server_export_2026-10-20.json",
          },
        ],
        selectedBackupPath:
          "F:/server_backup/history/2026-10-20/server_export_2026-10-20.json",
        currentBackup: sampleBackup,
        selectedChannelId: "1542028566022201344",
        backupRootPath: "F:\\server_backup\\history",
        canDeleteEditedBackup: false,
        botStatus: {
          state: "connected",
          status_text: "Connected as ArchiveBot#4821 — ready for !export",
          bot_username: "ArchiveBot#4821",
          completed_exports: 1,
          last_export_path: null,
          last_error: null,
          has_token_configured: true,
        },
        onSelectBackup: () => {},
        onSelectChannel: () => {},
        onOpenGlobalSearch: () => {},
        onBrowseBackupRoot: () => {},
        onOpenSettings: () => {},
        onStartExportBot: () => {},
        onStopExportBot: () => {},
      }),
    );

    expect(sidebarHtml).toContain("Export bot");
    expect(sidebarHtml).toContain("Connected as ArchiveBot#4821");
    expect(sidebarHtml).toContain('aria-label="Stop export bot"');
    expect(sidebarHtml).toContain("2026-10-20 · Original");
    expect(sidebarHtml).toContain("Original · read-only");
    expect(sidebarHtml).toContain("F:\\server_backup\\history");
    expect(sidebarHtml).not.toContain("Delete edited copy");

    const modalHtml = renderToStaticMarkup(
      createElement(SettingsModal, {
        isOpen: true,
        backupRootPath: "F:\\server_backup\\history",
        recentBackupRoots: [
          "F:\\server_backup\\history",
          "C:\\OtherBackups\\history",
        ],
        localAuthorName: "Hugo",
        localAuthorId: "hugo-1",
        botToken: "secret-bot-token",
        snapshotCount: 14,
        onClose: () => {},
        onPickFolder: async () => null,
        onSave: () => {},
      }),
    );

    expect(modalHtml).toContain("Backup folder");
    expect(modalHtml).toContain("Browse…");
    expect(modalHtml).toContain("14 snapshots in the current folder");
    expect(modalHtml).toContain("Recent folders");
    expect(modalHtml).toContain("C:\\OtherBackups\\history");
    expect(modalHtml).toContain("Export bot token");
    expect(modalHtml).toContain("Token set");
    expect(modalHtml).toContain("Local author");
    expect(modalHtml.match(/type="submit"/g)).toHaveLength(1);

    const promptHtml = renderToStaticMarkup(
      createElement(UnsavedEditsPromptModal, {
        isOpen: true,
        reason: "new-backup",
        targetLabel: "2026-10-24 (Original)",
        currentDateLabel: "2026-10-20",
        onSaveAndSwitch: () => {},
        onDiscardAndSwitch: () => {},
        onStayHere: () => {},
      }),
    );

    expect(promptHtml).toContain("New Backup Available");
    expect(promptHtml).toContain("2026-10-24 (Original)");
    expect(promptHtml).toContain("2026-10-20 (Edited)");
    expect(promptHtml).toContain("Discard Edits &amp; Switch");
    expect(promptHtml).toContain("Stay Here");

    const snapshotPromptHtml = renderToStaticMarkup(
      createElement(UnsavedEditsPromptModal, {
        isOpen: true,
        reason: "snapshot",
        targetLabel: "2026-10-18 (Original)",
        currentDateLabel: "2026-10-20",
        isSaving: true,
        onSaveAndSwitch: () => {},
        onDiscardAndSwitch: () => {},
        onStayHere: () => {},
      }),
    );
    expect(snapshotPromptHtml).toContain("Switch Snapshot?");
    expect(snapshotPromptHtml).toContain("Saving…");

    const bannerHtml = renderToStaticMarkup(
      createElement(ErrorBanner, {
        message: "Save failed, your edits are still unsaved: disk full",
        onDismiss: () => {},
      }),
    );
    expect(bannerHtml).toContain('role="alert"');
    expect(bannerHtml).toContain("disk full");
    expect(
      renderToStaticMarkup(createElement(ErrorBanner, { message: null, onDismiss: () => {} })),
    ).toBe("");
  });
});

describe("UI/UX: performance, confirmations, keyboard access", () => {
  it("keeps the previous value when a poll returns unchanged data", () => {
    const prev = [{ json_path: "a.json", is_edited: false }];
    const same = [{ json_path: "a.json", is_edited: false }];
    const changed = [{ json_path: "b.json", is_edited: false }];
    expect(keepIfUnchanged(prev, same)).toBe(prev);
    expect(keepIfUnchanged(prev, changed)).toBe(changed);
  });

  it("moves the global search highlight within the result list", () => {
    expect(moveActiveIndex(0, 1, 3)).toBe(1);
    expect(moveActiveIndex(2, 1, 3)).toBe(2);
    expect(moveActiveIndex(0, -1, 3)).toBe(0);
    expect(moveActiveIndex(0, 1, 0)).toBe(-1);
  });

  it("renders a destructive confirmation as an alert dialog with Cancel first", () => {
    const html = renderToStaticMarkup(
      createElement(
        ConfirmDialog,
        {
          isOpen: true,
          title: "Delete Edited Backup?",
          confirmLabel: "Delete Edited Backup",
          onConfirm: () => {},
          onCancel: () => {},
          children: createElement("p", null, "server_export_2026-10-20_edited.json"),
        },
      ),
    );
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("server_export_2026-10-20_edited.json");
    expect(html.indexOf(">Cancel<")).toBeLessThan(html.indexOf(">Delete Edited Backup<"));
    expect(
      renderToStaticMarkup(
        createElement(ConfirmDialog, {
          isOpen: false,
          title: "x",
          confirmLabel: "x",
          onConfirm: () => {},
          onCancel: () => {},
          children: null,
        }),
      ),
    ).toBe("");
  });

  it("keeps message actions and images reachable from the keyboard", () => {
    const msg = sampleBackup.channels[0].posts[0].messages[0];
    const html = renderToStaticMarkup(
      createElement(MessageCard, {
        message: {
          ...msg,
          attachments: [
            {
              relative_path: "assets_2026-10-20/1_diagram.png",
              filename: "1_diagram.png",
              resolved_path: "C:/history/2026-10-20/assets_2026-10-20/1_diagram.png",
              extension: "png",
              exists: true,
            },
          ],
        },
        backup: sampleBackup,
        channelId: sampleBackup.channels[0].id,
        postId: sampleBackup.channels[0].posts[0].id,
        onEditMessage: () => {},
        onDeleteMessage: () => {},
      }),
    );
    expect(html).toContain('role="toolbar"');
    expect(html).toContain("focus-within:opacity-100");
    expect(html).not.toContain("invisible");
    expect(html).toContain('aria-label="Open image diagram.png"');
  });
});
