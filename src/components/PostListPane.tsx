import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Hash,
  LayoutList,
  MessageSquare,
  PanelLeftClose,
  Paperclip,
  Plus,
  Rows3,
  Rows4,
  Search,
  X,
} from "lucide-react";
import type { Channel, PostOrThread } from "../types/backup";
import { formatShortDate, plainTextSnippet } from "../lib/ui";

export type PostSortMode = "recent" | "oldest" | "title" | "messages";
export type TagMatchMode = "any" | "all";
type Density = "comfortable" | "compact";

interface PostListPaneProps {
  channel: Channel | null;
  selectedPostId: string;
  postQuery: string;
  activeTagIds: Set<string>;
  tagMatchMode: TagMatchMode;
  sortMode: PostSortMode;
  onChangePostQuery: (query: string) => void;
  onToggleTag: (tagId: string) => void;
  onClearTags: () => void;
  onChangeTagMatchMode: (mode: TagMatchMode) => void;
  onChangeSortMode: (mode: PostSortMode) => void;
  onSelectPost: (postId: string) => void;
  onCreatePost?: (
    title: string,
    initialContent: string,
    tagIds: string[],
    attachmentPaths: string[],
  ) => Promise<void> | void;
  onCollapse?: () => void;
}

const DENSITY_KEY = "csb.postDensity";

function postActivityRange(post: PostOrThread): { first: number; latest: number; latestIso: string } {
  let first = Number.POSITIVE_INFINITY;
  let latest = 0;
  let latestIso = "";
  for (const m of post.messages) {
    const t = Date.parse(m.timestamp);
    if (Number.isNaN(t)) continue;
    if (t < first) first = t;
    if (t > latest) {
      latest = t;
      latestIso = m.timestamp;
    }
  }
  return { first: Number.isFinite(first) ? first : 0, latest, latestIso };
}

export function filterAndSortPosts(
  posts: PostOrThread[],
  query: string,
  activeTagIds: Set<string>,
  tagMatchMode: TagMatchMode,
  sortMode: PostSortMode,
): PostOrThread[] {
  const q = query.trim().toLowerCase();

  const filtered = posts.filter((post) => {
    if (activeTagIds.size > 0) {
      const postTagSet = new Set(post.applied_tags.map((t) => t.id));
      const required = [...activeTagIds];
      const matches =
        tagMatchMode === "all"
          ? required.every((id) => postTagSet.has(id))
          : required.some((id) => postTagSet.has(id));
      if (!matches) return false;
    }

    if (!q) return true;
    if (post.name.toLowerCase().includes(q)) return true;
    if (post.applied_tags.some((t) => t.name.toLowerCase().includes(q))) return true;
    return post.messages.some(
      (m) =>
        m.content.toLowerCase().includes(q) ||
        m.author.name.toLowerCase().includes(q) ||
        m.attachments.some((a) => a.filename.toLowerCase().includes(q)),
    );
  });

  return [...filtered].sort((a, b) => {
    // Keep the main channel stream at the top in text channels
    if (a.type === "channel_stream" && b.type !== "channel_stream") return -1;
    if (b.type === "channel_stream" && a.type !== "channel_stream") return 1;

    switch (sortMode) {
      case "title":
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      case "messages":
        return b.messages.length - a.messages.length;
      case "oldest":
        return postActivityRange(a).first - postActivityRange(b).first;
      default:
        return postActivityRange(b).latest - postActivityRange(a).latest;
    }
  });
}

function loadDensity(): Density {
  try {
    return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function PostListPane({
  channel,
  selectedPostId,
  postQuery,
  activeTagIds,
  tagMatchMode,
  sortMode,
  onChangePostQuery,
  onToggleTag,
  onClearTags,
  onChangeTagMatchMode,
  onChangeSortMode,
  onSelectPost,
  onCreatePost,
  onCollapse,
}: PostListPaneProps) {
  const [density, setDensity] = useState<Density>(loadDensity);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostBody, setNewPostBody] = useState("");
  const [newPostTagIds, setNewPostTagIds] = useState<Set<string>>(new Set());
  const [newPostAttInput, setNewPostAttInput] = useState("");
  const [newPostAttPaths, setNewPostAttPaths] = useState<string[]>([]);
  const [submittingPost, setSubmittingPost] = useState(false);
  const filterRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const allPosts = useMemo(() => channel?.posts ?? [], [channel]);
  const availableTags = channel?.available_tags ?? [];
  const isForum = channel?.type === "forum";

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch {
      // Storage unavailable: keep the choice for this session only.
    }
  }, [density]);

  // On channel change, the tag filter starts open only when a tag filter is already active.
  const activeTagCount = activeTagIds.size;
  const channelId = channel?.id;
  useEffect(() => setTagsOpen(activeTagCount > 0), [channelId]);

  // Ctrl+Shift+F focuses the post filter (Ctrl+F belongs to the message search).
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyF") {
        e.preventDefault();
        filterRef.current?.focus();
        filterRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of allPosts) {
      for (const tag of post.applied_tags) {
        counts.set(tag.id, (counts.get(tag.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [allPosts]);

  const filteredPosts = useMemo(
    () => filterAndSortPosts(allPosts, postQuery, activeTagIds, tagMatchMode, sortMode),
    [allPosts, postQuery, activeTagIds, tagMatchMode, sortMode],
  );

  // The selected post is always scrolled into view (SPEC §7.6).
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-post-id="${CSS.escape(selectedPostId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedPostId, filteredPosts]);

  const resetNewPost = () => {
    setNewPostTitle("");
    setNewPostBody("");
    setNewPostTagIds(new Set());
    setNewPostAttPaths([]);
    setNewPostAttInput("");
    setCreatingPost(false);
  };

  const handleCreatePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreatePost || submittingPost) return;
    const title = newPostTitle.trim();
    const body = newPostBody.trim();
    if (!title || (!body && newPostAttPaths.length === 0)) return;
    setSubmittingPost(true);
    try {
      await onCreatePost(title, body, Array.from(newPostTagIds), newPostAttPaths);
      resetNewPost();
    } finally {
      setSubmittingPost(false);
    }
  };

  if (!channel) {
    return (
      <aside className="flex h-full w-full flex-col items-center justify-center bg-surface-1 p-6 text-center text-ui text-ink-muted">
        Select a channel.
      </aside>
    );
  }

  const HeaderIcon = isForum ? LayoutList : Hash;
  const filtersActive = postQuery.trim() !== "" || activeTagIds.size > 0;
  const noun = isForum ? "post" : "thread";

  return (
    <aside className="flex h-full w-full flex-col bg-surface-1 select-none">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line pl-3.5 pr-1.5">
        <HeaderIcon className="h-4 w-4 shrink-0 text-ink-muted" />
        <h2 className="min-w-0 flex-1 truncate text-heading text-ink" title={channel.name}>
          {channel.name}
        </h2>
        <span className="text-meta text-ink-muted" title="Shown / total">
          {filteredPosts.length === allPosts.length
            ? allPosts.length
            : `${filteredPosts.length} / ${allPosts.length}`}
        </span>
        {onCreatePost && (
          <button
            type="button"
            onClick={() => setCreatingPost((v) => !v)}
            title={`New ${noun}`}
            aria-label={`New ${noun}`}
            aria-expanded={creatingPost}
            className="rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title="Hide post list (Ctrl+Shift+B)"
            aria-label="Hide post list"
            className="rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-b border-line px-3 py-2.5">
        {/* New post form */}
        {creatingPost && onCreatePost && (
          <form
            onSubmit={handleCreatePostSubmit}
            aria-label={`New ${noun}`}
            className="space-y-2 rounded-[10px] border border-line bg-surface-2 p-2.5"
          >
            <input
              type="text"
              value={newPostTitle}
              onChange={(e) => setNewPostTitle(e.target.value)}
              placeholder="Title"
              aria-label="Title"
              required
              autoFocus
              className="w-full rounded-md border border-line bg-surface-0 px-2 py-1.5 text-ui text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
            {isForum && availableTags.length > 0 && (
              <div className="flex flex-wrap gap-1" role="group" aria-label="Tags for the new post">
                {availableTags.map((tag) => {
                  const selected = newPostTagIds.has(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setNewPostTagIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(tag.id)) next.delete(tag.id);
                          else next.add(tag.id);
                          return next;
                        })
                      }
                      className={`rounded-md px-2 py-0.5 text-meta cursor-pointer ${
                        selected ? "bg-accent-strong text-white" : "bg-surface-3 text-ink-muted hover:text-ink"
                      }`}
                    >
                      {tag.emoji ? `${tag.emoji} ` : ""}
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
            <textarea
              value={newPostBody}
              onChange={(e) => setNewPostBody(e.target.value)}
              placeholder="First message (markdown)"
              aria-label="First message"
              rows={3}
              className="w-full resize-y rounded-md border border-line bg-surface-0 px-2 py-1.5 text-ui text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newPostAttInput}
                onChange={(e) => setNewPostAttInput(e.target.value)}
                placeholder="Attach a file by path (optional)"
                aria-label="Attachment file path"
                className="min-w-0 flex-1 rounded-md border border-line bg-surface-0 px-2 py-1 text-ui text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const p = newPostAttInput.trim();
                  if (!p) return;
                  setNewPostAttPaths((prev) => (prev.includes(p) ? prev : [...prev, p]));
                  setNewPostAttInput("");
                }}
                className="rounded-md bg-surface-3 px-2 py-1 text-ui text-ink hover:text-white cursor-pointer"
              >
                Attach
              </button>
            </div>
            {newPostAttPaths.length > 0 && (
              <ul className="space-y-1">
                {newPostAttPaths.map((p) => (
                  <li key={p} className="flex items-center gap-1.5 text-meta text-ink-muted">
                    <Paperclip className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate" title={p}>
                      {p}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      onClick={() => setNewPostAttPaths((prev) => prev.filter((x) => x !== p))}
                      className="rounded p-0.5 hover:bg-surface-3 hover:text-ink cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={resetNewPost}
                className="rounded-md px-2.5 py-1 text-ui text-ink-muted hover:bg-surface-3 hover:text-ink cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingPost || !newPostTitle.trim() || (!newPostBody.trim() && newPostAttPaths.length === 0)}
                className="rounded-md bg-accent-strong px-3 py-1 text-ui font-semibold text-white hover:bg-accent disabled:opacity-40 cursor-pointer disabled:cursor-default"
              >
                Create
              </button>
            </div>
          </form>
        )}

        {/* Filter, sort, density */}
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              ref={filterRef}
              type="text"
              value={postQuery}
              onChange={(e) => onChangePostQuery(e.target.value)}
              placeholder={`Filter ${noun}s`}
              aria-label={`Filter ${noun}s (Ctrl+Shift+F)`}
              className="w-full rounded-md border border-line bg-surface-2 py-1.5 pl-7 pr-2 text-ui text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
          </div>
          <select
            aria-label="Sort posts"
            value={sortMode}
            onChange={(e) => onChangeSortMode(e.target.value as PostSortMode)}
            className="max-w-[8.5rem] rounded-md border border-line bg-surface-2 px-1.5 py-1.5 text-ui text-ink focus:border-accent focus:outline-none cursor-pointer"
          >
            <option value="recent">Recent activity</option>
            <option value="oldest">Oldest first</option>
            <option value="title">A–Z</option>
            <option value="messages">Most messages</option>
          </select>
          <button
            type="button"
            onClick={() => setDensity((d) => (d === "compact" ? "comfortable" : "compact"))}
            title={density === "compact" ? "Comfortable rows" : "Compact rows"}
            aria-label={density === "compact" ? "Switch to comfortable rows" : "Switch to compact rows"}
            className="rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            {density === "compact" ? <Rows3 className="h-4 w-4" /> : <Rows4 className="h-4 w-4" />}
          </button>
        </div>

        {/* Collapsible tag filter (forums) */}
        {isForum && availableTags.length > 0 && (
          <div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTagsOpen((v) => !v)}
                aria-expanded={tagsOpen}
                className="flex flex-1 items-center gap-1 rounded px-0.5 py-0.5 text-meta text-ink-muted hover:text-ink cursor-pointer"
              >
                {tagsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Tags
                {activeTagIds.size > 0 && <span className="text-accent">· {activeTagIds.size} active</span>}
              </button>
              {activeTagIds.size > 0 && (
                <button
                  type="button"
                  onClick={onClearTags}
                  className="rounded px-1 text-meta text-ink-muted hover:text-ink cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            {tagsOpen && (
              <div className="mt-1.5 space-y-2">
                <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto" role="group" aria-label="Filter by tag">
                  {availableTags.map((tag) => {
                    const isActive = activeTagIds.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => onToggleTag(tag.id)}
                        aria-pressed={isActive}
                        className={`rounded-md px-2 py-0.5 text-meta cursor-pointer ${
                          isActive ? "bg-accent-strong text-white" : "bg-surface-2 text-ink-muted hover:text-ink"
                        }`}
                      >
                        {tag.emoji ? `${tag.emoji} ` : ""}
                        {tag.name}
                        <span className={isActive ? "text-white/70" : "text-ink-faint"}> {tagCounts.get(tag.id) ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="inline-flex rounded-md bg-surface-2 p-0.5 text-meta" role="group" aria-label="Tag match mode">
                  {(["any", "all"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={tagMatchMode === mode}
                      onClick={() => onChangeTagMatchMode(mode)}
                      className={`rounded px-2 py-0.5 cursor-pointer ${
                        tagMatchMode === mode ? "bg-surface-3 text-ink" : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      Match {mode}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Post rows */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-1.5" aria-label={isForum ? "Posts" : "Threads"}>
        {filteredPosts.length === 0 ? (
          <div className="px-4 py-12 text-center text-ui text-ink-muted">
            {filtersActive ? (
              <>
                <p>No {noun}s match your filters.</p>
                <button
                  type="button"
                  onClick={() => {
                    onChangePostQuery("");
                    onClearTags();
                  }}
                  className="mt-2 rounded-md bg-surface-2 px-2.5 py-1 text-ui text-ink hover:bg-surface-3 cursor-pointer"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <p>No {noun}s in this channel.</p>
            )}
          </div>
        ) : (
          filteredPosts.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              isSelected={post.id === selectedPostId}
              compact={density === "compact"}
              onSelect={() => onSelectPost(post.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function PostRow({
  post,
  isSelected,
  compact,
  onSelect,
}: {
  post: PostOrThread;
  isSelected: boolean;
  compact: boolean;
  onSelect: () => void;
}) {
  const first = post.messages[0];
  const { latestIso } = postActivityRange(post);
  const attachmentCount = post.messages.reduce((n, m) => n + m.attachments.length, 0);
  const snippet = !compact && first ? plainTextSnippet(first.content, 140) : "";
  const shownTags = post.applied_tags.slice(0, 3);
  const hiddenTags = post.applied_tags.length - shownTags.length;

  return (
    <button
      type="button"
      data-post-id={post.id}
      onClick={onSelect}
      aria-current={isSelected ? "true" : undefined}
      className={`relative mb-px flex w-full flex-col rounded-md px-2.5 text-left transition-colors cursor-pointer ${
        compact ? "py-1.5" : "py-2.5"
      } ${
        isSelected
          ? "bg-surface-3 before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent"
          : "hover:bg-surface-2"
      }`}
    >
      <span className={`text-title text-ink ${compact ? "line-clamp-1" : "line-clamp-2"}`}>
        {post.name || "Untitled post"}
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-meta text-ink-muted">
        {first && <span className="max-w-[10rem] truncate">{first.author.name}</span>}
        {latestIso && <span>· {formatShortDate(latestIso)}</span>}
        <span className="inline-flex items-center gap-0.5" title={`${post.messages.length} messages`}>
          · <MessageSquare className="h-3 w-3" aria-hidden="true" />
          {post.messages.length}
        </span>
        {attachmentCount > 0 && (
          <span className="inline-flex items-center gap-0.5" title={`${attachmentCount} attachments`}>
            · <Paperclip className="h-3 w-3" aria-hidden="true" />
            {attachmentCount}
          </span>
        )}
      </span>
      {snippet && <span className="mt-1 line-clamp-2 text-ui text-ink-muted">{snippet}</span>}
      {!compact && shownTags.length > 0 && (
        <span className="mt-1.5 flex flex-wrap gap-1 text-meta text-ink-muted">
          {shownTags.map((t) => (
            <span key={t.id} className="rounded bg-surface-2 px-1.5">
              {t.emoji ? `${t.emoji} ` : ""}
              {t.name}
            </span>
          ))}
          {hiddenTags > 0 && <span>+{hiddenTags}</span>}
        </span>
      )}
    </button>
  );
}
