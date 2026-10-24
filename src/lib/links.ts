import type { Channel, Message, PostOrThread, ServerBackup } from "../types/backup";

export interface InternalServerTarget {
  serverId: string;
  channelId: string;
  messageId: string | null;
}

export interface ResolvedInternalTarget {
  channel: Channel;
  post: PostOrThread;
  message: Message | null;
  label: string;
}

/**
 * Parse a generic internal server jump URL matching https://<host>/channels/<serverId>/<channelId>[/<messageId>]
 * without relying on any specific platform branding.
 */
export function parseInternalChannelUrl(rawUrl: string): InternalServerTarget | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== "channels") {
    return null;
  }
  if (segments.length !== 3 && segments.length !== 4) {
    return null;
  }

  const [serverId, channelId, messageId] = segments.slice(1);
  const validId = /^[A-Za-z0-9_-]+$/;
  const hasDigit = /\d/;
  if (
    !validId.test(serverId) ||
    !hasDigit.test(serverId) ||
    !validId.test(channelId) ||
    !hasDigit.test(channelId)
  ) {
    return null;
  }
  if (
    messageId !== undefined &&
    (!validId.test(messageId) || !hasDigit.test(messageId))
  ) {
    return null;
  }

  return {
    serverId,
    channelId,
    messageId: messageId ?? null,
  };
}

/**
 * Resolve an InternalServerTarget against a loaded ServerBackup.
 * In forum channels, the URL's second snowflake (`channelId`) is often the thread/post ID,
 * and `messageId` is a specific message inside that thread.
 */
export function resolveTargetInBackup(
  backup: ServerBackup | null,
  target: InternalServerTarget,
): ResolvedInternalTarget | null {
  if (!backup) {
    return null;
  }

  // 1. If messageId is provided, try finding the exact message first
  if (target.messageId) {
    for (const channel of backup.channels) {
      for (const post of channel.posts) {
        const foundMsg = post.messages.find((m) => m.id === target.messageId);
        if (foundMsg) {
          return {
            channel,
            post,
            message: foundMsg,
            label: `${post.name} • @${foundMsg.author.name}`,
          };
        }
      }
    }
  }

  // 2. Match post/thread ID by target.messageId or target.channelId
  const candidateIds = [target.messageId, target.channelId].filter(
    (id): id is string => Boolean(id),
  );
  for (const candId of candidateIds) {
    for (const channel of backup.channels) {
      for (const post of channel.posts) {
        if (post.id === candId) {
          return {
            channel,
            post,
            message: null,
            label: post.name,
          };
        }
      }
    }
  }

  // 3. Match top-level channel ID
  for (const channel of backup.channels) {
    if (channel.id === target.channelId && channel.posts.length > 0) {
      const firstPost = channel.posts[0];
      return {
        channel,
        post: firstPost,
        message: null,
        label: `#${channel.name}`,
      };
    }
  }

  return null;
}
