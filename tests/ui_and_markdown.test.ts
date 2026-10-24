import { describe, expect, it } from "vitest";
import { parseMarkdownBlocks, tokenizeCodeLine } from "../src/lib/markdown";
import { parseInternalChannelUrl, resolveTargetInBackup } from "../src/lib/links";
import { filterAndSortPosts } from "../src/components/PostListPane";
import { searchAcrossBackup } from "../src/components/GlobalSearchModal";
import { cleanDisplayFilename } from "../src/components/MessageCard";
import {
  formatByteSize,
  formatDurationSeconds,
} from "../src/components/MediaCards";
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
      "Hugo",
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
      "Hugo",
      "Follow-up message",
      [],
      null,
    );
    const createdPost = afterMsg.channels[0].posts.find(
      (p) => p.id === createdPostId,
    )!;
    expect(createdPost.messages).toHaveLength(2);

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
