/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import {
  authorInitials,
  cleanDisplayFilename,
  formatShortDate,
  groupChannelsByCategory,
  messageGroupStarts,
  plainTextSnippet,
} from "../src/lib/ui";
import {
  COLLAPSED_RAIL,
  DEFAULT_LAYOUT,
  MESSAGE_PANE_MIN,
  POST_LIST_RANGE,
  SIDEBAR_RANGE,
  fitPaneWidths,
} from "../src/lib/layout";
import type { Channel, Message } from "../src/types/backup";

const msg = (id: string, authorId: string, timestamp: string, extra: Partial<Message> = {}): Message => ({
  id,
  author: { id: authorId, name: authorId, bot: false },
  content: "",
  timestamp,
  attachments: [],
  embeds: [],
  edited_timestamp: null,
  reply_to_id: null,
  local_edit_state: "original",
  ...extra,
});

const channel = (id: string, position: number, category: string | null): Channel => ({
  id,
  name: id,
  type: "text",
  available_tags: [],
  posts: [],
  category,
  position,
});

describe("UI v2 helpers (SPEC §7)", () => {
  it("turns message markdown into a plain-text snippet", () => {
    expect(plainTextSnippet("## Plan\n1. Profile heap\n2. Replace **bump** allocator")).toBe(
      "Plan Profile heap · Replace bump allocator",
    );
    expect(plainTextSnippet("Spoiler: ||secret|| and `code`")).toBe("Spoiler: ▒▒▒ and code");
    expect(plainTextSnippet("```rust\nfn main() {}\n```")).toBe("fn main() {}");
    expect(plainTextSnippet("x".repeat(200), 20)).toHaveLength(20);
    expect(plainTextSnippet("")).toBe("");
  });

  it("groups consecutive messages by author within 7 minutes on the same day", () => {
    const starts = messageGroupStarts([
      msg("1", "a", "2026-10-20T10:00:00Z"),
      msg("2", "a", "2026-10-20T10:03:00Z"),
      msg("3", "a", "2026-10-20T10:12:00Z"),
      msg("4", "b", "2026-10-20T10:13:00Z"),
      msg("5", "b", "2026-10-20T10:14:00Z", { reply_to_id: "4" }),
      msg("6", "b", "2026-10-20T10:15:00Z"),
    ]);
    expect(starts).toEqual([true, false, true, true, true, false]);
  });

  it("builds two-letter avatar initials", () => {
    expect(authorInitials("alice")).toBe("AL");
    expect(authorInitials("bob_the_builder")).toBe("BT");
    expect(authorInitials("Carmen Delacroix-Hernández")).toBe("CD");
    expect(authorInitials("  ")).toBe("?");
  });

  it("formats short relative dates", () => {
    const now = new Date(2026, 9, 26, 15, 0);
    expect(formatShortDate(new Date(2026, 9, 26, 14, 5).toISOString(), now)).toBe("Today 14:05");
    expect(formatShortDate(new Date(2026, 9, 25, 9, 0).toISOString(), now)).toBe("Yesterday");
    expect(formatShortDate(new Date(2026, 9, 22, 9, 0).toISOString(), now)).toBe("Thursday");
    expect(formatShortDate(new Date(2026, 9, 1, 9, 0).toISOString(), now)).toBe("1 Oct 2026");
    expect(formatShortDate("not a date", now)).toBe("");
  });

  it("groups channels by category in position order, uncategorized first", () => {
    const groups = groupChannelsByCategory([
      channel("rules", 5, "Info"),
      channel("general", 2, "Community"),
      channel("loose", 9, null),
      channel("intro", 1, "Info"),
      channel("random", 3, "Community"),
    ]);
    expect(groups.map((g) => g.category)).toEqual([null, "Info", "Community"]);
    expect(groups[1].channels.map((c) => c.id)).toEqual(["intro", "rules"]);
    expect(groups[2].channels.map((c) => c.id)).toEqual(["general", "random"]);
  });

  it("cleans numeric prefixes from exported file names", () => {
    expect(cleanDisplayFilename("1488296472926945421_mix_master.flac")).toBe("mix_master.flac");
    expect(cleanDisplayFilename("notes.docx")).toBe("notes.docx");
  });

  it("keeps the message pane at least 420 px wide", () => {
    const wide = fitPaneWidths(DEFAULT_LAYOUT, 1600);
    expect(wide).toEqual({ sidebar: SIDEBAR_RANGE.initial, postList: POST_LIST_RANGE.initial });

    const narrow = fitPaneWidths({ ...DEFAULT_LAYOUT, sidebarWidth: 360, postListWidth: 480 }, 900);
    expect(narrow.postList).toBe(POST_LIST_RANGE.min);
    expect(narrow.sidebar + narrow.postList + MESSAGE_PANE_MIN).toBeLessThanOrEqual(900);

    const collapsed = fitPaneWidths({ ...DEFAULT_LAYOUT, sidebarCollapsed: true }, 900);
    expect(collapsed.sidebar).toBe(COLLAPSED_RAIL);
  });

  it("uses no text sizes below the 12 px minimum in src/", () => {
    const sources = import.meta.glob("../src/**/*.{ts,tsx,css}", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    const offenders = Object.entries(sources)
      .filter(([, text]) => /text-\[(?:[0-9]|1[01])px\]/.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
