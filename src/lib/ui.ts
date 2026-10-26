import type { Channel, Message } from "../types/backup";
import { parseMarkdownBlocks, type InlineNode } from "./markdown";

/** Strip a leading numeric export prefix (`1544…_name.png` → `name.png`). */
export function cleanDisplayFilename(filename: string): string {
  return filename.replace(/^(?:\d+_)+/, "") || filename;
}

function inlineText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.text;
        case "code":
          return node.code;
        case "spoiler":
          return "▒▒▒";
        case "external_link":
          return node.label;
        case "internal_link":
          return "↗ link";
        default:
          return inlineText(node.children);
      }
    })
    .join("");
}

/** Plain-text preview of message markdown for lists and search (SPEC §7.6). */
export function plainTextSnippet(content: string, maxLength = 160): string {
  const parts = parseMarkdownBlocks(content).map((block) => {
    switch (block.type) {
      case "heading":
      case "paragraph":
        return inlineText(block.inlines);
      case "blockquote":
        return block.lines.map(inlineText).join(" ");
      case "list":
        return block.items.map(inlineText).join(" · ");
      case "code_block":
        return block.code;
    }
  });
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

const GROUP_GAP_MS = 7 * 60 * 1000;

function localDayKey(iso: string): string {
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime())
    ? ""
    : `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
}

/**
 * For each message in display order, whether it starts a new group (SPEC §7.7): a group
 * continues while the author is the same, messages are < 7 minutes apart on the same day,
 * and the later message is not a reply.
 */
export function messageGroupStarts(messages: Message[]): boolean[] {
  return messages.map((msg, i) => {
    if (i === 0) return true;
    const prev = messages[i - 1];
    const authorOf = (m: Message) => m.author.id || m.author.name;
    if (authorOf(msg) !== authorOf(prev)) return true;
    if (msg.reply_to_id) return true;
    if (localDayKey(msg.timestamp) !== localDayKey(prev.timestamp)) return true;
    const gap = Math.abs(Date.parse(msg.timestamp) - Date.parse(prev.timestamp));
    return !Number.isFinite(gap) || gap >= GROUP_GAP_MS;
  });
}

/** Two-letter avatar initials (SPEC §7.7). */
export function authorInitials(name: string): string {
  const words = name.trim().split(/[\s_.-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** "Today 14:05", "Yesterday", weekday within a week, otherwise "20 Oct 2026" (SPEC §7.6). */
export function formatShortDate(iso: string, now: Date = new Date()): string {
  const dt = new Date(iso);
  if (!iso || Number.isNaN(dt.getTime())) return "";
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(dt)) / 86_400_000);
  if (days === 0) {
    return `Today ${dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return dt.toLocaleDateString("en-GB", { weekday: "long" });
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Time of day for grouped messages, e.g. "14:05". */
export function formatTimeOfDay(iso: string): string {
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime())
    ? ""
    : dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export interface ChannelGroup {
  category: string | null;
  channels: Channel[];
}

/**
 * Channels grouped by category (SPEC §7.5): uncategorized first, then categories by their
 * lowest channel position; channels by position, then name.
 */
export function groupChannelsByCategory(channels: Channel[]): ChannelGroup[] {
  const byPosition = (a: Channel, b: Channel) =>
    a.position - b.position || a.name.localeCompare(b.name);
  const groups = new Map<string | null, Channel[]>();
  for (const ch of channels) {
    const key = ch.category?.trim() || null;
    groups.set(key, [...(groups.get(key) ?? []), ch]);
  }
  const result = [...groups.entries()].map(([category, list]) => ({
    category,
    channels: [...list].sort(byPosition),
  }));
  const minPosition = (g: ChannelGroup) => Math.min(...g.channels.map((c) => c.position));
  return result.sort((a, b) => {
    if (a.category === null) return -1;
    if (b.category === null) return 1;
    return minPosition(a) - minPosition(b) || a.category.localeCompare(b.category);
  });
}
