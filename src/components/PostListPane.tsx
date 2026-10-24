import { useMemo } from "react";
import {
  ArrowUpDown,
  FileText,
  FilterX,
  Hash,
  Image as ImageIcon,
  LayoutList,
  MessageSquare,
  Music,
  Paperclip,
  Search,
  Tag,
} from "lucide-react";
import type { Channel, PostOrThread } from "../types/backup";

export type PostSortMode = "recent" | "title" | "messages";
export type TagMatchMode = "any" | "all";

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
}

const IMG_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);
const AUDIO_EXT = new Set(["mp3", "flac", "wav", "ogg", "m4a"]);
const DOC_EXT = new Set(["pdf", "docx", "txt", "py", "tex", "7z", "zip"]);

function getPostLatestEpoch(post: PostOrThread): number {
  let latest = 0;
  for (const m of post.messages) {
    if (m.timestamp) {
      const t = Date.parse(m.timestamp);
      if (!Number.isNaN(t) && t > latest) {
        latest = t;
      }
    }
  }
  return latest;
}

function summarizePostAttachments(post: PostOrThread) {
  let images = 0;
  let audio = 0;
  let docs = 0;
  let other = 0;
  for (const m of post.messages) {
    for (const a of m.attachments) {
      const ext = a.extension.toLowerCase();
      if (IMG_EXT.has(ext)) images += 1;
      else if (AUDIO_EXT.has(ext)) audio += 1;
      else if (DOC_EXT.has(ext)) docs += 1;
      else other += 1;
    }
  }
  return { images, audio, docs, other, total: images + audio + docs + other };
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
      if (tagMatchMode === "all") {
        for (const reqId of activeTagIds) {
          if (!postTagSet.has(reqId)) return false;
        }
      } else {
        let matchedOne = false;
        for (const reqId of activeTagIds) {
          if (postTagSet.has(reqId)) {
            matchedOne = true;
            break;
          }
        }
        if (!matchedOne) return false;
      }
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

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    // Keep main channel stream at the top in text channels
    if (a.type === "channel_stream" && b.type !== "channel_stream") return -1;
    if (b.type === "channel_stream" && a.type !== "channel_stream") return 1;

    if (sortMode === "title") {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    if (sortMode === "messages") {
      return b.messages.length - a.messages.length;
    }
    return getPostLatestEpoch(b) - getPostLatestEpoch(a);
  });

  return sorted;
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
}: PostListPaneProps) {
  const allPosts = channel?.posts ?? [];
  const availableTags = channel?.available_tags ?? [];

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
    () =>
      filterAndSortPosts(
        allPosts,
        postQuery,
        activeTagIds,
        tagMatchMode,
        sortMode,
      ),
    [allPosts, postQuery, activeTagIds, tagMatchMode, sortMode],
  );

  if (!channel) {
    return (
      <aside className="flex h-full w-80 shrink-0 flex-col items-center justify-center border-r border-slate-800/90 bg-slate-900/50 p-6 text-center text-xs text-slate-500">
        Select a channel on the left.
      </aside>
    );
  }

  const isForum = channel.type === "forum";
  const HeaderIcon = isForum ? LayoutList : Hash;

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-slate-800/90 bg-slate-900/40 select-none">
      {/* Channel Header */}
      <div className="border-b border-slate-800/90 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <HeaderIcon className="h-4 w-4 shrink-0 text-indigo-400" />
            <h2 className="truncate text-sm font-bold text-white">
              {channel.name}
            </h2>
          </div>
          <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300">
            {filteredPosts.length} / {allPosts.length}
          </span>
        </div>

        {/* Search & Sort Controls */}
        <div className="mt-2.5 flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={postQuery}
              onChange={(e) => onChangePostQuery(e.target.value)}
              placeholder={isForum ? "Filter posts…" : "Filter threads…"}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/90 pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="relative flex items-center">
            <ArrowUpDown className="pointer-events-none absolute left-2 h-3 w-3 text-slate-400" />
            <select
              aria-label="Sort posts"
              value={sortMode}
              onChange={(e) => onChangeSortMode(e.target.value as PostSortMode)}
              className="rounded-lg border border-slate-800 bg-slate-950/90 pl-6 pr-2 py-1.5 text-[11px] text-slate-300 focus:border-indigo-500 focus:outline-none cursor-pointer"
            >
              <option value="recent">Recent</option>
              <option value="title">A–Z</option>
              <option value="messages">Messages</option>
            </select>
          </div>
        </div>

        {/* Forum Tag Filter Bar */}
        {isForum && availableTags.length > 0 && (
          <div className="mt-3 rounded-lg border border-slate-800/90 bg-slate-950/60 p-2">
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Tag className="h-3 w-3 text-indigo-400" />
                <span>Tags</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onChangeTagMatchMode(tagMatchMode === "any" ? "all" : "any")
                  }
                  title="Toggle matching ANY vs ALL selected tags"
                  className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Match: {tagMatchMode.toUpperCase()}
                </button>
                {activeTagIds.size > 0 && (
                  <button
                    type="button"
                    onClick={onClearTags}
                    title="Clear tag filters"
                    className="inline-flex items-center gap-0.5 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-500/30 cursor-pointer"
                  >
                    <FilterX className="h-2.5 w-2.5" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>
            <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto pt-0.5">
              {availableTags.map((tag) => {
                const isActive = activeTagIds.has(tag.id);
                const count = tagCounts.get(tag.id) ?? 0;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => onToggleTag(tag.id)}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-all cursor-pointer ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400"
                        : "bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    {tag.emoji && <span>{tag.emoji}</span>}
                    <span>{tag.name}</span>
                    <span
                      className={`text-[10px] ${
                        isActive ? "text-indigo-200" : "text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Post Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filteredPosts.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs text-slate-500">
            No matching posts found.
          </div>
        ) : (
          filteredPosts.map((post) => {
            const isSelected = post.id === selectedPostId;
            const attSummary = summarizePostAttachments(post);
            const firstMsg = post.messages[0];
            const previewSnippet = firstMsg?.content
              ? firstMsg.content.slice(0, 90)
              : "";

            return (
              <button
                key={post.id}
                type="button"
                onClick={() => onSelectPost(post.id)}
                className={`group flex w-full flex-col rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                  isSelected
                    ? "border-indigo-500/50 bg-indigo-600/15 shadow-sm"
                    : "border-transparent bg-slate-900/60 hover:border-slate-800 hover:bg-slate-900"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`line-clamp-1 text-xs font-semibold ${
                      isSelected ? "text-white" : "text-slate-200 group-hover:text-white"
                    }`}
                  >
                    {post.name || "Untitled post"}
                  </span>
                </div>

                {previewSnippet && (
                  <p className="mt-1 line-clamp-1 text-[11px] text-slate-400">
                    {previewSnippet}
                  </p>
                )}

                {post.applied_tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {post.applied_tags.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-800/90 px-2 py-0.5 text-[10px] font-medium text-slate-300"
                      >
                        {t.emoji && <span>{t.emoji}</span>}
                        <span>{t.name}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3 w-3 text-slate-500" />
                    <span>{post.messages.length}</span>
                  </span>

                  {attSummary.total > 0 && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      {attSummary.images > 0 && (
                        <span className="inline-flex items-center gap-0.5" title="Images">
                          <ImageIcon className="h-3 w-3 text-sky-400" />
                          <span>{attSummary.images}</span>
                        </span>
                      )}
                      {attSummary.audio > 0 && (
                        <span className="inline-flex items-center gap-0.5" title="Audio">
                          <Music className="h-3 w-3 text-emerald-400" />
                          <span>{attSummary.audio}</span>
                        </span>
                      )}
                      {attSummary.docs > 0 && (
                        <span className="inline-flex items-center gap-0.5" title="Documents">
                          <FileText className="h-3 w-3 text-amber-400" />
                          <span>{attSummary.docs}</span>
                        </span>
                      )}
                      {attSummary.other > 0 && (
                        <span className="inline-flex items-center gap-0.5" title="Files">
                          <Paperclip className="h-3 w-3 text-slate-400" />
                          <span>{attSummary.other}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
