import React, { useMemo, useState } from "react";
import { ArrowUpRight, Check, Copy, ExternalLink } from "lucide-react";
import {
  parseMarkdownBlocks,
  tokenizeCodeLine,
  type BlockNode,
  type InlineNode,
} from "../lib/markdown";
import {
  resolveTargetInBackup,
  type InternalServerTarget,
} from "../lib/links";
import type { ServerBackup } from "../types/backup";

interface RichContentProps {
  content: string;
  backup: ServerBackup | null;
  searchQuery?: string;
  onJumpToTarget?: (target: InternalServerTarget) => void;
  onOpenExternalUrl?: (url: string) => void;
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
        className="rounded bg-amber-400/30 px-0.5 text-amber-100 ring-1 ring-amber-400/40"
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
          ? "bg-slate-800/90 text-slate-100"
          : "bg-slate-700 text-transparent select-none hover:bg-slate-600"
      }`}
    >
      {children}
    </span>
  );
}

function CodeBlockView({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => code.split("\n"), [code]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/90 shadow-inner">
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-400">
        <span className="font-mono uppercase tracking-wider text-slate-300">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, lineIdx) => {
              const tokens = tokenizeCodeLine(line);
              return (
                <tr key={lineIdx} className="hover:bg-slate-900/40">
                  <td className="w-8 select-none pr-3 text-right text-slate-600">
                    {lineIdx + 1}
                  </td>
                  <td className="whitespace-pre text-slate-200">
                    {tokens.length === 0
                      ? " "
                      : tokens.map((tok, tokIdx) => {
                          if (tok.type === "keyword") {
                            return (
                              <span key={tokIdx} className="text-indigo-400 font-semibold">
                                {tok.value}
                              </span>
                            );
                          }
                          if (tok.type === "string") {
                            return (
                              <span key={tokIdx} className="text-emerald-300">
                                {tok.value}
                              </span>
                            );
                          }
                          if (tok.type === "comment") {
                            return (
                              <span key={tokIdx} className="text-slate-500 italic">
                                {tok.value}
                              </span>
                            );
                          }
                          if (tok.type === "number") {
                            return (
                              <span key={tokIdx} className="text-amber-300">
                                {tok.value}
                              </span>
                            );
                          }
                          return <span key={tokIdx}>{tok.value}</span>;
                        })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
              className="rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-[0.85em] text-indigo-200 border border-slate-700/60"
            >
              {highlightSearchText(node.code, searchQuery)}
            </code>
          );
        case "bold":
          return (
            <strong key={idx} className="font-semibold text-white">
              {renderInlines(node.children)}
            </strong>
          );
        case "italic":
          return (
            <em key={idx} className="italic text-slate-200">
              {renderInlines(node.children)}
            </em>
          );
        case "underline":
          return (
            <u key={idx} className="underline decoration-slate-400 underline-offset-2">
              {renderInlines(node.children)}
            </u>
          );
        case "strike":
          return (
            <del key={idx} className="line-through text-slate-400">
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
              className="mx-0.5 inline-flex items-center gap-1 rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/30 hover:text-white transition-colors cursor-pointer"
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
              className="inline-flex items-center gap-1 text-indigo-400 underline decoration-indigo-500/40 underline-offset-2 hover:text-indigo-300 hover:decoration-indigo-300 break-all"
            >
              <span>{highlightSearchText(node.label, searchQuery)}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-75" />
            </a>
          );
      }
    });

  const renderBlock = (block: BlockNode, idx: number): React.ReactNode => {
    switch (block.type) {
      case "heading": {
        const sizeClass =
          block.level === 1
            ? "text-lg font-bold text-white mt-2 mb-1"
            : block.level === 2
              ? "text-base font-semibold text-white mt-1.5 mb-1"
              : "text-sm font-semibold text-slate-100 mt-1 mb-0.5";
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
            className="my-1.5 border-l-3 border-indigo-500/60 bg-slate-900/50 pl-3 py-1 text-slate-300 rounded-r"
          >
            {block.lines.map((lineInlines, lineIdx) => (
              <div key={lineIdx} className="leading-relaxed">
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
            className={`my-1.5 pl-5 space-y-0.5 ${
              block.ordered ? "list-decimal" : "list-disc"
            } text-slate-200`}
          >
            {block.items.map((itemInlines, itemIdx) => (
              <li key={itemIdx} className="leading-relaxed">
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
            className="whitespace-pre-wrap break-words leading-relaxed text-slate-200 my-1 first:mt-0 last:mb-0"
          >
            {renderInlines(block.inlines)}
          </p>
        );
    }
  };

  if (blocks.length === 0) {
    return <span className="italic text-slate-500 text-xs">(empty message)</span>;
  }

  return <div className="space-y-1 text-sm">{blocks.map(renderBlock)}</div>;
}
