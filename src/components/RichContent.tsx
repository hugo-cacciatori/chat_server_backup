import React, { useMemo, useState } from "react";
import { ArrowUpRight, Check, Copy, ExternalLink } from "lucide-react";
import { parseMarkdownBlocks, type BlockNode, type InlineNode } from "../lib/markdown";
import {
  resolveTargetInBackup,
  type InternalServerTarget,
} from "../lib/links";
import type { ServerBackup } from "../types/backup";
import { CodeLines } from "./Attachments";

interface RichContentProps {
  content: string;
  backup: ServerBackup | null;
  searchQuery?: string;
  onJumpToTarget?: (target: InternalServerTarget) => void;
  onOpenExternalUrl?: (url: string) => void;
  /** Render nothing (instead of "(empty message)") when the message has attachments or embeds. */
  hideEmpty?: boolean;
}

function highlightSearchText(text: string, query?: string): React.ReactNode {
  if (!query || !query.trim()) {
    return text;
  }
  const cleanQuery = query.trim();
  const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  if (parts.length === 1) {
    return text;
  }
  return parts.map((part, idx) =>
    part.toLowerCase() === cleanQuery.toLowerCase() ? (
      <mark
        key={idx}
        className="rounded-sm bg-amber-400/30 px-0.5 text-ink"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function SpoilerSpan({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setRevealed((r) => !r)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setRevealed((r) => !r);
        }
      }}
      title={revealed ? "Click to hide spoiler" : "Click to reveal spoiler"}
      className={`inline rounded px-1.5 py-0.5 transition-all cursor-pointer ${
        revealed
          ? "bg-surface-3 text-ink"
          : "bg-surface-3 text-transparent select-none hover:bg-line"
      }`}
    >
      {children}
    </span>
  );
}

function CodeBlockView({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => code.split("\n"), [code]);

  return (
    <div className="my-2 overflow-hidden rounded-md border border-line bg-surface-1">
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-meta text-ink-muted">{language || "code"}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-meta text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="overflow-x-auto border-t border-line px-3 py-2">
        <CodeLines lines={lines} />
      </div>
    </div>
  );
}

export function RichContent({
  content,
  backup,
  searchQuery,
  onJumpToTarget,
  onOpenExternalUrl,
  hideEmpty = false,
}: RichContentProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  const renderInlines = (inlines: InlineNode[]): React.ReactNode =>
    inlines.map((node, idx) => {
      switch (node.type) {
        case "text":
          return (
            <React.Fragment key={idx}>
              {highlightSearchText(node.text, searchQuery)}
            </React.Fragment>
          );
        case "code":
          return (
            <code
              key={idx}
              className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em] text-ink"
            >
              {highlightSearchText(node.code, searchQuery)}
            </code>
          );
        case "bold":
          return (
            <strong key={idx} className="font-semibold text-ink">
              {renderInlines(node.children)}
            </strong>
          );
        case "italic":
          return (
            <em key={idx} className="italic">
              {renderInlines(node.children)}
            </em>
          );
        case "underline":
          return (
            <u key={idx} className="underline decoration-ink-muted underline-offset-2">
              {renderInlines(node.children)}
            </u>
          );
        case "strike":
          return (
            <del key={idx} className="line-through text-ink-muted">
              {renderInlines(node.children)}
            </del>
          );
        case "spoiler":
          return <SpoilerSpan key={idx}>{renderInlines(node.children)}</SpoilerSpan>;
        case "internal_link": {
          const resolved = resolveTargetInBackup(backup, node.target);
          const displayLabel = resolved
            ? resolved.label
            : `Channel ${node.target.channelId}`;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onJumpToTarget?.(node.target)}
              title={`Jump inside backup: ${node.url}`}
              className="mx-0.5 inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 text-ui font-medium text-accent hover:bg-accent/25 cursor-pointer"
            >
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
              <span>{displayLabel}</span>
            </button>
          );
        }
        case "external_link":
          return (
            <a
              key={idx}
              href={node.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (onOpenExternalUrl) {
                  e.preventDefault();
                  onOpenExternalUrl(node.url);
                }
              }}
              className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent break-all"
            >
              <span>{highlightSearchText(node.label, searchQuery)}</span>
              <ExternalLink className="ml-0.5 inline h-3 w-3 align-baseline opacity-75" aria-hidden="true" />
            </a>
          );
      }
    });

  const renderBlock = (block: BlockNode, idx: number): React.ReactNode => {
    switch (block.type) {
      case "heading": {
        const sizeClass =
          block.level === 1
            ? "text-lg font-semibold text-ink mt-2 mb-1"
            : block.level === 2
              ? "text-base font-semibold text-ink mt-1.5 mb-1"
              : "text-body font-semibold text-ink mt-1 mb-0.5";
        return (
          <div key={idx} className={sizeClass}>
            {renderInlines(block.inlines)}
          </div>
        );
      }
      case "code_block":
        return <CodeBlockView key={idx} language={block.language} code={block.code} />;
      case "blockquote":
        return (
          <blockquote
            key={idx}
            className="my-1.5 border-l-2 border-line pl-3 text-ink-muted"
          >
            {block.lines.map((lineInlines, lineIdx) => (
              <div key={lineIdx}>
                {renderInlines(lineInlines)}
              </div>
            ))}
          </blockquote>
        );
      case "list": {
        const ListTag = block.ordered ? "ol" : "ul";
        return (
          <ListTag
            key={idx}
            className={`my-1.5 space-y-0.5 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
          >
            {block.items.map((itemInlines, itemIdx) => (
              <li key={itemIdx}>
                {renderInlines(itemInlines)}
              </li>
            ))}
          </ListTag>
        );
      }
      case "paragraph":
        return (
          <p
            key={idx}
            className="my-1 whitespace-pre-wrap break-words first:mt-0 last:mb-0"
          >
            {renderInlines(block.inlines)}
          </p>
        );
    }
  };

  if (blocks.length === 0) {
    return hideEmpty ? null : <span className="text-ui italic text-ink-muted">(empty message)</span>;
  }

  return <div className="space-y-1 text-body text-ink">{blocks.map(renderBlock)}</div>;
}
