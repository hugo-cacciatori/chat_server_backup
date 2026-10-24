export interface InternalServerTarget {
  serverId: string;
  channelId: string;
  messageId: string | null;
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
  const numericId = /^\d+$/;
  if (!numericId.test(serverId) || !numericId.test(channelId)) {
    return null;
  }
  if (messageId !== undefined && !numericId.test(messageId)) {
    return null;
  }

  return {
    serverId,
    channelId,
    messageId: messageId ?? null,
  };
}
