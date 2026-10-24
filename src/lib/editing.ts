import type {
  AttachmentRef,
  Author,
  Message,
  PostOrThread,
  ServerBackup,
} from "../types/backup";

let localIdSeq = 1;

function nextLocalId(): string {
  const now = Date.now();
  localIdSeq += 1;
  return `${now}${String(localIdSeq).padStart(4, "0")}`;
}

function buildPendingAttachmentRef(filePath: string): AttachmentRef {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const filename = parts[parts.length - 1] || "attachment";
  const dotIdx = filename.lastIndexOf(".");
  const extension = dotIdx >= 0 ? filename.slice(dotIdx + 1).toLowerCase() : "";

  return {
    relative_path: filePath,
    filename,
    resolved_path: filePath,
    extension,
    exists: true,
  };
}

export function addMessageInMemory(
  backup: ServerBackup,
  channelId: string,
  postId: string,
  authorName: string,
  content: string,
  attachmentPaths: string[],
  replyToId: string | null,
): { backup: ServerBackup; createdMessageId: string } {
  const msgId = nextLocalId();
  const author: Author = {
    id: "local-user-1",
    name: authorName.trim() || "Local User",
    bot: false,
  };
  const newMsg: Message = {
    id: msgId,
    author,
    content,
    timestamp: new Date().toISOString(),
    attachments: attachmentPaths
      .map((p) => p.trim())
      .filter(Boolean)
      .map(buildPendingAttachmentRef),
    embeds: [],
    edited_timestamp: null,
    reply_to_id: replyToId,
    local_edit_state: "added",
  };

  const nextChannels = backup.channels.map((ch) => {
    if (ch.id !== channelId) return ch;
    return {
      ...ch,
      posts: ch.posts.map((p) => {
        if (p.id !== postId) return p;
        return {
          ...p,
          messages: [...p.messages, newMsg],
        };
      }),
    };
  });

  return {
    backup: {
      ...backup,
      channels: nextChannels,
    },
    createdMessageId: msgId,
  };
}

export function editMessageInMemory(
  backup: ServerBackup,
  channelId: string,
  postId: string,
  messageId: string,
  newContent: string,
  newAttachmentPaths: string[],
): { backup: ServerBackup } {
  const addedAtts = newAttachmentPaths
    .map((p) => p.trim())
    .filter(Boolean)
    .map(buildPendingAttachmentRef);
  const nowIso = new Date().toISOString();

  const nextChannels = backup.channels.map((ch) => {
    if (ch.id !== channelId) return ch;
    return {
      ...ch,
      posts: ch.posts.map((p) => {
        if (p.id !== postId) return p;
        return {
          ...p,
          messages: p.messages.map((m) => {
            if (m.id !== messageId) return m;
            return {
              ...m,
              content: newContent,
              edited_timestamp: nowIso,
              local_edit_state:
                m.local_edit_state === "original" ? "edited" : m.local_edit_state,
              attachments: [...m.attachments, ...addedAtts],
            };
          }),
        };
      }),
    };
  });

  return {
    backup: {
      ...backup,
      channels: nextChannels,
    },
  };
}

export function deleteMessageInMemory(
  backup: ServerBackup,
  channelId: string,
  postId: string,
  messageId: string,
): { backup: ServerBackup } {
  const nextChannels = backup.channels.map((ch) => {
    if (ch.id !== channelId) return ch;
    return {
      ...ch,
      posts: ch.posts.map((p) => {
        if (p.id !== postId) return p;
        return {
          ...p,
          messages: p.messages.filter((m) => m.id !== messageId),
        };
      }),
    };
  });

  return {
    backup: {
      ...backup,
      channels: nextChannels,
    },
  };
}

export function createPostInMemory(
  backup: ServerBackup,
  channelId: string,
  title: string,
  authorName: string,
  initialContent: string,
  tagIds: string[],
  attachmentPaths: string[],
): { backup: ServerBackup; createdPostId: string; createdMessageId: string } {
  const postId = nextLocalId();
  const msgId = nextLocalId();
  const tagSet = new Set(tagIds);
  const author: Author = {
    id: "local-user-1",
    name: authorName.trim() || "Local User",
    bot: false,
  };

  const starterMsg: Message = {
    id: msgId,
    author,
    content: initialContent,
    timestamp: new Date().toISOString(),
    attachments: attachmentPaths
      .map((p) => p.trim())
      .filter(Boolean)
      .map(buildPendingAttachmentRef),
    embeds: [],
    edited_timestamp: null,
    reply_to_id: null,
    local_edit_state: "added",
  };

  const nextChannels = backup.channels.map((ch) => {
    if (ch.id !== channelId) return ch;
    const appliedTags = ch.available_tags.filter((t) => tagSet.has(t.id));
    const newPost: PostOrThread = {
      id: postId,
      parent_id: ch.id,
      name: title,
      type: "thread",
      applied_tags: appliedTags,
      messages: [starterMsg],
    };
    return {
      ...ch,
      posts: [...ch.posts, newPost],
    };
  });

  return {
    backup: {
      ...backup,
      channels: nextChannels,
    },
    createdPostId: postId,
    createdMessageId: msgId,
  };
}
