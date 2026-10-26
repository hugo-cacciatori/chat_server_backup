/** Pane sizes and collapsed state (SPEC §7.4), persisted per viewer in localStorage. */
export interface PaneLayout {
  sidebarWidth: number;
  postListWidth: number;
  sidebarCollapsed: boolean;
  postListCollapsed: boolean;
}

export const SIDEBAR_RANGE = { min: 200, max: 360, initial: 248 } as const;
export const POST_LIST_RANGE = { min: 260, max: 480, initial: 320 } as const;
export const MESSAGE_PANE_MIN = 420;
export const COLLAPSED_RAIL = 40;

const STORAGE_KEY = "csb.layout.v1";

export const DEFAULT_LAYOUT: PaneLayout = {
  sidebarWidth: SIDEBAR_RANGE.initial,
  postListWidth: POST_LIST_RANGE.initial,
  sidebarCollapsed: false,
  postListCollapsed: false,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Widths that fit `windowWidth` while leaving the message pane at least MESSAGE_PANE_MIN:
 * the post list gives way first, then the sidebar, never below their minimums.
 */
export function fitPaneWidths(layout: PaneLayout, windowWidth: number): {
  sidebar: number;
  postList: number;
} {
  let sidebar = layout.sidebarCollapsed
    ? COLLAPSED_RAIL
    : clamp(layout.sidebarWidth, SIDEBAR_RANGE.min, SIDEBAR_RANGE.max);
  let postList = layout.postListCollapsed
    ? COLLAPSED_RAIL
    : clamp(layout.postListWidth, POST_LIST_RANGE.min, POST_LIST_RANGE.max);
  let overflow = sidebar + postList + MESSAGE_PANE_MIN - windowWidth;
  if (overflow > 0 && !layout.postListCollapsed) {
    const give = Math.min(overflow, postList - POST_LIST_RANGE.min);
    postList -= give;
    overflow -= give;
  }
  if (overflow > 0 && !layout.sidebarCollapsed) {
    sidebar -= Math.min(overflow, sidebar - SIDEBAR_RANGE.min);
  }
  return { sidebar, postList };
}

export function loadLayout(): PaneLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<PaneLayout>;
    return {
      sidebarWidth: Number(parsed.sidebarWidth) || DEFAULT_LAYOUT.sidebarWidth,
      postListWidth: Number(parsed.postListWidth) || DEFAULT_LAYOUT.postListWidth,
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
      postListCollapsed: Boolean(parsed.postListCollapsed),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: PaneLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage unavailable: the layout still works for this session.
  }
}

export function clampSidebarWidth(width: number): number {
  return clamp(width, SIDEBAR_RANGE.min, SIDEBAR_RANGE.max);
}

export function clampPostListWidth(width: number): number {
  return clamp(width, POST_LIST_RANGE.min, POST_LIST_RANGE.max);
}
